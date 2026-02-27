# Plan: Remote Branch Tracking for Worktrees

## Goal

When a user selects a **remote branch** (e.g., `origin/feature/foo`) as the base for a new worktree, Pane should automatically configure git tracking so that `git pull` and `git push` work immediately without additional configuration.

Additionally, improve the branch selection UI to:
1. Show both local and remote branches
2. Visually distinguish between them using `<optgroup>` labels
3. Prioritize remote branches at the top of the list

## Why

- **User friction**: Currently, users must manually run `git branch --set-upstream-to=...` or `git push -u` before `git pull` works
- **Expected behavior**: When you select `origin/feature/foo`, the expectation is that your local branch tracks it
- **Workflow improvement**: Users can immediately collaborate on remote branches without git configuration knowledge

## What

### User-Visible Behavior
1. Branch dropdown shows remote branches grouped under "Remote Branches" optgroup
2. Local branches grouped under "Local Branches" optgroup
3. Selecting a remote branch creates a local branch that tracks it automatically
4. `git pull` and `git push` work immediately after worktree creation

### Success Criteria

- [ ] `git branch -vv` shows tracking info for branches created from remote branches
- [ ] Branch dropdown uses `<optgroup>` for "Remote Branches" and "Local Branches"
- [ ] Remote branches are listed first
- [ ] Selecting a local branch does NOT set up tracking (preserves current behavior)

### Known Limitations (v1)

- Only supports "origin" remote. Branches from other remotes (upstream, fork) will appear but tracking may not work correctly.

## All Needed Context

### Documentation & References

```yaml
- file: main/src/services/worktreeManager.ts
  why: Contains listBranches() (line 271-309) and createWorktree() (line 96-200)
  critical: Currently only fetches local branches via `git branch`

- file: frontend/src/components/CreateSessionDialog.tsx
  why: Branch selector UI (lines 342-386) - displays branches in dropdown
  critical: Currently renders branch.name without any type distinction

- file: main/src/ipc/project.ts
  why: IPC handlers for projects:list-branches (line 462-477)
```

### Current Codebase Tree

```
main/src/services/worktreeManager.ts
  - listBranches(): Only fetches local branches
  - createWorktree(): Creates worktree but doesn't set tracking

main/src/ipc/project.ts
  - projects:list-branches handler: Calls worktreeManager.listBranches()

frontend/src/components/CreateSessionDialog.tsx
  - Branch selector dropdown
  - BranchInfo type: { name: string; isCurrent: boolean; hasWorktree: boolean }
```

### Desired Codebase Tree

```
main/src/services/worktreeManager.ts
  - listBranches(): Fetches remote branches via git fetch + git branch -r, adds isRemote field
  - createWorktree(): Uses --track flag for remote branches, updated validation

frontend/src/components/CreateSessionDialog.tsx
  - BranchInfo interface with isRemote field
  - Branch selector uses <optgroup> for Remote/Local grouping
  - Updated help text mentioning auto-tracking
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Remote branch names from `git branch -r` include "origin/" prefix
// e.g., "origin/main", "origin/feature/foo"

// CRITICAL: When creating worktree from remote, the local branch name should NOT include "origin/"
// e.g., remote "origin/feature/foo" creates local branch "feature/foo"
// Extract local name: baseBranch.replace(/^origin\//, '')

// CRITICAL: git branch -r may include HEAD -> origin/main, filter with !line.includes('HEAD ->')

// CRITICAL: Current validation (line 173) uses refs/heads/ which only works for local branches
// Must use `git rev-parse --verify ${baseBranch}` for remote branches

// CRITICAL: Use `git worktree add --track` flag for atomic tracking setup
```

## Implementation Blueprint

### Data Models and Structure

```typescript
// Update BranchInfo in TWO locations:

// 1. main/src/services/worktreeManager.ts line 271 - return type
async listBranches(...): Promise<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }>>

// 2. frontend/src/components/CreateSessionDialog.tsx line 15-19 - interface
interface BranchInfo {
  name: string;
  isCurrent: boolean;
  hasWorktree: boolean;
  isRemote: boolean;  // NEW
}

// 3. frontend/src/components/CreateSessionDialog.tsx line 54 - useState
// Change from inline type to: useState<BranchInfo[]>([])
```

