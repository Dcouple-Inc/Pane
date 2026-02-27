# Plan: Rename All "Pane" References to "Pane" (runpane)

## Goal

Replace every occurrence of "Pane" throughout the codebase with the new "Pane" branding. After this change, the app is called "Pane", lives at `~/.pane/`, uses `PANE_*` env vars, and all URLs point to `Dcouple-Inc/Pane` / `runpane.com`.

## Why

- Project has been rebranded from "Pane" to "Pane"
- New GitHub org: Dcouple-Inc/Pane, new domain: runpane.com
- Old name should no longer appear anywhere in the codebase

## What

A bulk rename script handles the mechanical string replacements across 100+ files, followed by manual file renames and one special-case fix (data directory migration + hardcoded path cleanup).

### Naming Conventions

| Context | Old | New |
|---------|-----|-----|
| UI display name | Pane | Pane |
| Package name | Pane | pane |
| App ID | com.dcouple.pane / com.dcouple.pane | com.dcouple.pane |
| Product name | Pane | Pane |
| GitHub repo | parsakhaz/Pane | Dcouple-Inc/Pane |
| GitHub account | - | runpane |
| Domain | runpane.com | runpane.com |
| Data directory | ~/.pane | ~/.pane |
| Dev directory | ~/.pane_dev | ~/.pane_dev |
| Env vars | PANE_DIR, PANE_SESSION_ID, PANE_PANEL_ID | PANE_DIR, PANE_SESSION_ID, PANE_PANEL_ID |
| CLI arg | --pane-dir | --pane-dir |
| Log files | pane-*.log | pane-*.log |
| MCP server | pane-permissions | pane-permissions |
| Analytics prefix | pane_ | pane_ |
| Database | pane.db | pane.db |
| localStorage keys | pane-* | pane-* |
| Temp files | pane-commit-*, pane-mcp-* | pane-commit-*, pane-mcp-* |
| Socket file | pane-permissions-*.sock | pane-permissions-*.sock |
| Scripts | pane-run-script.js, pane-run.sh | pane-run-script.js, pane-run.sh |
| CSS/theme names | pane-dark, pane-light | pane-dark, pane-light |

### Success Criteria

- [ ] `grep -ri Pane` returns zero results (excluding node_modules, dist, .git)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] App launches with window title "Pane"
- [ ] Data directory migration works (old ~/.pane → ~/.pane on first launch)

## All Needed Context

### Key Files to Reference

```yaml
- file: main/src/utils/appDirectory.ts
  why: Central data directory logic. Must rename paths AND add migration.

- file: main/src/index.ts
  why: Window titles, --pane-dir CLI arg, log messages, dialog text. Call migration on startup.

- file: main/src/services/panels/claude/claudeCodeManager.ts
  why: MCP config filenames, server keys, hardcoded ~/.pane paths (lines 856, 1058) that should be replaced with getAppDirectory() calls.

- file: main/src/services/spotlightManager.ts
  why: Hardcodes path.join(homedir(), '.pane', 'spotlight-state.json') at line 44 — should use getAppSubdirectory().

- file: package.json
  why: name, description, appId (com.dcouple.pane), productName, desktop entry, shortcut
```

### Known Gotchas

