## Goal

Simplify the foozol UI by applying progressive disclosure and opinionated defaults across the app. Reduce cognitive load by showing only essential options upfront while keeping all capabilities accessible. Match the clean, minimal aesthetic of Linear and Claude Code CLI.

## Why

- The current UI overwhelms users with advanced options on every interaction (session creation, thinking animations, sidebar utilities)
- New users face a wall of choices instead of an opinionated, guided experience
- The "thinking" animation is flashy and distracting vs Claude Code CLI's simple `thinking...`
- Session creation requires navigating ~6 visible sections when 80% of users just need: prompt → create
- Violates the 80/20 rule: power features have equal visual weight as core features

## What

Apply progressive disclosure and smart defaults to these areas:
1. **CreateSessionDialog** — Prompt-first layout, hide power features in collapsibles, simplify tool selection
2. **ThinkingPlaceholder** — Replace flashy animation with simple Claude Code CLI-style indicator
3. **Sidebar header** — Consolidate utility buttons into overflow menu
4. **Default preferences** — Claude Code selected by default, model defaults to opus
5. **Dead code cleanup** — Remove hidden backwards-compat prompt wrapper (preserve fileInputRef)

### Success Criteria

- [ ] CreateSessionDialog shows only prompt + session name + create on first open
- [ ] Tool selection, tool config, session count all behind collapsible "Session options"
- [ ] ThinkingPlaceholder replaced with minimal "Thinking..." text + subtle dots
- [ ] Sidebar "Projects & Sessions" header: Prompt History visible, Sort + Legend in overflow menu
- [ ] Claude Code is the default selected tool, model defaults to opus, ultrathink off
- [ ] Prompt textarea stays enabled regardless of tool selection
- [ ] Hidden backwards-compat prompt wrapper deleted (fileInputRef preserved)
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`

## All Needed Context

### Documentation & References

```yaml
- file: frontend/src/components/CreateSessionDialog.tsx
  why: Main dialog to restructure — 1,372 lines, all form fields and submission logic.
       Lines 1156-1241 contain a hidden div with a duplicate prompt textarea AND the
       fileInputRef <input type="file"> element used by the paperclip button. Must
       preserve the file input when deleting the hidden wrapper.

- file: frontend/src/components/session/ThinkingPlaceholder.tsx
  why: Contains ThinkingPlaceholder (spinning rings, bouncing dots, rotating icons)
       and InlineWorkingIndicator (41 wacky messages) — both need replacing

- file: frontend/src/components/Sidebar.tsx
  why: Header area with 3 utility icon buttons (Sort, Prompt History, Status Legend)

- file: frontend/src/components/ui/Dropdown.tsx
  why: Existing dropdown component. API:
       <Dropdown trigger={ReactNode} items={DropdownItem[]} selectedId={string}
         position="auto" width="md" />
       DropdownItem: { id: string, label: ReactNode, icon?: ComponentType,
         onClick?: () => void, disabled?: boolean }

- file: frontend/src/stores/sessionPreferencesStore.ts
  why: Stores session creation preferences. Add showSessionOptions key.
       Interface at line 6, defaults at line 31.
       Merge logic at line 78 handles new fields via spread — returning users
       keep saved values, new fields get defaults.

- file: frontend/src/components/FilePathAutocomplete.tsx
  why: Wraps the prompt textarea. Does NOT support autoFocus prop.
       Use useEffect with ref/querySelector to auto-focus on dialog open.

- file: frontend/src/components/panels/ai/RichOutputView.tsx
  why: Lines 1825-1832 render ThinkingPlaceholder/InlineWorkingIndicator.
       Imports stay the same — no changes needed to this file.
