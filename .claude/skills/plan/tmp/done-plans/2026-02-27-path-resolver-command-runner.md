# Plan: PathResolver + CommandRunner Architecture for Universal Platform Support

## Goal

Replace the manual `wslContext` threading pattern (26+ callsites) with two project-scoped abstractions — `PathResolver` and `CommandRunner` — that make platform differences transparent. Fix all broken WSL handlers (explorer panel, diff panel, dashboard) as part of the migration. Show environment type in sidebar UI.

## Why

- **Broken features**: Explorer panel (`file:read`, `file:list`, `file:delete`), diff side-by-side view (`file:readAtRevision`), and dashboard git commands don't work for WSL projects due to path format mismatches
- **Root cause**: WSL is a project-level decision (made once at creation) but every downstream handler independently re-derives and handles it, leading to inconsistent coverage
- **Future-proofing**: Clean abstraction supports additional environments (remote SSH, containers) without threading new context parameters everywhere
- **UI benefit**: `PathResolver.environment` property enables showing a "(WSL)" pill in the sidebar

## What

### Success Criteria

- [ ] `PathResolver` class created with `toFileSystem()`, `join()`, `relative()`, `isWithin()`, `environment`
- [ ] `CommandRunner` class created with `exec()`, `execAsync()` wrapping platform logic
- [ ] All broken handlers fixed: `file:read`, `file:list`, `file:delete`, `file:readAtRevision`, `file:write`, `file:search`, dashboard git commands
- [ ] No more direct imports of `getWSLContextFromProject` in IPC handlers — they use project's resolver/runner
- [ ] gitDiffManager methods accept `CommandRunner` instead of `WSLContext`
- [ ] Environment pill shown next to project name in ProjectSelector dropdown
- [ ] `pnpm typecheck` and `pnpm lint` pass

## All Needed Context

### Documentation & References

```yaml
- file: main/src/utils/wslUtils.ts
  why: Contains all existing WSL utilities. PathResolver and CommandRunner absorb most of this.
  keep: parseWSLPath, validateWSLAvailable, getWSLShellSpawn, linuxToUNCPath, posixJoin
  absorb: getWSLContextFromProject, wrapCommandForWSL (into CommandRunner)
  export: escapeForBashDoubleQuote (currently private, CommandRunner needs it)

- file: main/src/utils/commandExecutor.ts
  why: Current CommandExecutor singleton. CommandRunner wraps it, hiding wslContext from callers.

- file: main/src/database/models.ts
  why: Project interface (lines 1-21) with wsl_enabled and wsl_distribution fields.

- file: main/src/ipc/file.ts
  why: Primary broken file — 14 handlers needing migration. Mix of fs ops and raw child_process calls.

- file: main/src/ipc/git.ts
  why: 34+ usages of getWSLContextForSession helper. Largest migration by volume (mechanical).

- file: main/src/ipc/dashboard.ts
  why: Uses raw child_process.execSync for git commands — completely bypasses WSL wrapping.

- file: main/src/services/gitDiffManager.ts
  why: Stateless singleton. Method signatures accept WSLContext — change to CommandRunner.

- file: main/src/services/sessionManager.ts
  why: getProjectForSession() at line 186-192. Add getProjectContext() with cache here.

- file: frontend/src/components/ProjectSelector.tsx
  why: Line 194 shows project.name. Environment pill goes next to it.

- file: frontend/src/types/project.ts
  why: Frontend Project interface — add environment field.
```

### Current Architecture (What Changes)

```
IPC Handler receives sessionId
  → sessionManager.getProjectForSession(sessionId) → Project
  → getWSLContextFromProject(project) → WSLContext | null
  → Manual linuxToUNCPath() for fs operations
  → execSync(cmd, opts, wslContext) for commands
  → Each handler does this independently, some forget or do it wrong
```

### New Architecture

```
IPC Handler receives sessionId
  → sessionManager.getProjectContext(sessionId) → { project, pathResolver, commandRunner }
  → pathResolver.toFileSystem(path)  // for fs operations — always correct format
  → commandRunner.exec(cmd, cwd)     // for commands — WSL wrapping automatic
  → Impossible to forget — the API only exposes correct paths
```

### Known Gotchas

