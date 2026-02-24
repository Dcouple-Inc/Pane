# Keyboard Shortcut Cycling Implementation

## Goal

Add keyboard shortcuts to cycle through sessions and panel tabs, replacing the existing history navigation feature with more useful cycling behavior. Provide multiple key combinations for the same actions to accommodate different user preferences.

## Why

- **Session cycling**: Users want to quickly navigate between sessions without reaching for the mouse or being limited to 9 sessions (current Ctrl+1-9 limitation)
- **Tab cycling**: Alt+←/→ for cycling tabs is more intuitive than the current history navigation (back/forward browser-style)
- **Familiarity**: Multiple options (Ctrl+Tab, Ctrl+W/S, arrows) let users choose what feels natural based on their background
- **Flexibility**: Different users prefer different shortcuts - some like Tab cycling, others prefer WASD-style navigation
- **OS compatibility**: Multiple alternatives ensure at least one option works even if others conflict with OS shortcuts (e.g., Cmd+Tab on macOS)

## What

### Session Cycling Shortcuts (8 total, 4 key combos)

| Shortcut | Behavior |
|----------|----------|
| `Ctrl+Tab` | Next session |
| `Ctrl+Shift+Tab` | Previous session |
| `Ctrl+↑` | Next session |
| `Ctrl+↓` | Previous session |
| `Alt+↑` | Next session |
| `Alt+↓` | Previous session |
| `Ctrl+S` | Next session |
| `Ctrl+W` | Previous session |

### Tab Cycling Shortcuts (4 total, 2 key combos)

| Shortcut | Behavior |
|----------|----------|
| `Alt+→` | Next tab |
| `Alt+←` | Previous tab |
| `Ctrl+D` | Next tab |
| `Ctrl+A` | Previous tab |

### Modified Shortcuts

| Shortcut | Change |
|----------|--------|
| `Ctrl+Q` | Close active tab (moved FROM Ctrl+W) |

### Removed Features

- **History navigation** (`Alt+←/→` for back/forward in session history) - replaced with tab cycling
- **Ctrl+W close tab** - reassigned to session cycling, close tab moved to Ctrl+Q

### Success Criteria

- [ ] Session cycling works across ALL active (non-archived) sessions regardless of project expansion state
- [ ] Tab cycling works within the current session's panels
- [ ] All 8 session cycling shortcuts work identically
- [ ] All 4 tab cycling shortcuts work identically
- [ ] Ctrl+Q closes the active tab
- [ ] Shortcuts work even when terminal has focus
- [ ] Shortcuts display correctly in Help dialog and Command Palette

## All Needed Context

### Documentation & References

```yaml
- file: frontend/src/components/SessionView.tsx
  lines: 199-232
  why: Current history navigation shortcuts to REMOVE and replace with tab cycling

- file: frontend/src/components/SessionView.tsx
  lines: 266-294
  why: Pattern for Alt+1-9 tab switching AND Ctrl+W close tab (needs key change)

- file: frontend/src/components/ProjectSessionList.tsx
  lines: 117-172
  why: Current Ctrl+1-9 session switching - ADD cycling shortcuts here

- file: frontend/src/components/panels/TerminalPanel.tsx
  lines: 108-130
  why: Terminal key handler - MUST add new shortcuts to bypass list

- file: frontend/src/stores/hotkeyStore.ts
  why: Hotkey system - uses 'mod' for Ctrl/Cmd, keys like 'Tab', 'ArrowUp'

- file: frontend/src/utils/hotkeyUtils.ts
  why: Key display formatting - needs 'Tab' case added
```

### Key Implementation Details

**Hotkey key strings:**
- Use `mod+Tab` for Ctrl+Tab (mod = Ctrl on Windows, Cmd on Mac)
- Use `mod+shift+Tab` for Ctrl+Shift+Tab
- Use `mod+ArrowUp`, `mod+ArrowDown` for Ctrl+arrows
- Use `alt+ArrowUp`, `alt+ArrowDown`, `alt+ArrowLeft`, `alt+ArrowRight` for Alt+arrows
- Use `mod+w`, `mod+s`, `mod+a`, `mod+d`, `mod+q` for letter keys

**Session list requirements:**
- Current `allVisibleSessions` only includes sessions from EXPANDED projects
- Need a new `allActiveSessions` that includes ALL non-archived sessions across all projects
- `sessionsByProject` already filters archived sessions, so just iterate all projects
- Cycling should wrap around (first ↔ last)

**Tab cycling requirements:**
- Use `sortedSessionPanels` array (already exists in SessionView)
- Find current panel index, go to next/previous with wrap-around
- Add `enabled` check: only enable when there are 2+ panels

