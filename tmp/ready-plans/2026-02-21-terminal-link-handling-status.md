# Terminal Link Handling - Implementation Status

## Completed Features

### 1. Selection Popover (Working)
- **Copy** - Copies selected text to clipboard
- **Open URL** - Extracts and opens URLs from selected text (handles surrounding text like `error: https://...`)
- **Show in Explorer** - Opens native file explorer for detected file paths

### 2. File Path Detection (Working)
- Unix paths: `/path/to/file`, `./relative/path`, `~/home/path`
- Windows paths: `C:\path\to\file`, `C:/path/to/file`
- Relative paths with extensions: `file.ts`, `src/index.js:42`, `dir\file.md`
- Cross-platform path resolution (normalizes to `\` on Windows, `/` on Unix)

### 3. URL Detection (Working)
- HTTP/HTTPS URLs via WebLinksAddon
- Extracts URL from surrounding text (e.g., `error: https://example.com` opens just the URL)

### 4. GitHub Remote Detection (Working)
- SSH format: `git@github.com:org/repo.git`
- HTTPS format: `https://github.com/org/repo.git`
- Handles dotted repo names: `org/repo.name.git`

### 5. Performance Optimizations (Working)
- Early return when popovers not visible (prevents re-render spam)
- Lazy WebGL and WebLinksAddon loading

---

## Deferred Features

### 1. Ctrl/Cmd+Click on Links
**Status:** Not working (timing issue)
**Issue:** The `useTerminalLinks` hook receives `null` for the terminal ref on initial render. By the time the terminal is available, the link providers aren't re-registered.
**Workaround:** Selection popover provides the same functionality.
**Effort to fix:** Medium - need to refactor hook to handle terminal ref changes, or register providers after terminal initialization.

### 2. Open in Editor
**Status:** Stub only (TODO)
**Issue:** Editor panel integration not implemented. The button exists but does nothing.
**What's needed:**
- Integration with Pane's Editor panel system
- File path resolution to open at correct line number
- Panel creation/switching logic
**Effort:** Medium-High - requires understanding the panel system and editor integration

### 3. Git SHA/Issue Link Providers
**Status:** Infrastructure exists, but untested
**Files:** `gitLinkProvider.ts`
**What's implemented:**
- SHA detection regex
- Issue/PR number detection (`#123`)
- GitHub URL generation from remote
**What's missing:**
- Testing with actual GitHub repos
- Popover UI for git links
**Effort:** Low - mostly wiring up existing code

### 4. Hover Tooltips for Links
**Status:** Infrastructure exists
**Files:** `TerminalLinkTooltip.tsx`, link provider hover handlers
**Issue:** Tooltips may not be showing due to the same Ctrl+Click timing issue
**Effort:** Low - once Ctrl+Click is fixed, tooltips should work

---

## Files Created/Modified

### New Files
- `frontend/src/components/terminal/SelectionPopover.tsx`
- `frontend/src/components/terminal/TerminalPopover.tsx`
- `frontend/src/components/terminal/TerminalLinkTooltip.tsx`
- `frontend/src/components/terminal/hooks/useTerminalLinks.ts`
- `frontend/src/components/terminal/linkProviders/types.ts`
- `frontend/src/components/terminal/linkProviders/fileLinkProvider.ts`
- `frontend/src/components/terminal/linkProviders/gitLinkProvider.ts`
- `frontend/src/components/terminal/linkProviders/index.ts`
- `frontend/src/utils/platformUtils.ts`

### Modified Files
- `frontend/src/components/panels/TerminalPanel.tsx` - Integration
- `frontend/src/components/SessionView.tsx` - Fixed missing Link import
- `main/src/ipc/app.ts` - Added `app:showItemInFolder` handler
- `main/src/ipc/git.ts` - Added `git:get-github-remote` handler, fixed dotted repo regex

---

## PR Status
- **PR #16**: https://github.com/Dcouple-Inc/Pane/pull/16
- Ready for merge with current working features