```typescript
// CRITICAL: path.relative() cannot compute between Linux and UNC paths
// path.relative('/home/user/project', '\\\\wsl.localhost\\Ubuntu\\...') = GARBAGE
// PathResolver.relative() fixes this by converting both to filesystem format first

// CRITICAL: fs.realpath() fails on Linux paths when running on Windows
// Always use PathResolver.toFileSystem() BEFORE any fs.* call

// CRITICAL: file:readAtRevision uses raw child_process.exec, not commandExecutor
// Must be migrated to CommandRunner

// CRITICAL: dashboard.ts imports execSync from child_process, not commandExecutor
// All git commands there bypass WSL wrapping entirely

// CRITICAL: wslUtils.ts escapeForBashDoubleQuote is private (not exported)
// Must be exported before CommandRunner can use wrapCommandForWSL internally

// NOTE: Projects cannot change their path/environment type after creation.
// Users must delete and recreate to change. This means no cache invalidation
// is needed for environment changes — only for project deletion.

// INVARIANT: cwd parameter to CommandRunner is ALWAYS a stored path (Linux for WSL).
// CommandRunner handles the WSL wrapping internally. Never convert to UNC before passing to CommandRunner.
// Only use PathResolver.toFileSystem() when calling Node's fs.* functions.

// NOTE: Some services (gitPlumbingCommands, gitStatusManager, commitManager, spotlightManager,
// gitFileWatcher, updater) import execSync from commandExecutor but don't pass wslContext.
// These don't need migration — they'll continue working when wslContext param is removed.
// They may need WSL support in the future but that's out of scope for this plan.
```

### Task Dependencies

```
Tasks 1, 2 — independent, can run in parallel
Task 3 — depends on Tasks 1 and 2
Tasks 4, 5, 6, 7 — all depend on Task 3, can be parallelized
Task 8 — depends on Task 3 (needs PathResolver for environment detection)
Task 9 — depends on Tasks 4-7 (cleanup after all migrations complete)
```

## Implementation Blueprint

### Data Models

```typescript
// main/src/utils/pathResolver.ts

export type ProjectEnvironment = 'wsl' | 'windows' | 'linux' | 'macos';

export class PathResolver {
  readonly environment: ProjectEnvironment;
  private readonly distribution?: string;

  constructor(project: { path: string; wsl_enabled?: boolean; wsl_distribution?: string | null });

  /** Convert a stored path (Linux for WSL) to one Node's fs module can use */
  toFileSystem(storedPath: string): string;

  /** Join path segments using the correct separator for this environment */
  join(...segments: string[]): string;

  /** Compute relative path — converts both to filesystem format first so path.relative works */
  relative(from: string, to: string): string;

  /** Check if targetPath is within basePath — converts to filesystem format for comparison */
  isWithin(basePath: string, targetPath: string): boolean;
}
```

```typescript
// main/src/utils/commandRunner.ts

export class CommandRunner {
  private readonly wslContext: WSLContext | null; // Internal only — callers never see this

  constructor(project: { path: string; wsl_enabled?: boolean; wsl_distribution?: string | null });

  /** Execute command synchronously, wrapping for WSL if needed */
  exec(command: string, cwd: string, options?: { encoding?: string; maxBuffer?: number; silent?: boolean }): string;

  /** Execute command asynchronously, wrapping for WSL if needed */
  execAsync(command: string, cwd: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }>;
}
```

### Tasks (in implementation order)

---

#### Task 1: Create PathResolver class

```yaml
CREATE main/src/utils/pathResolver.ts:
  - Detect environment from project: WSL if wsl_enabled+wsl_distribution, else process.platform
  - toFileSystem(): if WSL, call linuxToUNCPath(path, distribution); else return as-is
  - join(): if WSL, use posixJoin; else use path.join
  - relative(): convert both paths to filesystem format via toFileSystem(), then path.relative
  - isWithin(): convert both to filesystem format, compute path.relative, check no '..' or absolute
  - Export PathResolver class and ProjectEnvironment type
```

**Pseudocode:**