**Project auto-expansion:**
- When cycling to a session in a collapsed project, auto-expand that project so the user can see the selected session in the sidebar

**Command Palette / Help dialog display:**
- All shortcuts for the same action are COMBINED into a single entry
- Primary shortcut label shows all key alternatives: "Next Session" with keys displayed as "Ctrl+Tab / ↑ / Alt+↑ / S"
- This requires adding a `showInPalette` property to HotkeyDefinition to hide duplicate entries
- Only the primary hotkey (first registered) shows in palette; alternatives are hidden but still functional

**macOS Cmd+Tab note:**
- Cmd+Tab is the system app switcher on macOS and cannot be intercepted
- This shortcut won't work on Mac, but alternatives (Ctrl+arrows, Alt+arrows, Ctrl+W/S) will
- No code change needed - just add a note in Help dialog if desired

## Implementation Blueprint

### Tasks (in implementation order)

```yaml
Task 0: Update hotkeyStore.ts - Add showInPalette property
MODIFY frontend/src/stores/hotkeyStore.ts:
  - ADD optional property to HotkeyDefinition interface:
    showInPalette?: boolean;  // defaults to true if not specified
  - UPDATE getAll() to optionally filter by showInPalette
  - This allows registering multiple keys for same action while showing only one in palette

Task 0.5: Update CommandPalette and Help to use paletteOnly filter
MODIFY frontend/src/components/CommandPalette.tsx:
  - UPDATE calls to useHotkeyStore.search() to pass { paletteOnly: true }
  - This hides alternative shortcuts from the palette

MODIFY frontend/src/components/Help.tsx:
  - UPDATE calls to useHotkeyStore.getAll() to pass { paletteOnly: true }
  - This hides alternative shortcuts from the help dialog

Task 1: Update hotkeyUtils.ts - Add Tab key formatting
MODIFY frontend/src/utils/hotkeyUtils.ts:
  - ADD case 'tab': return 'Tab'; in the switch statement (around line 32)
  - This ensures Tab displays correctly in Help dialog

Task 2: Update TerminalPanel.tsx - Allow new shortcuts through
MODIFY frontend/src/components/panels/TerminalPanel.tsx:
  - FIND: terminal.attachCustomKeyEventHandler (around line 109)
  - ADD these conditions to return false (let app handle):
    // Session cycling
    - ctrlOrMeta && e.key === 'Tab' (with or without shift)
    - ctrlOrMeta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    - ctrlOrMeta && (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's')
    - ctrlOrMeta && e.key.toLowerCase() === 'q'  // close tab
    // Tab cycling
    - e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    - ctrlOrMeta && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd')

Task 3: Update ProjectSessionList.tsx - Add session cycling shortcuts
MODIFY frontend/src/components/ProjectSessionList.tsx:
  - ADD new memo: allActiveSessions - flat list of ALL non-archived sessions
    - Iterate all projects (not filtering by expandedProjects)
    - Collect sessions from sessionsByProject for each
  - ADD ref: allActiveSessionsRef
  - ADD ref: activeSessionIdRef (for current session)
  - ADD ref: setExpandedProjectsRef (for auto-expanding projects)
  - ADD useEffect to register 8 cycling hotkeys with cleanup:
    - cycle-session-next-tab: mod+Tab
    - cycle-session-prev-tab: mod+shift+Tab
    - cycle-session-next-up: mod+ArrowUp
    - cycle-session-prev-down: mod+ArrowDown
    - cycle-session-next-alt-up: alt+ArrowUp
    - cycle-session-prev-alt-down: alt+ArrowDown
    - cycle-session-next-s: mod+s
    - cycle-session-prev-w: mod+w
  - ACTION: Find current session index, go to next/prev with wrap-around
  - AUTO-EXPAND: When selecting session, expand its project if collapsed

Task 4: Update SessionView.tsx - Replace history nav with tab cycling, change close tab key
MODIFY frontend/src/components/SessionView.tsx:
  - REMOVE: useHotkey for 'navigate-back' (alt+ArrowLeft) - lines 200-215
  - REMOVE: useHotkey for 'navigate-forward' (alt+ArrowRight) - lines 217-232
  - CHANGE: 'close-active-tab' hotkey from 'mod+w' to 'mod+q' (around line 287)
  - ADD: useHotkey for 'cycle-tab-prev-arrow' (alt+ArrowLeft)
  - ADD: useHotkey for 'cycle-tab-next-arrow' (alt+ArrowRight)
  - ADD: useHotkey for 'cycle-tab-prev-a' (mod+a)
  - ADD: useHotkey for 'cycle-tab-next-d' (mod+d)
  - ENABLED: () => sortedSessionPanels.length > 1
```

### Per-Task Pseudocode