### Tasks (in implementation order)

```yaml
Task 1:
MODIFY main/src/services/worktreeManager.ts:
  - FIND: listBranches() method (line 271)
  - ADD: Run `git fetch --all --prune` before listing branches (silent, catch errors)
  - ADD: Fetch remote branches with `git branch -r`
  - ADD: isRemote: true/false property to each branch
  - MODIFY: Return type to include isRemote field
  - MODIFY: Sorting logic to put remotes first, then locals (within locals, worktrees first)
  - FILTER: Remove lines containing "HEAD ->" from remote list

Task 2:
MODIFY frontend/src/components/CreateSessionDialog.tsx:
  - FIND: BranchInfo interface (line 15-19)
  - ADD: isRemote: boolean property
  - FIND: useState for branches (line 54)
  - CHANGE: Use BranchInfo[] type instead of inline type
  - FIND: Branch dropdown rendering (line 362-380)
  - REPLACE: Current rendering with <optgroup> structure:
    - <optgroup label="Remote Branches"> for isRemote === true
    - <optgroup label="Local Branches"> for isRemote === false
  - UPDATE: Help text (line 382-384) to mention remote tracking

Task 3:
MODIFY main/src/services/worktreeManager.ts:
  - FIND: createWorktree() method (line 96)
  - FIND: Base branch validation (line 171-176)
  - CHANGE: Use `git rev-parse --verify ${baseBranch}` instead of refs/heads check
  - FIND: git worktree add command (line 182)
  - CHANGE: Use --track flag when baseBranch is remote:
    - git worktree add -b ${localBranchName} --track "${worktreePath}" ${baseBranch}
  - ADD: Extract local branch name: baseBranch.replace(/^origin\//, '')
  - ADD: Verify tracking was set with `git branch -vv` (log result)
  - PRESERVE: Current behavior for local branches (no --track flag)
```

### Per-Task Pseudocode

#### Task 1: Update listBranches()

```typescript
async listBranches(projectPath: string, wslContext?: WSLContext | null): Promise<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }>> {
  // 0. Fetch latest from all remotes (silent, catch errors)
  try {
    await execForProject(`git fetch --all --prune`, projectPath, wslContext);
  } catch {
    // Ignore fetch errors - user may be offline
  }

  // 1. Get local branches (existing)
  const { stdout: localOutput } = await execForProject(`git branch`, projectPath, wslContext);

  // 2. Get remote branches (NEW)
  const { stdout: remoteOutput } = await execForProject(`git branch -r`, projectPath, wslContext);

  // 3. Get worktrees for hasWorktree check
  const worktrees = await this.listWorktrees(projectPath, wslContext);
  const worktreeBranches = new Set(worktrees.map(w => w.branch));

  // 4. Parse local branches (existing logic, add isRemote: false)
  const localBranches: Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }> = [];
  for (const line of localOutput.split('\n').filter(l => l.trim())) {
    const isCurrent = line.startsWith('*');
    const name = line.replace(/^[\*\+]?\s*[\+]?\s*/, '').trim();
    if (name) {
      localBranches.push({
        name,
        isCurrent,
        hasWorktree: worktreeBranches.has(name),
        isRemote: false
      });
    }
  }

  // 5. Parse remote branches (NEW)
  const remoteBranches = remoteOutput
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.includes('HEAD ->')) // Filter out "HEAD -> origin/main"
    .map(name => ({
      name,
      isCurrent: false,
      hasWorktree: false, // Remote branches never have worktrees directly
      isRemote: true
    }));

  // 6. Sort: remotes first (alphabetically), then locals (worktrees first, then alphabetically)
  return [
    ...remoteBranches.sort((a, b) => a.name.localeCompare(b.name)),
    ...localBranches.sort((a, b) => {
      if (a.hasWorktree !== b.hasWorktree) return a.hasWorktree ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
  ];
}
```

#### Task 2: Update branch dropdown with optgroup