```typescript
import path from 'path';
import { linuxToUNCPath, posixJoin } from './wslUtils';

export type ProjectEnvironment = 'wsl' | 'windows' | 'linux' | 'macos';

export class PathResolver {
  readonly environment: ProjectEnvironment;
  private readonly distribution?: string;

  constructor(project: { path: string; wsl_enabled?: boolean; wsl_distribution?: string | null }) {
    if (project.wsl_enabled && project.wsl_distribution) {
      this.environment = 'wsl';
      this.distribution = project.wsl_distribution;
    } else if (process.platform === 'win32') {
      this.environment = 'windows';
    } else if (process.platform === 'darwin') {
      this.environment = 'macos';
    } else {
      this.environment = 'linux';
    }
  }

  toFileSystem(storedPath: string): string {
    if (this.environment === 'wsl' && this.distribution) {
      return linuxToUNCPath(storedPath, this.distribution);
    }
    return storedPath;
  }

  join(...segments: string[]): string {
    if (this.environment === 'wsl') {
      return posixJoin(...segments);
    }
    return path.join(...segments);
  }

  relative(from: string, to: string): string {
    // Convert both to filesystem format so path.relative gets two paths
    // in the same format (both UNC for WSL, both native otherwise)
    const fsFrom = this.toFileSystem(from);
    const fsTo = this.toFileSystem(to);
    return path.relative(fsFrom, fsTo);
  }

  isWithin(basePath: string, targetPath: string): boolean {
    const fsBase = this.toFileSystem(basePath);
    const fsTarget = this.toFileSystem(targetPath);
    const rel = path.relative(fsBase, fsTarget);
    // rel === '' means paths are equal (base is within itself) — that's valid
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }
}
```

---

#### Task 2: Create CommandRunner class

```yaml
MODIFY main/src/utils/wslUtils.ts:
  - Export escapeForBashDoubleQuote (currently private) — CommandRunner needs it via wrapCommandForWSL

CREATE main/src/utils/commandRunner.ts:
  - Wraps commandExecutor singleton
  - Constructor takes project shape, builds WSLContext once via getWSLContextFromProject
  - exec() calls commandExecutor.execSync with stored wslContext
  - execAsync() calls commandExecutor.execAsync with stored wslContext
  - No caller ever sees WSLContext — it's internal
```

**Pseudocode:**

```typescript
import { commandExecutor } from './commandExecutor';
import { getWSLContextFromProject, type WSLContext } from './wslUtils';

export class CommandRunner {
  private readonly wslContext: WSLContext | null;

  constructor(project: { wsl_enabled?: boolean; wsl_distribution?: string | null; path: string }) {
    this.wslContext = getWSLContextFromProject(project);
  }

  exec(command: string, cwd: string, options?: { encoding?: string; maxBuffer?: number; silent?: boolean }): string {
    return commandExecutor.execSync(command, {
      cwd,
      encoding: options?.encoding || 'utf-8',
      maxBuffer: options?.maxBuffer,
      silent: options?.silent,
    }, this.wslContext) as string;
  }

  async execAsync(command: string, cwd: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    return commandExecutor.execAsync(command, { cwd, ...options }, this.wslContext);
  }
}
```

---

#### Task 3: Attach PathResolver and CommandRunner to Project via sessionManager

```yaml
MODIFY main/src/services/sessionManager.ts:
  - Import PathResolver, CommandRunner
  - Add private cache: Map<number, { pathResolver: PathResolver; commandRunner: CommandRunner }>
  - Add method: getProjectContext(sessionId: string) → { project, pathResolver, commandRunner } | null
  - Lazily create and cache resolver/runner when first requested
  - Invalidate cache entry when project is deleted (no need for update — path/type can't change)

  Also add: getProjectContextByProjectId(projectId: number) for handlers that have projectId directly
```

**Pseudocode:**

```typescript
import { PathResolver } from '../utils/pathResolver';
import { CommandRunner } from '../utils/commandRunner';

// In SessionManager class:
private projectContextCache = new Map<number, { pathResolver: PathResolver; commandRunner: CommandRunner }>();

getProjectContext(sessionId: string): { project: Project; pathResolver: PathResolver; commandRunner: CommandRunner } | null {
  const project = this.getProjectForSession(sessionId);
  if (!project) return null;
  return this.getOrCreateContext(project);
}

getProjectContextByProjectId(projectId: number): { project: Project; pathResolver: PathResolver; commandRunner: CommandRunner } | null {
  const project = this.getProjectById(projectId);
  if (!project) return null;
  return this.getOrCreateContext(project);
}

private getOrCreateContext(project: Project): { project: Project; pathResolver: PathResolver; commandRunner: CommandRunner } {
  if (!this.projectContextCache.has(project.id)) {
    this.projectContextCache.set(project.id, {
      pathResolver: new PathResolver(project),
      commandRunner: new CommandRunner(project),
    });
  }
  const cached = this.projectContextCache.get(project.id)!;
  return { project, ...cached };
}

// Call this from project.ts 'projects:delete' handler before deleting the project:
invalidateProjectContext(projectId: number): void {
  this.projectContextCache.delete(projectId);
}
```

---

