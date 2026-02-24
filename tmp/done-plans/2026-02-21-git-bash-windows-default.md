# Plan: Git Bash as Default Windows Shell with User Preference

## Goal

Make Git Bash the default shell on Windows (instead of PowerShell) and add a user preference in Settings to allow users to choose their preferred shell.

## Why

- Git Bash is more CLI-friendly and consistent with Unix-like tooling
- Many developers prefer bash syntax over PowerShell
- User preference allows flexibility for those who want PowerShell or cmd

## What

### User-Visible Behavior
- On Windows with Git installed: Git Bash becomes the default terminal shell
- On Windows without Git: Falls back to PowerShell → cmd (existing behavior)
- New "Terminal Shell" dropdown in Settings (General tab) allows users to choose:
  - Auto-detect (default - uses Git Bash if available)
  - Git Bash
  - PowerShell
  - Command Prompt
- Setting applies to both terminal panels and run commands

### Success Criteria
- [ ] Git Bash is auto-detected and used as default on Windows
- [ ] Shell preference dropdown appears in Settings on Windows only
- [ ] Preference persists across app restarts
- [ ] All standard Git installation locations are checked
- [ ] Fallback to PowerShell/cmd works when Git Bash unavailable

## All Needed Context

### Documentation & References

```yaml
- file: main/src/utils/shellDetector.ts
  why: Core file to modify - add Git Bash detection as top priority

- file: main/src/types/config.ts
  why: Add preferredShell to AppConfig interface

- file: main/src/services/configManager.ts
  why: Add getter for shell preference

- file: frontend/src/components/Settings.tsx
  why: Add shell preference dropdown (Windows only)

- file: main/src/ipc/config.ts
  why: Expose detected shells for dropdown population

- file: main/src/services/terminalPanelManager.ts
  why: Update to pass shell preference to ShellDetector

- file: main/src/services/runCommandManager.ts
  why: Update to pass shell preference to ShellDetector
```

### Git Bash Installation Locations (Windows)

Check these paths in order:
```
C:\Program Files\Git\bin\bash.exe          # 64-bit standard install
C:\Program Files (x86)\Git\bin\bash.exe    # 32-bit install
C:\Git\bin\bash.exe                        # Custom/portable install
%LOCALAPPDATA%\Programs\Git\bin\bash.exe   # User-level install
%USERPROFILE%\scoop\apps\git\current\bin\bash.exe  # Scoop package manager
%GIT_INSTALL_ROOT%\bin\bash.exe            # Environment variable (if set)
```

Also check PATH for `bash.exe` as final fallback.

## Implementation Blueprint

### Data Models

Add to `AppConfig` and `UpdateConfigRequest` in `main/src/types/config.ts`:
```typescript
// Shell preference for Windows terminals
// 'auto' = detect best shell (Git Bash > PowerShell > cmd)
// 'gitbash' | 'powershell' | 'pwsh' | 'cmd' = specific shell
preferredShell?: 'auto' | 'gitbash' | 'powershell' | 'pwsh' | 'cmd';
```

### Tasks (in implementation order)

```yaml
Task 1: Add Git Bash detection to ShellDetector
MODIFY main/src/utils/shellDetector.ts:
  - ADD private static method findGitBash() that checks all installation locations with try-catch
  - MODIFY detectWindowsShell() to check Git Bash FIRST (top priority)
  - ADD 'gitbash' case to getShellArgs() returning ['-i'] for interactive shell
  - ADD 'gitbash' case to getShellCommandArgs() using '-c'
  - ADD public static method getAvailableShells() returning list of detected shells
  - ADD public static method getShellByPreference(pref) to get specific shell by ID
  - MODIFY getDefaultShell() to accept optional preferredShell parameter

Task 2: Add preferredShell to config types
MODIFY main/src/types/config.ts:
  - ADD preferredShell field to AppConfig interface
  - ADD preferredShell field to UpdateConfigRequest interface

Task 3: Add shell preference support to ConfigManager
MODIFY main/src/services/configManager.ts:
  - ADD getPreferredShell() method returning validated config value or 'auto'

Task 4: Update callers to pass shell preference
MODIFY main/src/services/terminalPanelManager.ts:
  - IMPORT configManager
  - PASS configManager.getPreferredShell() to ShellDetector.getDefaultShell()
  - PASS forceRefresh: true when config has changed

MODIFY main/src/services/runCommandManager.ts:
  - IMPORT configManager
  - PASS configManager.getPreferredShell() to ShellDetector.getDefaultShell()

Task 5: Add IPC handler to get available shells
MODIFY main/src/ipc/config.ts:
  - ADD 'config:get-available-shells' handler that returns ShellDetector.getAvailableShells()

Task 6: Expose available shells in preload
MODIFY main/src/preload.ts:
  - ADD getAvailableShells method to config object
  - ADD AvailableShell interface type

Task 7: Add API method for available shells
MODIFY frontend/src/utils/api.ts:
  - ADD getAvailableShells() to config object

Task 8: Add shell preference to Settings UI
MODIFY frontend/src/components/Settings.tsx:
  - ADD state for preferredShell and availableShells
  - FETCH available shells on mount (Windows only, after platform check)
  - ADD shell preference dropdown in General tab (conditionally rendered for Windows)
  - INCLUDE preferredShell in handleSubmit update payload
  - LOAD preferredShell in fetchConfig
```