```

### Current Codebase Tree (files to modify)

```
frontend/src/
├── components/
│   ├── CreateSessionDialog.tsx          # MODIFY: Restructure layout, simplify tool selection, delete dead code
│   ├── Sidebar.tsx                      # MODIFY: Consolidate header buttons into overflow menu
│   └── session/
│       └── ThinkingPlaceholder.tsx      # MODIFY: Replace with minimal thinking indicator
├── stores/
│   └── sessionPreferencesStore.ts       # MODIFY: Add showSessionOptions, change defaults
```

### Known Gotchas

- `CreateSessionDialog` saves user preferences via `sessionPreferencesStore`. New defaults (claude selected, opus model) only affect first-time users. Returning users keep their saved preferences because `loadPreferences` merges with defaults via spread. This is intentional.
- The `Dropdown` component uses `trigger` prop + `items` array pattern. See `frontend/src/components/ui/Dropdown.tsx` for exact API. Do NOT use DropdownMenu/DropdownMenuTrigger — those don't exist.
- Lines 1156-1241 in CreateSessionDialog contain a `className="hidden"` wrapper with a duplicate prompt textarea AND the `<input ref={fileInputRef} type="file" ...>` element. The file input is used by the visible paperclip button at line ~980. When deleting the hidden wrapper, MOVE the file input element outside before deleting.
- `FilePathAutocomplete` does NOT support an `autoFocus` prop. Use a `useEffect` triggered by `isOpen` to focus the textarea element via ref or `document.querySelector`.
- The prompt textarea is currently disabled when no tools are selected (lines 971-976). After this change, keep it always enabled.
- The `selectedTools` state is `{ claude: boolean; codex: boolean }`. Dropdown mapping: "Claude Code" → `{ claude: true, codex: false }`, "Codex" → `{ claude: false, codex: true }`, "Both" → `{ claude: true, codex: true }`, "None" → `{ claude: false, codex: false }`.
- After replacing ThinkingPlaceholder, search codebase for other uses of the `bounce` keyframe before removing it from index.css.

## Implementation Blueprint

### Tasks (in implementation order)

```yaml
Task 1: Simplify ThinkingPlaceholder
MODIFY frontend/src/components/session/ThinkingPlaceholder.tsx:
  - REPLACE entire file contents with minimal implementations
  - ThinkingPlaceholder component:
    - useState for dots, useEffect cycling '' → '.' → '..' → '...' → '' every 500ms (4 states)
    - Render: centered div with "Thinking{dots}" text
    - Style: text-sm text-text-secondary, flex items-center justify-center py-8
    - No card, no container, no icons, no glow, no bouncing dots, no rotating messages
  - InlineWorkingIndicator component:
    - Same dots animation (4 states, 500ms interval)
    - Render: inline div with "Thinking{dots}" text
    - Style: text-xs text-text-secondary italic, flex items-center px-4 py-2
    - ADD subtle background: bg-surface-secondary/30 rounded (so it's visible among messages)
  - DELETE wackyStatusMessages array (all 41 messages)
  - DELETE thinkingMessages array (8 entries with icons)
  - DELETE all icon imports (Brain, Sparkles, Zap, Lightbulb, Code, Search, Wrench, FileText)
  - KEEP only: import { useState, useEffect } from 'react'
  - KEEP export names: ThinkingPlaceholder, InlineWorkingIndicator
  - After replacing, search codebase for 'bounce' keyframe usage. If ONLY used by
    old ThinkingPlaceholder, remove the @keyframes bounce from frontend/src/index.css.
    If used elsewhere, keep it.

Task 2: Update Default Preferences
MODIFY frontend/src/stores/sessionPreferencesStore.ts:
  - ADD to SessionCreationPreferences interface (after showAdvanced on line 26):
      showSessionOptions: boolean;
  - CHANGE defaultPreferences (lines 31-56):
      selectedTools: { claude: true, codex: false }  (was { claude: false, codex: false })
      claudeConfig.model: 'opus'  (was 'auto')
  - ADD to defaultPreferences:
      showSessionOptions: false
  - NOTE: Returning users keep their saved values. The merge logic at line 78
    spreads defaults first then saved values, so new fields get defaults and
    existing fields keep saved values. No migration needed.

Task 3: Restructure CreateSessionDialog - Prompt First + Session Name
MODIFY frontend/src/components/CreateSessionDialog.tsx:
  - NEW TOP-LEVEL LAYOUT (visible on dialog open, top to bottom):
    1. Prompt textarea (moved from lines 916-1006 to top of dialog body)
    2. Session Name field (kept from lines 815-887)
    3. "Session options" collapsible (new, collapsed by default) — see Task 4
    4. "More options" collapsible (existing advanced options, unchanged)
    5. Footer with Cancel + Create buttons
  - MOVE prompt section (lines 916-1006) to immediately after the modal header
  - REMOVE the "Initial Prompt" section header with FileText icon — render textarea directly
  - REMOVE the "Session Configuration" section header with Settings2 icon
  - KEEP Session Name field visible at top level (below prompt, above collapsibles)
    because users without an API key MUST enter a session name
  - KEEP: FilePathAutocomplete, paperclip button, paste support, attachment previews
  - KEEP: the relative wrapper div and absolute-positioned paperclip button
  - Auto-focus prompt textarea on dialog open:
    - Use useEffect triggered by isOpen
    - Focus via document.querySelector or a ref on the textarea
    - FilePathAutocomplete does NOT support autoFocus prop
  - REMOVE disabled state from prompt textarea — keep it always enabled regardless
    of tool selection. Update placeholder text when no tools selected to:
    "Describe your task... (use @ to reference files)"
    (same placeholder regardless of tool selection)

Task 4: CreateSessionDialog - Collapsible "Session options"
MODIFY frontend/src/components/CreateSessionDialog.tsx:
  - CREATE "Session options" collapsible section (collapsed by default for new users)
  - Toggle state: use preferences.showSessionOptions from sessionPreferencesStore
  - Toggle UI: button with ChevronRight (collapsed) / ChevronDown (expanded) icon
    + "Session options" text label
    - Follow the EXACT same pattern as existing "More options" toggle at lines 1244-1260
  - MOVE into this collapsible:
    1. AI Tool selection dropdown (see Task 5)
    2. Tool-specific config (model, ultrathink, permission for Claude; model, thinking
       level, sandbox for Codex) — shown conditionally based on selected tool
    3. Number of Sessions slider (from lines 889-913)
  - DELETE the "Tool Configuration" section header with Code2 icon (lines 1009-1013)
    since tool selection is now inside "Session options"
  - Save toggle state to preferences on change (same pattern as showAdvanced)

Task 5: CreateSessionDialog - Simplify Tool Selection
MODIFY frontend/src/components/CreateSessionDialog.tsx:
  - REPLACE the two checkbox cards (lines 1021-1086) with a compact Dropdown
  - Use <Dropdown> from '../ui/Dropdown'
  - Dropdown items:
    { id: 'claude', label: 'Claude Code', icon: Brain, onClick: → { claude: true, codex: false } }
    { id: 'codex', label: 'Codex', icon: Code2, onClick: → { claude: false, codex: true } }
    { id: 'both', label: 'Both', onClick: → { claude: true, codex: true } }
    { id: 'none', label: 'None', onClick: → { claude: false, codex: false } }
  - Derive selectedId from current selectedTools state:
    both true → 'both', only claude → 'claude', only codex → 'codex', neither → 'none'
  - Trigger button: show current tool's icon + label + ChevronDown
    (derive icon from selected tool: Brain for claude, Code2 for codex, etc.)
  - When tool changes, show/hide tool-specific config sections conditionally
    (same as current behavior, just triggered by dropdown instead of checkboxes)
  - When "None" selected: show brief note "Session will be created without an AI agent"
  - RESPECT saved preferences: selectedId derived from preferences.selectedTools

Task 6: Delete Dead Code in CreateSessionDialog
MODIFY frontend/src/components/CreateSessionDialog.tsx:
  - The hidden section at lines 1156-1241 has className="hidden" wrapping:
    - A duplicate prompt textarea (DEAD — delete this)
    - An <input ref={fileInputRef} type="file" .../> (ALIVE — used by paperclip button)
  - MOVE the <input ref={fileInputRef} type="file" .../> element OUTSIDE the hidden
    div, placing it near the prompt section (e.g., right after the prompt textarea area)
    Keep it hidden with className="hidden" or style display:none
  - DELETE the rest of the hidden section (the wrapper div, duplicate prompt textarea,
    duplicate attachment UI)
  - VERIFY: grep for any state/handlers ONLY used by the deleted section and remove those too

Task 7: Consolidate Sidebar Header Buttons
MODIFY frontend/src/components/Sidebar.tsx:
  - REPLACE the 3 icon buttons (Sort, Prompt History, Status Legend) at lines 143-160
  - NEW LAYOUT: [Clock button] [MoreHorizontal button]
  - KEEP Prompt History as visible button (has keyboard shortcut Cmd/Ctrl+P)
  - ADD overflow Dropdown for Sort and Status Legend:
    - Use <Dropdown> from '../ui/Dropdown'
    - Trigger: button with MoreHorizontal icon (size 14), same styling as existing buttons
    - Items:
      { id: 'sort', label: sortAscending ? 'Sort: Oldest first' : 'Sort: Newest first',
        icon: ArrowUpDown, onClick: onToggleSortOrder }
      { id: 'legend', label: 'Status legend', icon: Info, onClick: onOpenStatusGuide }
    - Position: 'auto' (lets Dropdown handle smart positioning)
    - Width: 'sm'
  - ADD imports: MoreHorizontal from lucide-react, Dropdown + DropdownItem from '../ui/Dropdown'
  - KEEP all existing prop callbacks unchanged
```

### Integration Points

```yaml
PREFERENCES (sessionPreferencesStore.ts):
  - ADD showSessionOptions: boolean to SessionCreationPreferences interface
  - ADD showSessionOptions: false to defaultPreferences
  - CHANGE selectedTools.claude default: true (was false)
  - CHANGE claudeConfig.model default: 'opus' (was 'auto')
  - Existing merge logic handles new fields automatically
  - Only affects new users — returning users keep saved preferences (intentional)

COMPONENT EXPORTS:
  - ThinkingPlaceholder and InlineWorkingIndicator keep same export names
  - RichOutputView imports unchanged — it just gets the simplified versions

DROPDOWN COMPONENT API (frontend/src/components/ui/Dropdown.tsx):
  - <Dropdown trigger={ReactNode} items={DropdownItem[]} selectedId? position? width? />
  - DropdownItem: { id: string, label: ReactNode, icon?: ComponentType, onClick?: () => void }
  - Use selectedId prop to highlight current selection (shows dot indicator)

FORM SUBMISSION:
  - No changes to handleSubmit or backend/IPC interfaces
  - selectedTools state structure unchanged: { claude: boolean, codex: boolean }
  - Same session creation parameters sent to backend
```

### Per-Task Pseudocode

#### Task 1: ThinkingPlaceholder (complete file replacement)

```tsx
import { useState, useEffect } from 'react';

export function ThinkingPlaceholder() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev === '...' ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center py-8">
      <span className="text-sm text-text-secondary">
        Thinking{dots}
      </span>
    </div>
  );
}

