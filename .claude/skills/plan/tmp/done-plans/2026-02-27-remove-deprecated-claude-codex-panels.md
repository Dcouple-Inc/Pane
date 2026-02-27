## Goal

Remove all deprecated Claude and Codex custom panel logic from the codebase. Sessions already use terminal panels for CLI interaction. The custom `type: 'claude'` and `type: 'codex'` panels were never shipped to users, have no data in any database, and will be replaced by Zed ACP support in the future.

## Why

- ~9,600 lines of dead code across 25+ files
- Every panel/session change requires tiptoeing around ghost logic
- Clean slate needed for future Zed ACP integration
- No backwards compatibility needed — panels were never shipped

## What

Strip all `type: 'claude'` and `type: 'codex'` panel infrastructure. Sessions keep working via `claudeCodeManager` (the SDK wrapper) using its existing session-based methods. Terminal panels remain the user-facing way to interact with Claude/Codex CLI.

### Success Criteria

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] No references to deleted files remain
- [ ] Session input/continue still routes to `claudeCodeManager` (via session-based methods)
- [ ] Terminal panels still work (`claude --dangerously-skip-permissions`)
- [ ] "Terminal (Claude)" and "Terminal (Codex)" dropdown items still work
- [ ] No `'claude'` or `'codex'` in `ToolPanelType` union

## All Needed Context

### Key Architectural Insight

`claudeCodeManager` already has **session-based fallback methods** that work without panels:
- `claudeCodeManager.startSession(sessionId, worktreePath, prompt, permissionMode, model)` — `session.ts:697`
- `claudeCodeManager.continueSession(sessionId, worktreePath, prompt, history, model)` — `session.ts:732`

These are used when no claude panel is found. After this change, they become the **primary** paths.

### What MUST Stay

- `main/src/services/panels/claude/claudeCodeManager.ts` — Core SDK wrapper, used by session creation
- `main/src/services/panels/cli/AbstractCliManager.ts` — Extended by claudeCodeManager
- `main/src/services/cliToolRegistry.ts` — Generic CLI registry (no codex refs)
- All terminal panel infrastructure
- All session/worktree creation logic
- `claudeExecutablePath` setting in Settings.tsx (CLI tool config, not panel config)
- `shared/types/models.ts` — keep for now (model definitions, can clean later)
- Session-based output/conversation methods in sessionManager
- Keyboard shortcuts for "Terminal (Claude)" `mod+shift+1` and "Terminal (Codex)" `mod+shift+2` (these create terminal panels, not claude/codex panels)

### Documentation & References

```yaml
- file: main/src/ipc/session.ts:693-703
  why: Session-based startSession fallback — becomes primary path

- file: main/src/ipc/session.ts:728-739
  why: Session-based continueSession fallback — becomes primary path

- file: main/src/ipc/session.ts:622-623
  why: Session-based conversation history retrieval — becomes primary path

- file: main/src/events.ts:494-638
  why: attachProcessLifecycleHandlers — needs simplification to claude-only

- file: main/src/events.ts:651-737
  why: Auto-panel creation on session-created — remove claude/codex panel creation entirely

- file: shared/types/panels.ts:16
  why: ToolPanelType union — remove 'claude' and 'codex'
```

## Implementation Blueprint

### Tasks (in implementation order)

#### Phase 1: Delete Frontend Files (no dependencies)

```yaml
Task 1: Delete frontend claude panel directory
DELETE frontend/src/components/panels/claude/
  Files: ClaudePanel.tsx, ClaudeInputWithImages.tsx, ClaudeSettingsPanel.tsx,
         PromptNavigation.tsx, RichOutputWithSidebar.tsx, SessionStats.tsx

Task 2: Delete frontend codex panel directory
DELETE frontend/src/components/panels/codex/
  Files: CodexPanel.tsx, CodexInputPanel.tsx, CodexInputPanelRefactored.tsx,
         CodexInputPanelStyled.tsx, CodexInputPanelWithHook.tsx,
         CodexDebugStateView.tsx, CodexStatsView.tsx

Task 3: Delete frontend AI panel base directory
DELETE frontend/src/components/panels/ai/
  Files: AbstractAIPanel.tsx, AbstractInputPanel.tsx, MessagesView.tsx,
         RichOutputView.tsx, components/ dir, transformers/ dir
  WHY: All importers (ClaudePanel, CodexPanel) are being deleted.
       RichOutputSettingsPanel.tsx imports from here but is itself unused.

Task 4: Delete unused RichOutputSettingsPanel
DELETE frontend/src/components/session/RichOutputSettingsPanel.tsx
  WHY: Only imports from deleted panels/ai/AbstractAIPanel. Never imported elsewhere.

Task 5: Delete frontend hooks
DELETE frontend/src/hooks/useClaudePanel.ts
DELETE frontend/src/hooks/useCodexPanel.ts
```

