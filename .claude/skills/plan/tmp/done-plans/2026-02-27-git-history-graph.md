# Git History Graph in DetailPanel Sidebar

## Goal

Add a VS Code-style Source Control Graph visualization to the DetailPanel right sidebar, below the existing Actions section. Uses `@tomplum/react-git-log` to render a commit history graph with branch lines, commit dots, messages, authors, and timestamps. Clicking a commit switches the Diff view to show that commit's changes.

## Why

- The DetailPanel has significant empty space below the "Open in IDE" action button
- Commit history visualization is an established IDE pattern (VS Code Source Control Graph)
- Pane already has commit data flowing through `getSessionCommitHistory()` but only shows aggregate counts in the sidebar
- Users managing worktrees need to see their branch's commit history at a glance

## What

A new "History" section in the DetailPanel showing:
- Visual commit graph with branch lines and colored commit nodes
- Commit message (truncated), author, and relative timestamp per row
- Uncommitted changes indicator at the top (if any)
- Click-to-select: clicking a commit navigates the Diff panel to show that commit's diff
- Compact layout optimized for 140-350px sidebar width
- Dark theme matching Pane's existing aesthetic

### Success Criteria

- [ ] Git history graph renders in DetailPanel below Actions section
- [ ] Shows commits unique to current branch (existing behavior) with parent relationships for graph lines
- [ ] Uncommitted changes shown as special top entry
- [ ] Clicking a commit triggers diff view for that commit
- [ ] Dark-themed and visually consistent with Pane's UI
- [ ] Handles edge cases: no commits, loading state, error state
- [ ] No TypeScript `any` types (ESLint enforced)
- [ ] `pnpm typecheck` and `pnpm lint` pass

## All Needed Context

### Documentation & References

```yaml
- url: https://www.npmjs.com/package/@tomplum/react-git-log
  why: Core library API, props, theming, compound component pattern

- file: frontend/src/components/DetailPanel.tsx
  why: Where the graph will be added (new DetailSection below Actions)

- file: main/src/ipc/git.ts (lines 195-337)
  why: Existing getSessionCommitHistory() and sessions:get-executions handler - needs new handler for graph data

- file: main/src/services/gitDiffManager.ts (lines 104-197)
  why: getCommitHistory() - needs modification to include parent hashes

- file: frontend/src/contexts/SessionContext.tsx
  why: How session data flows to DetailPanel via useSession()

- file: main/src/preload.ts (line 219)
  why: IPC bridge pattern for adding new handlers

- file: frontend/src/types/electron.d.ts (line 75)
  why: TypeScript types for IPC bridge - must add new method type

- file: frontend/src/utils/api.ts (line 122)
  why: Frontend API wrapper pattern - must add new method
```

### Current Codebase Tree (relevant files)

```
main/src/
├── ipc/git.ts                          # IPC handlers for git operations
├── services/gitDiffManager.ts          # Git commit history retrieval
├── preload.ts                          # IPC bridge (Electron preload)
frontend/src/
├── components/DetailPanel.tsx          # Right sidebar (target for graph)
├── components/ExecutionList.tsx         # Existing flat commit list (in Diff view)
├── contexts/SessionContext.tsx          # Session data context provider
├── types/session.ts                    # Session, GitStatus interfaces
├── types/diff.ts                       # ExecutionDiff interface
├── types/electron.d.ts                 # IPC bridge types
├── utils/api.ts                        # Frontend API wrapper
```

### Desired Codebase Tree (new/modified files)

```
main/src/
├── ipc/git.ts                          # MODIFY: add sessions:get-git-graph handler
├── services/gitDiffManager.ts          # MODIFY: add getGraphCommitHistory() with parent hashes
├── preload.ts                          # MODIFY: add getGitGraph bridge
frontend/src/
├── components/DetailPanel.tsx          # MODIFY: add History section with GitLog
├── components/GitHistoryGraph.tsx      # CREATE: wrapper component for @tomplum/react-git-log
├── types/electron.d.ts                 # MODIFY: add getGitGraph type
├── utils/api.ts                        # MODIFY: add getGitGraph method
package.json                            # MODIFY: add @tomplum/react-git-log dependency
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: @tomplum/react-git-log requires React 19+ (Pane uses React 19 ✅)
// CRITICAL: Node.js 22+ required (Pane requires >=22.14.0 ✅)

// GOTCHA: GraphCanvas2D is incomplete with bugs - MUST use GraphHTMLGrid
// GOTCHA: Node size must be divisible by 2, range 8-30px
// GOTCHA: Custom table row height must be divisible by 2 for graph alignment
// GOTCHA: No `any` types allowed - use unknown + type guards

// GOTCHA: The library's parseGitLog() expects a specific git log format:
// git log --all --pretty=format:'hash:%h,parents:%p,branch:%S,msg:%s,cdate:%cd,adate:%ad,author:%an,email:%ae' --date=iso
// BUT we already have commit data from our own git commands. We should construct
// GitLogEntry[] directly from our data rather than using parseGitLog().

// GOTCHA: GitLogEntry requires `parents: string[]` field which our current
// GitCommit interface does NOT have. Must add parent hash to git log format.

// GOTCHA: GitLogEntry requires `branch: string` field. For worktree sessions,
// this is session.baseBranch. For main repo, use the current branch name.

// GOTCHA: The library uses abbreviated hashes (%h) in its parser. Our codebase
// uses full hashes (%H). The library should work with either, but we should use
// abbreviated hashes in the git log format for consistency with the library's
// expectations and shorter display text.
```

