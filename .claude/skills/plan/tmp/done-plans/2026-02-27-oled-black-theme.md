## Goal

Add an "OLED Black" theme as a third theme option to Pane. Replace the current theme toggle with a dropdown selector. The OLED theme uses pure `#000000` backgrounds with very dark grays for secondary surfaces to maintain depth.

## Why

- OLED displays save battery when showing true black pixels
- A high-contrast pure black theme looks more striking and modern
- Expanding from 2 to 3 themes requires a better selection UI (dropdown vs toggle)

## What

Users can select from three themes: **Light**, **Dark**, and **OLED Black**. The current toggle button is replaced by a dropdown in both Settings and HomePage. The OLED theme inherits the dark theme's color palette but pushes backgrounds to pure `#000000` and uses slightly more visible borders for element separation.

### Success Criteria

- [ ] Three themes selectable: Light, Dark, OLED Black
- [ ] Settings and HomePage show a dropdown instead of a toggle button
- [ ] OLED theme has `#000000` as primary background
- [ ] Theme persists across restarts (localStorage + config file)
- [ ] Terminal, Monaco editor, markdown, and all UI components render correctly in OLED theme
- [ ] No flash of wrong theme on startup (index.html handles `oled` class)
- [ ] `pnpm typecheck` and `pnpm lint` pass

## All Needed Context

### Documentation & References

```yaml
- file: frontend/src/styles/tokens/colors.css
  why: Contains all 100+ semantic color tokens for dark (:root) and light (:root.light). The OLED theme block goes here as :root.oled.

- file: frontend/src/contexts/ThemeContext.tsx
  why: Core theme state management. Must extend Theme type, replace toggleTheme with setTheme, handle 3 themes in class switching.

- file: frontend/src/types/config.ts (frontend)
  why: AppConfig.theme type needs 'oled' added

- file: main/src/types/config.ts (backend)
  why: Both AppConfig (line 26) and UpdateConfigRequest (line 104) need 'oled' added

- file: frontend/index.html
  why: Pre-React theme class application to prevent flash. Must handle 'oled' theme.

- file: frontend/src/index.css
  why: Contains .light .xterm filter, :root.dark Monaco overrides, body.light styling. OLED needs equivalent rules.

- file: frontend/src/styles/monaco-overrides.css
  why: Has :root.dark and :root:not(.dark) blocks for Monaco editor theming. OLED theme needs its own overrides.

- file: frontend/src/styles/markdown.css
  why: Uses .dark class for dark-mode markdown styles. OLED should inherit these.

- file: frontend/src/components/Settings.tsx
  why: Theme toggle UI (lines 314-338) needs replacement with dropdown

- file: frontend/src/components/HomePage.tsx
  why: Theme toggle UI (lines 86-96) needs replacement with dropdown

- file: frontend/src/hooks/usePaneLogo.ts
  why: Returns logo based on theme. OLED should use the dark logo.

- file: frontend/src/utils/terminalTheme.ts
  why: Checks document.documentElement.classList for 'light'/'dark'. Must handle 'oled' class.

- file: frontend/src/components/panels/diff/DiffViewer.tsx
  why: Line 340: isDarkMode = theme === 'dark'. Must also be true for 'oled'.

- file: frontend/src/components/panels/editor/FileEditor.tsx
  why: Line 593: isDarkMode = theme === 'dark'. Must also be true for 'oled'.

- file: frontend/src/components/panels/logPanel/LogsView.tsx
  why: Line 35: isLight = theme === 'light'. This is fine as-is (oled is not light), but the ANSI colors should use dark colors for oled.

- file: frontend/src/components/MermaidRenderer.tsx
  why: Line 29: checks classList.contains('dark') for Mermaid theme. OLED needs to also use dark Mermaid theme.
```

### Known Gotchas & Critical Design Decisions

1. **CSS class strategy**: The OLED theme will add class `oled` to both `<html>` and `<body>`. This means:
   - `:root.oled { ... }` for CSS variable overrides (same as `:root.light` pattern)
   - `.dark` class is NOT applied when OLED is active — OLED is its own distinct class
   - All places checking `.dark` class must also check `.oled` class

2. **Markdown CSS uses `.dark` selector**: The `markdown.css` file uses `.dark .markdown-preview` selectors extensively. The simplest approach: make `.oled` inherit `.dark` markdown styles by duplicating the selectors as `.dark .markdown-preview, .oled .markdown-preview`.