### Per-Task Pseudocode

#### Task 1: findGitBash() method
```typescript
private static findGitBash(): string | null {
  const locations = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    'C:\\Git\\bin\\bash.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'),
  ];

  // Check GIT_INSTALL_ROOT env var first
  const gitInstallRoot = process.env.GIT_INSTALL_ROOT || '';
  if (gitInstallRoot) {
    locations.unshift(path.join(gitInstallRoot, 'bin', 'bash.exe'));
  }

  for (const loc of locations) {
    try {
      if (loc && fs.existsSync(loc)) return loc;
    } catch {
      // Permission denied or other fs error, skip this location
    }
  }

  // Fallback: check PATH
  return this.findExecutable('bash.exe');
}
```

#### Task 1: Modified detectWindowsShell()
```typescript
private static detectWindowsShell(): ShellInfo {
  // Check for Git Bash FIRST (top priority)
  const gitBashPath = this.findGitBash();
  if (gitBashPath) {
    return { path: gitBashPath, name: 'gitbash', args: ['-i'] };
  }

  // Check for PowerShell Core
  const pwshPath = this.findExecutable('pwsh.exe');
  if (pwshPath) {
    return { path: pwshPath, name: 'pwsh' };
  }

  // Check for Windows PowerShell
  const powershellPath = this.findExecutable('powershell.exe');
  if (powershellPath) {
    return { path: powershellPath, name: 'powershell' };
  }

  // Fall back to cmd.exe
  const cmdPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe');
  if (fs.existsSync(cmdPath)) {
    return { path: cmdPath, name: 'cmd' };
  }

  return { path: 'cmd.exe', name: 'cmd' };
}
```

#### Task 1: getShellByPreference() method
```typescript
static getShellByPreference(preference: string): ShellInfo | null {
  if (process.platform !== 'win32') return null;

  switch (preference) {
    case 'gitbash': {
      const gitBash = this.findGitBash();
      return gitBash ? { path: gitBash, name: 'gitbash', args: ['-i'] } : null;
    }
    case 'pwsh': {
      const pwsh = this.findExecutable('pwsh.exe');
      return pwsh ? { path: pwsh, name: 'pwsh' } : null;
    }
    case 'powershell': {
      const ps = this.findExecutable('powershell.exe');
      return ps ? { path: ps, name: 'powershell' } : null;
    }
    case 'cmd': {
      const cmdPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe');
      try {
        if (fs.existsSync(cmdPath)) return { path: cmdPath, name: 'cmd' };
      } catch { /* ignore */ }
      return null;
    }
    default:
      return null;
  }
}
```

#### Task 1: Modified getDefaultShell()
```typescript
static getDefaultShell(preferredShell?: string, forceRefresh = false): ShellInfo {
  // If specific preference provided (not 'auto'), try to use it
  if (preferredShell && preferredShell !== 'auto') {
    const preferred = this.getShellByPreference(preferredShell);
    if (preferred) {
      return preferred;
    }
    // Preferred shell not available, fall through to auto-detect
  }

  // Use cache if available and not forcing refresh
  if (!forceRefresh && this.cachedShell) {
    return this.cachedShell;
  }

  const shell = this.detectShell();
  this.cachedShell = shell;
  return shell;
}
```

#### Task 1: getAvailableShells()
```typescript
static getAvailableShells(): Array<{ id: string; name: string; path: string }> {
  if (process.platform !== 'win32') return [];

  const shells: Array<{ id: string; name: string; path: string }> = [];

  const gitBash = this.findGitBash();
  if (gitBash) shells.push({ id: 'gitbash', name: 'Git Bash', path: gitBash });

  const pwsh = this.findExecutable('pwsh.exe');
  if (pwsh) shells.push({ id: 'pwsh', name: 'PowerShell', path: pwsh });

  const powershell = this.findExecutable('powershell.exe');
  if (powershell) shells.push({ id: 'powershell', name: 'PowerShell', path: powershell });

  const cmdPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe');
  try {
    if (fs.existsSync(cmdPath)) shells.push({ id: 'cmd', name: 'Command Prompt', path: cmdPath });
  } catch { /* ignore */ }

  return shells;
}
```