## Implementation Blueprint

### Data Models

```typescript
// New interface for graph-specific commit data (main/src/services/gitDiffManager.ts)
export interface GitGraphCommit {
  hash: string;           // Abbreviated hash (%h)
  parents: string[];      // Parent abbreviated hashes (%p, space-separated)
  branch: string;         // Branch name
  message: string;        // Commit subject
  committerDate: string;  // ISO date string
  author: string;         // Author name
  authorEmail?: string;   // Author email
}

// Maps directly to @tomplum/react-git-log's GitLogEntry:
// { hash, parents, branch, message, committerDate, author?: { name, email } }
```

### Tasks (in implementation order)

```yaml
Task 1: Install @tomplum/react-git-log
  - Run: pnpm add @tomplum/react-git-log
  - Verify it installs correctly and peer deps are met (React 19)

Task 2: Add getGraphCommitHistory() to GitDiffManager
  MODIFY main/src/services/gitDiffManager.ts:
    - Add GitGraphCommit interface (hash, parents[], branch, message, committerDate, author, authorEmail)
    - Add new method getGraphCommitHistory(worktreePath, branch, limit, mainBranch, wslContext)
    - Git format: '%h|%p|%s|%ai|%an|%ae' (adds %p for parents, %ae for email, uses %h abbreviated hash)
    - Command: git log --format="<format>" -n <limit> --cherry-pick --left-only HEAD...<mainBranch> --
    - Parse: split by '|', parents = parentStr.split(' ').filter(Boolean)
    - Return GitGraphCommit[]

Task 3: Add IPC handler for git graph data
  MODIFY main/src/ipc/git.ts:
    - Add new handler: sessions:get-git-graph
    - Reuse getSessionCommitHistory() pattern but call getGraphCommitHistory() instead
    - MUST replicate the fallback logic from getSessionCommitHistory() for isMainRepo sessions:
      - Try cherry-pick history first
      - If fails for main repo, fallback to worktreeManager.getLastCommits() and map to GitGraphCommit format
      - For the fallback, parent hashes won't have graph relationships — use sequential parent linking (each commit's parent = next commit's hash)
    - Include branch name from session.baseBranch
    - Include uncommitted changes as special entry (hash: 'index', parents: [firstCommitHash], branch, message: 'Uncommitted changes')
    - Return { success: true, data: { entries: GitGraphCommit[], currentBranch: string } }

Task 4: Wire IPC bridge
  MODIFY main/src/preload.ts:
    - Add getGitGraph to sessions object:
      getGitGraph: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-git-graph', sessionId)

  MODIFY frontend/src/types/electron.d.ts:
    - Add to sessions interface:
      getGitGraph: (sessionId: string) => Promise<IPCResponse>

  MODIFY frontend/src/utils/api.ts:
    - Add getGitGraph method following existing getExecutions pattern

Task 5: Create GitHistoryGraph component
  CREATE frontend/src/components/GitHistoryGraph.tsx:
    - Props: { sessionId: string, baseBranch: string, onSelectCommit?: (hash: string) => void }
    - Fetches graph data via API.sessions.getGitGraph(sessionId)
    - Transforms GitGraphCommit[] to GitLogEntry[] for the library
    - Renders <GitLog> with compound components
    - Uses GraphHTMLGrid (NOT Canvas2D)
    - Dark theme, compact layout for sidebar
    - Loading state (skeleton or spinner)
    - Error state (inline message)
    - Empty state ("No commits yet")
    - Refetches when sessionId changes
    - Refresh mechanism: listen for IPC event 'git-status-updated' (same event gitStatusManager emits
      after git operations) to refetch graph data when commits change
    - Container should have max-height with overflow-y-auto to prevent the History section
      from dominating the sidebar (e.g., max-h-[400px] overflow-y-auto)
    - If the library doesn't export TypeScript types, create a local declaration file
      frontend/src/types/react-git-log.d.ts with `declare module '@tomplum/react-git-log'`

Task 6: Integrate into DetailPanel
  MODIFY frontend/src/components/DetailPanel.tsx:
    - Import GitHistoryGraph
    - Add new DetailSection title="History" below the Actions section
    - Render <GitHistoryGraph sessionId={session.id} baseBranch={session.baseBranch} />
    - Show for all sessions (worktree and main-repo) — main-repo uses fallback local history
    - Guard: only render when session has a worktreePath (skip for sessions still initializing)
    - Pass baseBranch with fallback: session.baseBranch || 'main'
```

### Per-Task Pseudocode

#### Task 2: Git Graph Commit History