```tsx
// Replace current branch rendering (lines 362-380) with:
<select ...>
  {/* Remote branches group */}
  {branches.some(b => b.isRemote) && (
    <optgroup label="Remote Branches">
      {branches.filter(b => b.isRemote).map(branch => (
        <option key={branch.name} value={branch.name}>
          {branch.name}
        </option>
      ))}
    </optgroup>
  )}

  {/* Local branches group */}
  {branches.some(b => !b.isRemote) && (
    <optgroup label="Local Branches">
      {branches.filter(b => !b.isRemote).map(branch => (
        <option key={branch.name} value={branch.name}>
          {branch.name} {branch.isCurrent ? '(current)' : ''} {branch.hasWorktree ? '(has worktree)' : ''}
        </option>
      ))}
    </optgroup>
  )}
</select>

// Update help text (line 382-384):
<p className="text-xs text-text-tertiary mt-1">
  Remote branches will automatically track the remote for git pull/push.
</p>
```

#### Task 3: Use --track flag for remote branches

```typescript
// In createWorktree(), around line 165-183:

const isRemoteBranch = baseBranch && baseBranch.startsWith('origin/');

// Extract local branch name from remote (e.g., "origin/feature/foo" -> "feature/foo")
// Only use this if we're creating from a remote branch AND no explicit branch name given
const localBranchName = isRemoteBranch && !branch
  ? baseBranch.replace(/^origin\//, '')
  : branchName;

// Update base branch validation (line 171-176) to work with remotes:
// CHANGE FROM: git show-ref --verify --quiet refs/heads/${baseBranch}
// CHANGE TO: git rev-parse --verify ${baseBranch}
try {
  await execForProject(`git rev-parse --verify ${baseBranch}`, projectPath, wslContext);
} catch {
  throw new Error(`Base branch '${baseBranch}' does not exist`);
}

// Use --track flag for remote branches (line 182):
if (isRemoteBranch) {
  // Atomic worktree creation with tracking
  await execForProject(
    `git worktree add -b ${localBranchName} --track "${worktreePath}" ${baseBranch}`,
    projectPath,
    wslContext
  );

  // Verify tracking was set (for debugging)
  const { stdout: trackingInfo } = await execForProject(`git branch -vv`, worktreePath, wslContext);
  console.log(`[WorktreeManager] Branch tracking set:`, trackingInfo);
} else {
  // Existing logic for local branches (line 182)
  await execForProject(
    `git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`,
    projectPath,
    wslContext
  );
}
```

### Integration Points

```yaml
IPC:
  - projects:list-branches: Already calls worktreeManager.listBranches()
  - No changes needed to IPC layer

FRONTEND:
  - CreateSessionDialog.tsx: Update to render isRemote property
  - TypeScript type: BranchInfo needs isRemote added (check if shared type or local)

DATABASE:
  - No changes needed - base_branch column already stores the full branch name
```

## Validation Loop

```bash
# Run these FIRST - fix any errors before proceeding
pnpm typecheck          # TypeScript compilation
pnpm lint               # ESLint
# Expected: No errors. If errors, READ the error and fix.

# Manual validation:
# 1. Create a new session selecting "origin/main" as base branch
# 2. Open terminal in the worktree
# 3. Run: git branch -vv
# 4. Verify output shows tracking: [origin/main] or similar
# 5. Run: git pull --dry-run (verify it knows where to pull from)
```

## Final Validation Checklist

- [x] No linting errors: `pnpm lint` (no new errors introduced)
- [x] No type errors: `pnpm typecheck`
- [ ] Branch dropdown shows `<optgroup label="Remote Branches">` and `<optgroup label="Local Branches">`
- [ ] Remote branches appear first in dropdown
- [ ] Selecting remote branch results in tracked local branch (`git branch -vv` shows tracking)
- [ ] Selecting local branch does NOT set up tracking (unchanged behavior)
- [ ] `git pull --dry-run` works immediately in worktree created from remote branch

## Anti-Patterns to Avoid

- Don't create a separate function for remote branch handling when we can extend listBranches()
- Don't hardcode "origin" - but for v1, it's acceptable since most repos use "origin"
- Don't set tracking for local branches - only remote branches should set tracking
- Don't change the branch name format stored in database - keep full "origin/main" format

## Code to Remove

None - this is additive functionality.