#### Task 4: Fix file.ts handlers (highest priority — broken features)

```yaml
MODIFY main/src/ipc/file.ts:
  - Remove imports: getWSLContextFromProject, linuxToUNCPath
  - All handlers get context via: const ctx = sessionManager.getProjectContext(sessionId)
  - Use ctx.pathResolver.toFileSystem() for all fs paths
  - Use ctx.pathResolver.isWithin() for path validation (replaces broken startsWith checks)
  - Use ctx.pathResolver.relative() for relative path computation
  - Use ctx.commandRunner for all git commands (replaces raw child_process.exec)

  Handlers needing pathResolver (filesystem operations):
  1. file:read (lines 56-118) — toFileSystem for basePath, isWithin for validation
  2. file:exists (lines 121-153) — toFileSystem for basePath
  3. file:write (lines 156-242) — toFileSystem for basePath, isWithin for validation
  4. file:getPath (lines 245-275) — toFileSystem for basePath
  5. file:list (lines 494-574) — toFileSystem for basePath, relative() for relative paths
  6. file:delete (lines 577-637) — toFileSystem for basePath, isWithin for validation
  7. file:search (lines 640-805) — toFileSystem for basePath, PLUS commandRunner for git ls-files
  8. file:read-project (lines 808-849) — toFileSystem for project path
  9. file:write-project (lines 852-888) — toFileSystem for project path

  Handlers needing commandRunner (git commands):
  10. file:readAtRevision (lines 445-491) — CRITICAL: replace raw child_process.exec with commandRunner.execAsync
  11. git:commit (lines 278-376) — replace raw exec with commandRunner
  12. git:revert (lines 379-410) — replace raw execAsync with commandRunner
  13. git:restore (lines 413-442) — replace raw execAsync with commandRunner
  14. git:execute-project (lines 891-946) — replace raw execSync with commandRunner

  IMPORTANT: Every handler must null-check ctx:
    const ctx = sessionManager.getProjectContext(request.sessionId);
    if (!ctx) throw new Error('Project not found for session');
    const { pathResolver, commandRunner } = ctx;
```

**Migration pattern (before → after):**

```typescript
// BEFORE (current broken pattern):
const project = sessionManager.getProjectForSession(request.sessionId);
const wslContext = project ? getWSLContextFromProject(project) : null;
const basePath = wslContext
  ? linuxToUNCPath(session.worktreePath, wslContext.distribution)
  : session.worktreePath;
const fullPath = path.join(basePath, normalizedPath);
const resolvedWorktreePath = await fs.realpath(session.worktreePath).catch(() => session.worktreePath);
if (!resolvedFilePath.startsWith(resolvedWorktreePath)) { throw ... }  // BROKEN for WSL

// AFTER (new pattern):
const ctx = sessionManager.getProjectContext(request.sessionId);
if (!ctx) throw new Error('Project not found for session');
const { pathResolver } = ctx;
const basePath = pathResolver.toFileSystem(session.worktreePath);
const fullPath = path.join(basePath, normalizedPath);
// Validate using filesystem paths (both in same format, so path.relative works)
if (!pathResolver.isWithin(session.worktreePath, fullPath)) {
  throw new Error('File path is outside worktree');
}
// NOTE: Remove the old fs.realpath(session.worktreePath) pattern entirely.
// isWithin() handles the format conversion internally.
// For fs operations, always use basePath (already in filesystem format).
```

**Critical fix for file:readAtRevision (currently has ZERO WSL support):**

```typescript
// BEFORE (completely broken on WSL):
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { stdout } = await execAsync(`git show ${revision}:${normalizedPath}`, {
  cwd: session.worktreePath,  // Linux path as cwd on Windows = crash
  encoding: 'utf8',
});

// AFTER:
const ctx = sessionManager.getProjectContext(request.sessionId);
if (!ctx) throw new Error('Project not found for session');
const { commandRunner } = ctx;
const { stdout } = await commandRunner.execAsync(
  `git show ${revision}:${normalizedPath}`,
  session.worktreePath
);
```

---

#### Task 5: Fix dashboard.ts handlers