#### Phase 2: Delete Backend Files

```yaml
Task 6: Delete backend IPC handlers for panels
DELETE main/src/ipc/claudePanel.ts
DELETE main/src/ipc/codexPanel.ts

Task 7: Delete backend panel managers
DELETE main/src/services/panels/claude/claudePanelManager.ts
  NOTE: Keep claudeCodeManager.ts in same directory!

Task 8: Delete entire codex backend directory
DELETE main/src/services/panels/codex/
  Files: codexManager.ts, codexPanelManager.ts, codexManager.test.ts, CODEX_CONFIG.md

Task 9: Delete backend abstract AI panel infrastructure
DELETE main/src/services/panels/ai/ (entire directory — only contains AbstractAIPanelManager.ts)
  WHY: Only imported by claudePanelManager (deleted) and codexPanelManager (deleted)
       and baseAIPanelHandler (deleted next)

DELETE main/src/ipc/baseAIPanelHandler.ts
  WHY: Only imported by claudePanel.ts and codexPanel.ts (both deleted)

```

#### Phase 3: Edit Backend — Simplify Session Routing

```yaml
Task 12: Edit main/src/ipc/index.ts
  - Remove import of registerClaudePanelHandlers (line 19)
  - Remove import of registerCodexPanelHandlers (line 20)
  - Remove calls to registerClaudePanelHandlers() (line 45)
  - Remove calls to registerCodexPanelHandlers() (line 46)

Task 13: Edit main/src/ipc/session.ts — Simplify input handler
  The 'sessions:input' handler (around line 396-521):
  - Remove lines 402-427: panel finding/creation logic for claude/codex
  - Remove lines 430-477: entire codex routing block
  - Remove lines 484-491: claude panel filtering
  - Simplify to: always use claudeCodeManager.startSession/sendInput directly
    using sessionId (the existing fallback at line 697 becomes the main path)

  Pseudocode for simplified input handler:
    const session = await sessionManager.getSession(sessionId);
    if (session.toolType === 'none') return error;

    // Session-based methods use virtual panel IDs: `session-${sessionId}`
    // (see AbstractCliManager.ts:377-390)
    const isRunning = claudeCodeManager.isSessionRunning(sessionId);
    if (!isRunning) {
      await claudeCodeManager.startSession(sessionId, session.worktreePath, finalInput, session.permissionMode);
      await sessionManager.updateSession(sessionId, { status: 'running' });
    } else {
      // sendInput requires a panelId — use the virtual panel ID format
      claudeCodeManager.sendInput(`session-${sessionId}`, finalInput);
    }
    return { success: true };

Task 14: Edit main/src/ipc/session.ts — Simplify continue handler
  The 'sessions:continue' handler (around line 577-740):
  - Remove lines 584-610: claude panel finding/creation for continuation
  - Remove lines 613-624: panel-based vs session-based history retrieval
    ALWAYS use: sessionManager.getConversationMessages(sessionId)
  - Remove lines 676-693: claude panel filtering for main repo start
    ALWAYS use: claudeCodeManager.startSession(...)
  - Remove lines 711-727: claude panel filtering for normal continue
    ALWAYS use: claudeCodeManager.continueSession(...)

Task 15: Edit main/src/ipc/session.ts — Remove all other panel filtering
  Search for ALL remaining `.filter(p => p.type === 'claude')` patterns:
  - Line ~769-795: session migration fix — remove claude panel creation, use session methods
  - Line ~805-811: output retrieval — always use session-based output
  - Line ~858-864: conversation retrieval — always use session-based
  - Line ~1070-1095: panel input routing cases — remove 'claude' and 'codex' cases
  - Line ~1130-1233: panel continue routing — remove 'claude' and 'codex' cases
  - Line ~1261: context compaction — always use session-based
  - Line ~1347: JSON messages — always use session-based
  - Line ~1434-1447: session stop — use claudeCodeManager.stopSession directly
  - Line ~1824: statistics — always use session-based

Task 16: Edit main/src/ipc/panels.ts
  - Remove lines 14-40: auto-register logic for claude/codex panels
  - Remove lines 54-81: auto-unregister logic for claude/codex panels
  - Remove lines 189-196: initialization checks for claude/codex panels
  - Remove line 221: unviewed content filter for claude/codex

Task 17: Edit main/src/events.ts — Major cleanup
  - Remove import of ClaudePanelManager type (line 10)
  - Remove import of aiPanelConfig types
  - Remove lines 46-77: codex & claude manager resolution
  - Remove lines 283-327: updateClaudePanelCustomState function
  - Remove lines 332-380: updateAIPanelStatus function (or simplify if used elsewhere)
  - Remove lines 429-492: startAutoContextRun function (claude-specific)
  - Simplify lines 494-638: attachProcessLifecycleHandlers
    - Remove 'codex' tool support, only handle 'claude'
    - Remove panel type parameter — just use claudeCodeManager directly
    - Keep event handlers (spawned, output, waiting, exit, error) but remove panel status updates
  - Remove lines 651-737: Auto-create AI panel block in session-created handler
    KEEP line 739-748: auto-create terminal panel (this stays!)
  - Remove line 586: AI panel status filter
  - Remove lines 637-638: attachProcessLifecycleHandlers for codex
  - Remove lines 700-711: codex/claude settings persistence to panel
  - Remove lines 714-729: panel manager registration
  - Remove line ~956: prompt markers migration claude panel filter

Task 18: Edit main/src/services/taskQueue.ts
  - Remove codex config interface (lines 40-47)
  - Remove claude config interface (lines 48-52)
  - Simplify toolType to just 'claude' | 'none' (line 37)
  - Remove codex panel creation & startup routing (lines 299-330)
  - Remove claude panel creation & startup routing (lines 331-355)
  - Session startup should use claudeCodeManager.startSession() directly

Task 19: Edit main/src/services/sessionManager.ts
  - Remove any `panels.filter(p => p.type === 'claude')` patterns
  - Remove codex-related references
  - Keep all session-based output/conversation methods

Task 20: Edit main/src/preload.ts
  - Remove claudePanels IPC channels (lines 612-615)
  - Remove codexPanels IPC channels (lines 618-621)
  - Remove codexPanel event channels (lines 682-685, 694-697)
```