export function InlineWorkingIndicator() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev === '...' ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center px-4 py-2 bg-surface-secondary/30 rounded">
      <span className="text-xs text-text-secondary italic">
        Thinking{dots}
      </span>
    </div>
  );
}
```

#### Task 5: Tool selection dropdown

```tsx
import { Dropdown } from '../ui/Dropdown';
import type { DropdownItem } from '../ui/Dropdown';
import { Brain, Code2, ChevronDown } from 'lucide-react';

// Derive selection state
const toolSelectionId = selectedTools.claude && selectedTools.codex ? 'both'
  : selectedTools.claude ? 'claude'
  : selectedTools.codex ? 'codex'
  : 'none';

const toolLabels: Record<string, string> = {
  claude: 'Claude Code', codex: 'Codex', both: 'Both', none: 'None'
};

const toolIcons: Record<string, React.ComponentType<{ className?: string }> | null> = {
  claude: Brain, codex: Code2, both: null, none: null
};

const SelectedIcon = toolIcons[toolSelectionId];

const toolItems: DropdownItem[] = [
  { id: 'claude', label: 'Claude Code', icon: Brain,
    onClick: () => setSelectedTools({ claude: true, codex: false }) },
  { id: 'codex', label: 'Codex', icon: Code2,
    onClick: () => setSelectedTools({ claude: false, codex: true }) },
  { id: 'both', label: 'Both',
    onClick: () => setSelectedTools({ claude: true, codex: true }) },
  { id: 'none', label: 'None',
    onClick: () => setSelectedTools({ claude: false, codex: false }) },
];