1. **Bundle identifier check**: `appDirectory.ts:65` checks `__CFBundleIdentifier === 'com.dcouple.pane'` — must update to `com.dcouple.pane`
2. **Two different app IDs**: `package.json` has `com.dcouple.pane`, while `appDirectory.ts` checks `com.dcouple.pane` — both must become `com.dcouple.pane`
3. **MCP server name consistency**: `mcp__pane-permissions__approve_permission` appears in `claudeCodeManager.ts` line 228 and must match the server name in `mcpPermissionBridge.ts`, `mcpPermissionServer.ts`, and `build-mcp-bridge.js` — all must use `pane-permissions`
4. **Logo SVG files**: Three copies exist (frontend/public, frontend/src/assets, main/assets) — content already updated in commit 0331666, just rename files
5. **localStorage keys**: Existing users lose sidebar width/collapse preferences (acceptable for rebrand)
6. **Cloud scripts**: `cloud/scripts/setup-vm.sh` creates a Linux user named "Pane" — rename to "pane"
7. **Hardcoded `~/.pane` paths**: `spotlightManager.ts:44` and `claudeCodeManager.ts:856,1058` hardcode `~/.pane` instead of using `getAppDirectory()` — fix these to use the centralized function, not just string-replace
8. **Analytics distinctId**: Existing users have `pane_` prefixed IDs in their stored config. Changing the prefix for new code only is acceptable — existing stored IDs keep their prefix (PostHog can handle mixed prefixes)
9. **Env var `PANE_SESSION_ID`/`PANE_PANEL_ID`**: Set in `terminalPanelManager.ts`, may be read by `pane-run.sh` / `pane-run.sh` — ensure both sides are renamed

## Implementation Blueprint

### Task 1: Write and run the bulk rename script

CREATE a temporary Node.js script `scripts/rename-to-pane.js` that:

1. Defines ordered replacement rules (order matters — longer/more-specific patterns first):
   ```js
   const replacements = [
     // URLs (most specific first)
     ['github.com/Dcouple-Inc/Pane', 'github.com/Dcouple-Inc/Pane'],
     ['runpane.com', 'runpane.com'],
     // App IDs
     ['com.dcouple.pane', 'com.dcouple.pane'],
     ['com.dcouple.pane', 'com.dcouple.pane'],
     // MCP tool name (with double underscores)
     ['mcp__pane-permissions__approve_permission', 'mcp__pane-permissions__approve_permission'],
     // Env vars (UPPER_CASE)
     ['PANE_DIR', 'PANE_DIR'],
     ['PANE_SESSION_ID', 'PANE_SESSION_ID'],
     ['PANE_PANEL_ID', 'PANE_PANEL_ID'],
     ['PANE_VERSION', 'PANE_VERSION'],
     ['PANE_USER', 'PANE_USER'],
     ['PANE_CONFIG_DIR', 'PANE_CONFIG_DIR'],
     ['PANE_CONFIG', 'PANE_CONFIG'],
     // File/path patterns
     ['pane-run-script.js', 'pane-run-script.js'],
     ['pane-run.sh', 'pane-run.sh'],
     ['pane-logo.svg', 'pane-logo.svg'],
     ['pane-mcp-', 'pane-mcp-'],
     ['pane-base-mcp-', 'pane-base-mcp-'],
     ['pane-commit-retry-', 'pane-commit-retry-'],
     ['pane-commit-', 'pane-commit-'],
     ['pane-permissions-', 'pane-permissions-'],
     ['pane-permissions', 'pane-permissions'],
     ['pane-dark', 'pane-dark'],
     ['pane-light', 'pane-light'],
     ['pane-cloud', 'pane-cloud'],
     ['pane-test-', 'pane-test-'],
     ['.pane_dev', '.pane_dev'],
     ['.pane', '.pane'],
     ['pane.db', 'pane.db'],
     ['pane.flatpak', 'pane.flatpak'],
     ['pane.verboseLogging', 'pane.verboseLogging'],
     // Variable/function names (camelCase/snake_case)
     ['paneLogo', 'paneLogo'],
     ['panePackageJson', 'panePackageJson'],
     ['get_pane_config_path', 'get_pane_config_path'],
     ['get_pane_config_dir', 'get_pane_config_dir'],
     // Prefixes
     ['pane_', 'pane_'],
     ['pane-', 'pane-'],
     // CLI arg
     ['--pane-dir', '--pane-dir'],
     // Generic (case-sensitive variants — apply LAST)
     ['PANE', 'PANE'],
     ['Pane', 'Pane'],
     ['Pane', 'pane'],  // lowercase catch-all — handles remaining cases
   ];
   ```

2. Globs for all target files (exclude `node_modules`, `dist`, `.git`, the script itself):
   ```
   **/*.{ts,tsx,js,json,md,html,css,sh,yml,yaml,svg}
   ```

