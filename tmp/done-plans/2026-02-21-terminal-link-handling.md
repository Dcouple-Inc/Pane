# Terminal Link Handling & Selection Popover

## Goal

Add VS Code-style clickable links and selection popover to xterm.js terminals. Users can Ctrl+Click (Cmd+Click on Mac) links to open them, with hover tooltips showing the destination. File paths show a popover with "Open in Editor" or "Open in System Explorer" options. Selected text shows a popover with Copy and Open URL actions.

## Why

- Terminal output contains URLs, file paths, git SHAs, and issue references that users want to interact with
- Currently no way to click links or easily copy selected text
- Improves developer workflow by enabling quick navigation from terminal to browser/editor
- Brings foozol terminals closer to VS Code's terminal UX

## What

### Link Types Supported

| Type | Pattern Examples | Action |
|------|------------------|--------|
| HTTP(S) URL | `https://github.com`, `http://example.com` | Open in browser (via WebLinksAddon) |
| File path | `/src/foo.ts`, `C:\src\foo.ts`, `./foo.ts` | Show popover: Editor / Explorer |
| File:line | `src/foo.ts:42`, `foo.ts:42:10` | Show popover, open at line |
| Git SHA | `a1b2c3d4` (7-40 hex chars) | Open on GitHub (if GH remote) |
| Issue/PR ref | `#123`, `org/repo#123` | Open on GitHub (if GH remote) |

### UI Components

1. **Hover Tooltip** - Shows link destination + "Ctrl+Click to open" hint (viewport-aware positioning)
2. **TerminalPopover** - Reusable positioned popover for actions
3. **Selection Popover** - Copy + Open URL (if URL detected), positioned at mouse when selection ends

### Success Criteria

- [ ] URLs are clickable with Ctrl+Click and open in browser
- [ ] File paths show popover with Editor/Explorer options
- [ ] Hover tooltip appears on link hover with destination
- [ ] Text selection shows popover with Copy action
- [ ] Git SHA and issue links work when GitHub remote configured
- [ ] Silent fail + console log when file doesn't exist

## All Needed Context

### Documentation & References

```yaml
- url: https://xtermjs.org/docs/guides/link-handling/
  why: Official link handling guide, shows registerLinkProvider API

- url: https://www.npmjs.com/package/@xterm/addon-web-links
  why: WebLinksAddon documentation for automatic URL detection

- file: frontend/src/components/panels/TerminalPanel.tsx
  why: Current terminal setup, addon loading pattern, ref structure

- file: frontend/src/components/ui/Tooltip.tsx
  why: Existing tooltip pattern with portal rendering and smart positioning

- file: frontend/src/components/ui/Dropdown.tsx
  why: Click-outside detection and smart positioning patterns

- file: main/src/ipc/app.ts
  why: Contains openExternal handler, need to add showItemInFolder

- file: main/src/ipc/file.ts
  why: ALREADY has file:exists handler (lines 120-152), reuse it
```

### Current Codebase Tree

```
frontend/src/components/
├── panels/
│   └── TerminalPanel.tsx        # Main terminal component
├── ui/
│   ├── Tooltip.tsx              # Existing hover tooltip
│   └── Dropdown.tsx             # Click-outside patterns
```

### Desired Codebase Tree