**Task 0 - hotkeyStore showInPalette property:**
```typescript
// In HotkeyDefinition interface, add:
export interface HotkeyDefinition {
  // ... existing properties ...
  /** If false, hotkey works but doesn't appear in Command Palette/Help. Defaults to true. */
  showInPalette?: boolean;
}

// Update getAll() to filter by showInPalette (for Command Palette/Help)
getAll: (options?: { paletteOnly?: boolean }) => {
  const state = get();
  let results = Array.from(state.hotkeys.values()).filter(
    (def) => !def.devOnly || process.env.NODE_ENV === 'development'
  );
  if (options?.paletteOnly) {
    results = results.filter((def) => def.showInPalette !== false);
  }
  return results;
},

// Update search() similarly
search: (query, options?: { paletteOnly?: boolean }) => {
  const lower = query.toLowerCase();
  let results = get().getAll(options);
  return results.filter(
    (def) =>
      def.label.toLowerCase().includes(lower) ||
      def.keys.toLowerCase().includes(lower) ||
      def.id.toLowerCase().includes(lower)
  );
},
```

**Task 2 - Terminal key handler additions:**
```typescript
// Inside attachCustomKeyEventHandler, add these checks:

// Session cycling - Tab
if (ctrlOrMeta && e.key === 'Tab') return false;

// Session cycling - arrows
if (ctrlOrMeta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return false;

// Session cycling - W/S
if (ctrlOrMeta && (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's')) return false;

// Close tab - Q
if (ctrlOrMeta && e.key.toLowerCase() === 'q') return false;

// Tab cycling - Alt+arrows
if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return false;

// Tab cycling - A/D
if (ctrlOrMeta && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd')) return false;
```

**Task 3 - Session cycling logic:**
```typescript
// New memo for ALL active sessions (not just from expanded projects)
const allActiveSessions = useMemo(() => {
  const result: Session[] = [];
  projects.forEach(p => {
    const list = sessionsByProject.get(p.id) || [];
    result.push(...list);
  });
  return result;
}, [projects, sessionsByProject]);

// Refs for stable access in callbacks
const allActiveSessionsRef = useRef(allActiveSessions);
allActiveSessionsRef.current = allActiveSessions;
const activeSessionIdRef = useRef(activeSessionId);
activeSessionIdRef.current = activeSessionId;
const expandedProjectsRef = useRef(expandedProjects);
expandedProjectsRef.current = expandedProjects;
const setExpandedProjectsRef = useRef(setExpandedProjects);
setExpandedProjectsRef.current = setExpandedProjects;

// Cycling function
const cycleSession = (direction: 'next' | 'prev') => {
  const sessions = allActiveSessionsRef.current;
  if (sessions.length === 0) return;

  const currentId = activeSessionIdRef.current;
  const currentIndex = sessions.findIndex(s => s.id === currentId);

  let nextIndex: number;
  if (currentIndex === -1) {
    nextIndex = 0; // No active session, go to first
  } else if (direction === 'next') {
    nextIndex = (currentIndex + 1) % sessions.length;
  } else {
    nextIndex = (currentIndex - 1 + sessions.length) % sessions.length;
  }

  const nextSession = sessions[nextIndex];

  // Auto-expand the project if it's collapsed
  if (nextSession.projectId != null && !expandedProjectsRef.current.has(nextSession.projectId)) {
    setExpandedProjectsRef.current(prev => {
      const next = new Set(prev);
      next.add(nextSession.projectId!);
      return next;
    });
  }

  setActiveSessionRef.current(nextSession.id);
  navigateToSessionsRef.current();
};

// Register hotkeys in useEffect - COMBINED display in Command Palette
// First shortcut shows in palette with all keys listed; alternatives are hidden but functional
useEffect(() => {
  // Keys arrays: first entry shows in palette, rest are hidden alternatives
  const nextKeys = ['mod+Tab', 'mod+ArrowUp', 'alt+ArrowUp', 'mod+s'];
  const prevKeys = ['mod+shift+Tab', 'mod+ArrowDown', 'alt+ArrowDown', 'mod+w'];
  const ids: string[] = [];

  nextKeys.forEach((keys, i) => {
    const id = `cycle-session-next-${i}`;
    ids.push(id);
    register({
      id,
      label: 'Next Session',
      keys,
      category: 'session',
      enabled: () => allActiveSessionsRef.current.length > 0,
      action: () => cycleSession('next'),
      showInPalette: i === 0,  // Only first entry shows in Command Palette
    });
  });

  prevKeys.forEach((keys, i) => {
    const id = `cycle-session-prev-${i}`;
    ids.push(id);
    register({
      id,
      label: 'Previous Session',
      keys,
      category: 'session',
      enabled: () => allActiveSessionsRef.current.length > 0,
      action: () => cycleSession('prev'),
      showInPalette: i === 0,  // Only first entry shows in Command Palette
    });
  });

  return () => ids.forEach(id => unregister(id));
}, [register, unregister]);
```

