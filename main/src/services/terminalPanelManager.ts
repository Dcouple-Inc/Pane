import * as pty from '@lydell/node-pty';
import { ToolPanel, TerminalPanelState, PanelEventType } from '../../../shared/types/panels';
import { panelManager } from './panelManager';
import { mainWindow, configManager } from '../index';
import * as os from 'os';
import * as path from 'path';
import { getShellPath } from '../utils/shellPath';
import { ShellDetector } from '../utils/shellDetector';
import type { AnalyticsManager } from './analyticsManager';
import { getWSLShellSpawn, WSLContext } from '../utils/wslUtils';

const HIGH_WATERMARK = 100_000; // 100KB — pause PTY when pending exceeds this
const LOW_WATERMARK = 10_000;   // 10KB — resume PTY when pending drops below this
const OUTPUT_BATCH_INTERVAL = 16; // ms (~60fps)
const OUTPUT_BATCH_SIZE = 4096;   // 4KB — flush immediately if buffer exceeds this
const PAUSE_SAFETY_TIMEOUT = 5_000; // 5s — auto-resume PTY if no acks arrive (prevents permanent stall)

interface TerminalProcess {
  pty: pty.IPty;
  panelId: string;
  sessionId: string;
  scrollbackBuffer: string;
  commandHistory: string[];
  currentCommand: string;
  lastActivity: Date;
  isWSL?: boolean;
  // Flow control
  pendingBytes: number;
  isPaused: boolean;
  pauseSafetyTimer: ReturnType<typeof setTimeout> | null;
  // Output batching
  outputBuffer: string;
  outputFlushTimer: ReturnType<typeof setTimeout> | null;
}

export class TerminalPanelManager {
  private terminals = new Map<string, TerminalProcess>();
  private readonly MAX_SCROLLBACK_LINES = 10000;
  private analyticsManager: AnalyticsManager | null = null;

  setAnalyticsManager(analyticsManager: AnalyticsManager): void {
    this.analyticsManager = analyticsManager;
  }

  private flushOutputBuffer(terminal: TerminalProcess): void {
    if (terminal.outputFlushTimer) {
      clearTimeout(terminal.outputFlushTimer);
      terminal.outputFlushTimer = null;
    }

    if (!terminal.outputBuffer) return;

    const data = terminal.outputBuffer;
    terminal.outputBuffer = '';

    // Track pending bytes for flow control
    terminal.pendingBytes += data.length;

    // Send batched output to renderer
    if (mainWindow) {
      mainWindow.webContents.send('terminal:output', {
        sessionId: terminal.sessionId,
        panelId: terminal.panelId,
        output: data
      });
    }

    // Apply backpressure if watermark exceeded
    if (terminal.pendingBytes > HIGH_WATERMARK && !terminal.isPaused) {
      terminal.isPaused = true;
      terminal.pty.pause();

      // Safety valve: auto-resume if no acks arrive (e.g., renderer unmounted)
      if (terminal.pauseSafetyTimer) clearTimeout(terminal.pauseSafetyTimer);
      terminal.pauseSafetyTimer = setTimeout(() => {
        if (terminal.isPaused) {
          terminal.isPaused = false;
          terminal.pendingBytes = 0;
          terminal.pty.resume();
        }
        terminal.pauseSafetyTimer = null;
      }, PAUSE_SAFETY_TIMEOUT);
    }
  }