// Render
<div className="flex items-center gap-2">
  <label className="text-sm text-text-secondary">AI Tool</label>
  <Dropdown
    trigger={
      <button className="flex items-center gap-2 px-3 py-1.5 text-sm
        border border-border-secondary rounded-md hover:bg-interactive/10
        text-text-primary">
        {SelectedIcon && <SelectedIcon className="w-4 h-4" />}
        {toolLabels[toolSelectionId]}
        <ChevronDown size={14} className="text-text-tertiary" />
      </button>
    }
    items={toolItems}
    selectedId={toolSelectionId}
    width="sm"
  />
</div>
```

#### Task 7: Sidebar overflow menu

```tsx
import { Dropdown } from '../ui/Dropdown';
import type { DropdownItem } from '../ui/Dropdown';
import { Clock, MoreHorizontal, ArrowUpDown, Info } from 'lucide-react';

// In the "Projects & Sessions" header area, replace 3 buttons with:
<div className="flex items-center gap-1">
  {/* Prompt History stays visible — has keyboard shortcut */}
  <button
    onClick={onOpenPromptHistory}
    className="p-1 rounded-md hover:bg-interactive/10 text-text-secondary hover:text-text-primary"
    title="View Prompt History (Cmd/Ctrl + P)"
  >
    <Clock size={14} />
  </button>

  {/* Overflow menu for Sort + Status Legend */}
  <Dropdown
    trigger={
      <button className="p-1 rounded-md hover:bg-interactive/10 text-text-secondary hover:text-text-primary">
        <MoreHorizontal size={14} />
      </button>
    }
    items={[
      {
        id: 'sort',
        label: sortAscending ? 'Sort: Oldest first' : 'Sort: Newest first',
        icon: ArrowUpDown,
        onClick: onToggleSortOrder
      },
      {
        id: 'legend',
        label: 'Status legend',
        icon: Info,
        onClick: onOpenStatusGuide
      }
    ]}
    position="auto"
    width="sm"
  />