```yaml
MODIFY main/src/ipc/dashboard.ts:
  - Remove direct imports of execSync from child_process
  - Remove imports of getWSLContextFromProject, linuxToUNCPath
  - Replace ALL raw execSync git commands with commandRunner.exec()

  IMPORTANT: Dashboard handlers often have projectId (not sessionId).
  Use sessionManager.getProjectContextByProjectId(projectId) for project-level operations.
  Use sessionManager.getProjectContext(sessionId) for session-level operations.

  Lines to fix (all raw child_process.execSync with cwd but no WSL wrapping):
  - Line 295: git rev-parse --verify (uses projectPath → getProjectContextByProjectId)
  - Lines 305-307: git rev-list --left-right --count (uses projectPath → getProjectContextByProjectId)
  - Lines 486-488: git branch --show-current (uses session.worktree_path → getProjectContext)
  - Lines 502-504: git merge-base (uses session.worktree_path → getProjectContext)
  - Lines 517-519: git rev-parse (uses projectPath → getProjectContextByProjectId)
  - Lines 526-528: git log -1 (uses projectPath → getProjectContextByProjectId)
  - Lines 545-547: git rev-list --left-right --count (uses session.worktree_path → getProjectContext)
  - Lines 560-562: gh pr list (uses projectPath → getProjectContextByProjectId)
  - Line 743: git status --porcelain (uses worktreePath → getProjectContext)
```

---

#### Task 6: Migrate git.ts to use CommandRunner

```yaml
MODIFY main/src/ipc/git.ts:
  - Remove the local getWSLContextForSession helper (lines 111-115)
  - Remove the local gitExecSync helper (lines 118-124)
  - Remove imports of getWSLContextFromProject, wrapCommandForWSL
  - Each handler calls: const ctx = sessionManager.getProjectContext(sessionId)
  - Use ctx.commandRunner.exec() everywhere gitExecSync/wslCtx was used

  This touches ~34 usages. The migration is mechanical:
    // BEFORE:
    const wslCtx = getWSLContextForSession(sessionId);
    const result = gitExecSync('git status --porcelain', session.worktreePath, wslCtx);

    // AFTER:
    const ctx = sessionManager.getProjectContext(sessionId);
    if (!ctx) throw new Error('Project not found');
    const result = ctx.commandRunner.exec('git status --porcelain', session.worktreePath);
```

---

#### Task 7: Migrate remaining services

```yaml
MODIFY main/src/services/gitDiffManager.ts:
  - Keep as stateless singleton (current architecture)
  - Change ALL method signatures: replace wslContext?: WSLContext | null with commandRunner: CommandRunner
  - All internal execSync(cmd, { cwd }, wslContext) calls become commandRunner.exec(cmd, cwd)
  - This includes: captureWorkingDirectoryDiff, captureCommitDiff, getCommitHistory,
    getGitDiff, getCombinedDiff, getCommitDiff, getGitDiffString, getGitCommitDiff,
    getChangedFiles, getChangedFilesBetweenCommits, getDiffStats, getCommitDiffStats,
    getCommitStats, getCommitChangedFiles, getCurrentCommitHash, hasChanges,
    getUntrackedFiles, createDiffForUntrackedFiles
  - wc -l and cat commands (lines 493, 600) already go through execSync with wslContext,
    so just changing the parameter type makes them work

MODIFY main/src/services/executionTracker.ts:
  - Remove private getWSLContextForSession method (lines 33-37)
  - Store reference to sessionManager (already has it in constructor)
  - Use this.sessionManager.getProjectContext(sessionId) to get commandRunner
  - Pass commandRunner to gitDiffManager methods instead of wslContext

MODIFY main/src/events.ts:
  - Replace getWSLContextFromProject calls (lines 1055, 1086, 1231)
  - Use sessionManager.getProjectContext() or getProjectContextByProjectId() to get commandRunner
  - Pass commandRunner to gitDiffManager and worktreeManager methods

MODIFY main/src/services/worktreeManager.ts:
  - Change method signatures to accept PathResolver and CommandRunner instead of WSLContext
  - Replace getProjectPaths WSL branching with pathResolver.join()
  - Replace posixJoin/path.join branching (lines 103, 226) with pathResolver.join()
  - Replace wrapCommandForWSL + execSync calls with commandRunner.exec()
  - Replace execForProject helper with commandRunner.exec()

MODIFY main/src/ipc/script.ts:
  - Remove local getWSLContextForSession helper (lines 11-15)
  - Use sessionManager.getProjectContext() pattern
  - Fix sessions:open-ide (line 234) to use commandRunner

MODIFY main/src/ipc/project.ts:
  - Replace wrapCommandForWSL direct calls with commandRunner
  - In 'projects:delete' handler: call sessionManager.invalidateProjectContext(projectId) before deletion
```

---

#### Task 8: Add environment pill to sidebar UI