```
frontend/src/components/
├── panels/
│   └── TerminalPanel.tsx        # Updated with link providers
├── terminal/                    # New folder for terminal-related components
│   ├── TerminalLinkTooltip.tsx  # Hover tooltip for links
│   ├── TerminalPopover.tsx      # Reusable action popover
│   ├── SelectionPopover.tsx     # Selection-specific popover
│   ├── linkProviders/
│   │   ├── types.ts             # Shared types for link providers
│   │   ├── fileLinkProvider.ts  # File path detection (URLs handled by WebLinksAddon)
│   │   ├── gitLinkProvider.ts   # SHA + issue detection
│   │   └── index.ts             # Export all providers
│   └── hooks/
│       └── useTerminalLinks.ts  # Hook to wire up link handling
├── ui/
│   ├── Tooltip.tsx
│   └── Dropdown.tsx
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: WebLinksAddon handles URLs - don't duplicate in custom providers
// WebLinksAddon is ALREADY installed in frontend/package.json

// CRITICAL: WebLinksAddon click handler receives MouseEvent
// Check for modifier key (Ctrl/Cmd) before opening
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
if (isMac ? event.metaKey : event.ctrlKey) {
  // Open link
}

// CRITICAL: registerLinkProvider callback is called per-line
// Must be fast - avoid async operations in provideLinks
// File existence check happens AFTER click, not during link detection
terminal.registerLinkProvider({
  provideLinks: (lineNumber, callback) => {
    // Synchronous regex matching only
    callback(links);
  }
});

// CRITICAL: ILink.activate receives MouseEvent, use for click handling
// ILink.hover/leave are optional for tooltip show/hide

// xterm.js selection API:
terminal.hasSelection()      // Check if text selected
terminal.getSelection()      // Get selected text
terminal.onSelectionChange() // Listen for selection changes

// CRITICAL: Existing file:exists handler expects object format:
// window.electronAPI.invoke('file:exists', { sessionId, filePath })
// NOT separate parameters

// CRITICAL: Git remote can be SSH or HTTPS format:
// SSH: git@github.com:org/repo.git
// HTTPS: https://github.com/org/repo.git
// Both need to be parsed to extract org/repo
```

## Design Decisions

1. **Git SHA regex** - Keep simple `/\b([0-9a-f]{7,40})\b/gi` and accept some false positives (hex strings). Users will learn to ignore non-SHAs.

2. **Selection popover positioning** - Position at mouse location when selection ends (top-right of cursor). This feels natural as it's where the user's attention is.

3. **URL handling separation** - WebLinksAddon handles all HTTP(S) URLs. Custom providers handle file paths, git SHAs, and issue refs only. No overlap.

4. **Windows paths with spaces** - Require quotes around paths containing spaces to avoid false positives. Match `"C:\foo bar\file.txt"` but not `C:\foo bar.txt`.

5. **Directory structure** - Use `frontend/src/components/terminal/` for future extensibility (more terminal features later).

## Implementation Blueprint

### Data Models and Structure

```typescript
// frontend/src/components/terminal/linkProviders/types.ts

import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';

export interface LinkMatch {
  text: string;
  startIndex: number;
  endIndex: number;
  type: 'file' | 'git-sha' | 'issue';
  // For file links
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  // For git links
  sha?: string;
  issueNumber?: number;
  repo?: string; // org/repo format
}

export interface LinkProviderConfig {
  terminal: Terminal;
  workingDirectory: string;
  githubRemoteUrl?: string; // e.g., "https://github.com/org/repo"
  onShowTooltip: (event: MouseEvent, text: string, hint: string) => void;
  onHideTooltip: () => void;
  onShowFilePopover: (event: MouseEvent, filePath: string, line?: number) => void;
  onOpenUrl: (url: string) => void;
}

export type CreateLinkProvider = (config: LinkProviderConfig) => ILinkProvider;
```

### Tasks (in implementation order)