</div>
```

## Validation Loop

```bash
# Run after each task
pnpm typecheck          # TypeScript compilation
pnpm lint               # ESLint
# Expected: No errors. If errors, READ the error and fix.
```

## Final Validation Checklist

- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`
- [ ] CreateSessionDialog opens with prompt textarea focused
- [ ] Session name visible below prompt (not behind collapsible)
- [ ] Clicking "Session options" reveals tool dropdown, tool config, session count
- [ ] Clicking "More options" reveals branch, commit mode (unchanged behavior)
- [ ] Default tool is Claude Code with opus model (for new users)
- [ ] Returning users see their previously saved tool/model preferences
- [ ] Prompt textarea enabled even when "None" tool selected
- [ ] ThinkingPlaceholder shows simple "Thinking..." with animated dots (no spinning rings)
- [ ] InlineWorkingIndicator shows "Thinking..." with subtle background for visibility
- [ ] Sidebar has Prompt History button + overflow menu with Sort and Status Legend
- [ ] Paperclip attachment button still works (fileInputRef preserved)
- [ ] Hidden backwards-compat prompt wrapper deleted, file input preserved
- [ ] Form submission sends same data to backend as before

## Anti-Patterns to Avoid

- Don't break the form submission flow — same data must be sent to backend
- Don't change backend/IPC interfaces — this is frontend-only
- Don't use DropdownMenu/DropdownMenuTrigger — those don't exist. Use `<Dropdown>` from `../ui/Dropdown`
- Don't delete the fileInputRef <input> when removing the hidden section — move it first
- Don't nest collapsible sections (Session options should not contain sub-collapsibles)
- Don't disable prompt textarea based on tool selection anymore

## Code to Remove

- `wackyStatusMessages` array (41 messages) in ThinkingPlaceholder.tsx
- `thinkingMessages` array (8 entries with icons) in ThinkingPlaceholder.tsx
- All icon imports from ThinkingPlaceholder.tsx (Brain, Sparkles, Zap, Lightbulb, Code, Search, Wrench, FileText)
- Hidden backwards-compat prompt wrapper in CreateSessionDialog.tsx (lines 1156-1241 outer div + duplicate prompt textarea) — keep fileInputRef input
- "Tool Configuration" section header with Code2 icon (lines 1009-1013) in CreateSessionDialog.tsx
- "Initial Prompt" section header with FileText icon in CreateSessionDialog.tsx
- "Session Configuration" section header with Settings2 icon in CreateSessionDialog.tsx
- The `bounce` CSS keyframe in `frontend/src/index.css` (lines 107-116) — only if no other component uses it after ThinkingPlaceholder is simplified. Search for 'bounce' in the codebase first.

## Confidence Score: 9/10

High confidence because:
- All changes are frontend-only (no backend/IPC changes)
- Component boundaries are clear and export names unchanged
- Correct Dropdown API documented with exact usage pattern from actual codebase
- Preference store merge logic handles new fields automatically
- Dead code identified with fileInputRef dependency correctly handled
- Pseudocode covers all non-trivial tasks with correct component APIs
- Form submission data structure preserved

Risk areas:
- CreateSessionDialog is 1,372 lines — restructuring layout requires careful section identification
- FilePathAutocomplete auto-focus needs useEffect approach since it doesn't support autoFocus prop
