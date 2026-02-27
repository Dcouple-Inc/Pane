# Plan: WSL Environment Detection & Integration (Issue #4)

## Goal

Allow foozol (running as a native Windows Electron app) to work with projects that live inside WSL. Users who develop inside WSL currently cannot use foozol because the directory picker only shows Windows paths, and all processes spawn on the Windows side.

## Why

- Windows developers who use WSL for their actual dev work cannot use foozol at all
- Projects inside WSL are invisible to foozol's file picker
- Even if a WSL path were manually entered, git commands, terminal spawns, and script execution would all fail because they'd try to run on the Windows side

## What

When a user browses for a project directory and selects a path under `\\wsl.localhost\<distro>\...` (or `\\wsl$\<distro>\...`), foozol should:
1. Auto-detect that this is a WSL project, extract the distro name and Linux path
2. Store the project with WSL metadata (`wsl_enabled`, `wsl_distribution`, Linux-native path)
3. Spawn terminal panels inside WSL with the correct working directory
4. Execute git worktree operations inside WSL
5. Run scripts (build/run) inside WSL

### Success Criteria

- [ ] User can browse to `\\wsl.localhost\Ubuntu\home\user\project` in the directory picker
- [ ] foozol auto-detects WSL, stores the Linux path `/home/user/project` and distro `Ubuntu`
- [ ] Terminal panels open a bash shell inside the correct WSL distro at the project path
- [ ] Git worktree creation/deletion works inside WSL
- [ ] Git commit, diff, status, rebase operations work for WSL sessions
- [ ] Run/build scripts execute inside WSL
- [ ] File read/write in the Editor panel works for WSL projects (via UNC path conversion)
- [ ] Existing non-WSL projects are completely unaffected
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

## Scope Exclusions

- **Claude/Codex manager classes** (`claudeCodeManager.ts`, `codexManager.ts`, `AbstractCliManager.ts`): These are being ripped out in favor of terminal-based tooling. Do NOT add WSL support to them.
- **Unit/integration tests**: Not included per project conventions.

## All Needed Context

### Documentation & References

```yaml
- file: main/src/database/models.ts
  why: Project interface needs wsl_enabled and wsl_distribution fields (lines 1-19)

- file: frontend/src/types/project.ts
  why: Frontend Project/CreateProjectRequest/UpdateProjectRequest types need WSL fields (lines 1-54)

- file: main/src/database/database.ts
  why: createProject() at line 1311 and updateProject() at line 1357 need WSL column handling
  why: runMigrations() at line 113 — follow existing ALTER TABLE pattern

- file: main/src/ipc/project.ts
  why: projects:create handler (line 69) does mkdir, git init — must go through WSL for WSL projects
  why: projects:detect-branch handler (line 371) runs git commands with path

- file: main/src/services/worktreeManager.ts
  why: execWithShellPath() wrapper (line 24) and all git commands need WSL routing
  why: getProjectPaths() (line 45) uses path.join — breaks WSL Linux paths
  why: createWorktree() (line 72), removeWorktree() (line 178), and all git methods

- file: main/src/services/terminalPanelManager.ts
  why: initializeTerminal() at line 30 spawns PTY — needs WSL shell spawning

- file: main/src/utils/commandExecutor.ts
  why: Central execSync (line 18) and execAsync (line 67) — add optional wslContext param

- file: main/src/ipc/git.ts
  why: Uses execSync from commandExecutor for git operations with cwd: session.worktreePath

- file: main/src/services/panels/logPanel/logsManager.ts
  why: runScript() at line 92 spawns child_process.spawn with cwd — needs WSL wrapping

- file: main/src/ipc/file.ts
  why: Uses fs.readFile/writeFile with session.worktreePath — needs UNC path for WSL

- file: main/src/ipc/dashboard.ts
  why: Has execSync calls for git operations — verify WSL coverage

- file: frontend/src/components/DraggableProjectTreeView.tsx
  why: "Add New Project" dialog (around line 2515) and handleCreateProject (line 1180)

- file: frontend/src/components/ProjectSettings.tsx
  why: Project settings UI — needs WSL indicator
```

### Known Gotchas & Library Quirks