  acknowledgeBytes(panelId: string, bytesConsumed: number): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) return;

    terminal.pendingBytes = Math.max(0, terminal.pendingBytes - bytesConsumed);

    if (terminal.isPaused && terminal.pendingBytes < LOW_WATERMARK) {
      terminal.isPaused = false;
      terminal.pty.resume();
      // Cancel safety timer — normal ack flow is working
      if (terminal.pauseSafetyTimer) {
        clearTimeout(terminal.pauseSafetyTimer);
        terminal.pauseSafetyTimer = null;
      }
    }
  }

  // Reset flow control state - useful for recovering from stuck terminals
  resetFlowControl(panelId: string): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) return;

    console.log(`[TerminalPanelManager] Resetting flow control for panel ${panelId}`);

    // Clear any pending safety timer
    if (terminal.pauseSafetyTimer) {
      clearTimeout(terminal.pauseSafetyTimer);
      terminal.pauseSafetyTimer = null;
    }

    // Reset flow control state
    terminal.pendingBytes = 0;

    // Resume PTY if paused
    if (terminal.isPaused) {
      terminal.isPaused = false;
      terminal.pty.resume();
    }
  }

  async initializeTerminal(panel: ToolPanel, cwd: string, wslContext?: WSLContext | null): Promise<void> {
    if (this.terminals.has(panel.id)) {
      return;
    }


    let shellPath: string;
    let shellArgs: string[];
    let spawnCwd: string | undefined = cwd;

    if (wslContext && process.platform === 'win32') {
      const wslShell = getWSLShellSpawn(wslContext.distribution, cwd);
      shellPath = wslShell.path;
      shellArgs = wslShell.args;
      spawnCwd = undefined; // WSL handles cwd
    } else {
      const preferredShell = configManager.getPreferredShell();
      const shellInfo = ShellDetector.getDefaultShell(preferredShell);
      shellPath = shellInfo.path;
      shellArgs = shellInfo.args || [];
    }

    const isLinux = process.platform === 'linux';
    const enhancedPath = isLinux ? (process.env.PATH || '') : getShellPath();

    // Create PTY process with enhanced environment
    const ptyProcess = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: spawnCwd,
      env: {
        ...process.env,
        PATH: enhancedPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        WORKTREE_PATH: cwd,
        FOOZOL_SESSION_ID: panel.sessionId,
        FOOZOL_PANEL_ID: panel.id
      }
    });
    
    // Create terminal process object
    const terminalProcess: TerminalProcess = {
      pty: ptyProcess,
      panelId: panel.id,
      sessionId: panel.sessionId,
      scrollbackBuffer: '',
      commandHistory: [],
      currentCommand: '',
      lastActivity: new Date(),
      isWSL: !!(wslContext && process.platform === 'win32'),
      pendingBytes: 0,
      isPaused: false,
      pauseSafetyTimer: null,
      outputBuffer: '',
      outputFlushTimer: null
    };
    
    // Store in map
    this.terminals.set(panel.id, terminalProcess);
    
    // Set up event handlers
    this.setupTerminalHandlers(terminalProcess);
    
    // Get initialCommand from existing state before updating
    const existingState = panel.state.customState as TerminalPanelState | undefined;
    const initialCommand = existingState?.initialCommand;

    // Update panel state
    const state = panel.state;
    state.customState = {
      ...state.customState,
      isInitialized: true,
      cwd: cwd,
      shellType: path.basename(shellPath),
      dimensions: { cols: 80, rows: 30 }
    } as TerminalPanelState;

    await panelManager.updatePanel(panel.id, { state });

    // NOTE: terminal_panel_created analytics tracking has been moved to panelManager.createPanel()
    // to ensure it only fires when users explicitly create new panels, not during app restoration
    // or when panels are initialized for viewing.

    // Execute initial command if provided (e.g., "claude --dangerously-skip-permissions")
    if (initialCommand) {
      let commandToRun = initialCommand;

      // If this is a Claude CLI command, inject --session-id or --resume
      if (
        initialCommand.toLowerCase().includes('claude') &&
        !initialCommand.includes('--session-id') &&
        !initialCommand.includes('--resume')
      ) {
        const termState = existingState as TerminalPanelState | undefined;
        if (termState?.hasClaudeSessionId) {
          // Session ID was already used before — resume instead of creating new
          commandToRun = `claude --resume ${panel.id} --dangerously-skip-permissions`;
        } else {
          // First time — create session with panel ID
          commandToRun = `${initialCommand} --session-id ${panel.id}`;
        }

        // Mark that we've assigned a session ID to this panel
        const updatedState = panel.state;
        const cs = (updatedState.customState || {}) as TerminalPanelState;
        cs.hasClaudeSessionId = true;
        updatedState.customState = cs;
        panelManager.updatePanel(panel.id, { state: updatedState });
      }

      // Wait for the shell to actually emit output (prompt) before injecting the command.
      // This avoids the race condition where the fixed 500ms delay was insufficient
      // and the command was written before the shell was ready to accept input.
      const panelId = panel.id;
      let commandInjected = false;

      const injectCommand = () => {
        if (commandInjected) return;
        commandInjected = true;
        onShellReady.dispose();
        this.writeToTerminal(panelId, commandToRun + '\r');
      };

      const onShellReady = ptyProcess.onData(() => {
        // Shell emitted data (prompt), it's ready to accept input.
        // Small additional delay to let the prompt fully render.
        setTimeout(injectCommand, 300);
      });

      // Safety timeout: if the shell never emits data within 3s, inject anyway
      setTimeout(injectCommand, 3000);
    }

  }
  
  private setupTerminalHandlers(terminal: TerminalProcess): void {
    // Handle terminal output
    terminal.pty.onData((data: string) => {
      // Update last activity
      terminal.lastActivity = new Date();
      
      // Add to scrollback buffer
      this.addToScrollback(terminal, data);
      
      // Detect commands (simple heuristic - look for carriage returns)
      if (data.includes('\r') || data.includes('\n')) {
        if (terminal.currentCommand.trim()) {
          terminal.commandHistory.push(terminal.currentCommand);
          
          // Emit command executed event
          panelManager.emitPanelEvent(
            terminal.panelId,
            'terminal:command_executed',
            {
              command: terminal.currentCommand,
              timestamp: new Date().toISOString()
            }
          );
          
          // Check for file operation commands
          if (this.isFileOperationCommand(terminal.currentCommand)) {
            panelManager.emitPanelEvent(
              terminal.panelId,
              'files:changed',
              {
                command: terminal.currentCommand,
                timestamp: new Date().toISOString()
              }
            );
          }
          
          terminal.currentCommand = '';
        }
      } else {
        // Accumulate command input
        terminal.currentCommand += data;
      }
      
      // Buffer output for batching instead of sending immediately
      terminal.outputBuffer += data;

      if (terminal.outputBuffer.length >= OUTPUT_BATCH_SIZE) {
        // Buffer is large enough — flush immediately
        this.flushOutputBuffer(terminal);
      } else if (!terminal.outputFlushTimer) {
        // Schedule flush for next frame
        terminal.outputFlushTimer = setTimeout(() => {
          this.flushOutputBuffer(terminal);
        }, OUTPUT_BATCH_INTERVAL);
      }
    });
    
    // Handle terminal exit
    terminal.pty.onExit((exitCode: { exitCode: number; signal?: number }) => {
      // Emit exit event
      panelManager.emitPanelEvent(
        terminal.panelId,
        'terminal:exit',
        {
          exitCode: exitCode.exitCode,
          signal: exitCode.signal,
          timestamp: new Date().toISOString()
        }
      );
      
      // Clean up
      this.terminals.delete(terminal.panelId);
      
      // Notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exited', {
          sessionId: terminal.sessionId,
          panelId: terminal.panelId,
          exitCode: exitCode.exitCode
        });
      }
    });
  }
  
  private addToScrollback(terminal: TerminalProcess, data: string): void {
    // Add raw data to scrollback buffer
    terminal.scrollbackBuffer += data;
    
    // Trim buffer if it exceeds max size (keep last ~500KB of data)
    const maxBufferSize = 500000; // 500KB
    if (terminal.scrollbackBuffer.length > maxBufferSize) {
      // Keep the most recent data
      terminal.scrollbackBuffer = terminal.scrollbackBuffer.slice(-maxBufferSize);
    }
  }
  
  private isFileOperationCommand(command: string): boolean {
    const fileOperations = [
      'touch', 'rm', 'mv', 'cp', 'mkdir', 'rmdir',
      'cat >', 'echo >', 'echo >>', 'vim', 'vi', 'nano', 'emacs',
      'git add', 'git rm', 'git mv'
    ];
    
    const trimmedCommand = command.trim().toLowerCase();
    return fileOperations.some(op => trimmedCommand.startsWith(op));
  }
  
  isTerminalInitialized(panelId: string): boolean {
    return this.terminals.has(panelId);
  }
  
  writeToTerminal(panelId: string, data: string): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found`);
      return;
    }
    
    terminal.pty.write(data);
    terminal.lastActivity = new Date();
  }
  
  resizeTerminal(panelId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found for resize`);
      return;
    }

    // Reject unreasonably small dimensions (likely from hidden container)
    if (cols < 20 || rows < 5) {
      console.warn(`[TerminalPanelManager] Rejecting invalid resize ${cols}x${rows} for ${panelId}`);
      return;
    }

    terminal.pty.resize(cols, rows);
    
    // Update panel state with new dimensions
    const panel = panelManager.getPanel(panelId);
    if (panel) {
      const state = panel.state;
      state.customState = {
        ...state.customState,
        dimensions: { cols, rows }
      } as TerminalPanelState;
      panelManager.updatePanel(panelId, { state });
    }
  }
  
  async saveTerminalState(panelId: string): Promise<void> {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found for state save`);
      return;
    }
    
    const panel = panelManager.getPanel(panelId);
    if (!panel) return;
    
    // Get current working directory (if possible)
    let cwd = (panel.state.customState && 'cwd' in panel.state.customState) ? panel.state.customState.cwd : undefined;
    cwd = cwd || process.cwd();
    try {
      // Try to get CWD from process (platform-specific)
      if (process.platform !== 'win32') {
        const pid = terminal.pty.pid;
        if (pid) {
          // This is a simplified approach - in production you might use platform-specific methods
          cwd = await this.getProcessCwd(pid);
        }
      }
    } catch (error) {
      console.warn(`[TerminalPanelManager] Could not get CWD for terminal ${panelId}:`, error);
    }
    
    // Save state to panel
    const state = panel.state;
    state.customState = {
      ...state.customState,
      isInitialized: true,
      cwd: cwd,
      scrollbackBuffer: terminal.scrollbackBuffer,
      commandHistory: terminal.commandHistory.slice(-100), // Keep last 100 commands
      lastActivityTime: terminal.lastActivity.toISOString(),
      lastActiveCommand: terminal.currentCommand
    } as TerminalPanelState;
    
    await panelManager.updatePanel(panelId, { state });
    
  }
  
  private async getProcessCwd(pid: number): Promise<string> {
    // This is platform-specific and simplified
    // In production, you'd use more robust methods
    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        const fs = require('fs').promises;
        const cwdLink = `/proc/${pid}/cwd`;
        return await fs.readlink(cwdLink);
      } catch {
        return process.cwd();
      }
    }
    return process.cwd();
  }
  
  async restoreTerminalState(panel: ToolPanel, state: TerminalPanelState, wslContext?: WSLContext | null): Promise<void> {
    if (!state.scrollbackBuffer || state.scrollbackBuffer.length === 0) {
      return;
    }

    // Initialize terminal first
    await this.initializeTerminal(panel, state.cwd || process.cwd(), wslContext);
    
    const terminal = this.terminals.get(panel.id);
    if (!terminal) return;
    
    // Restore scrollback buffer (handle both string and array formats)
    if (typeof state.scrollbackBuffer === 'string') {
      terminal.scrollbackBuffer = state.scrollbackBuffer;
    } else if (Array.isArray(state.scrollbackBuffer)) {
      // Convert legacy array format to string
      terminal.scrollbackBuffer = state.scrollbackBuffer.join('\n');
    } else {
      terminal.scrollbackBuffer = '';
    }
    terminal.commandHistory = state.commandHistory || [];
    
    // Send restoration indicator to terminal
    const restorationMsg = `\r\n[Session Restored from ${state.lastActivityTime || 'previous session'}]\r\n`;
    terminal.pty.write(restorationMsg);
    
    // Send scrollback to frontend
    if (mainWindow && state.scrollbackBuffer) {
      mainWindow.webContents.send('terminal:output', {
        sessionId: panel.sessionId,
        panelId: panel.id,
        output: state.scrollbackBuffer + restorationMsg
      });
    }
  }
  
  getTerminalState(panelId: string): TerminalPanelState | null {
    const terminal = this.terminals.get(panelId);
    if (!terminal) return null;
    
    return {
      isInitialized: true,
      cwd: process.cwd(), // Simplified - would need platform-specific implementation
      shellType: process.env.SHELL || 'bash',
      scrollbackBuffer: terminal.scrollbackBuffer,
      commandHistory: terminal.commandHistory,
      lastActivityTime: terminal.lastActivity.toISOString(),
      lastActiveCommand: terminal.currentCommand
    };
  }
  
  destroyTerminal(panelId: string): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      return;
    }

    // Save state before destroying
    this.saveTerminalState(panelId);

    // Clear timers
    if (terminal.outputFlushTimer) {
      clearTimeout(terminal.outputFlushTimer);
      terminal.outputFlushTimer = null;
    }
    if (terminal.pauseSafetyTimer) {
      clearTimeout(terminal.pauseSafetyTimer);
      terminal.pauseSafetyTimer = null;
    }
    this.flushOutputBuffer(terminal);

    // Kill the PTY process
    try {
      if (terminal.isWSL) {
        terminal.pty.write('exit\r');
        // Give WSL a moment to gracefully exit
        setTimeout(() => {
          try { terminal.pty.kill(); } catch { /* already exited */ }
        }, 500);
      } else {
        terminal.pty.kill();
      }
    } catch (error) {
      console.error(`[TerminalPanelManager] Error killing terminal ${panelId}:`, error);
    }

    // Remove from map
    this.terminals.delete(panelId);
  }
  
  /**
   * Get all active terminal panel IDs.
   */
  getAllPanelIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Send Ctrl+C to all running terminals (for graceful shutdown).
   * Returns array of panel IDs that were signaled.
   */
  sendCtrlCToAll(): string[] {
    const signaledPanels: string[] = [];

    for (const [panelId, terminal] of this.terminals) {
      try {
        terminal.pty.write('\x03');
        signaledPanels.push(panelId);
        console.log(`[TerminalPanelManager] Sent Ctrl+C to terminal panel ${panelId}`);
      } catch (error) {
        console.error(`[TerminalPanelManager] Error sending Ctrl+C to terminal ${panelId}:`, error);
      }
    }

    return signaledPanels;
  }

  /**
   * Save state for all running terminals.
   */
  async saveAllTerminalStates(): Promise<void> {
    for (const panelId of this.terminals.keys()) {
      await this.saveTerminalState(panelId);
    }
  }

  /**
   * Get scrollback buffer for a specific terminal.
   * Returns null if terminal not found.
   */
  getTerminalScrollback(panelId: string): string | null {
    return this.terminals.get(panelId)?.scrollbackBuffer ?? null;
  }

  destroyAllTerminals(): void {
    for (const [panelId, terminal] of this.terminals) {
      try {
        // Save state before killing
        this.saveTerminalState(panelId);

        // Clear timers
        if (terminal.outputFlushTimer) {
          clearTimeout(terminal.outputFlushTimer);
          terminal.outputFlushTimer = null;
        }
        if (terminal.pauseSafetyTimer) {
          clearTimeout(terminal.pauseSafetyTimer);
          terminal.pauseSafetyTimer = null;
        }
        this.flushOutputBuffer(terminal);

        terminal.pty.kill();
      } catch (error) {
        console.error(`[TerminalPanelManager] Error killing terminal ${panelId}:`, error);
      }
    }

    this.terminals.clear();
  }

  getActiveTerminals(): string[] {
    return Array.from(this.terminals.keys());
  }
}

// Export singleton instance
export const terminalPanelManager = new TerminalPanelManager();