3. **Monaco overrides use `:root.dark`**: Both `index.css` and `monaco-overrides.css` use `:root.dark` selectors. Must add `:root.oled` alongside these.

4. **Terminal theme detection**: `terminalTheme.ts` checks `classList.contains('light')` and `classList.contains('dark')`. Must add `classList.contains('oled')` checks and treat it like dark for fallbacks.

5. **Component `isDarkMode` checks**: Several components use `theme === 'dark'` to determine dark mode. These must become `theme === 'dark' || theme === 'oled'` or use a helper.

6. **MermaidRenderer checks classList**: Uses `document.documentElement.classList.contains('dark')` — must also check for 'oled'.

7. **index.html flash prevention**: The inline script must handle 'oled' as a valid saved theme value.

## Implementation Blueprint

### Data Model Changes

```typescript
// ThemeContext.tsx - line 5
type Theme = 'light' | 'dark' | 'oled';

// frontend/src/types/config.ts - line 15
theme?: 'light' | 'dark' | 'oled';

// main/src/types/config.ts - line 26 and line 104
theme?: 'light' | 'dark' | 'oled';
```

### Theme Context API Change

```typescript
// Replace toggleTheme with setTheme in the context
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}
```

### Tasks (in implementation order)

```yaml
Task 1: Add OLED color tokens (ONLY overrides — inherits everything else from dark)
MODIFY frontend/src/styles/tokens/colors.css:
  - ADD :root.oled block after :root.light (after line 332)
  - ONLY override tokens that differ from dark theme (backgrounds, surfaces, borders, component bg)
  - All text, interactive, status, and accent colors inherit from the :root dark defaults
  - See pseudocode below for the minimal token set

Task 2: Update ThemeContext type and API
MODIFY frontend/src/contexts/ThemeContext.tsx:
  - Change type Theme = 'light' | 'dark' to 'light' | 'dark' | 'oled'
  - Change ThemeContextType: replace toggleTheme with setTheme: (theme: Theme) => void
  - Update useState initializer to accept 'oled' as valid localStorage value
  - Update config sync useEffect to accept 'oled'
  - Update class switching useEffect to handle 3 themes:
    Remove all theme classes first (root.classList.remove('light', 'dark', 'oled'))
    Then add the current theme class
    Same for body
  - Replace toggleTheme function with setTheme that directly sets the theme
  - Update Provider value: { theme, setTheme }

Task 3: Update config types
MODIFY frontend/src/types/config.ts:
  - Line 15: change to theme?: 'light' | 'dark' | 'oled';
MODIFY main/src/types/config.ts:
  - Line 26: change to theme?: 'light' | 'dark' | 'oled';
  - Line 104: change to theme?: 'light' | 'dark' | 'oled';

Task 4: Update index.html flash prevention
MODIFY frontend/index.html:
  - Update inline script (line 13): accept 'oled' as valid theme
    const theme = (savedTheme === 'light' || savedTheme === 'oled') ? savedTheme : 'dark';
  - Update body script (line 20): same logic
    const t = localStorage.getItem('theme');
    document.body.classList.add(t === 'light' ? 'light' : t === 'oled' ? 'oled' : 'dark');

Task 5: Update CSS files for OLED class
MODIFY frontend/src/index.css:
  - Line 38: add body.oled alongside body.light (or simplify since body already gets bg-bg-primary)
  - Line 159: add .oled .xterm rule — OLED does NOT need the invert filter (it's a dark theme)
  - Lines 393-401: add :root.oled alongside :root.dark for Monaco variables
    Change `:root.dark {` to `:root.dark, :root.oled {`
  - Lines 405-414: :root:not(.dark) is for light theme. Change to :root.light (more explicit) so it doesn't accidentally match .oled

MODIFY frontend/src/styles/monaco-overrides.css:
  - Line 4: change `:root.dark {` to `:root.dark, :root.oled {`
  - Line 16: change `:root:not(.dark) {` to `:root.light {`

MODIFY frontend/src/styles/markdown.css:
  - Find-replace ALL `.dark .markdown-preview` with `.dark .markdown-preview, .oled .markdown-preview` throughout the file
  - This covers all dark-mode markdown selectors (pre, code, th, td, tr, hr, strong, scrollbar)

Task 6: Update Settings.tsx theme dropdown
MODIFY frontend/src/components/Settings.tsx:
  - Line 30: import { useTheme } from '../contexts/ThemeContext';  (no change needed)
  - Line 86: change destructure from { theme, toggleTheme } to { theme, setTheme }
  - Lines 314-338: replace the entire SettingsSection content with a <select> dropdown:
    - Three options: Light, Dark, OLED Black
    - Use existing styling patterns (bg-surface-secondary, border-border-secondary, etc.)
    - Icon in SettingsSection: use Monitor icon (or keep Palette from the parent)
    - Description: "Choose your preferred theme"
  - Import Monitor from lucide-react (for OLED option icon, if desired — optional)

Task 7: Update HomePage.tsx theme dropdown
MODIFY frontend/src/components/HomePage.tsx:
  - Line 22: change destructure from { theme, toggleTheme } to { theme, setTheme }
  - Lines 86-96: replace the theme toggle with a <select> dropdown
    - Same three options: Light, Dark, OLED Black
    - Keep the compact style that fits the preferences panel

Task 8: Update component theme checks
MODIFY frontend/src/hooks/usePaneLogo.ts:
  - Line 7: change to `return theme === 'light' ? paneLogoLight : paneLogoDark;`
  - This already works correctly — 'oled' is not 'light', so it returns dark logo. No change needed.

MODIFY frontend/src/components/panels/diff/DiffViewer.tsx:
  - Line 340: change `theme === 'dark'` to `theme !== 'light'`

MODIFY frontend/src/components/panels/editor/FileEditor.tsx:
  - Line 593: change `theme === 'dark'` to `theme !== 'light'`

MODIFY frontend/src/components/panels/logPanel/LogsView.tsx:
  - Line 35: `const isLight = theme === 'light';` — this already works (oled is not light). No change needed.

MODIFY frontend/src/components/MermaidRenderer.tsx:
  - Line 29: change `classList.contains('dark')` to `classList.contains('dark') || classList.contains('oled')`

MODIFY frontend/src/utils/terminalTheme.ts:
  - Lines 31-32: add `const isOled = document.documentElement.classList.contains('oled');`
  - Update fallback logic: treat oled same as dark (`if (isDark || isOled)`)
  - Lines 85-86: same change
  - Lines 99-100: same change
  - Line 93: update ternary to handle oled alongside dark
```

### Per-Task Pseudocode

#### Task 1: OLED Color Tokens — ONLY overrides (colors.css)

The OLED theme inherits ALL tokens from the `:root` dark defaults. Only override the tokens that actually change (backgrounds, surfaces, borders, component backgrounds, scrollbar, terminal bg).

```css
/* OLED Black Theme - True black for OLED displays */
:root.oled {
  /* Backgrounds - pure black */
  --color-bg-primary: rgb(0 0 0);
  --color-bg-secondary: rgb(10 10 10);
  --color-bg-tertiary: rgb(20 20 20);
  --color-bg-hover: rgb(25 25 25);
  --color-bg-active: rgb(35 35 35);

  /* Surfaces - near-black with subtle depth */
  --color-surface-primary: rgb(8 8 8);
  --color-surface-secondary: rgb(15 15 15);
  --color-surface-hover: rgba(255, 255, 255, 0.06);

  /* Borders - slightly brighter for separation on pure black */
  --color-border-primary: rgba(255, 255, 255, 0.10);
  --color-border-secondary: rgba(255, 255, 255, 0.07);
  --color-border-hover: rgba(255, 255, 255, 0.15);

  /* Interactive surfaces */
  --color-surface-interactive: rgb(15 15 15);
  --color-surface-interactive-hover: rgb(25 25 25);

  /* Interactive borders - slightly brighter */
  --color-border-interactive: rgba(255, 255, 255, 0.12);

  /* Buttons - secondary/ghost need darker backgrounds */
  --color-button-secondary-bg: rgb(25 25 25);
  --color-button-secondary-hover: rgb(35 35 35);
  --color-button-ghost-hover: rgb(15 15 15);

  /* Cards */
  --color-card-bg: rgb(8 8 8);
  --color-card-nested-bg: rgb(15 15 15);

  /* Forms */
  --color-input-bg: rgb(0 0 0);

  /* Modal */
  --color-modal-overlay: rgba(0, 0, 0, 0.75);
  --color-modal-bg: rgb(8 8 8);

  /* Navigation */
  --color-surface-navigation: rgb(0 0 0);
  --color-surface-navigation-hover: rgb(15 15 15);
  --color-surface-navigation-active: rgb(25 25 25);

  /* Scrollbar */
  --color-scrollbar-track: rgb(0 0 0);
  --color-scrollbar-thumb: rgb(40 40 40);
  --color-scrollbar-thumb-hover: rgb(55 55 55);

  /* Terminal - only bg and black need to change */
  --color-terminal-bg: rgb(0 0 0);
  --color-terminal-black: rgb(0 0 0);
}
```

#### Task 2: ThemeContext (pseudocode)

```typescript
type Theme = 'light' | 'dark' | 'oled';

const VALID_THEMES: Theme[] = ['light', 'dark', 'oled'];
const isValidTheme = (t: string): t is Theme => VALID_THEMES.includes(t as Theme);

// In useState initializer:
const saved = localStorage.getItem('theme');
if (saved && isValidTheme(saved)) return saved;
return 'dark';

// In config sync:
if (config?.theme && isValidTheme(config.theme)) { ... }

// In class effect:
root.classList.remove('light', 'dark', 'oled');
root.classList.add(theme);
body.classList.remove('light', 'dark', 'oled');
body.classList.add(theme);

// Context value:
{ theme, setTheme: (t: Theme) => setTheme(t) }
```

#### Task 6: Settings dropdown (pseudocode)

```tsx
const { theme, setTheme } = useTheme();

// In the SettingsSection for theme:
<SettingsSection
  title="Theme"
  description="Choose your preferred theme"
  icon={<Palette className="w-4 h-4" />}
>
  <select
    value={theme}
    onChange={(e) => {
      const v = e.target.value;
      if (v === 'light' || v === 'dark' || v === 'oled') setTheme(v);
    }}
    className="w-full px-4 py-3 bg-surface-secondary hover:bg-surface-hover rounded-lg
               transition-colors border border-border-secondary text-text-primary
               focus:outline-none focus:ring-2 focus:ring-interactive cursor-pointer"
  >
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="oled">OLED Black</option>
  </select>
</SettingsSection>
```

#### Task 7: HomePage dropdown (pseudocode)

```tsx
const { theme, setTheme } = useTheme();

<div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
  <span className="text-text-primary">Theme</span>
  <select
    value={theme}
    onChange={(e) => {
      const v = e.target.value;
      if (v === 'light' || v === 'dark' || v === 'oled') setTheme(v);
    }}
    className="px-3 py-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover
               text-sm text-text-primary border border-border-secondary
               focus:outline-none focus:ring-2 focus:ring-interactive cursor-pointer"
  >
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="oled">OLED Black</option>
  </select>
</div>
```

## Validation Loop

```bash
# Run after implementation
pnpm typecheck        # TypeScript compilation
pnpm lint             # ESLint
# Expected: No errors.
```

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] All three themes render correctly in the UI
- [ ] Theme selection persists across restarts
- [ ] No flash of wrong theme on app load
- [ ] Terminal renders correctly in OLED mode
- [ ] Monaco editor uses dark theme in OLED mode
- [ ] Markdown preview uses dark styles in OLED mode
- [ ] Mermaid diagrams use dark theme in OLED mode

## Anti-Patterns to Avoid

- Don't duplicate entire component code for theme handling — use `theme !== 'light'` instead of listing all dark-like themes
- Don't forget to update BOTH `main/src/types/config.ts` AND `frontend/src/types/config.ts`
- Don't leave `:root:not(.dark)` selectors — they would incorrectly match `.oled`. Change to explicit `:root.light`
- Don't import unused icons from lucide-react (remove Moon/Sun imports if no longer used in Settings/HomePage)

## Deprecated Code to Remove

- `toggleTheme` function in ThemeContext.tsx — replaced by `setTheme`
- Binary theme toggle button in Settings.tsx (lines 319-337) — replaced by dropdown
- Binary theme toggle button in HomePage.tsx (lines 89-95) — replaced by dropdown
- `Moon` and `Sun` icon imports from Settings.tsx and HomePage.tsx if no longer used by any other element in those files (check before removing)