```
CRITICAL: PATH STORAGE STRATEGY
Store Linux paths in the DB (e.g., /home/user/project), NOT UNC paths.
98% of usage is command execution which needs Linux paths.
The only exception is file.ts which uses Node's fs module — for that,
convert Linux path → UNC path at the call site using linuxToUNCPath().

CRITICAL: When using `wsl.exe -d <distro> -- <command>`, the command runs in the WSL
user's home directory by default. Use --cd flag for working directory:
`wsl.exe -d <distro> --cd <path> -- <command>` (WSL 0.67.6+).
Fallback: wrap command in bash -c with cd prefix.

CRITICAL: `\\wsl.localhost\` is the modern UNC path prefix (Windows 10 2004+).
`\\wsl$\` is the legacy prefix. Both MUST be detected.

CRITICAL: node-pty on Windows can spawn `wsl.exe` directly as the shell executable.
This is the correct approach for terminal panels — NOT wrapping with cmd.exe.

CRITICAL: `path.join()` uses backslashes on Windows.
For WSL Linux paths, NEVER use path.join(). Use posixJoin() or string
concatenation with forward slashes.

CRITICAL: worktreeManager.ts line 76 uses `join(baseDir, name)` to build worktree paths.
For WSL projects, this must use forward-slash concatenation instead.

CRITICAL: `cwd` option in execSync/execAsync is a Windows-side concept.
For WSL commands, cwd goes INSIDE the command wrapping (cd <path> &&),
not in the options object. Set options.cwd to undefined for WSL.

CRITICAL: Shell escaping for wsl.exe commands must handle: single quotes,
double quotes, dollar signs, backticks, backslashes, and exclamation marks.
Git commands like `git commit -m "message"` contain double quotes.

CRITICAL: Killing wsl.exe on Windows does NOT kill processes inside WSL.
For terminal cleanup, send `exit\r` before killing the PTY to gracefully
close the WSL shell. Child process cleanup inside WSL is best-effort.

CRITICAL: Before creating a WSL project, verify wsl.exe exists and the
specified distro is installed. Use `wsl.exe -l -q` to list distros.

CRITICAL: WSL distro names from UNC paths may have different casing than
what `wsl.exe -l -q` returns. Use case-insensitive matching when validating.
```

## Implementation Blueprint

### Architecture Decision: Path Storage

**Store Linux paths in DB.** Rationale:
- Command execution (git, terminals, scripts) is 98% of path usage — all need Linux paths
- `file.ts` is the only place that uses Node's `fs` module with project paths — add a `linuxToUNCPath(linuxPath, distro)` helper for that
- Avoids constant UNC→Linux conversion at every command execution site

### Architecture Decision: WSL Context Threading

**Look up project from database when needed.** Don't add WSL fields to sessions table.
- Sessions already have `project_id`
- All places that need WSL context can do: `project = db.getProject(session.project_id)` → `wslContext = getWSLContextFromProject(project)`
- This is a simple approach that avoids schema changes on sessions and keeps WSL as a project-level concern

### Architecture Decision: Command Execution

**Add optional `wslContext` parameter to existing `execSync`/`execAsync` in commandExecutor.**
Don't create separate methods. This ensures all command execution flows through the same code path and callers just pass WSL context when available.

### Data Models

```typescript
// Add to Project interface in BOTH:
//   main/src/database/models.ts
//   frontend/src/types/project.ts
wsl_enabled?: boolean;
wsl_distribution?: string | null;
```

### Tasks (in implementation order)