```yaml
Task 1:
VERIFY @xterm/addon-web-links is installed:
  - CHECK frontend/package.json for @xterm/addon-web-links
  - If missing: cd frontend && pnpm add @xterm/addon-web-links
  - Already in lock file, likely already installed

Task 2:
CREATE frontend/src/components/terminal/linkProviders/types.ts:
  - Define LinkMatch, LinkProviderConfig interfaces
  - Export CreateLinkProvider type
  - Note: No 'url' type since WebLinksAddon handles URLs

Task 3:
CREATE frontend/src/components/terminal/TerminalLinkTooltip.tsx:
  - Portal-based tooltip positioned near mouse cursor
  - SMART POSITIONING: Check viewport boundaries like existing Tooltip.tsx
  - Shows link text + "Ctrl+Click to open" (or Cmd+Click on Mac)
  - Uses app theming (bg-surface-tertiary, high contrast)
  - Props: visible, x, y, linkText, hint

Task 4:
CREATE frontend/src/components/terminal/TerminalPopover.tsx:
  - Generic reusable popover component
  - Portal rendering to document.body
  - Click-outside detection using mousedown with ref check (follow Dropdown.tsx pattern)
  - Escape key handling
  - Props: visible, x, y, onClose, children
  - Smart viewport positioning to keep on screen

Task 5:
CREATE frontend/src/components/terminal/linkProviders/fileLinkProvider.ts:
  - Regex patterns for:
    - Unix paths: /(?:^|[\s"'`])([.~]?\/[\w\-.\/]+(?::\d+(?::\d+)?)?)/g
    - Windows paths WITH quotes: /"([A-Za-z]:\\[^"]+)"/g (require quotes for spaces)
    - Windows paths NO spaces: /([A-Za-z]:\\[\w\-.\\/]+(?::\d+(?::\d+)?)?)/g
    - Relative with line: /(?:^|[\s"'`])([\w\-./]+\.[a-z]+:\d+(?::\d+)?)/g
  - Parse line:column from path
  - RESOLVE relative paths against workingDirectory
  - On hover: show tooltip with full resolved path
  - On Ctrl+Click: show file popover (validate existence AFTER click)

Task 6:
CREATE frontend/src/components/terminal/linkProviders/gitLinkProvider.ts:
  - Git SHA regex: /\b([0-9a-f]{7,40})\b/gi (accept some false positives)
  - Issue regex: /(?:^|[\s(])#(\d+)\b/g and /([a-z0-9_-]+\/[a-z0-9_-]+)#(\d+)/gi
  - Only active when githubRemoteUrl is provided
  - On Ctrl+Click: construct GitHub URL and call onOpenUrl
  - SHA: ${githubRemoteUrl}/commit/${sha}
  - Issue: ${githubRemoteUrl}/issues/${number}

Task 7:
CREATE frontend/src/components/terminal/linkProviders/index.ts:
  - Export fileLinkProvider and gitLinkProvider
  - Export registerAllLinkProviders helper function
  - NOTE: No URL provider - WebLinksAddon handles URLs

Task 8:
CREATE frontend/src/components/terminal/SelectionPopover.tsx:
  - Positioned at MOUSE LOCATION when selection ends
  - Actions: Copy (always), Open URL (if selection matches URL regex)
  - URL detection: same regex as WebLinksAddon /https?:\/\/[^\s<>"{}|\\^`\[\]]+/
  - Uses TerminalPopover as base
  - Track mouse position via mousemove/mouseup events

Task 9:
CREATE frontend/src/components/terminal/hooks/useTerminalLinks.ts:
  - Custom hook that manages all link-related state
  - Tooltip state: { visible, x, y, text, hint }
  - File popover state: { visible, x, y, path, line, absolutePath }
  - Selection popover state: { visible, x, y, text }
  - Track mouse position for selection popover positioning
  - Returns: renderOverlays function, ref for mouse tracking
  - File existence check via IPC: window.electronAPI.invoke('file:exists', { sessionId, filePath })
  - Properly dispose providers on cleanup and re-register when githubRemoteUrl changes

Task 10:
ADD IPC handler for showItemInFolder:
  - MODIFY main/src/ipc/app.ts
  - Add 'showItemInFolder' handler using shell.showItemInFolder
  - VALIDATE path exists before calling (security)
  - MODIFY main/src/preload.ts: add to electronAPI.shell namespace

Task 11:
ADD GitHub remote detection:
  - MODIFY main/src/ipc/git.ts
  - Add 'git:get-github-remote' handler
  - Run: git remote -v in session worktree
  - Parse BOTH formats:
    - SSH: git@github.com:org/repo.git -> https://github.com/org/repo
    - HTTPS: https://github.com/org/repo.git -> https://github.com/org/repo
  - Returns { success: true, data: string | null }

Task 12:
UPDATE frontend/src/components/panels/TerminalPanel.tsx:
  - Import useTerminalLinks hook
  - Import WebLinksAddon from '@xterm/addon-web-links'
  - Load WebLinksAddon AFTER terminal.open() in same async block as WebGL
  - Configure WebLinksAddon with custom click handler (check Ctrl/Cmd key)
  - Register custom link providers (file, git) after WebLinksAddon
  - Call useTerminalLinks hook with workingDirectory and sessionId
  - Render overlay components from hook
  - Add mouse tracking div wrapper for selection positioning
```

### Per-Task Pseudocode

**Task 3: TerminalLinkTooltip (with smart positioning)**
```typescript
export const TerminalLinkTooltip: React.FC<{
  visible: boolean;
  x: number;
  y: number;
  linkText: string;
  hint: string;
}> = ({ visible, x, y, linkText, hint }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Position above cursor by default, flip if near top
    let top = y - rect.height - 8;
    if (top < 10) top = y + 20; // Flip below

    // Keep horizontally on screen
    let left = x;
    if (left + rect.width > viewportWidth - 10) {
      left = viewportWidth - rect.width - 10;
    }
    if (left < 10) left = 10;

    setPosition({ top, left });
  }, [visible, x, y]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[10000] px-3 py-2 bg-surface-tertiary border border-border-primary rounded-lg shadow-lg text-sm"
      style={{ left: position.left, top: position.top }}
    >
      <div className="text-text-primary truncate max-w-xs">{linkText}</div>
      <div className="text-text-tertiary text-xs">{hint}</div>
    </div>,
    document.body
  );
};
```

**Task 4: TerminalPopover (following Dropdown pattern)**
```typescript
export const TerminalPopover: React.FC<{
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ visible, x, y, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Smart positioning
  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = y;
    let left = x;

    // Flip up if near bottom
    if (top + rect.height > viewportHeight - 10) {
      top = y - rect.height;
    }
    // Keep on screen horizontally
    if (left + rect.width > viewportWidth - 10) {
      left = viewportWidth - rect.width - 10;
    }

    setPosition({ top, left });
  }, [visible, x, y]);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Add listeners after a tick to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[10001] bg-surface-primary border border-border-primary rounded-lg shadow-dropdown-elevated py-1 min-w-[180px]"
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </div>,
    document.body
  );
};
```

**Task 5: File Link Provider (with path resolution)**
```typescript
export function createFileLinkProvider(config: LinkProviderConfig): ILinkProvider {
  // Multiple patterns for different file path formats
  const UNIX_PATH = /(?:^|[\s"'`])([.~]?\/[\w\-.\/]+(?::\d+(?::\d+)?)?)/g;
  const WIN_QUOTED = /"([A-Za-z]:\\[^"]+)"/g;
  const WIN_SIMPLE = /([A-Za-z]:\\[\w\-.\\/]+(?::\d+(?::\d+)?)?)/g;
  const RELATIVE_WITH_LINE = /(?:^|[\s"'`])([\w\-./]+\.[a-z]+:\d+(?::\d+)?)/g;

  function parseFilePath(match: string): { path: string; line?: number; col?: number } {
    const lineMatch = match.match(/:(\d+)(?::(\d+))?$/);
    if (lineMatch) {
      return {
        path: match.slice(0, match.indexOf(':' + lineMatch[1])),
        line: parseInt(lineMatch[1], 10),
        col: lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
      };
    }
    return { path: match };
  }

  function resolvePath(filePath: string): string {
    if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) {
      return filePath; // Absolute path
    }
    // Resolve relative to working directory
    return `${config.workingDirectory}/${filePath}`.replace(/\/+/g, '/');
  }

  return {
    provideLinks(lineNumber: number, callback: (links: ILink[] | undefined) => void) {
      const line = config.terminal.buffer.active.getLine(lineNumber);
      if (!line) { callback(undefined); return; }

      const text = line.translateToString();
      const links: ILink[] = [];

      // Apply all patterns and collect matches
      const patterns = [UNIX_PATH, WIN_QUOTED, WIN_SIMPLE, RELATIVE_WITH_LINE];
      for (const regex of patterns) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const rawPath = match[1] || match[0];
          const { path, line: fileLine, col } = parseFilePath(rawPath);
          const resolvedPath = resolvePath(path);

          links.push({
            range: {
              start: { x: match.index + 1, y: lineNumber + 1 },
              end: { x: match.index + match[0].length + 1, y: lineNumber + 1 }
            },
            text: rawPath,
            activate: (event: MouseEvent) => {
              const isMac = navigator.platform.toUpperCase().includes('MAC');
              if (isMac ? event.metaKey : event.ctrlKey) {
                config.onShowFilePopover(event, resolvedPath, fileLine);
              }
            },
            hover: (event: MouseEvent) => {
              const isMac = navigator.platform.toUpperCase().includes('MAC');
              config.onShowTooltip(event, resolvedPath, `${isMac ? 'Cmd' : 'Ctrl'}+Click to open`);
            },
            leave: () => config.onHideTooltip()
          });
        }
      }

      callback(links.length > 0 ? links : undefined);
    }
  };
}
```

**Task 9: useTerminalLinks hook (with mouse tracking)**
```typescript
export function useTerminalLinks(terminal: Terminal | null, config: {
  workingDirectory: string;
  sessionId: string;
}) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '', hint: '' });
  const [filePopover, setFilePopover] = useState({ visible: false, x: 0, y: 0, path: '', line: 0 });
  const [selectionPopover, setSelectionPopover] = useState({ visible: false, x: 0, y: 0, text: '' });
  const [githubRemoteUrl, setGithubRemoteUrl] = useState<string | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });

  // Track mouse position for selection popover
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Fetch GitHub remote on mount
  useEffect(() => {
    window.electronAPI.invoke('git:get-github-remote', config.sessionId)
      .then((result: { success: boolean; data?: string | null }) => {
        if (result.success) setGithubRemoteUrl(result.data ?? null);
      });
  }, [config.sessionId]);

  // Register link providers when terminal ready
  useEffect(() => {
    if (!terminal) return;

    const providerConfig: LinkProviderConfig = {
      terminal,
      workingDirectory: config.workingDirectory,
      githubRemoteUrl: githubRemoteUrl ?? undefined,
      onShowTooltip: (event, text, hint) => {
        setTooltip({ visible: true, x: event.clientX, y: event.clientY, text, hint });
      },
      onHideTooltip: () => setTooltip(prev => ({ ...prev, visible: false })),
      onShowFilePopover: (event, path, line) => {
        setFilePopover({ visible: true, x: event.clientX, y: event.clientY, path, line: line ?? 0 });
      },
      onOpenUrl: (url) => window.electronAPI.openExternal(url),
    };

    const disposables = [
      terminal.registerLinkProvider(createFileLinkProvider(providerConfig)),
      // Only register git provider if we have a GitHub remote
      ...(githubRemoteUrl ? [terminal.registerLinkProvider(createGitLinkProvider(providerConfig))] : [])
    ];

    return () => disposables.forEach(d => d.dispose());
  }, [terminal, config.workingDirectory, githubRemoteUrl]);

  // Selection listener - position at mouse location
  useEffect(() => {
    if (!terminal) return;
    const disposable = terminal.onSelectionChange(() => {
      if (terminal.hasSelection()) {
        const text = terminal.getSelection();
        const { x, y } = mousePositionRef.current;
        setSelectionPopover({ visible: true, x, y, text });
      } else {
        setSelectionPopover(prev => ({ ...prev, visible: false }));
      }
    });
    return () => disposable.dispose();
  }, [terminal]);

  // File popover actions
  const handleOpenInEditor = useCallback(async () => {
    const { path, line } = filePopover;
    // Check if file exists first
    const result = await window.electronAPI.invoke('file:exists', {
      sessionId: config.sessionId,
      filePath: path
    });
    if (result.success && result.data) {
      // TODO: Open in editor panel
      console.log('Opening in editor:', path, 'at line', line);
    } else {
      console.log('File does not exist:', path);
    }
    setFilePopover(prev => ({ ...prev, visible: false }));
  }, [filePopover, config.sessionId]);

  const handleShowInExplorer = useCallback(async () => {
    const { path } = filePopover;
    await window.electronAPI.invoke('showItemInFolder', path);
    setFilePopover(prev => ({ ...prev, visible: false }));
  }, [filePopover]);

  return {
    onMouseMove: handleMouseMove,
    renderOverlays: () => (
      <>
        <TerminalLinkTooltip {...tooltip} linkText={tooltip.text} />
        <TerminalPopover
          visible={filePopover.visible}
          x={filePopover.x}
          y={filePopover.y}
          onClose={() => setFilePopover(p => ({ ...p, visible: false }))}
        >
          <PopoverButton icon={FileEdit} onClick={handleOpenInEditor}>
            Open in Editor
          </PopoverButton>
          <PopoverButton icon={FolderOpen} onClick={handleShowInExplorer}>
            Open in System Explorer
          </PopoverButton>
        </TerminalPopover>
        <SelectionPopover
          {...selectionPopover}
          onClose={() => setSelectionPopover(p => ({ ...p, visible: false }))}
        />
      </>
    )
  };
}
```

**Task 11: Git remote parsing (SSH and HTTPS)**
```typescript
// In main/src/ipc/git.ts
ipcMain.handle('git:get-github-remote', async (_event, sessionId: string) => {
  try {
    const session = services.sessionManager.getSession(sessionId);
    if (!session?.worktreePath) {
      return { success: true, data: null };
    }

    const { stdout } = await execAsync('git remote -v', { cwd: session.worktreePath });

    // Parse remote output for github.com
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Match SSH format: git@github.com:org/repo.git
      const sshMatch = line.match(/git@github\.com:([^/]+\/[^.]+)(?:\.git)?/);
      if (sshMatch) {
        return { success: true, data: `https://github.com/${sshMatch[1]}` };
      }

      // Match HTTPS format: https://github.com/org/repo.git
      const httpsMatch = line.match(/https:\/\/github\.com\/([^/]+\/[^.\s]+)/);
      if (httpsMatch) {
        return { success: true, data: `https://github.com/${httpsMatch[1]}` };
      }
    }

    return { success: true, data: null };
  } catch (error) {
    console.error('Failed to get GitHub remote:', error);
    return { success: true, data: null }; // Silent fail, just no git links
  }
});
```

### Integration Points

```yaml
FRONTEND:
  - New components: frontend/src/components/terminal/*
  - Hook integration: TerminalPanel.tsx imports useTerminalLinks
  - Package: @xterm/addon-web-links (verify installed)

BACKEND (IPC):
  - main/src/ipc/app.ts: Add showItemInFolder handler
  - main/src/ipc/git.ts: Add git:get-github-remote handler
  - main/src/preload.ts: Expose showItemInFolder

EXISTING (no changes needed):
  - main/src/ipc/file.ts: file:exists handler already exists

PRELOAD API additions:
  - window.electronAPI.invoke('showItemInFolder', path: string)
  - window.electronAPI.invoke('git:get-github-remote', sessionId: string)
```

## Validation Loop

```bash
# Run these FIRST - fix any errors before proceeding
pnpm lint                # ESLint across all workspaces
pnpm typecheck           # TypeScript compilation
# Expected: No errors. If errors, READ the error and fix.
```

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] WebLinksAddon loads without error
- [ ] Ctrl+Click on URL opens browser
- [ ] Hover on link shows tooltip (stays on screen)
- [ ] Ctrl+Click on file path shows popover
- [ ] "Open in Editor" works for existing files
- [ ] "Open in System Explorer" reveals file in Finder/Explorer
- [ ] Selection popover appears at mouse position with Copy action
- [ ] Git SHA links work when GitHub remote detected
- [ ] Issue references (#123) work when GitHub remote detected
- [ ] Silent fail when file doesn't exist (check console)
- [ ] Popover dismisses on click outside or Escape

## Anti-Patterns to Avoid

- Don't use async operations inside `provideLinks` - it must be synchronous
- Don't duplicate URL handling - WebLinksAddon already handles URLs
- Don't forget to check for modifier key (Ctrl/Cmd) before opening links
- Don't hardcode platform detection - use navigator.platform
- Don't forget click-outside cleanup in useEffect
- Don't block terminal input while popover is open
- Don't forget to dispose link providers on cleanup
- Don't forget to re-register providers when githubRemoteUrl changes (include in deps)
- Don't call showItemInFolder without validating path exists first

## Deprecated Code to Remove

None - this is a new feature addition.

---

**Plan Confidence Score: 9/10**

High confidence because:
- xterm.js link APIs are well-documented and stable
- Existing tooltip/dropdown patterns provide clear reference
- IPC infrastructure already exists (just adding handlers)
- Clear separation of concerns with hooks and providers
- WebLinksAddon handles URLs, custom providers handle the rest
- Smart positioning follows existing component patterns
- All reviewer feedback incorporated

Remaining minor risks:
- File path regex may need tuning for edge cases (iterative)
- Selection popover positioning relies on mouse tracking (should work)