#### Task 1: Update getShellArgs()
```typescript
private static getShellArgs(shellName: string): string[] {
  switch (shellName) {
    case 'bash':
    case 'sh':
    case 'zsh':
    case 'fish':
    case 'gitbash':  // Add gitbash case
      return ['-i']; // Interactive mode
    case 'pwsh':
    case 'powershell':
      return ['-NoExit'];
    default:
      return [];
  }
}
```

#### Task 1: Update getShellCommandArgs()
```typescript
static getShellCommandArgs(command: string): { shell: string; args: string[] } {
  const shellInfo = this.getDefaultShell();

  switch (shellInfo.name) {
    case 'cmd':
      return { shell: shellInfo.path, args: ['/c', command] };
    case 'powershell':
    case 'pwsh':
      return { shell: shellInfo.path, args: ['-Command', command] };
    case 'gitbash':  // Add explicit gitbash case
      return { shell: shellInfo.path, args: ['-c', command] };
    default:
      // Unix shells
      return { shell: shellInfo.path, args: ['-c', command] };
  }
}
```

#### Task 3: getPreferredShell() in ConfigManager
```typescript
getPreferredShell(): string {
  const pref = this.config.preferredShell || 'auto';
  const validPrefs = ['auto', 'gitbash', 'powershell', 'pwsh', 'cmd'];
  return validPrefs.includes(pref) ? pref : 'auto';
}
```

#### Task 4: Update terminalPanelManager.ts
```typescript
// In initializeTerminal method, where ShellDetector.getDefaultShell() is called:
import { configManager } from './configManager';

// Replace:
const shellInfo = ShellDetector.getDefaultShell();

// With:
const preferredShell = configManager.getPreferredShell();
const shellInfo = ShellDetector.getDefaultShell(preferredShell);
```

#### Task 8: Settings UI dropdown (Windows only)
```typescript
// Add state (near other useState declarations)
const [preferredShell, setPreferredShell] = useState<string>('auto');
const [availableShells, setAvailableShells] = useState<Array<{id: string; name: string}>>([]);

// In fetchConfig, after platform check completes:
// Note: platform state already exists at line 43
if (platform === 'win32') {
  const shellsResponse = await API.config.getAvailableShells();
  if (shellsResponse.success) {
    setAvailableShells(shellsResponse.data);
  }
}
setPreferredShell(data.preferredShell || 'auto');

// In handleSubmit, add to the update payload:
preferredShell,

// In JSX (General tab, conditionally for Windows):
{platform === 'win32' && (
  <SettingsSection title="Terminal Shell" description="Default shell for terminal panels" icon={<Terminal />}>
    <select
      value={preferredShell}
      onChange={(e) => setPreferredShell(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-border-primary bg-surface-secondary text-text-primary focus:ring-2 focus:ring-interactive focus:border-interactive"
    >
      <option value="auto">Auto-detect (Git Bash preferred)</option>
      {availableShells.map(shell => (
        <option key={shell.id} value={shell.id}>{shell.name}</option>
      ))}
    </select>
  </SettingsSection>
)}
```

## Validation Loop

```bash
# Run these after implementation
pnpm typecheck         # TypeScript compilation
pnpm lint              # ESLint checks

# Manual testing on Windows:
# 1. Run app, open a terminal panel
# 2. Run `echo $SHELL` or check prompt - should show Git Bash
# 3. Open Settings, verify Terminal Shell dropdown appears
# 4. Change preference to PowerShell, save
# 5. Create new terminal panel, verify PowerShell is used
# 6. Change to "Auto-detect", verify Git Bash is used again
```

## Anti-Patterns to Avoid

- Don't hardcode paths without environment variable fallbacks
- Don't show shell preference UI on non-Windows platforms
- Don't break existing Unix/Mac behavior (this is Windows-only)
- Don't use 'any' type - use proper ShellInfo interfaces
- Don't import configManager directly into ShellDetector (circular dependency risk)
- Don't forget try-catch around fs.existsSync calls

## Deprecated Code to Remove

None - this is additive functionality.

## Confidence Score: 9/10

High confidence due to:
- Clear pattern from existing ShellDetector code
- Well-established Settings UI pattern to follow
- Isolated changes with clear boundaries
- Dependency injection approach avoids circular imports
- Comprehensive error handling