```yaml
Task 1: Create WSL utility module
CREATE main/src/utils/wslUtils.ts:
  - parseWSLPath(uncPath): { distro, linuxPath } | null
  - isWSLUNCPath(path): boolean
  - linuxToUNCPath(linuxPath, distro): string  # For file.ts fs operations
  - posixJoin(...segments): string  # Forward-slash join for Linux paths
  - wrapCommandForWSL(command, distro, cwd?): string  # Robust shell escaping
  - getWSLShellSpawn(distro, cwd?): { path, name, args }  # Match ShellInfo shape
  - getWSLContextFromProject(project): WSLContext | null
  - validateWSLAvailable(distro): boolean  # Check wsl.exe exists + distro installed
  - WSLContext interface: { enabled, distribution, linuxPath }
  PATTERNS TO FOLLOW: shellDetector.ts for exported functions/interfaces

Task 2: Database schema, types, and service updates for WSL
CREATE main/src/database/migrations/006_add_wsl_support.sql:
  - ALTER TABLE projects ADD COLUMN wsl_enabled BOOLEAN DEFAULT 0;
  - ALTER TABLE projects ADD COLUMN wsl_distribution TEXT;
MODIFY main/src/database/database.ts:
  - In runMigrations(): check PRAGMA table_info(projects) for wsl_enabled column
  - If missing: ALTER TABLE to add both columns
  - FOLLOW pattern at line 113+ (check column existence, then ALTER)
  - In createProject() (line 1311): add wsl_enabled, wsl_distribution params and to INSERT
  - In updateProject() (line 1357): add wsl_enabled, wsl_distribution field handling
MODIFY main/src/database/models.ts:
  - Add wsl_enabled?: boolean and wsl_distribution?: string | null to Project
MODIFY frontend/src/types/project.ts:
  - Add same fields to Project, CreateProjectRequest, UpdateProjectRequest

Task 3: WSL-aware project creation (backend)
MODIFY main/src/ipc/project.ts:
  - In projects:create handler (line 69):
    - Import parseWSLPath, wrapCommandForWSL, validateWSLAvailable from wslUtils
    - After receiving projectData.path, call parseWSLPath()
    - If WSL detected:
      - Call validateWSLAvailable(distro) — return error if wsl.exe missing or distro not installed
      - Store actualPath = wslInfo.linuxPath (the Linux path)
      - Skip mkdirSync; use nodeExecSync(wrapCommandForWSL('mkdir -p ...', distro))
      - Run git rev-parse, git init, git checkout, git commit via wrapCommandForWSL
      - Pass wsl_enabled=true and wsl_distribution to createProject()
    - If NOT WSL: existing flow unchanged
  - In projects:detect-branch handler (line 371):
    - Check if path is WSL UNC; if so, run git command through WSL
  - In projects:activate handler (line 200):
    - worktreeManager.initializeProject needs WSL context for mkdir

Task 4: WSL-aware project creation (frontend)
MODIFY frontend/src/components/DraggableProjectTreeView.tsx:
  - After directory dialog returns a path (line 2580):
    - Import/create a frontend parseWSLPath utility (or inline regex check)
    - If UNC path detected: show "WSL: <distro>" badge next to the path input
    - Auto-populate wsl_enabled and wsl_distribution in the CreateProjectRequest
    - The path sent to backend is the original UNC path (backend extracts Linux path)
MODIFY frontend/src/components/ProjectSettings.tsx:
  - If project.wsl_enabled is true, show read-only "WSL: <distro>" indicator
  - Display in the "Project Overview" section near the Repository Path

Task 5: WSL-aware command execution
MODIFY main/src/utils/commandExecutor.ts:
  - Import WSLContext, wrapCommandForWSL from wslUtils
  - Add optional wslContext parameter to execSync and execAsync signatures:
    execSync(command, options?, wslContext?): string | Buffer
    execAsync(command, options?, wslContext?): Promise<{stdout, stderr}>
  - Inside both methods: if wslContext is provided:
    - Extract cwd from options (this is a Linux path for WSL projects)
    - Wrap command: command = wrapCommandForWSL(command, wslContext.distribution, cwd)
    - Set options.cwd = undefined (WSL handles cwd inside the command)
  - If wslContext is NOT provided: existing behavior unchanged

Task 6: WSL-aware worktree management
MODIFY main/src/services/worktreeManager.ts:
  - Import WSLContext, posixJoin, wrapCommandForWSL, getWSLContextFromProject from wslUtils
  - Add wslContext parameter to key methods:
    - createWorktree(projectPath, name, branch?, baseBranch?, worktreeFolder?, wslContext?)
    - removeWorktree(projectPath, name, worktreeFolder?, sessionCreatedAt?, wslContext?)
    - initializeProject(projectPath, worktreeFolder?, wslContext?)
    - listBranches(projectPath, wslContext?)
    - getProjectMainBranch(projectPath, wslContext?)
    - And ALL other methods that call execWithShellPath
  - Create module-level execForProject(command, cwd, wslContext?):
    - If wslContext: use wsl.exe wrapping with cwd inside the command
    - If not: use existing execWithShellPath(command, { cwd })
  - In getProjectPaths(): if wslContext, use posixJoin instead of path.join
    - Check: worktreeFolder.startsWith('/') for absolute Linux path detection
    - Build worktreePath with posixJoin(baseDir, name) instead of join(baseDir, name)
  - In initializeProject(): if wslContext, mkdir via WSL instead of fs mkdir
  - Validate: for WSL projects, worktree_folder must be a Linux path (not Windows)

Task 7: WSL-aware terminal spawning
MODIFY main/src/services/terminalPanelManager.ts:
  - Import getWSLShellSpawn, WSLContext from wslUtils
  - Change initializeTerminal signature:
    async initializeTerminal(panel, cwd, wslContext?: WSLContext | null)
  - In initializeTerminal():
    if (wslContext && process.platform === 'win32') {
      const wslShell = getWSLShellSpawn(wslContext.distribution, cwd);
      shellPath = wslShell.path;    // 'wsl.exe'
      shellArgs = wslShell.args;    // ['-d', 'Ubuntu', '--cd', '/path']
      spawnCwd = undefined;          // WSL handles cwd
    } else {
      // existing ShellDetector logic
    }
  - In destroyTerminal(): before killing PTY, if WSL, write 'exit\r' first
    with a small timeout to allow graceful shutdown
  - Update restoreTerminalState() to also accept and pass wslContext
  - CALLER CHANGES: everywhere initializeTerminal is called, pass wslContext
    (see Task 9 for how context is threaded)

Task 8: WSL-aware git IPC handlers
MODIFY main/src/ipc/git.ts:
  - Import getWSLContextFromProject from wslUtils
  - For handlers that operate on sessions:
    - Look up session.project_id → databaseService.getProject(project_id)
    - Get wslContext = getWSLContextFromProject(project)
    - Pass wslContext to execSync calls:
      execSync(command, { cwd: worktreePath, encoding: 'utf-8' }, wslContext)
  - Affects these operations (at minimum):
    - git status --porcelain (line 302)
    - git add -A (line 312)
    - git commit (line 318)
    - git diff (line 414, 420)
    - git diff --name-only (line 423)
    - All other git operations using session.worktreePath

Task 9: Thread WSL context through session/panel creation flow
  TRACE THE FLOW:
  1. Session creation: main/src/services/taskQueue.ts calls worktreeManager.createWorktree()
     - It already has targetProject (from databaseService.getProject)
     - Extract wslContext, pass to createWorktree()
  2. Panel initialization: when terminal panels are created/initialized
     - terminalPanelManager.initializeTerminal() is called from panel lifecycle code
     - The panel has panel.sessionId → look up session → look up project → get wslContext
     - Pass wslContext to initializeTerminal()
  3. Search codebase for ALL callers of:
     - terminalPanelManager.initializeTerminal()
     - worktreeManager.createWorktree()
     - worktreeManager.removeWorktree()
     - execSync/execAsync with cwd that could be a WSL path
     And ensure WSL context is passed when available.

Task 10: WSL-aware script execution
MODIFY main/src/services/panels/logPanel/logsManager.ts:
  - In runScript() (line 92):
    - Determine if project is WSL (look up project from session)
    - If WSL: change spawn call at line 148:
      From: spawn(command, [], { cwd, shell: true, env: {...} })
      To:   spawn('wsl.exe', ['-d', distro, '--cd', cwd, '--', 'bash', '-c', command], { env: {...} })
    - No cwd in spawn options for WSL (handled by --cd flag)
  - In stopScript(): for WSL, send graceful termination before SIGKILL

Task 11: WSL-aware file operations
MODIFY main/src/ipc/file.ts:
  - Import linuxToUNCPath, getWSLContextFromProject from wslUtils
  - In file:read handler (line 54):
    - Look up session → project → wslContext
    - If WSL: convert worktreePath to UNC for fs operations
      const fsPath = linuxToUNCPath(session.worktreePath, wslContext.distribution)
    - Use fsPath instead of session.worktreePath for path.join and fs.readFile
  - Same pattern for file:write, file:list, file:delete, file:search handlers
  - IMPORTANT: The UNC path \\wsl.localhost\Distro\path works with Windows fs module
```

