import { EventEmitter } from 'events';
import * as pty from '@lydell/node-pty';
import type { Logger } from '../utils/logger';
import type { DatabaseService } from '../database/database';
import type { ProjectRunCommand } from '../database/models';
import { getShellPath } from '../utils/shellPath';
import { ShellDetector } from '../utils/shellDetector';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { configManager } from '../index';

interface RunProcess {
  process: pty.IPty;
  command: ProjectRunCommand;
  sessionId: string;
}

export class RunCommandManager extends EventEmitter {
  private processes: Map<string, RunProcess[]> = new Map();

  constructor(
    private databaseService: DatabaseService,
    private logger?: Logger
  ) {
    super();
  }

  async startRunCommands(sessionId: string, projectId: number, worktreePath: string): Promise<void> {
    try {
      // Get all run commands for the project
      const runCommands = this.databaseService.getProjectRunCommands(projectId);
      
      
      if (runCommands.length === 0) {
        this.logger?.info(`No RUN commands configured for project ${projectId}`);
        return;
      }

      this.logger?.info(`Starting ${runCommands.length} RUN commands sequentially for session ${sessionId}`);
      
      const processes: RunProcess[] = [];

      // Execute commands sequentially
      for (let i = 0; i < runCommands.length; i++) {
        const command = runCommands[i];
        
        try {
          this.logger?.verbose(`Starting RUN command ${i + 1}/${runCommands.length}: ${command.display_name || command.command}`);
          
          // Split command by newlines to execute each line sequentially
          const commandLines = command.command.split('\n').filter(line => line.trim());
          
          for (let j = 0; j < commandLines.length; j++) {
            const commandLine = commandLines[j].trim();
            if (!commandLine) continue;
            
            this.logger?.verbose(`Executing line ${j + 1}/${commandLines.length} of command ${i + 1}: ${commandLine}`);
            
            // Create environment with WORKTREE_PATH and enhanced PATH
            // For Linux, use current PATH to avoid slow shell detection
            const isLinux = process.platform === 'linux';
            const shellPath = isLinux ? (process.env.PATH || '') : getShellPath();
            const env = {
              ...process.env,
              WORKTREE_PATH: worktreePath,
              PATH: shellPath
            } as { [key: string]: string };
            
            // Log environment details for debugging
            if (j === 0) {
              this.logger?.verbose(`Setting WORKTREE_PATH to: ${worktreePath}`);
              this.logger?.verbose(`Enhanced PATH: ${shellPath}`);
              this.logger?.verbose(`Env WORKTREE_PATH check: ${env.WORKTREE_PATH}`);
            }
            
            // Get the user's default shell
            const preferredShell = configManager.getPreferredShell();
            const shellInfo = ShellDetector.getDefaultShell(preferredShell);
            this.logger?.verbose(`Using shell: ${shellInfo.path} (${shellInfo.name})`);
            
            // Prepare command with environment variable
            const isWindows = process.platform === 'win32';
            let commandWithEnv: string;
            
            if (isWindows) {
              // Windows command format: set VAR=value && command
              const escapedWorktreePath = worktreePath.replace(/"/g, '""');
              commandWithEnv = `set WORKTREE_PATH="${escapedWorktreePath}" && ${commandLine}`;
            } else {
              // Unix/macOS
              const escapedWorktreePath = worktreePath.replace(/'/g, "'\"'\"'");
              commandWithEnv = `export WORKTREE_PATH='${escapedWorktreePath}' && ${commandLine}`;
            }
            
            // Get shell command arguments (pass preferred shell)
            const { shell, args: shellArgs } = ShellDetector.getShellCommandArgs(commandWithEnv, preferredShell);
            
            this.logger?.verbose(`Using shell: ${shell}`);
            this.logger?.verbose(`Full command: ${commandWithEnv}`);
            
            // Spawn the shell process with the enhanced environment
            // IMPORTANT: We don't use 'detached' here because node-pty already creates a new session
            const ptyProcess = pty.spawn(shell, shellArgs, {
              name: 'xterm-color',
              cols: 80,
              rows: 30,
              cwd: worktreePath,
              env: env
            });

            const runProcess: RunProcess = {
              process: ptyProcess,
              command,
              sessionId
            };

            // Store the process immediately so it can be stopped if needed
            const currentProcesses = this.processes.get(sessionId) || [];
            currentProcesses.push(runProcess);
            this.processes.set(sessionId, currentProcesses);

            // Wait for this command line to complete before starting the next one
            await new Promise<void>((resolve, reject) => {
              let hasExited = false;

              // Handle output from the run command
              ptyProcess.onData((data: string) => {
                this.emit('output', {
                  sessionId,
                  commandId: command.id,
                  displayName: command.display_name || command.command,
                  type: 'stdout',
                  data,
                  timestamp: new Date()
                });
              });

              ptyProcess.onExit(({ exitCode, signal }) => {
                hasExited = true;
                this.logger?.info(`Command line exited: ${commandLine}, exitCode: ${exitCode}, signal: ${signal}`);
                
                // Only emit exit event for the last line of a command
                if (j === commandLines.length - 1) {
                  this.emit('exit', {
                    sessionId,
                    commandId: command.id,
                    displayName: command.display_name || command.command,
                    exitCode,
                    signal
                  });
                }

                // Remove from processes array
                const sessionProcesses = this.processes.get(sessionId);
                if (sessionProcesses) {
                  const index = sessionProcesses.indexOf(runProcess);
                  if (index > -1) {
                    sessionProcesses.splice(index, 1);
                  }
                }

                // Only continue to next command line if this one succeeded
                if (exitCode === 0) {
                  resolve();
                } else {
                  reject(new Error(`Command line failed with exit code ${exitCode}: ${commandLine}`));
                }
              });
            });

            this.logger?.verbose(`Completed command line successfully: ${commandLine}`);
          }

          this.logger?.info(`Completed run command successfully: ${command.display_name || command.command}`);
        } catch (error) {
          this.logger?.error(`Failed to run command: ${command.display_name || command.command}`, error as Error);
          this.emit('error', {
            sessionId,
            commandId: command.id,
            displayName: command.display_name || command.command,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Stop execution of subsequent commands if one fails
          break;
        }
      }

      this.logger?.info(`Finished running commands for session ${sessionId}`);
    } catch (error) {
      this.logger?.error(`Failed to start run commands for session ${sessionId}`, error as Error);
      throw error;
    }
  }

  async stopRunCommands(sessionId: string): Promise<void> {
    const processes = this.processes.get(sessionId);
    if (!processes || processes.length === 0) {
      return;
    }

    this.logger?.info(`Stopping ${processes.length} run commands for session ${sessionId}`);

    // Collect all PIDs we know about
    const knownPids: number[] = [];
    
    for (const runProcess of processes) {
      try {
        const pid = runProcess.process.pid;
        const commandName = runProcess.command.display_name || runProcess.command.command;
        
        if (pid) {
          knownPids.push(pid);
          // Use the comprehensive killProcessTree method
          const success = await this.killProcessTree(pid, commandName);
          if (!success) {
            this.logger?.error(`Failed to cleanly terminate all child processes for command: ${commandName}`);
          }
        }
        
        // Also try to kill via pty interface as fallback
        try {
          runProcess.process.kill();
        } catch (error) {
          // Process might already be dead
        }
      } catch (error) {
        this.logger?.error(`Failed to stop run command: ${runProcess.command.display_name || runProcess.command.command}`, error as Error);
      }
    }

    // IMPORTANT: Do a final sweep to catch any processes that might have escaped
    // This happens when the shell exits but child processes continue running
    if (knownPids.length > 0 && os.platform() !== 'win32') {
      await this.killEscapedProcesses(sessionId, knownPids);
    }

    this.processes.delete(sessionId);
  }

  async stopAllRunCommands(): Promise<void> {
    const stopPromises = [];
    for (const [sessionId, processes] of this.processes) {
      stopPromises.push(this.stopRunCommands(sessionId));
    }
    await Promise.all(stopPromises);
  }

  /**
   * Get all descendant PIDs of a parent process recursively
   * This is critical for ensuring all child processes are killed
   */
  private getAllDescendantPids(parentPid: number): number[] {
    const descendants: number[] = [];
    const platform = os.platform();
    
    try {
      if (platform === 'win32') {
        // Windows: Use WMIC to get child processes
        const result = require('child_process').execSync(
          `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
          { encoding: 'utf8' }
        );
        
        const lines = result.split('\n').filter((line: string) => line.trim());
        for (let i = 1; i < lines.length; i++) { // Skip header
          const pid = parseInt(lines[i].trim());
          if (!isNaN(pid) && pid !== parentPid) {
            descendants.push(pid);
            // Recursively get children of this process
            descendants.push(...this.getAllDescendantPids(pid));
          }
        }
      } else {
        // Unix/Linux/macOS: Use ps command
        const result = require('child_process').execSync(
          `ps -o pid= --ppid ${parentPid} 2>/dev/null || true`,
          { encoding: 'utf8' }
        );
        
        const pids = result.split('\n')
          .map((line: string) => parseInt(line.trim()))
          .filter((pid: number) => !isNaN(pid) && pid !== parentPid);
        
        for (const pid of pids) {
          descendants.push(pid);
          // Recursively get children of this process
          descendants.push(...this.getAllDescendantPids(pid));
        }
      }
    } catch (error) {
      this.logger?.warn(`Error getting descendant PIDs for ${parentPid}:`, error as Error);
    }
    
    // Remove duplicates
    return [...new Set(descendants)];
  }

  /**
   * Kill a process and all its descendants
   * Returns true if successful, false if zombie processes remain
   */
  private async killProcessTree(pid: number, commandName: string): Promise<boolean> {
    const platform = os.platform();
    const execAsync = promisify(exec);
    
    // First, get all descendant PIDs before we start killing
    const descendantPids = this.getAllDescendantPids(pid);
    this.logger?.info(`Found ${descendantPids.length} descendant processes for PID ${pid}: ${descendantPids.join(', ')}`);
    
    // IMPORTANT: Also find the process group ID and kill all processes in that group
    let pgid: number | null = null;
    try {
      if (platform !== 'win32') {
        const result = await execAsync(`ps -o pgid= -p ${pid}`);
        pgid = parseInt(result.stdout.trim());
        if (!isNaN(pgid) && pgid !== pid) {
          this.logger?.info(`Process ${pid} is in process group ${pgid}`);
          // Get all processes in this process group
          const pgResult = await execAsync(`ps -o pid= -g ${pgid} 2>/dev/null || true`);
          const pgPids = pgResult.stdout.split('\n')
            .map(line => parseInt(line.trim()))
            .filter(p => !isNaN(p) && p !== pid && !descendantPids.includes(p));
          if (pgPids.length > 0) {
            this.logger?.info(`Found ${pgPids.length} additional processes in process group ${pgid}: ${pgPids.join(', ')}`);
            descendantPids.push(...pgPids);
          }
        }
      }
    } catch (error) {
      this.logger?.warn(`Error getting process group: ${error}`);
    }
    
    let success = true;
    
    try {
      if (platform === 'win32') {
        // On Windows, use taskkill to terminate the process tree
        try {
          await execAsync(`taskkill /F /T /PID ${pid}`);
          this.logger?.verbose(`Successfully killed Windows process tree ${pid}`);
        } catch (error) {
          this.logger?.warn(`Error killing Windows process tree: ${error as Error}`);
          // Fallback: kill descendants individually
          for (const childPid of descendantPids) {
            try {
              await execAsync(`taskkill /F /PID ${childPid}`);
            } catch (e) {
              // Process might already be dead
            }
          }
        }
      } else {
        // On Unix-like systems (macOS, Linux)
        // First, try SIGTERM for graceful shutdown
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          this.logger?.warn('SIGTERM failed:', error as Error);
        }
        
        // Kill the entire process group using negative PID
        // Use the actual process group ID if we found it, otherwise use the PID
        const killGroupId = pgid || pid;
        try {
          await execAsync(`kill -TERM -${killGroupId}`);
          this.logger?.info(`Sent SIGTERM to process group ${killGroupId}`);
        } catch (error) {
          this.logger?.warn(`Error sending SIGTERM to process group ${killGroupId}: ${error}`);
        }
        
        // Give processes 10 seconds to clean up gracefully
        this.logger?.info(`Waiting 10 seconds for graceful shutdown of process ${pid}...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Now forcefully kill the main process
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }
        
        // Kill the process group with SIGKILL
        try {
          await execAsync(`kill -9 -${killGroupId}`);
          this.logger?.info(`Sent SIGKILL to process group ${killGroupId}`);
        } catch (error) {
          this.logger?.warn(`Error sending SIGKILL to process group ${killGroupId}: ${error}`);
        }
        
        // Kill all known descendants individually to be sure
        for (const childPid of descendantPids) {
          try {
            await execAsync(`kill -9 ${childPid}`);
            this.logger?.verbose(`Killed descendant process ${childPid}`);
          } catch (error) {
            this.logger?.verbose(`Process ${childPid} already terminated`);
          }
        }
        
        // Final cleanup attempt using pkill
        try {
          await execAsync(`pkill -9 -P ${pid}`);
        } catch (error) {
          // Ignore errors - processes might already be dead
        }
      }
      
      // Verify all processes are actually dead
      await new Promise(resolve => setTimeout(resolve, 500));
      const remainingPids = this.getAllDescendantPids(pid);
      
      if (remainingPids.length > 0) {
        this.logger?.error(`WARNING: ${remainingPids.length} zombie processes remain: ${remainingPids.join(', ')}`);
        success = false;
        
        // Emit error event so UI can show warning
        this.emit('zombie-processes-detected', {
          commandName,
          pids: remainingPids,
          message: `Failed to terminate ${remainingPids.length} child processes from command "${commandName}". Please manually kill PIDs: ${remainingPids.join(', ')}`
        });
      }
    } catch (error) {
      this.logger?.error('Error in killProcessTree:', error as Error);
      success = false;
    }
    
    return success;
  }

  /**
   * Kill any processes that might have escaped our normal termination
   * This can happen when a shell exits but its children continue running
   */
  private async killEscapedProcesses(sessionId: string, knownPids: number[]): Promise<void> {
    const execAsync = promisify(exec);
    
    try {
      // Find all processes that have any of our known PIDs as ancestors
      // This is a more aggressive approach to catch processes that might have been orphaned
      const allDescendants: number[] = [];
      
      for (const pid of knownPids) {
        // Get all descendants, including orphaned ones
        const descendants = this.getAllDescendantPids(pid);
        allDescendants.push(...descendants);
        
        // Also check for processes that might have been reparented to init (PID 1)
        // by looking for processes with the same process group
        try {
          const pgidResult = await execAsync(`ps -o pgid= -p ${pid} 2>/dev/null || echo ""`);
          const pgid = parseInt(pgidResult.stdout.trim());
          
          if (!isNaN(pgid)) {
            // Find all processes in this process group
            const pgResult = await execAsync(`ps -o pid= -g ${pgid} 2>/dev/null || true`);
            const pgPids = pgResult.stdout.split('\n')
              .map(line => parseInt(line.trim()))
              .filter(p => !isNaN(p) && !knownPids.includes(p));
            
            if (pgPids.length > 0) {
              this.logger?.warn(`Found ${pgPids.length} orphaned processes in process group ${pgid}: ${pgPids.join(', ')}`);
              allDescendants.push(...pgPids);
            }
          }
        } catch (error) {
          // Process might be gone already
        }
      }
      
      // Remove duplicates and kill any remaining processes
      const uniquePids = [...new Set(allDescendants)];
      if (uniquePids.length > 0) {
        this.logger?.warn(`Killing ${uniquePids.length} escaped processes: ${uniquePids.join(', ')}`);
        
        for (const pid of uniquePids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            this.logger?.info(`Killed escaped process ${pid}`);
          } catch (error) {
            // Process might already be dead
          }
        }
        
        // Emit warning about escaped processes
        this.emit('zombie-processes-detected', {
          sessionId,
          pids: uniquePids,
          message: `Detected and killed ${uniquePids.length} processes that escaped normal termination`
        });
      }
    } catch (error) {
      this.logger?.error('Error killing escaped processes:', error as Error);
    }
  }
}