#### Phase 4: Edit Shared Types & Delete Deferred Files

```yaml
Task 20.5: Delete shared/types/aiPanelConfig.ts
  WHY: Only imported by deleted files and files edited in Phase 3.
  All imports from events.ts, session.ts, sessionManager.ts, panels.ts, index.ts
  were removed in Phase 3 tasks. Safe to delete now.

Task 21: Edit shared/types/panels.ts
  - Line 16: Remove 'claude' | 'codex' from ToolPanelType
    BECOMES: 'terminal' | 'diff' | 'explorer' | 'logs' | 'dashboard' | 'setup-tasks'
  - Line 22: Remove ClaudePanelState | CodexPanelState from customState union
  - Lines 94-118: Delete ClaudePanelState and CodexPanelState interfaces
  - Lines 84-91 in BaseAIPanelState: Remove deprecated aliases (claudeSessionId, codexSessionId, claudeResumeId, codexResumeId)
  - Line 178: Remove ClaudePanelState | CodexPanelState from CreatePanelRequest.initialState
  - Line 193: Change ResumableSession.panelType from 'terminal' | 'claude' to just 'terminal'
  - Lines 270-285: Delete claude and codex entries from PANEL_CAPABILITIES
  - Remove import of AIPanelConfig/AIPanelState if present

Task 21.5: Edit backend database models
  - Update tool_type in main/src/database/models.ts (or equivalent):
    Simplify from 'claude' | 'codex' | 'none' to 'claude' | 'none'
  - This matches the frontend type changes in Tasks 30-31
  - No database migration needed — 'codex' rows don't exist

Task 22: Keep shared/types/cliPanels.ts
  - CliPanelType = 'claude' refers to the CLI TOOL (the executable), not the panel type.
  - CLI_PANEL_CONFIGS is used by CliPanelFactory and useCliPanel (both staying).
  - KEEP this file as-is. It describes terminal-based CLI tool configs, not deprecated panels.
```

#### Phase 5: Edit Frontend Files