### Per-Task Pseudocode

#### Task 1: wslUtils.ts (complete)

```typescript
// main/src/utils/wslUtils.ts
import { execSync as nodeExecSync } from 'child_process';

export interface WSLPathInfo {
  distro: string;
  linuxPath: string;
}

export interface WSLContext {
  enabled: boolean;
  distribution: string;
  linuxPath: string;
}

/**
 * Parse a Windows UNC path to extract WSL distro and Linux path.
 * Handles \\wsl.localhost\Distro\... and \\wsl$\Distro\...
 */
export function parseWSLPath(windowsPath: string): WSLPathInfo | null {
  const normalized = windowsPath.replace(/\\/g, '/');
  const match = normalized.match(/^\/\/(wsl\.localhost|wsl\$)\/([^/]+)(\/.*)?$/i);
  if (!match) return null;
  return {
    distro: match[2],
    linuxPath: match[3] || '/',
  };
}

export function isWSLUNCPath(pathStr: string): boolean {
  return parseWSLPath(pathStr) !== null;
}

/**
 * Convert a Linux path back to a Windows UNC path for fs module access.
 * Example: linuxToUNCPath('/home/user/project', 'Ubuntu')
 *   → '\\\\wsl.localhost\\Ubuntu\\home\\user\\project'
 */
export function linuxToUNCPath(linuxPath: string, distro: string): string {
  // Use wsl.localhost for modern Windows
  const windowsPath = linuxPath.replace(/\//g, '\\');
  return `\\\\wsl.localhost\\${distro}${windowsPath}`;
}

/**
 * Join path segments with forward slashes (for Linux paths on Windows).
 * NEVER use Node's path.join() for WSL Linux paths.
 */
export function posixJoin(...segments: string[]): string {
  return segments
    .join('/')
    .replace(/\/+/g, '/')  // collapse multiple slashes
    .replace(/\/$/, '');    // remove trailing slash
}

/**
 * Escape a string for use inside a bash -c '...' single-quoted context.
 * Handles: single quotes, and ensures the command is safely wrapped.
 */
function escapeForBashSingleQuote(str: string): string {
  // In single-quoted strings, only single quotes need escaping
  // Replace ' with '\'' (end quote, escaped quote, start quote)
  return str.replace(/'/g, "'\\''");
}

/**
 * Wrap a command to execute inside WSL via wsl.exe.
 * If cwd provided, cd to it first inside WSL.
 */
export function wrapCommandForWSL(command: string, distro: string, cwd?: string): string {
  if (cwd) {
    const escapedCwd = escapeForBashSingleQuote(cwd);
    const escapedCmd = escapeForBashSingleQuote(command);
    return `wsl.exe -d ${distro} -- bash -c 'cd "${escapedCwd}" && ${escapedCmd}'`;
  }
  // Without cwd, pass command directly (simpler, fewer escaping issues)
  return `wsl.exe -d ${distro} -- bash -c '${escapeForBashSingleQuote(command)}'`;
}

/**
 * Get shell spawn info for opening an interactive WSL terminal.
 * Returns shape compatible with ShellDetector's ShellInfo.
 */
export function getWSLShellSpawn(distro: string, cwd?: string): {
  path: string;
  name: string;
  args: string[];
} {
  const args = ['-d', distro];
  if (cwd) {
    args.push('--cd', cwd);
  }
  return { path: 'wsl.exe', name: 'wsl', args };
}

/**
 * Build WSL context from a project record.
 * Returns null if project is not WSL-enabled.
 */
export function getWSLContextFromProject(project: {
  wsl_enabled?: boolean;
  wsl_distribution?: string | null;
  path: string;
}): WSLContext | null {
  if (!project.wsl_enabled || !project.wsl_distribution) return null;
  return {
    enabled: true,
    distribution: project.wsl_distribution,
    linuxPath: project.path,
  };
}

/**
 * Validate that WSL is available and the specified distro is installed.
 * Returns error message if invalid, null if OK.
 */
export function validateWSLAvailable(distro: string): string | null {
  try {
    nodeExecSync('wsl.exe --version', { encoding: 'utf-8', timeout: 5000 });
  } catch {
    return 'WSL is not installed or not available on this system.';
  }

  try {
    const output = nodeExecSync('wsl.exe -l -q', { encoding: 'utf-8', timeout: 5000 });
    // wsl -l -q outputs distro names, one per line (may have UTF-16 BOM/null chars)
    const distros = output
      .replace(/\0/g, '') // strip null chars from UTF-16
      .split('\n')
      .map(d => d.trim())
      .filter(Boolean);
    const found = distros.some(d => d.toLowerCase() === distro.toLowerCase());
    if (!found) {
      return `WSL distribution '${distro}' is not installed. Available: ${distros.join(', ')}`;
    }
  } catch {
    return 'Failed to list WSL distributions.';
  }

  return null; // All good
}
```

