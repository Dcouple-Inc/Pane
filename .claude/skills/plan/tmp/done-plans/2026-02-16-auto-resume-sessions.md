## Goal

When the user quits foozol (gracefully via X button or Ctrl+Q), capture Claude session IDs from all running panels (both dedicated Claude panels and terminal panels running Claude), mark them as "interrupted", and on next app startup for the same project, automatically resume those sessions using `claude --resume <id>` instead of starting fresh empty panels.

## Why

- With 10+ tabs, manually resuming each conversation after an app restart is painful
- Terminal panels running Claude (the user's primary workflow) currently lose all resume capability — they restart as empty shells
- The infrastructure for `--resume` already exists for dedicated Claude panels; this extends it universally
- Closing and reopening foozol should feel like closing and reopening a terminal emulator — sessions pick up where they left off

## What

### User-Visible Behavior
1. User quits foozol (X button, Ctrl+Q, or `app.quit()`)
2. All running Claude processes receive Ctrl+C via PTY for graceful shutdown
3. Brief delay (2s) allows Claude to print farewell message with resume ID
4. On next launch, interrupted sessions from the **active project** show a "Resume sessions?" dialog
5. "Resume All" is the primary button; "Skip" is secondary
6. User can also select individual sessions via checkboxes → "Resume Selected"
7. Selected sessions reopen with `claude --resume <id>` running automatically
8. Dialog stays open until user acts (no auto-dismiss timeout)

### Technical Requirements
- Capture Claude session IDs from **terminal panels** (regex on scrollback for farewell message)
- Capture Claude session IDs from **Claude panels** (already works via JSON init message — stored as `agentSessionId`)
- New `interrupted` session status to distinguish "app quit while running" from "user stopped this"
- Graceful Ctrl+C via PTY on shutdown with 2s timeout before hard kill
- Startup resume flow with user prompt (active project only)
- Logging to diagnose which capture method succeeds
- Deprecated fields on BaseAIPanelState: keep reading as fallback, stop writing to them

### Success Criteria
- [ ] Claude panels resume correctly after app restart
- [ ] Terminal panels running Claude resume correctly after app restart
- [ ] Scrollback regex captures session ID from Claude's farewell message
- [ ] Graceful Ctrl+C gives Claude time to print farewell message
- [ ] User sees dialog on startup listing resumable sessions (active project only)
- [ ] "Resume All" is the primary/default button; "Skip" is secondary
- [ ] "Skip" leaves sessions as stopped (current behavior)
- [ ] Logging shows which capture method (init JSON vs farewell regex) succeeded
- [ ] Force-killed app does NOT show resume dialog (sessions marked stopped, not interrupted)
- [ ] Terminals running non-Claude commands are marked stopped after scan (not left as interrupted)

## All Needed Context

### Documentation & References

```yaml
- file: main/src/services/terminalPanelManager.ts
  why: |
    Terminal panel lifecycle. Key methods:
    - saveTerminalState() at line 261 — saves scrollback, cwd, commandHistory to DB
    - destroyTerminal() at line 369 — calls saveTerminalState THEN kills PTY
    - destroyAllTerminals() at line 397 — kills PTYs WITHOUT saving state (bug on shutdown)
    - initializeTerminal() at line 32 — spawns PTY, reads initialCommand from panel state
    - initialCommand execution at line 112-117 — runs initialCommand via pty.write after 500ms delay
    - getActiveTerminals() at line 409 — returns list of active panel IDs

- file: main/src/services/panels/cli/AbstractCliManager.ts
  why: |
    CLI process management. Key methods:
    - killProcess (line 233) — gets descendant PIDs, kills process tree
    - killAllProcesses (line 307) — calls killProcess for each panel
    - killProcessTree (line 910) — uses taskkill /F /T on Windows, SIGTERM→SIGKILL on Unix
    - All panels use node-pty (this.processes Map stores CliProcess with .process: IPty)
    - PTY accessible via this.processes.get(panelId).process

- file: main/src/services/sessionManager.ts
  why: |
    Session lifecycle. Key methods:
    - initializeFromDatabase() line 187-198 — marks all running sessions as stopped on startup
    - addPanelOutput() line 878-889 — captures claude_session_id from JSON init message
    - getPanelClaudeSessionId() line 105-115 — reads agentSessionId (with deprecated fallbacks)
    - getPanelAgentSessionId() line 160-173 — generic version with fallbacks
    - mapDbStatusToSessionStatus() line 241-274 — maps DB status to frontend status

- file: main/src/index.ts
  why: |
    before-quit handler at line 757-866. CRITICAL: already uses event.preventDefault()
    for archive task check at line 760. Must merge, not duplicate. Shutdown order:
    1. Archive task check (prevents quit if active)
    2. spotlightManager.disableAll()
    3. sessionManager.cleanup()
    4. runCommandManager.stopAllRunCommands()
    5. gitStatusManager.stopPolling()
    6. cliManagerFactory.shutdown() → killAllProcesses
    7. taskQueue.close()
    8. permissionIpcServer.stop()
    9. analyticsManager.flush/shutdown
    10. logger.close()

- file: shared/types/panels.ts
  why: |
    Type definitions. Key types:
    - TerminalPanelState (line 19-39) — has initialCommand field, no panelStatus
    - BaseAIPanelState (line 58-78) — has agentSessionId + deprecated legacy fields + panelStatus
    - PanelStatus (line 55) — 'idle' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error'
    - ToolPanel (line 1-8) — id, sessionId, type, title, state, metadata

- file: main/src/services/panels/claude/claudeCodeManager.ts
  why: |
    Claude CLI integration:
    - continuePanel() at line 597 — resume flow
    - --resume flag added at line 188-199 via getPanelClaudeSessionId()
    - Resume validation at line 452-478 — throws if no session ID
    - parseCliOutput() at line 251 — parses JSON, detects init message at line 259-267

- file: main/src/database/database.ts
  why: updateSession(), updatePanel(), getActiveSessions(), markSessionsAsStopped(), getAllPanels(), getPanel()

- file: main/src/preload.ts
  why: Must expose new IPC channels for renderer access
```

### Known Gotchas

```
1. SHUTDOWN GUARD: before-quit ALREADY uses event.preventDefault() for archive tasks (line 760).
   Use a shutdownInProgress guard flag. CRITICAL: if user clicks "Wait" on archive dialog,
   reset shutdownInProgress = false before returning, otherwise future quit attempts are blocked.

2. DESTROY ALL BUG: destroyAllTerminals() (line 397) kills PTYs WITHOUT saving state.
   On shutdown, we must save each terminal's state BEFORE the normal cleanup calls this.

3. ALL PTYS USE write('\x03'): Both terminal panels and CLI panels use node-pty.
   Send Ctrl+C uniformly via pty.write('\x03') on ALL platforms. Do NOT use taskkill
   or process.kill during the graceful phase. node-pty handles the cross-platform translation.

4. SCROLLBACK SIZE: Terminal scrollback buffer capped at 500KB (line 207).
   Claude's farewell message is small (~100 bytes) so it'll be in the buffer.

5. TERMINAL initialCommand RACE CONDITION: initializeTerminal() reads initialCommand from
   panel state at line 92-94 BEFORE updating the state. To use initialCommand for resume:
   update panel state in DB FIRST → reload panel from DB → THEN call initializeTerminal().

6. LAZY INITIALIZATION: Terminal panels only start PTY processes when first viewed.
   Resumed sessions need immediate initialization via direct initializeTerminal() call.

7. MULTI-PROJECT: Resume dialog must filter by active project. Don't mark other projects'
   interrupted sessions as stopped when user skips. Leave them as interrupted until their
   project becomes active.

8. NON-CLAUDE TERMINALS: After scrollback scan, terminals WITHOUT a resume ID should be
   marked as 'stopped', not left as 'interrupted' forever.

9. DEPRECATED FIELDS: BaseAIPanelState has deprecated claudeSessionId, claudeResumeId,
   codexSessionId, codexResumeId. Keep reading them as fallback for existing DBs, but
   stop writing to them. Use agentSessionId for all new writes.

10. TERMINAL vs AI PANEL STATE: TerminalPanelState does NOT have panelStatus (that's on
    BaseAIPanelState). Track terminal interruption via a wasInterrupted?: boolean field
    on TerminalPanelState, not panelStatus.
```

### Claude Farewell Message Format

When Claude exits gracefully (SIGINT/Ctrl+C), it prints:
```
Resume this session with:
claude --resume 30e1eacf-4e12-49aa-a466-26b9fe9ae456
```

Regex to extract (after ANSI stripping): `claude\s+--resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`

Use `--resume` (double dash only). Strip ANSI codes first. Use `/gi` flag with `matchAll()` to find ALL occurrences, take the LAST one (most recent Claude session if user ran multiple in same terminal).

## Implementation Blueprint

### Data Model Changes

No migration files needed — `status` is TEXT (accepts any value), `tool_panels.state` is JSON (accepts any keys).

**New fields in TerminalPanelState (shared/types/panels.ts):**
```typescript
// Add to TerminalPanelState interface:
terminalClaudeResumeId?: string;  // Claude session ID captured from farewell message in terminal scrollback
wasInterrupted?: boolean;          // Whether this terminal was active when app shutdown occurred
```

**New PanelStatus value:**
```typescript
export type PanelStatus = 'idle' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error' | 'interrupted';
```

**New type definition for resume flow:**
```typescript
interface ResumableSession {
  sessionId: string;
  sessionName: string;
  panels: Array<{
    panelId: string;
    panelType: 'terminal' | 'claude';
    resumeId: string;
  }>;
}
```

**Deprecated fields on BaseAIPanelState — keep but stop writing:**
```typescript
// These stay in the interface for backward compatibility with existing DBs.
// READ from them as fallback, but NEVER write to them. Use agentSessionId for all new writes.
/** @deprecated Use agentSessionId instead */
claudeSessionId?: string;
/** @deprecated Use agentSessionId instead */
codexSessionId?: string;
/** @deprecated Use agentSessionId instead */
claudeResumeId?: string;
/** @deprecated Use agentSessionId instead */
codexResumeId?: string;
```

Update code that WRITES to these deprecated fields to write to `agentSessionId` instead. Keep read-fallback chains intact.

### Pseudocode: Shutdown Flow

```
// Module-level guard
let shutdownInProgress = false;

on before-quit:
  if shutdownInProgress: return
  shutdownInProgress = true
  event.preventDefault()

  // Existing archive task check (lines 758-791)
  if archiveProgressManager.hasActiveTasks():
    show archive warning dialog
    if user chooses "Wait":
      shutdownInProgress = false   // CRITICAL: reset guard so next quit works
      return
    else:
      archiveProgressManager.clearAll()
      // fall through to shutdown

  // Phase 1: Send Ctrl+C to all PTYs (terminals + CLI panels)
  log "Graceful shutdown: sending Ctrl+C to all panels"
  const signaledTerminals = terminalPanelManager.sendCtrlCToAll()  // returns panel IDs
  cliManagerFactory.gracefulSignalAllProcesses()  // writes '\x03' to each CLI PTY
  log "Graceful shutdown: sent Ctrl+C to {signaledTerminals.length} terminals, {cliCount} CLI processes"

  // Phase 2: Wait for Claude to print farewell messages
  log "Graceful shutdown: waiting 2s for farewell messages..."
  await sleep(2000)

  // Phase 3: Save terminal state + scan scrollback for resume IDs
  await terminalPanelManager.saveAllTerminalStates()
  const interruptedPanels: Map<string, string[]> = new Map()  // sessionId → panelIds

  for each panelId in signaledTerminals:
    const scrollback = terminalPanelManager.getTerminalScrollback(panelId)
    const resumeId = extractClaudeResumeId(scrollback)
    const panel = panelManager.getPanel(panelId)

    if resumeId:
      log "Found resume ID {resumeId} for terminal panel {panelId}"
      update panel state: { terminalClaudeResumeId: resumeId, wasInterrupted: true }
      interruptedPanels.get(panel.sessionId)?.push(panelId) or set new
    else:
      log "No resume ID for terminal panel {panelId} — marking as stopped"
      // Don't mark as interrupted — no way to resume

  for each CLI panel that was signaled:
    const agentSessionId = sessionManager.getPanelAgentSessionId(panelId)
    if agentSessionId:
      update panel state: { panelStatus: 'interrupted' }
      interruptedPanels.get(panel.sessionId)?.push(panelId) or set new
    else:
      log "No agent session ID for CLI panel {panelId}"

  // Phase 4: Mark sessions as interrupted in DB
  for each [sessionId, panelIds] in interruptedPanels:
    db.updateSession(sessionId, { status: 'interrupted' })
    log "Marked session {sessionId} as interrupted ({panelIds.length} panels)"

  // Phase 5: Normal cleanup (existing code, unchanged)
  spotlightManager.disableAll()
  sessionManager.cleanup()
  runCommandManager.stopAllRunCommands()
  gitStatusManager.stopPolling()
  cliManagerFactory.shutdown()  // hard-kills remaining processes
  taskQueue.close()
  permissionIpcServer.stop()
  analyticsManager.flush() + shutdown()
  logger.close()

  app.exit(0)
```

### Pseudocode: Startup Resume Flow

```
in initializeFromDatabase():
  const activeSessions = db.getActiveSessions()  // status = 'running' or 'pending'
  const interruptedSessions = db.getSessionsByStatus('interrupted')

  // Crashed sessions (running but no graceful shutdown) → mark stopped
  const crashedIds = activeSessions.map(s => s.id)
  if crashedIds.length > 0:
    db.markSessionsAsStopped(crashedIds)
    log "Marked {crashedIds.length} crashed sessions as stopped"

  // Interrupted sessions → leave as-is, will be handled by resume dialog
  if interruptedSessions.length > 0:
    log "Found {interruptedSessions.length} interrupted sessions from last shutdown"

  // Load all sessions as before
  const dbSessions = db.getAllSessions()
  emit('sessions-loaded', ...)


// New method: getResumableSessions(projectId)
getResumableSessions(projectId: number): ResumableSession[]
  const interrupted = db.getSessionsByStatus('interrupted')
    .filter(s => s.project_id === projectId)

  const result: ResumableSession[] = []
  for each session in interrupted:
    const panels = db.getPanelsForSession(session.id)
    const resumablePanels = []
    for each panel in panels:
      if panel.type === 'claude':
        const resumeId = panel.state.customState?.agentSessionId
                      || panel.state.customState?.claudeSessionId  // deprecated fallback
        if resumeId: resumablePanels.push({ panelId: panel.id, panelType: 'claude', resumeId })
      if panel.type === 'terminal':
        const resumeId = panel.state.customState?.terminalClaudeResumeId
        if resumeId: resumablePanels.push({ panelId: panel.id, panelType: 'terminal', resumeId })

    if resumablePanels.length > 0:
      result.push({ sessionId: session.id, sessionName: session.name, panels: resumablePanels })

  return result


// New method: resumeInterruptedSessions(sessionIds)
resumeInterruptedSessions(sessionIds: string[]): void
  for each sessionId in sessionIds:
    const panels = db.getPanelsForSession(sessionId)
    for each panel in panels:
      if panel.type === 'terminal' && panel.state.customState?.terminalClaudeResumeId:
        // Update initialCommand in DB, then reload and init
        const resumeId = panel.state.customState.terminalClaudeResumeId
        panel.state.customState.initialCommand = `claude --resume ${resumeId}`
        db.updatePanel(panel.id, { state: panel.state })
        const updatedPanel = db.getPanel(panel.id)  // reload from DB
        terminalPanelManager.initializeTerminal(updatedPanel, worktreePath)
        log "Resumed terminal panel {panel.id} with claude --resume {resumeId}"

      if panel.type === 'claude' && (panel.state.customState?.agentSessionId || panel.state.customState?.claudeSessionId):
        // Use existing continuePanel flow
        claudeCodeManager.continuePanel(panel.id, sessionId, worktreePath, '', ...)
        log "Resumed Claude panel {panel.id}"

    db.updateSession(sessionId, { status: 'running' })


// New method: dismissInterruptedSessions(sessionIds)
dismissInterruptedSessions(sessionIds: string[]): void
  for each sessionId in sessionIds:
    db.updateSession(sessionId, { status: 'stopped' })
  log "Dismissed {sessionIds.length} interrupted sessions"
```

### Pseudocode: Scrollback Resume ID Scanner

```typescript
// main/src/utils/claudeResumeParser.ts

export function extractClaudeResumeId(scrollback: string): string | null {
  // Strip ANSI escape codes
  const clean = scrollback.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  // Match ALL "claude --resume <uuid>" occurrences, take the LAST one
  // (most recent Claude session if user ran multiple in the same terminal)
  const regex = /claude\s+--resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const allMatches = [...clean.matchAll(regex)];
  return allMatches.length > 0 ? allMatches[allMatches.length - 1][1] : null;
}
```

## Tasks (in implementation order)

### Task 1: Type updates and deprecation annotations

```yaml
MODIFY shared/types/panels.ts:
  - ADD 'interrupted' to PanelStatus type union (line 55)
  - ADD terminalClaudeResumeId?: string to TerminalPanelState (after line 38)
  - ADD wasInterrupted?: boolean to TerminalPanelState (after terminalClaudeResumeId)
  - ADD @deprecated JSDoc comments to claudeSessionId, codexSessionId, claudeResumeId, codexResumeId on BaseAIPanelState (lines 73-77) — keep the fields, just mark deprecated
  - ADD ResumableSession interface (can go in this file or a new shared type)

MODIFY main/src/services/sessionManager.ts:
  - UPDATE mapDbStatusToSessionStatus() to handle 'interrupted' → map to 'stopped' for frontend display for now (line 241-274)
  - UPDATE all WRITE paths to use agentSessionId exclusively (stop writing to deprecated fields)
  - KEEP read fallback chains in getPanelClaudeSessionId, getPanelCodexSessionId, getPanelAgentSessionId

GREP entire codebase for writes to claudeSessionId, codexSessionId, claudeResumeId, codexResumeId:
  - Change any db.updatePanel() or state assignment that writes these fields to write agentSessionId instead
```

### Task 2: Create scrollback resume ID scanner utility

```yaml
CREATE main/src/utils/claudeResumeParser.ts:
  - extractClaudeResumeId(scrollback: string): string | null
    - Inline ANSI strip: scrollback.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    - Regex: /claude\s+--resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi
    - Return LAST match via matchAll() (most recent Claude session)
    - console.log result: found resume ID or no match
```

### Task 3: Graceful Ctrl+C signaling for CLI processes

```yaml
MODIFY main/src/services/panels/cli/AbstractCliManager.ts:
  - ADD gracefulSignalAllProcesses(): void
    - For each process in this.processes:
      - Write '\x03' to process.process (the IPty instance) via process.process.write('\x03')
      - Log which panel was signaled
    - Does NOT kill or remove from map — just sends the signal
    - Returns immediately (caller handles wait + hard kill later)
  - KEEP existing killProcess/killAllProcesses unchanged for non-shutdown use
  - NOTE: The existing cliManagerFactory.shutdown() calls killAllProcesses() — this remains
    as the hard-kill fallback after the graceful phase
```

### Task 4: Graceful shutdown with state snapshot

```yaml
MODIFY main/src/index.ts (before-quit handler, line 757-866):
  - ADD module-level: let shutdownInProgress = false
  - RESTRUCTURE the before-quit handler:
    1. If shutdownInProgress, return
    2. shutdownInProgress = true
    3. event.preventDefault()
    4. Archive task check (existing lines 758-791):
       - If user chooses "Wait": set shutdownInProgress = false, return
       - If "Quit Anyway": clearAll, fall through
    5. NEW — Graceful signal phase:
       - const signaledTerminals = terminalPanelManager.sendCtrlCToAll()
       - cliManagerFactory graceful signal (call on each CLI manager)
       - Log counts
    6. NEW — Wait: await new Promise(resolve => setTimeout(resolve, 2000))
    7. NEW — Save + scan terminals:
       - await terminalPanelManager.saveAllTerminalStates()
       - For each signaled terminal panel:
         - Get scrollback via terminalPanelManager.getTerminalScrollback(panelId)
         - Call extractClaudeResumeId(scrollback)
         - If found: update panel state in DB with terminalClaudeResumeId + wasInterrupted=true
         - If not found: leave as-is (will be marked stopped in normal startup)
       - For each CLI panel that was signaled:
         - Check if agentSessionId exists (already stored)
         - If yes: update panel state with panelStatus='interrupted'
    8. NEW — Mark sessions:
       - Collect sessionIds from panels that had resume IDs
       - For each: db.updateSession(sessionId, { status: 'interrupted' })
       - Log count
    9. Existing cleanup (unchanged): spotlights, sessionManager.cleanup(),
       runCommands, gitStatus, cliManagerFactory.shutdown(), taskQueue,
       permissionIpcServer, analytics, logger
    10. app.exit(0)

MODIFY main/src/services/terminalPanelManager.ts:
  - ADD sendCtrlCToAll(): string[]
    - For each terminal in this.terminals: pty.write('\x03')
    - Return array of panel IDs that were signaled
    - Log each one
  - ADD saveAllTerminalStates(): Promise<void>
    - For each terminal in this.terminals: await saveTerminalState(panelId)
  - ADD getTerminalScrollback(panelId: string): string | null
    - Return this.terminals.get(panelId)?.scrollbackBuffer ?? null
  - FIX destroyAllTerminals(): save state per panel before killing
    - For each terminal: saveTerminalState(panelId), THEN pty.kill()
```

### Task 5: Startup resume detection and IPC handlers

```yaml
MODIFY main/src/services/sessionManager.ts:
  - MODIFY initializeFromDatabase():
    - Get active sessions (status = 'running' or 'pending') as before
    - Mark those as 'stopped' (crash recovery — no graceful shutdown happened)
    - Do NOT touch sessions with status 'interrupted' (those had graceful shutdown)
    - Log: "Marked N crashed sessions as stopped, found N interrupted sessions"
  - ADD getResumableSessions(projectId: number): ResumableSession[]
    - Query sessions with status='interrupted' AND project_id=projectId
    - For each session, check all panels for resume IDs:
      - Claude panels: read agentSessionId (with deprecated field fallback)
      - Terminal panels: read terminalClaudeResumeId
    - Only include sessions with at least one panel that has a resume ID
    - Log what was found
  - ADD resumeInterruptedSessions(sessionIds: string[]): void
    - For each session:
      - For terminal panels with terminalClaudeResumeId:
        - Update panel state: set initialCommand = "claude --resume <id>"
        - Save to DB via db.updatePanel()
        - Reload panel from DB (to avoid race condition with initializeTerminal reading stale state)
        - Call terminalPanelManager.initializeTerminal(reloadedPanel, worktreePath) directly
      - For Claude panels with agentSessionId:
        - Call continuePanel() with empty prompt + isResume=true
      - Update session status to 'running'
    - Log each resumed panel
  - ADD dismissInterruptedSessions(sessionIds: string[]): void
    - Mark provided sessions as 'stopped' in DB
    - Log count

ADD IPC handlers in main/src/ipc/session.ts:
  - 'sessions:get-resumable':
    - Get active project ID
    - Return sessionManager.getResumableSessions(projectId)
  - 'sessions:resume-interrupted':
    - Receive sessionIds: string[]
    - Call sessionManager.resumeInterruptedSessions(sessionIds)
  - 'sessions:dismiss-interrupted':
    - Receive sessionIds: string[]
    - Call sessionManager.dismissInterruptedSessions(sessionIds)

MODIFY main/src/preload.ts:
  - Expose the three new IPC channels for renderer access
```

### Task 6: Frontend resume dialog

```yaml
CREATE frontend/src/components/ResumeSessionsDialog.tsx:
  - Modal dialog shown on startup when resumable sessions exist
  - Lists sessions with name, panel count, and panel types (terminal vs claude icons)
  - Checkboxes per session for individual selection
  - Primary button: "Resume All" (always enabled)
  - Secondary button: "Skip" (marks all as stopped)
  - Tertiary: "Resume Selected" (enabled when checkboxes are checked)
  - NO auto-dismiss timeout — dialog stays until user acts
  - On Resume All: call window.api.invoke('sessions:resume-interrupted', allSessionIds)
  - On Resume Selected: call window.api.invoke('sessions:resume-interrupted', selectedIds)
  - On Skip: call window.api.invoke('sessions:dismiss-interrupted', allSessionIds)
  - Close dialog after action completes

MODIFY frontend entry point (App.tsx or equivalent root component):
  - After session store isLoaded becomes true (wait for useIPCEvents initialization):
    - Call window.api.invoke('sessions:get-resumable')
    - If results non-empty: show ResumeSessionsDialog
    - Normal app interaction blocked (dialog is modal) until resolved
  - After dialog action completes: proceed with normal app flow
  - If no resumable sessions: no dialog, normal startup
```

### Task 7: Logging (integrated into all tasks)

```yaml
All logging uses console.log (which routes to the existing Logger) at info level.

SHUTDOWN LOGGING (in index.ts):
  - "Graceful shutdown: sending Ctrl+C to N terminals, N CLI processes"
  - "Graceful shutdown: waiting 2s for farewell messages..."
  - "Graceful shutdown: scanned N terminals — found resume IDs for N, none for N"
  - "Graceful shutdown: marked N sessions as interrupted"
  - Phase timing: log start/end timestamps for the 2s wait and scan phases

SCANNER LOGGING (in claudeResumeParser.ts):
  - "Scrollback scan for panel {panelId}: found resume ID {id}" or "no resume ID found"

STARTUP LOGGING (in sessionManager.ts):
  - "Startup: marked N crashed sessions as stopped"
  - "Startup: found N interrupted sessions from last shutdown"
  - "Resumable sessions for project {id}: N sessions with N total panels"
  - "Resuming session {id}: N terminal panels, N claude panels"
  - "Dismissed N interrupted sessions"
```

## Integration Points

```yaml
DATABASE:
  - No migration files needed
  - Session status TEXT column: new 'interrupted' value
  - Panel state JSON: TerminalPanelState gains terminalClaudeResumeId + wasInterrupted
  - BaseAIPanelState: deprecated fields kept for read-fallback, new writes use agentSessionId

IPC:
  - New channels: sessions:get-resumable, sessions:resume-interrupted, sessions:dismiss-interrupted
  - MUST be added to preload.ts for renderer access

SHUTDOWN (before-quit):
  - Merged with existing archive task guard via shutdownInProgress flag
  - Ctrl+C via pty.write('\x03') → 2s wait → save state + scan → hard kill → app.exit(0)

STARTUP:
  - initializeFromDatabase: crashed (running) → stopped; interrupted → left for resume dialog
  - Frontend checks for resumable sessions via IPC after session store loads
  - Resume dialog is modal — blocks normal interaction

FRONTEND:
  - New ResumeSessionsDialog component
  - App.tsx: post-load check for resumable sessions
```

## Validation Loop

```bash
# Run these after implementation
pnpm typecheck          # TypeScript compilation — no errors
pnpm lint               # ESLint — no errors (especially no-any rule)
pnpm electron-dev       # Manual test: start app, create sessions, quit, reopen
```

### Manual Test Scenarios
1. Start Claude in a terminal panel → quit app → reopen → dialog shows → Resume All → Claude resumes in terminal
2. Start Claude in dedicated Claude panel → quit app → reopen → dialog shows → Resume All → Claude panel resumes
3. Start app with no interrupted sessions → no dialog
4. Click "Skip" in resume dialog → sessions become stopped (current behavior)
5. Force-kill app (Task Manager) → on reopen, sessions marked stopped (no dialog)
6. Multiple projects → only show resume for active project's sessions
7. Terminal running `npm run dev` (not Claude) → quit → reopen → no resume ID found, terminal not in dialog
8. Mid-shutdown crash (kill during 2s wait) → sessions left as interrupted → next startup shows dialog
9. Mixed: some terminals with Claude, some without → dialog only shows sessions with resume IDs

## Anti-Patterns to Avoid

- Don't try to capture init JSON from terminal panels — they don't use `--output-format stream-json`
- Don't create a separate shutdown state table — existing panel state JSON is sufficient
- Don't add a watchdog/daemon process — keep it simple with graceful shutdown only
- Don't auto-resume without asking — user must consent
- Don't modify existing `killProcess`/`killAllProcesses` — add new graceful signal method alongside
- Don't use `any` type — ESLint enforces this
- Don't use `taskkill` during graceful phase — use pty.write('\x03') everywhere
- Don't mark other projects' interrupted sessions as stopped when user skips
- Don't delete deprecated fields from BaseAIPanelState — keep for read-fallback, stop writing
- Don't call initializeTerminal() without first saving the updated initialCommand to DB and reloading

## Deprecated Code Changes

Mark as `@deprecated` (keep for read-fallback, stop writing):
- `BaseAIPanelState.claudeSessionId` → use `agentSessionId`
- `BaseAIPanelState.codexSessionId` → use `agentSessionId`
- `BaseAIPanelState.claudeResumeId` → use `agentSessionId`
- `BaseAIPanelState.codexResumeId` → use `agentSessionId`

Grep for writes to these fields and redirect to `agentSessionId`.

## Confidence Score: 8.5/10

Strong foundations exist (session IDs, scrollback persistence, --resume wiring). All reviewer feedback incorporated:
- Shutdown guard with proper reset on "Wait"
- Single scan after 2s wait (not dual scan)
- Uniform pty.write('\x03') across all platforms and panel types
- initialCommand race condition handled (DB save → reload → init)
- Non-Claude terminals cleaned up after scan
- Multi-project filtering
- No auto-dismiss timeout
- Resume All as primary button
- Deprecated fields kept for read, stopped for write
- ResumableSession type defined
- preload.ts explicitly required

Remaining risks:
- PTY.write('\x03') may not work if Claude is in a subshell or pipe
- 2s may be tight for Claude to flush output on slow machines
- Force-init bypasses lazy loading — memory impact with many resumed sessions
