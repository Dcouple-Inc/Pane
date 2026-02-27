import { execSync as nodeExecSync, ExecSyncOptions, ExecSyncOptionsWithStringEncoding, ExecSyncOptionsWithBufferEncoding, exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import { getShellPath } from './shellPath';
import { WSLContext, wrapCommandForWSL } from './wslUtils';

const nodeExecAsync = promisify(exec);

/**
 * Extended ExecSyncOptions that includes a custom 'silent' flag
 * to suppress command execution logging
 */
export interface ExtendedExecSyncOptions extends ExecSyncOptions {
  silent?: boolean;
}

class CommandExecutor {
  execSync(command: string, options: ExecSyncOptionsWithStringEncoding & { silent?: boolean }, wslContext?: WSLContext | null): string;
  execSync(command: string, options?: ExecSyncOptionsWithBufferEncoding & { silent?: boolean }, wslContext?: WSLContext | null): Buffer;
  execSync(command: string, options?: ExtendedExecSyncOptions, wslContext?: WSLContext | null): string | Buffer {
    // Log the command being executed (unless silent mode requested)
    const cwd = options?.cwd || process.cwd();

    const extendedOptions = options as ExtendedExecSyncOptions;
    const silentMode = extendedOptions?.silent === true;

    // Handle WSL command wrapping
    let actualCommand = command;
    let actualOptions = extendedOptions;

    if (wslContext) {
      // Extract cwd for WSL (it's a Linux path)
      const wslCwd = typeof cwd === 'string' ? cwd : undefined;
      actualCommand = wrapCommandForWSL(command, wslContext.distribution, wslCwd);
      // WSL handles cwd internally, remove it from options
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cwd: _cwd, silent: _silent, ...cleanOptions } = extendedOptions || {};
      actualOptions = cleanOptions as ExtendedExecSyncOptions;
    }

    if (!silentMode) {
      console.log(`[CommandExecutor] Executing: ${actualCommand} in ${cwd}`);
    }

    // Get enhanced shell PATH
    const shellPath = getShellPath();

    // Merge enhanced PATH into options (but remove our custom silent flag)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { silent: _silent, ...cleanOptions } = actualOptions || {};
    const enhancedOptions = {
      ...cleanOptions,
      env: {
        ...process.env,
        ...cleanOptions?.env,
        PATH: shellPath
      }
    };

    try {
      const result = nodeExecSync(actualCommand, enhancedOptions as ExecSyncOptions);

      // Log success with a preview of the result (unless silent mode)
      if (result && !silentMode) {
        const resultStr = result.toString();
        const lines = resultStr.split('\n');
        const preview = lines[0].substring(0, 100) +
                        (lines.length > 1 ? ` ... (${lines.length} lines)` : '');
        console.log(`[CommandExecutor] Success: ${preview}`);
      }

      return result;
    } catch (error: unknown) {
      // Log error (unless silent mode)
      if (!silentMode) {
        console.error(`[CommandExecutor] Failed: ${actualCommand}`);
        console.error(`[CommandExecutor] Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      throw error;
    }
  }

  async execAsync(command: string, options?: ExecOptions & { timeout?: number }, wslContext?: WSLContext | null): Promise<{ stdout: string; stderr: string }> {
    // Log the command being executed
    const cwd = options?.cwd || process.cwd();

    // Handle WSL command wrapping
    let actualCommand = command;
    let actualOptions = options;

    if (wslContext) {
      // Extract cwd for WSL (it's a Linux path)
      const wslCwd = typeof cwd === 'string' ? cwd : undefined;
      actualCommand = wrapCommandForWSL(command, wslContext.distribution, wslCwd);
      // WSL handles cwd internally, remove it from options
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cwd: _cwd, ...cleanOptions } = options || {};
      actualOptions = cleanOptions;
    }

    console.log(`[CommandExecutor] Executing async: ${actualCommand} in ${cwd}`);

    // Get enhanced shell PATH
    const shellPath = getShellPath();

    // Set up timeout (default 10 seconds)
    const timeout = actualOptions?.timeout || 10000;

    // Merge enhanced PATH into options
    const enhancedOptions: ExecOptions = {
      ...actualOptions,
      timeout,
      env: {
        ...process.env,
        ...actualOptions?.env,
        PATH: shellPath
      }
    };

    try {
      const result = await nodeExecAsync(actualCommand, enhancedOptions);

      // Log success with a preview of the result
      if (result.stdout) {
        const stdout = String(result.stdout);
        const lines = stdout.split('\n');
        const preview = lines[0].substring(0, 100) +
                        (lines.length > 1 ? ` ... (${lines.length} lines)` : '');
        console.log(`[CommandExecutor] Async Success: ${preview}`);
      }

      return { stdout: String(result.stdout), stderr: String(result.stderr) };
    } catch (error: unknown) {
      // Log error
      console.error(`[CommandExecutor] Async Failed: ${actualCommand}`);
      console.error(`[CommandExecutor] Async Error: ${error instanceof Error ? error.message : String(error)}`);

      throw error;
    }
  }
}

// Export a singleton instance
export const commandExecutor = new CommandExecutor();

// Export the execSync function as a drop-in replacement
export const execSync = commandExecutor.execSync.bind(commandExecutor);

// Export the execAsync function
export const execAsync = commandExecutor.execAsync.bind(commandExecutor);