#### Task 3: Project creation backend (key changes)

```typescript
// In main/src/ipc/project.ts projects:create handler:
import { parseWSLPath, wrapCommandForWSL, validateWSLAvailable } from '../utils/wslUtils';

// After receiving projectData:
const wslInfo = parseWSLPath(projectData.path);
let actualPath = projectData.path;
let wslEnabled = false;
let wslDistribution: string | null = null;

if (wslInfo) {
  // Validate WSL is available
  const wslError = validateWSLAvailable(wslInfo.distro);
  if (wslError) {
    return { success: false, error: wslError };
  }

  wslEnabled = true;
  wslDistribution = wslInfo.distro;
  actualPath = wslInfo.linuxPath; // Store Linux path in DB

  // Skip Windows mkdirSync; create dir via WSL
  try {
    const mkdirCmd = wrapCommandForWSL(
      `mkdir -p '${wslInfo.linuxPath}'`,
      wslInfo.distro
    );
    nodeExecSync(mkdirCmd, { encoding: 'utf-8' });
  } catch (err) {
    // Directory might already exist, that's fine
  }

  // Check if git repo via WSL
  try {
    nodeExecSync(
      wrapCommandForWSL('git rev-parse --is-inside-work-tree', wslInfo.distro, wslInfo.linuxPath),
      { encoding: 'utf-8' }
    );
    isGitRepo = true;
  } catch { /* not a git repo */ }

  // Git init via WSL if needed
  if (!isGitRepo) {
    nodeExecSync(wrapCommandForWSL('git init', wslInfo.distro, wslInfo.linuxPath), { encoding: 'utf-8' });
    nodeExecSync(wrapCommandForWSL('git checkout -b main', wslInfo.distro, wslInfo.linuxPath), { encoding: 'utf-8' });
    nodeExecSync(wrapCommandForWSL('git commit -m "Initial commit" --allow-empty', wslInfo.distro, wslInfo.linuxPath), { encoding: 'utf-8' });
  }
} else {
  // EXISTING WINDOWS FLOW — unchanged
  if (!existsSync(projectData.path)) { mkdirSync(...); }
  // ... existing git init logic ...
}
```