3. For each file, reads content, applies all replacements in order, writes back if changed.

4. After the bulk replace, applies a **case-fix pass** for user-facing strings where "pane" should be "Pane" (capitalized). The bulk script handles this via the ordered replacements — `Pane` → `Pane` and `Pane` → `pane` catch most cases. But some strings like `"pane stash"`, `"pane-test-"` are correctly lowercase. The cases that need uppercase "Pane" are already handled by context (e.g., `'Welcome to Pane'` comes from `'Welcome to Pane'` → the `Pane` → `pane` replacement gives `'Welcome to pane'` which is WRONG).

   **CRITICAL**: The catch-all `Pane` → `pane` will produce incorrect casing in user-facing text like "Welcome to pane". To handle this, add these specific replacements BEFORE the generic catch-all:
   ```js
   // User-facing text (capitalize Pane)
   ['Welcome to Pane', 'Welcome to Pane'],
   ['Pane Help', 'Pane Help'],
   ['Pane Settings', 'Pane Settings'],
   ['Pane Cloud', 'Pane Cloud'],
   ['Pane Community', 'Pane Community'],
   ['Pane Attribution', 'Pane Attribution'],
   ['Pane encountered', 'Pane encountered'],
   ['Pane runs', 'Pane runs'],
   ['Pane will', 'Pane will'],
   ['Pane is', 'Pane is'],
   ['Pane needs', 'Pane needs'],
   ['Pane to', 'Pane to'],
   ['of Pane', 'of Pane'],
   ['with Pane', 'with Pane'],
   ['Help Improve Pane', 'Help Improve Pane'],
   ['make Pane better', 'make Pane better'],
   ['other Pane users', 'other Pane users'],
   ['help with Pane', 'help with Pane'],
   ['how Pane', 'how Pane'],
   ['from Pane', 'from Pane'],
   ['in Pane', 'in Pane'],
   ['about Pane', 'about Pane'],
   ['for Pane', 'for Pane'],
   ['enable them in your browser settings and refresh Pane', 'enable them in your browser settings and refresh Pane'],
   ['Join the Pane', 'Join the Pane'],
   ['Connect with other Pane', 'Connect with other Pane'],
   ['version of Pane', 'version of Pane'],
   ['restarting Pane', 'restarting Pane'],
   ['I use Pane', 'I use Pane'],
   ['Allow Pane', 'Allow Pane'],
   ['remove all project data from Pane', 'remove all project data from Pane'],
   ['Pane \\[', 'Pane ['],  // Window title "Pane [worktree]"
   // In comments and docs, "Pane" as a standalone sentence-start or title
   ['# Pane', '# Pane'],
   ['Pane -', 'Pane -'],  // "Pane - Terminal-first..." description
   ```

5. Prints a summary of files changed and total replacements made.