```yaml
Task 23: Edit frontend/src/components/panels/cli/CliPanelFactory.tsx
  - Remove lazy imports of ClaudePanel and CodexPanel (lines 81-82)
  - Remove type detection for claude/codex (lines 93-94)
  - Remove switch cases for claude/codex rendering (lines 104-116)
  - Remove 'claude'/'codex' from supportedTools array (line 150)
  - If the file becomes empty/trivial after removal, delete it entirely

Task 24: Edit frontend/src/components/panels/PanelContainer.tsx
  - Remove 'claude' and 'codex' from cliPanelTypes array (line 47)
  - If the CliPanelFactory branch becomes unreachable, remove it

Task 25: Edit frontend/src/components/panels/PanelTabBar.tsx
  - Remove line 262: the filter hiding claude/codex from dropdown (no longer needed)
  - Remove lines 277-280: icon cases for 'claude' and 'codex'
  - Remove lines 309-346: getPanelStatusConfig claude/codex logic
    (Return null early if panel type isn't an AI panel, or remove entire function)

Task 26: Edit frontend/src/components/SessionView.tsx
  - Remove lines 185-188: hasClaudePanels memo
  - Remove line 201: debug log for hasClaudePanels
  - Remove lines 214-224: unviewed content clearing for claude/codex panels
  - Remove lines 399-414: codex panel creation initialState in handlePanelCreate
  - Remove line 836: 'claude' and 'codex' from keepAlive array
    BECOMES: ['terminal'].includes(panel.type)
  - Remove commented-out imports (lines 21, 23)

Task 27: Edit frontend/src/components/ProjectView.tsx
  - Remove lines 138-153: codex panel creation initialState

Task 28: Edit frontend/src/components/CreateSessionButton.tsx
  - Remove getCodexModelConfig import and usage (line 48)
  - Default toolType to 'claude' always (no codex detection)

Task 29: Edit frontend/src/components/DraggableProjectTreeView.tsx
  - Remove codexConfig from session creation objects
  - Remove toolType ternary checking for codex — always use 'claude'
  - Lines ~109, 112, 117, 620-626, 1142: simplify toolType references

Task 30: Edit frontend/src/types/config.ts
  - Remove codex-related fields (codex boolean, codexConfig)
  - Keep claudeExecutablePath, claude boolean, toolType (simplify to 'claude' | 'none')

Task 31: Edit frontend/src/types/session.ts
  - Remove codexConfig field
  - Keep claudeConfig if still used by session creation
  - Simplify toolType to 'claude' | 'none'

Task 32: Edit frontend/src/utils/api.ts
  - Remove static claudePanels object (lines ~551-558)
  - Remove static codexPanels object (lines ~559-572)

Task 33: Edit frontend/src/stores/sessionPreferencesStore.ts
  - Remove codex boolean, codexConfig fields and merge logic
  - Keep claude boolean and claudeConfig if still relevant

Task 34: Edit frontend/src/hooks/useCliPanel.ts
  - Remove 'claudePanel' event listener references (line ~420)
  - Clean up any dead code paths

Task 35: Edit frontend/src/types/electron.d.ts
  - Remove claudePanels and codexPanels type definitions
  - Remove codexPanel event types
```

#### Phase 6: Validation

```yaml
Task 36: Run pnpm typecheck — fix ALL type errors
  This will cascade from the ToolPanelType change.
  Fix remaining references that the above tasks missed.

Task 37: Run pnpm lint — fix ALL lint errors
  Unused imports, unreachable code, etc.

Task 38: Grep sweep — verify no orphaned references
  grep -r "type.*===.*'claude'" frontend/ main/ shared/  (should find 0 in panel context)
  grep -r "type.*===.*'codex'" frontend/ main/ shared/   (should find 0)
  grep -r "claudePanelManager" frontend/ main/            (should find 0)
  grep -r "codexPanelManager" frontend/ main/             (should find 0)
  grep -r "codexManager" frontend/ main/                  (should find 0)
  grep -r "AbstractAIPanelManager" frontend/ main/        (should find 0)
  grep -r "baseAIPanelHandler" frontend/ main/            (should find 0)
  grep -r "aiPanelConfig" frontend/ main/ shared/         (should find 0)
```

## Deprecated Code to Remove

This entire plan IS the removal of deprecated code. Summary of deletions:

**Frontend directories deleted:** `panels/claude/`, `panels/codex/`, `panels/ai/`
**Frontend files deleted:** `useClaudePanel.ts`, `useCodexPanel.ts`, `RichOutputSettingsPanel.tsx`
**Backend files deleted:** `claudePanel.ts` (IPC), `codexPanel.ts` (IPC), `baseAIPanelHandler.ts`, `claudePanelManager.ts`, `codex/` directory, `ai/` directory, `aiPanelConfig.ts`
**Shared files deleted:** `aiPanelConfig.ts` (if all importers cleaned)

## Anti-Patterns to Avoid

- Don't leave `if (type === 'claude')` checks "just in case" — remove them completely
- Don't create compatibility shims for panel types — no users have this data
- Don't rename/re-export deleted types — delete completely
- Don't add TODO comments for removed functionality — it's gone
- Don't touch claudeCodeManager.ts internals — it works, leave it alone
- Don't delete shared/types/models.ts — Codex model types may be used elsewhere and can be cleaned separately

## Confidence Score: 8/10

High confidence because:
- Session-based fallback methods already exist in claudeCodeManager
- No user data to migrate
- Clear deletion boundaries
- Type system will catch missed references

Risk areas:
- events.ts is 1,374 lines with interleaved claude/codex logic — careful editing needed
- session.ts is 1,943 lines — same concern
- `sendInput` requires virtual panel ID format (`session-${sessionId}`) — addressed in Task 13 pseudocode