#### Task 5: commandExecutor WSL integration

```typescript
// In main/src/utils/commandExecutor.ts:
import type { WSLContext } from './wslUtils';
import { wrapCommandForWSL } from './wslUtils';

class CommandExecutor {
  execSync(command: string, options?: ExtendedExecSyncOptions, wslContext?: WSLContext | null): string | Buffer {
    let effectiveCommand = command;
    let effectiveOptions = options;

    if (wslContext) {
      const cwd = options?.cwd?.toString();
      effectiveCommand = wrapCommandForWSL(command, wslContext.distribution, cwd);
      // Remove cwd from options — WSL handles it inside the command
      const { cwd: _cwd, ...restOptions } = effectiveOptions || {};
      effectiveOptions = restOptions as ExtendedExecSyncOptions;
    }

    // ... rest of existing logic using effectiveCommand and effectiveOptions ...
  }

  // Same pattern for execAsync
}
```

#### Task 6: worktreeManager WSL-aware path building

```typescript
// Key change in getProjectPaths for WSL:
import { posixJoin, WSLContext } from '../utils/wslUtils';

private getProjectPaths(projectPath: string, worktreeFolder?: string, wslContext?: WSLContext | null) {
  const cacheKey = `${projectPath}:${worktreeFolder || 'worktrees'}`;
  if (!this.projectsCache.has(cacheKey)) {
    const folderName = worktreeFolder || 'worktrees';
    let baseDir: string;

    if (wslContext) {
      // WSL: use forward-slash paths
      if (worktreeFolder && worktreeFolder.startsWith('/')) {
        baseDir = worktreeFolder; // Absolute Linux path
      } else {
        baseDir = posixJoin(projectPath, folderName);
      }
    } else {
      // Existing Windows/native logic
      if (worktreeFolder && (worktreeFolder.startsWith('/') || worktreeFolder.includes(':'))) {
        baseDir = worktreeFolder;
      } else {
        baseDir = join(projectPath, folderName);
      }
    }

    this.projectsCache.set(cacheKey, { baseDir });
  }
  return this.projectsCache.get(cacheKey)!;
}

// Similarly, in createWorktree:
const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder, wslContext);
const worktreePath = wslContext
  ? posixJoin(baseDir, name)
  : join(baseDir, name);
```