Run the script, then **delete it** (it's a one-time tool).

### Task 2: Rename files

After the bulk content replacement, rename these files using `git mv`:

```bash
git mv frontend/public/pane-logo.svg frontend/public/pane-logo.svg
git mv frontend/src/assets/pane-logo.svg frontend/src/assets/pane-logo.svg
git mv main/assets/pane-logo.svg main/assets/pane-logo.svg
git mv scripts/pane-run-script.js scripts/pane-run-script.js
git mv pane-run.sh pane-run.sh
```

The bulk script already updated all references to these filenames in Task 1, so no further content changes needed.

### Task 3: Fix hardcoded paths to use centralized `getAppDirectory()`

These files hardcode `~/.pane` instead of using the centralized `getAppDirectory()` / `getAppSubdirectory()` functions. After the bulk rename they'll say `~/.pane`, but they should use the utility instead:

**MODIFY `main/src/services/spotlightManager.ts` (line 44)**:
```typescript
// Before (after bulk rename):
this.SPOTLIGHT_STATE_FILE = join(homedir(), '.pane', 'spotlight-state.json');
// After:
import { getAppSubdirectory } from '../utils/appDirectory';
this.SPOTLIGHT_STATE_FILE = getAppSubdirectory('spotlight-state.json');
```

**MODIFY `main/src/services/panels/claude/claudeCodeManager.ts` (lines 856 and 1058)**:
```typescript
// Before (after bulk rename):
tempDir = path.join(homeDir, '.pane');
// After:
import { getAppDirectory } from '../../../utils/appDirectory';
tempDir = getAppDirectory();
```

Both locations (the MCP config setup around line 856 and the base MCP setup around line 1058) should use `getAppDirectory()`.

### Task 4: Add data directory migration to appDirectory.ts

MODIFY `main/src/utils/appDirectory.ts` — add a `migrateDataDirectory()` function:

```typescript
import { existsSync, renameSync } from 'fs';

/**
 * Migrates the data directory from ~/.pane to ~/.pane on first launch.
 * Should be called once during app startup, before any services are initialized.
 */
export function migrateDataDirectory(): void {
  const home = homedir();
  const oldDir = join(home, '.pane');
  const newDir = join(home, '.pane');
  const oldDevDir = join(home, '.pane_dev');
  const newDevDir = join(home, '.pane_dev');

  // Migrate production directory
  if (!existsSync(newDir) && existsSync(oldDir)) {
    try {
      renameSync(oldDir, newDir);
      console.log(`[Pane] Migrated data directory: ${oldDir} → ${newDir}`);
    } catch (err) {
      console.error(`[Pane] Failed to migrate data directory: ${err}`);
    }
  }

  // Migrate dev directory
  if (!existsSync(newDevDir) && existsSync(oldDevDir)) {
    try {
      renameSync(oldDevDir, newDevDir);
      console.log(`[Pane] Migrated dev directory: ${oldDevDir} → ${newDevDir}`);
    } catch (err) {
      console.error(`[Pane] Failed to migrate dev directory: ${err}`);
    }
  }
}
```

MODIFY `main/src/index.ts` — call `migrateDataDirectory()` early in the app startup, before `getAppDirectory()` is first used. Keep the existing `--pane-dir` CLI arg parsing as a silent deprecated alias (the bulk rename will have already changed it to `--pane-dir`, so add back the old one as a fallback):

```typescript
// In the CLI arg parsing section, after the --pane-dir handling:
if (arg.startsWith('--pane-dir=')) {
  // Deprecated: use --pane-dir instead
  setAppDirectory(arg.split('=')[1]);
} else if (arg === '--pane-dir' && args[i + 1]) {
  setAppDirectory(args[i + 1]);
  i++;
}
```

### Task 5: Final sweep and validation

```bash
# Verify no remaining references (unfiltered search, exclude only build artifacts)
grep -ri "Pane" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.claude -l

# Run type checking
pnpm typecheck

# Run linting
pnpm lint
```

Fix any remaining issues found. Common things the sweep may catch:
- Missed files not covered by the glob patterns
- References in `.gitignore` or other dotfiles
- SVG content that wasn't touched (file content of the logos, though these were already updated in a prior commit)

## Validation Loop

```bash
# After all changes:
pnpm typecheck
pnpm lint

# Verify zero remaining Pane references:
grep -ri "Pane" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.claude -l
# Expected: empty output (or only the rename script itself if not yet deleted)
```

## Anti-Patterns to Avoid

- Don't add backward-compatibility shims for localStorage keys (clean break)
- Don't keep old env var names as aliases (only `--pane-dir` CLI arg gets a deprecated alias)
- Don't change any logic beyond what's needed for the rename
- Don't modify the SVG logo content (already updated in prior commit, just rename files)
- Don't touch node_modules, dist, or generated files
- Don't manually edit files the bulk script can handle — let the script do the work

## Deprecated Code to Remove

- Delete `scripts/rename-to-pane.js` after running it (one-time tool)

## Confidence Score: 9/10

High confidence — the bulk script approach minimizes human error. The main risks are (1) incorrect casing in user-facing text (handled by specific replacement rules before the catch-all) and (2) the `getAppDirectory()` refactor in Task 3 potentially missing an import. The final grep sweep catches anything missed.