**Task 4 - Tab cycling logic:**
```typescript
// Cycling function (define before useHotkey calls)
const cycleTab = useCallback((direction: 'next' | 'prev') => {
  if (!activeSession || sortedSessionPanels.length < 2) return;

  const currentIndex = sortedSessionPanels.findIndex(
    p => p.id === currentActivePanel?.id
  );

  let nextIndex: number;
  if (currentIndex === -1) {
    nextIndex = 0;
  } else if (direction === 'next') {
    nextIndex = (currentIndex + 1) % sortedSessionPanels.length;
  } else {
    nextIndex = (currentIndex - 1 + sortedSessionPanels.length) % sortedSessionPanels.length;
  }

  const nextPanel = sortedSessionPanels[nextIndex];
  handlePanelSelect(nextPanel);
}, [activeSession, sortedSessionPanels, currentActivePanel, handlePanelSelect]);

// Tab cycling hotkeys - COMBINED display in Command Palette
// Primary shortcut shows in palette; alternative is hidden but functional
useHotkey({
  id: 'cycle-tab-prev-arrow',
  label: 'Previous Tab',
  keys: 'alt+ArrowLeft',
  category: 'tabs',
  enabled: () => sortedSessionPanels.length > 1,
  action: () => cycleTab('prev'),
  showInPalette: true,  // Primary - shows in palette
});

useHotkey({
  id: 'cycle-tab-next-arrow',
  label: 'Next Tab',
  keys: 'alt+ArrowRight',
  category: 'tabs',
  enabled: () => sortedSessionPanels.length > 1,
  action: () => cycleTab('next'),
  showInPalette: true,  // Primary - shows in palette
});

useHotkey({
  id: 'cycle-tab-prev-a',
  label: 'Previous Tab',
  keys: 'mod+a',
  category: 'tabs',
  enabled: () => sortedSessionPanels.length > 1,
  action: () => cycleTab('prev'),
  showInPalette: false,  // Hidden alternative
});

useHotkey({
  id: 'cycle-tab-next-d',
  label: 'Next Tab',
  keys: 'mod+d',
  category: 'tabs',
  enabled: () => sortedSessionPanels.length > 1,
  action: () => cycleTab('next'),
  showInPalette: false,  // Hidden alternative
});

// Change close-active-tab from mod+w to mod+q
useHotkey({
  id: 'close-active-tab',
  label: 'Close active tab',
  keys: 'mod+q',  // CHANGED from 'mod+w'
  category: 'tabs',
  // ... rest stays the same
});
```

## Validation Loop

```bash
# Run these after implementation
pnpm typecheck         # TypeScript compilation
pnpm lint              # ESLint checks
```

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] Session cycling works with Ctrl+Tab / Ctrl+Shift+Tab
- [ ] Session cycling works with Ctrl+Up / Ctrl+Down
- [ ] Session cycling works with Alt+Up / Alt+Down
- [ ] Session cycling works with Ctrl+W / Ctrl+S
- [ ] Tab cycling works with Alt+Left / Alt+Right
- [ ] Tab cycling works with Ctrl+A / Ctrl+D
- [ ] Ctrl+Q closes the active tab
- [ ] Shortcuts work when terminal has focus
- [ ] Command Palette shows ONE entry per action (not 4 duplicates)
- [ ] Help dialog shows ONE entry per action (not 4 duplicates)
- [ ] Cycling wraps around correctly (last → first, first → last)
- [ ] Cycling to collapsed project auto-expands it
- [ ] Alt+Left/Right no longer navigate history (now cycle tabs)
- [ ] Cmd+Tab doesn't work on macOS (expected - system shortcut)

## Code to Remove

1. **SessionView.tsx lines 199-232**: The two `useHotkey` calls for `navigate-back` and `navigate-forward`
2. **History imports**: `navigateBack` and `navigateForward` from `useSessionHistoryStore` IF they become unused (verify `addToHistory` is still used by Alt+1-9)

## Anti-Patterns to Avoid

- Don't register hotkeys in render - use useEffect with cleanup like the existing Ctrl+1-9 pattern
- Don't forget to unregister hotkeys on cleanup
- Don't use allVisibleSessions for cycling (it filters by expanded projects)
- Don't forget to update the terminal key handler - shortcuts won't work in terminal otherwise
- Don't use `e.key === 'w'` - use `e.key.toLowerCase() === 'w'` for case-insensitive matching