### Integration Points

```yaml
DATABASE:
  - Migration: main/src/database/migrations/006_add_wsl_support.sql
  - Runtime migration: main/src/database/database.ts runMigrations()
  - Model: main/src/database/models.ts Project interface
  - Service: createProject() and updateProject() in database.ts

BACKEND SERVICES:
  - New utility: main/src/utils/wslUtils.ts (centralized WSL logic)
  - Modified: main/src/utils/commandExecutor.ts (optional wslContext param)
  - Modified: main/src/services/worktreeManager.ts (WSL command routing + posix paths)
  - Modified: main/src/services/terminalPanelManager.ts (WSL shell spawning)
  - Modified: main/src/services/panels/logPanel/logsManager.ts (WSL script execution)

IPC HANDLERS:
  - Modified: main/src/ipc/project.ts (WSL path detection on create)
  - Modified: main/src/ipc/git.ts (WSL command routing for all git operations)
  - Modified: main/src/ipc/file.ts (UNC path conversion for fs operations)
  - Check: main/src/ipc/dashboard.ts (verify git operations are covered)

FRONTEND:
  - Modified: frontend/src/types/project.ts (WSL type fields)
  - Modified: frontend/src/components/DraggableProjectTreeView.tsx (WSL detection + badge)
  - Modified: frontend/src/components/ProjectSettings.tsx (WSL indicator display)
```

## Validation Loop

```bash
# Run these after each task — fix any errors before proceeding
pnpm typecheck          # TypeScript compilation across all workspaces
pnpm lint               # ESLint across all workspaces
# Expected: No errors. If errors, READ the error and fix.
```

## Task Execution Order (Critical Path)

1. **Task 1** (wslUtils.ts) — no dependencies, everything else imports from here
2. **Task 2** (DB migration + types + service) — depends on nothing, can parallel with Task 1
3. **Task 3** (project creation backend) — depends on Tasks 1, 2
4. **Task 4** (project creation frontend) — depends on Task 2 (types)
5. **Task 5** (commandExecutor) — depends on Task 1
6. **Task 6** (worktreeManager) — depends on Tasks 1, 5
7. **Task 7** (terminal spawning) — depends on Task 1
8. **Task 8** (git IPC) — depends on Tasks 1, 5
9. **Task 9** (WSL context threading) — woven into Tasks 6, 7, 8; implement together
10. **Task 10** (script execution) — depends on Task 1
11. **Task 11** (file operations) — depends on Task 1

## Anti-Patterns to Avoid

- Do NOT use `path.join()` for Linux paths on Windows — it produces backslashes. Use posixJoin().
- Do NOT translate paths back and forth everywhere — store Linux paths, convert to UNC only in file.ts
- Do NOT modify ShellDetector class — WSL shell spawning is project-specific, not system-wide
- Do NOT add WSL logic to `getShellPath()` — WSL PATH is irrelevant; commands run with WSL's own PATH
- Do NOT create separate execSyncWSL/execAsyncWSL methods — add wslContext param to existing methods
- Do NOT break existing non-WSL projects — all WSL paths must be guarded with `if (wslContext)` checks
- Do NOT add WSL support to claudeCodeManager/codexManager/AbstractCliManager — they're being removed
- Do NOT use `path.join` when building UNC paths in linuxToUNCPath — use string concatenation

## Deprecated Code

No code is being removed in this plan. All changes are additive with `if (wslContext)` guards.

## Confidence Score: 8/10

High confidence:
- Architecture is clean with clear integration points
- WSL UNC paths are well-documented Windows features
- node-pty can spawn wsl.exe directly
- Centralized command execution makes WSL wrapping systematic

Risk areas:
- UNC path browsing in Electron's dialog needs manual verification
- Shell escaping edge cases in complex git commands
- Process cleanup for WSL terminals is best-effort
- `wsl.exe --cd` flag requires relatively recent WSL version
