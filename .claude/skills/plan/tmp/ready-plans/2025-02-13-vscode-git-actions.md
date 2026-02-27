# VSCode-Like Git Actions for Detail Panel

## Goal

Add VSCode Source Control-like git actions to the Detail Panel sidebar, expanding the current limited set (Rebase from main, Merge to main, Open in IDE) to include:
- **Commit with message** - Stage all and commit with user-provided message
- **Push** - Push commits to remote
- **Pull** - Pull latest from remote
- **Fetch** - Fetch without merging
- **Stash** - Stash current changes
- **Unstash (Pop)** - Pop the most recent stash
- **View commit history** (nice-to-have) - Show recent commits

## Why

- Users currently have limited git actions requiring them to open a terminal or IDE
- VSCode's Source Control is the mental model users expect
- Reduces context switching between foozol and external tools
- Makes worktree management more self-contained

## What

Expand the Actions section in `DetailPanel.tsx` to show a comprehensive set of git operations similar to VSCode's Source Control dropdown. Actions should be contextually enabled/disabled based on git status.

### Success Criteria

- [ ] Commit action shows dialog for commit message, commits all staged + unstaged changes
- [ ] Push/Pull/Fetch actions work and show progress feedback
- [ ] Stash/Unstash actions work with appropriate enable/disable states
- [ ] All actions emit proper events for UI refresh
- [ ] Error handling shows GitErrorDialog with details
- [ ] Actions disabled appropriately (e.g., can't push with no commits ahead)

## All Needed Context

### Documentation & References

```yaml
- file: main/src/ipc/git.ts
  why: Pattern for adding new IPC handlers - see existing gitPull, gitPush handlers

- file: main/src/services/worktreeManager.ts
  why: Git command execution patterns with execWithShellPath()

- file: frontend/src/hooks/useSessionView.ts
  why: Handler patterns like handleGitPull, handleGitPush

- file: frontend/src/components/DetailPanel.tsx
  why: Where actions are rendered - the main file to modify for UI

- file: frontend/src/components/SessionView.tsx:475-529
  why: Where branchActions array is built - add new actions here

- file: frontend/src/components/session/CommitMessageDialog.tsx
  why: Existing dialog for commit messages - can be reused/adapted
```

### Current Codebase Tree (relevant files)

```
main/src/
├── ipc/
│   └── git.ts                    # IPC handlers for git operations
├── services/
│   └── worktreeManager.ts        # Git command execution
├── preload.ts                    # Electron preload exposing IPC

frontend/src/
├── components/
│   ├── DetailPanel.tsx           # Sidebar showing Actions
│   ├── SessionView.tsx           # Builds branchActions array
│   └── session/
│       ├── CommitMessageDialog.tsx  # Commit message input dialog
│       └── GitErrorDialog.tsx       # Error display
├── hooks/
│   └── useSessionView.ts         # Git operation handlers
├── utils/
│   └── api.ts                    # API.sessions methods
└── types/
    └── session.ts                # GitStatus, GitCommands types
```

### Desired Codebase Tree

No new files needed - all modifications to existing files.

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: All git commands must use execWithShellPath for Windows compatibility
// See worktreeManager.ts for the pattern

// CRITICAL: After git operations, must call:
// 1. emitGitOperationToProject() to notify all sessions
// 2. gitStatusManager.updateGitStatusAfterOperation() to refresh status

// CRITICAL: For stash operations, check if stash exists before pop:
// git stash list | head -1

// CRITICAL: Commit should stage all changes first (git add -A) then commit
```

## Implementation Blueprint

### Data Models and Structure

No new types needed. Existing types suffice:
- `GitStatus` - already has all needed state
- `GitCommands` - can add new command preview methods
- `GitErrorDetails` - for error handling

### Tasks (in implementation order)

```yaml
Task 1:
MODIFY main/src/services/worktreeManager.ts:
  - ADD gitFetch(worktreePath: string) method
  - ADD gitStash(worktreePath: string) method
  - ADD gitStashPop(worktreePath: string) method
  - ADD gitStageAllAndCommit(worktreePath: string, message: string) method
  - ADD hasStash(worktreePath: string) method - returns boolean
  - FOLLOW existing gitPull/gitPush pattern with execWithShellPath

Task 2:
MODIFY main/src/ipc/git.ts:
  - ADD 'sessions:git-fetch' handler
  - ADD 'sessions:git-stash' handler
  - ADD 'sessions:git-stash-pop' handler
  - ADD 'sessions:git-stage-and-commit' handler (different from existing git-commit)
  - ADD 'sessions:has-stash' handler
  - FOLLOW existing handler pattern with emitGitOperationToProject

Task 3:
MODIFY main/src/preload.ts:
  - ADD gitFetch to sessions object
  - ADD gitStash to sessions object
  - ADD gitStashPop to sessions object
  - ADD gitStageAndCommit to sessions object
  - ADD hasStash to sessions object

Task 4:
MODIFY frontend/src/utils/api.ts:
  - ADD gitFetch(sessionId) to API.sessions
  - ADD gitStash(sessionId) to API.sessions
  - ADD gitStashPop(sessionId) to API.sessions
  - ADD gitStageAndCommit(sessionId, message) to API.sessions
  - ADD hasStash(sessionId) to API.sessions

Task 5:
MODIFY frontend/src/hooks/useSessionView.ts:
  - ADD handleGitFetch handler
  - ADD handleGitStash handler
  - ADD handleGitStashPop handler
  - ADD handleGitStageAndCommit handler (shows commit dialog, then commits)
  - ADD hasStash state (query on mount and after stash operations)
  - RETURN new handlers and hasStash state

Task 6:
MODIFY frontend/src/components/SessionView.tsx:
  - EXPAND branchActions array for worktree sessions (line 497-528)
  - ADD actions in this order after existing ones:
    1. Commit (icon: GitCommitHorizontal) - always enabled if hasUncommittedChanges
    2. Push (icon: Upload) - enabled if ahead > 0
    3. Pull (icon: Download) - enabled if behind > 0 or always
    4. Fetch (icon: RefreshCw) - always enabled
    5. Stash (icon: Archive) - enabled if hasUncommittedChanges
    6. Unstash (icon: ArchiveRestore) - enabled if hasStash
  - ADD commit message dialog state and handler

Task 7:
MODIFY frontend/src/components/DetailPanel.tsx:
  - ADD section dividers between action groups (Git Sync, Git Changes, IDE)
  - KEEP existing rendering logic - actions come from gitBranchActions prop
```

### Per-Task Pseudocode

**Task 1 - WorktreeManager methods:**
```typescript
async gitFetch(worktreePath: string): Promise<{ output: string }> {
  const { stdout, stderr } = await execWithShellPath('git fetch --all', { cwd: worktreePath });
  return { output: stdout + stderr };
}

async gitStash(worktreePath: string): Promise<{ output: string }> {
  const { stdout, stderr } = await execWithShellPath('git stash push -m "foozol stash"', { cwd: worktreePath });
  return { output: stdout + stderr };
}

async gitStashPop(worktreePath: string): Promise<{ output: string }> {
  const { stdout, stderr } = await execWithShellPath('git stash pop', { cwd: worktreePath });
  return { output: stdout + stderr };
}

async hasStash(worktreePath: string): Promise<boolean> {
  const { stdout } = await execWithShellPath('git stash list', { cwd: worktreePath });
  return stdout.trim().length > 0;
}

async gitStageAllAndCommit(worktreePath: string, message: string): Promise<{ output: string }> {
  // Stage all changes including untracked
  await execWithShellPath('git add -A', { cwd: worktreePath });
  // Commit with message (escape quotes in message)
  const escapedMessage = message.replace(/"/g, '\\"');
  const { stdout, stderr } = await execWithShellPath(`git commit -m "${escapedMessage}"`, { cwd: worktreePath });
  return { output: stdout + stderr };
}
```

**Task 2 - IPC Handler pattern:**
```typescript
ipcMain.handle('sessions:git-fetch', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session?.worktreePath) return { success: false, error: 'Session not found' };

    const result = await worktreeManager.gitFetch(session.worktreePath);
    emitGitOperationToProject(sessionId, 'git:fetch_completed', 'Fetched from remote', { output: result.output });
    await gitStatusManager.updateGitStatusAfterOperation(sessionId, 'fetch');

    return { success: true, output: result.output };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fetch failed';
    emitGitOperationToProject(sessionId, 'git:fetch_failed', message, {});
    return { success: false, error: message };
  }
});
```

**Task 6 - branchActions expansion:**
```typescript
// Add after existing 'open-ide' action in the worktree actions array
{
  id: 'commit',
  label: 'Commit',
  icon: GitCommitHorizontal,
  onClick: () => setShowCommitDialog(true), // Opens dialog
  disabled: hook.isMerging || !activeSession.gitStatus?.hasUncommittedChanges,
  variant: 'default' as const,
  description: 'Stage all changes and commit'
},
{
  id: 'push',
  label: 'Push',
  icon: Upload,
  onClick: hook.handleGitPush,
  disabled: hook.isMerging || !activeSession.gitStatus?.ahead,
  variant: 'default' as const,
  description: 'Push commits to remote'
},
{
  id: 'pull',
  label: 'Pull',
  icon: Download,
  onClick: hook.handleGitPull,
  disabled: hook.isMerging,
  variant: 'default' as const,
  description: 'Pull latest from remote'
},
{
  id: 'fetch',
  label: 'Fetch',
  icon: RefreshCw,
  onClick: hook.handleGitFetch,
  disabled: hook.isMerging,
  variant: 'default' as const,
  description: 'Fetch from remote without merging'
},
{
  id: 'stash',
  label: 'Stash',
  icon: Archive,
  onClick: hook.handleGitStash,
  disabled: hook.isMerging || !activeSession.gitStatus?.hasUncommittedChanges,
  variant: 'default' as const,
  description: 'Stash uncommitted changes'
},
{
  id: 'unstash',
  label: 'Pop Stash',
  icon: ArchiveRestore,
  onClick: hook.handleGitStashPop,
  disabled: hook.isMerging || !hook.hasStash,
  variant: 'default' as const,
  description: 'Apply and remove most recent stash'
}
```

### Integration Points

```yaml
IPC:
  - Add handlers to: main/src/ipc/git.ts
  - Expose via: main/src/preload.ts

FRONTEND:
  - API methods: frontend/src/utils/api.ts
  - Handlers: frontend/src/hooks/useSessionView.ts
  - Actions array: frontend/src/components/SessionView.tsx
  - UI rendering: frontend/src/components/DetailPanel.tsx (minimal changes)
```

## Validation Loop

```bash
# Run these after each task - fix errors before proceeding
pnpm typecheck          # TypeScript compilation across workspaces
pnpm lint               # ESLint checks
# Expected: No errors
```

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] All new IPC handlers follow existing patterns
- [ ] Git status refreshes after each operation
- [ ] Error cases show GitErrorDialog
- [ ] Actions properly disabled based on state

## Anti-Patterns to Avoid

- Don't create new dialog components when CommitMessageDialog can be reused
- Don't skip emitGitOperationToProject - needed for multi-session sync
- Don't forget Windows path handling (use execWithShellPath)
- Don't hardcode 'main' branch - use gitCommands.mainBranch
- Don't add actions to DetailPanel.tsx directly - they come from branchActions

## Deprecated Code to Remove

None - this is purely additive functionality.