```yaml
MODIFY shared/types/panels.ts:
  - Export ProjectEnvironment type: 'wsl' | 'windows' | 'linux' | 'macos'

MODIFY main/src/ipc/project.ts:
  - In 'projects:get-all' handler (line 52-60): augment each project with environment field
  - Create a PathResolver per project to derive environment, e.g.:
    const projectsWithEnv = projects.map(p => ({
      ...p,
      environment: new PathResolver(p).environment
    }));
  - Same for 'projects:get-active' and 'projects:create' responses

MODIFY frontend/src/types/project.ts:
  - Import ProjectEnvironment from shared types
  - Add environment?: ProjectEnvironment field to Project interface

MODIFY frontend/src/components/ProjectSelector.tsx:
  - At line 194, next to project.name, render environment pill when project.environment === 'wsl'
  - Style: small pill/badge with "WSL" text, similar to existing status badges
  - Example: <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 ml-1.5">WSL</span>
  - Only show for WSL (don't show "Windows" or "Linux" — those are the normal/expected case)
```

---

#### Task 9: Clean up deprecated code

**IMPORTANT: This task runs LAST, after all migrations in Tasks 4-7 are complete and verified.**

```yaml
MODIFY main/src/utils/wslUtils.ts:
  - Remove getWSLContextFromProject() — all callers now use PathResolver/CommandRunner constructors
  - Keep WSLContext interface (still used internally by CommandRunner)
  - Keep and verify exported: parseWSLPath, validateWSLAvailable, getWSLShellSpawn,
    linuxToUNCPath, posixJoin, escapeForBashDoubleQuote, isWSLUNCPath

MODIFY main/src/utils/commandExecutor.ts:
  - Remove wslContext parameter from execSync/execAsync public signatures
  - Remove WSL wrapping logic inside execSync/execAsync
  - CommandRunner is now the ONLY path for WSL command wrapping
  - commandExecutor becomes a simple shell executor with PATH enhancement

VERIFY: No remaining imports of:
  - getWSLContextFromProject (except in CommandRunner constructor)
  - wrapCommandForWSL (except internally in commandExecutor, if kept, or CommandRunner)
  - Direct WSLContext usage in IPC handlers

VERIFY: grep -r "getWSLContextFromProject\|getWSLContextForSession" main/src/ipc/ returns no results
VERIFY: grep -r "child_process.*exec" main/src/ipc/ returns no results (except allowed patterns)
```

## Validation Loop

```bash
# Run after each task
pnpm typecheck        # TypeScript compilation across all workspaces
pnpm lint             # ESLint across all workspaces
```

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] No direct imports of `getWSLContextFromProject` in IPC handlers
- [ ] No raw `child_process.exec/execSync` in IPC handlers
- [ ] All `file:*` handlers use `pathResolver.toFileSystem()` before `fs.*` calls
- [ ] All git command handlers use `commandRunner.exec()` or `commandRunner.execAsync()`
- [ ] `file:readAtRevision` uses CommandRunner (was completely broken)
- [ ] Dashboard git commands use CommandRunner (were completely broken)
- [ ] `pathResolver.isWithin()` used for all path validation (replaces broken startsWith checks)
- [ ] gitDiffManager methods accept CommandRunner, not WSLContext
- [ ] Environment pill shows in ProjectSelector for WSL projects
- [ ] commandExecutor no longer accepts wslContext parameter (Task 9)

## Anti-Patterns to Avoid

- Don't keep the `wslContext` parameter on public APIs — the whole point is to hide it
- Don't create PathResolver/CommandRunner per-call — always use sessionManager.getProjectContext() which caches
- Don't mix old pattern (getWSLContextFromProject) with new pattern in the same file
- Don't use `path.relative()` or `startsWith` directly for path validation — always use PathResolver
- Don't import commandExecutor directly in IPC handlers — use CommandRunner via getProjectContext()
- Don't add cache invalidation for project settings changes — projects can't change path/type, just delete and recreate

## Implementation Confidence: 8/10

High confidence because:
- The pattern is mechanical — each migration follows the same before/after template
- No new dependencies or database schema changes needed
- PathResolver and CommandRunner are thin wrappers around existing utilities
- The broken handlers have clear fixes once the abstractions exist

Risk areas:
- git.ts has 34 usages to migrate — high volume but mechanical
- gitDiffManager signature changes ripple to all callers (events.ts, executionTracker.ts, git.ts, dashboard.ts)
- events.ts is 1,108 lines with complex coordination — needs careful migration