```typescript
// In gitDiffManager.ts
getGraphCommitHistory(
  worktreePath: string,
  branch: string,
  limit: number = 50,
  mainBranch: string = 'main',
  wslContext?: WSLContext | null
): GitGraphCommit[] {
  const logFormat = '%h|%p|%s|%ai|%an|%ae';
  const gitCommand = `git log --format="${logFormat}" -n ${limit} --cherry-pick --left-only HEAD...${mainBranch} --`;
  const output = execSync(gitCommand, { cwd: worktreePath, encoding: 'utf8' }, wslContext);

  return output.trim().split('\n').filter(Boolean).map(line => {
    const [hash, parentStr, message, date, author, email] = line.split('|');
    return {
      hash,
      parents: parentStr ? parentStr.split(' ').filter(Boolean) : [],
      branch,
      message,
      committerDate: date,
      author,
      authorEmail: email
    };
  });
}
```

#### Task 3: IPC Handler

```typescript
// In git.ts - follows exact pattern of sessions:get-executions
ipcMain.handle('sessions:get-git-graph', async (_event, sessionId: string) => {
  const session = await sessionManager.getSession(sessionId);
  // Get project, mainBranch, wslContext (same as getSessionCommitHistory)
  const branch = session.baseBranch || 'unknown';

  let entries: GitGraphCommit[];
  // Try cherry-pick history first, fallback to local history (same pattern)
  entries = gitDiffManager.getGraphCommitHistory(worktreePath, branch, 50, mainBranch, wslCtx);

  // Prepend uncommitted changes if any
  if (gitDiffManager.hasChanges(worktreePath, wslCtx)) {
    entries.unshift({
      hash: 'index',
      parents: entries.length > 0 ? [entries[0].hash] : [],
      branch,
      message: 'Uncommitted changes',
      committerDate: new Date().toISOString(),
      author: 'You',
    });
  }

  return { success: true, data: { entries, currentBranch: branch } };
});
```

#### Task 5: GitHistoryGraph Component

```tsx
// GitHistoryGraph.tsx
import { GitLog } from '@tomplum/react-git-log';

// Transform our data to library format
const gitLogEntries = data.entries.map(entry => ({
  hash: entry.hash,
  parents: entry.parents,
  branch: entry.branch,
  message: entry.message,
  committerDate: entry.committerDate,
  author: { name: entry.author, email: entry.authorEmail },
}));

<GitLog
  entries={gitLogEntries}
  currentBranch={data.currentBranch}
  theme="dark"
  defaultGraphWidth={80}
  rowSpacing={0}
  onSelectCommit={(commit) => {
    if (commit && commit.hash !== 'index') {
      onSelectCommit?.(commit.hash);
    }
  }}
  enableSelectedCommitStyling
>
  <GitLog.GraphHTMLGrid
    nodeTheme="plain"
    nodeSize={10}
    showCommitNodeTooltips
  />
  <GitLog.Table
    timestampFormat="MMM D"
    styles={{
      table: { fontSize: '0.75rem' },
      td: { padding: '2px 4px' }
    }}
  />
</GitLog>
```

### Integration Points

```yaml
BACKEND:
  - gitDiffManager.ts: New method getGraphCommitHistory() alongside existing getCommitHistory()
  - ipc/git.ts: New handler sessions:get-git-graph alongside sessions:get-executions

IPC BRIDGE:
  - preload.ts: Add getGitGraph to sessions object
  - electron.d.ts: Add type for getGitGraph

FRONTEND:
  - api.ts: Add getGitGraph() method
  - GitHistoryGraph.tsx: New component wrapping @tomplum/react-git-log
  - DetailPanel.tsx: Add History section rendering GitHistoryGraph

DEPENDENCY:
  - package.json: Add @tomplum/react-git-log
```

## Validation Loop

```bash
# Run after each task
pnpm typecheck         # TypeScript compilation across all workspaces
pnpm lint              # ESLint (enforces no-any rule)
# Expected: No errors. If errors, READ the error and fix.
```

## Final Validation Checklist

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] No `any` types used anywhere
- [ ] GitHistoryGraph renders in DetailPanel below Actions
- [ ] Commit graph shows branch lines and commit nodes
- [ ] Dark theme applied consistently
- [ ] Loading, error, and empty states handled
- [ ] Clicking a commit fires onSelectCommit callback
- [ ] Works at minimum sidebar width (140px)

## Anti-Patterns to Avoid

- Don't use `parseGitLog()` from the library — construct `GitLogEntry[]` directly from our data
- Don't use `GraphCanvas2D` — it's incomplete with rendering bugs, use `GraphHTMLGrid` only
- Don't modify existing `getCommitHistory()` or `sessions:get-executions` — add new parallel methods
- Don't use `any` type — use `unknown` with type guards or specific interfaces
- Don't over-style — start with library defaults + dark theme, refine after seeing it render
- Don't let the History section grow unbounded — use max-height with scroll

## Deprecated Code

None. This is purely additive — new section in DetailPanel, new IPC handler, new component. Existing commit history in the Diff view is unaffected.
