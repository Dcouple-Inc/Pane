# Plan: Multi-Platform CI/CD with GitHub Actions

## Summary

Add Windows (x64 + ARM64) builds to existing GitHub Actions CI/CD. Update release workflow to build on all platforms (macOS universal, Windows x64, Windows ARM64, Linux x64+arm64) and auto-publish all artifacts to a single GitHub Release. Add a `scripts/release.js` script to trigger releases.

## Current State

- **build.yml** (canary): Builds macOS + Linux on push to main
- **release.yml**: Builds macOS + Linux on `v*` tag push, publishes to GitHub Releases
- **Windows builds**: `scripts/build-win.js` exists and works locally, but is NOT in any CI workflow
- **No Windows release script** exists in package.json (only `build:win:*`)
- electron-builder is configured with GitHub publish provider (`parsakhaz/foozol`)

## Approach

### Key Design Decisions

1. **Separate jobs per platform** (not matrix) — Windows needs `windows-latest`, macOS needs `macos-latest`, Linux needs `ubuntu-latest`. Each has different setup steps.
2. **Windows builds use `build-win.js`** — it handles ALL build steps internally (frontend, main, inject-build-info, generate-notices, electron-builder with `npmRebuild=false`). The Windows CI job does NOT need separate build steps.
3. **Single GitHub Release** — All jobs publish to the same tag. electron-builder's `--publish always` handles this natively (creates release if missing, appends artifacts if exists). Race conditions are handled by electron-builder's retry logic.
4. **Release trigger script** — `scripts/release.js` (cross-platform Node.js, consistent with other scripts in `scripts/`) bumps version, commits, tags, and pushes. The tag push triggers the release workflow.
5. **ARM64 Windows in CI** — Since `build-win.js` already handles cross-arch ARM64 builds from x64 (downloads ARM64 prebuilts), we run on `windows-latest` (x64) and build both architectures from there.
6. **No Python needed for Windows** — `build-win.js` uses `--config.npmRebuild=false`, skipping all native module compilation and using prebuilt binaries instead.

## Tasks

### Task 1: Add Windows release and canary scripts to package.json

**File**: `package.json`

Add these scripts alongside existing release/canary scripts:

```json
"release:win": "node scripts/build-win.js both --publish",
"release:win:x64": "node scripts/build-win.js x64 --publish",
"release:win:arm64": "node scripts/build-win.js arm64 --publish",
"canary:win": "node scripts/prepare-canary.js && node scripts/build-win.js both",
```

Also add the release trigger:
```json
"release": "node scripts/release.js",
```

### Task 2: Update `scripts/build-win.js` to support `--publish` flag

**File**: `scripts/build-win.js`

Currently the script hardcodes `--publish never`. Add support for a `--publish` flag anywhere in argv:

- Use `process.argv.includes('--publish')` to detect the flag (position-independent)
- If `--publish` is passed, use `--publish always` instead of `--publish never`
- Filter `--publish` from argv before arch parsing to avoid validation errors
- Update the script header comment to document the `--publish` flag

Changes:
1. Near top (after line 33), filter out `--publish` before parsing arch:
```javascript
const args = process.argv.slice(2).filter(a => a !== '--publish');
const shouldPublish = process.argv.includes('--publish');
const arch = args[0] || 'x64';
```

2. In `build()` function near line 334:
```javascript
const publishFlag = shouldPublish ? '--publish always' : '--publish never';
run(`pnpm exec electron-builder --win ${archFlag} ${publishFlag} --config.npmRebuild=false`);
```

### Task 3: Update `release.yml` to include Windows builds

**File**: `.github/workflows/release.yml`

Replace the current matrix job with 3 separate jobs. Each must declare `permissions: contents: write`.

```yaml
name: Release foozol

on:
  push:
    tags:
      - 'v*'

jobs:
  release-macos:
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22.15.1'
        cache: 'pnpm'
    - run: pnpm install
    - run: pnpm run build:main
    - name: Build and publish
      run: pnpm run release:mac:universal
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        CSC_LINK: ${{ secrets.APPLE_CERTIFICATE }}
        CSC_KEY_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        APPLE_ID: ${{ secrets.APPLE_ID }}
        APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
        APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        CSC_IDENTITY_AUTO_DISCOVERY: 'true'
    - run: ls -la dist-electron/
    - uses: actions/upload-artifact@v4
      with:
        name: foozol-macos-${{ github.ref_name }}
        path: |
          dist-electron/*.dmg
          dist-electron/*.zip
          dist-electron/latest-mac.yml
        if-no-files-found: error
        retention-days: 90

  release-linux:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22.15.1'
        cache: 'pnpm'
    - run: pnpm install
    - run: pnpm run build:main
    - name: Build and publish
      run: pnpm run release:linux
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    - run: ls -la dist-electron/
    - uses: actions/upload-artifact@v4
      with:
        name: foozol-linux-${{ github.ref_name }}
        path: |
          dist-electron/*.deb
          dist-electron/*.AppImage
          dist-electron/latest-linux.yml
        if-no-files-found: error
        retention-days: 90

  release-windows:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22.15.1'
        cache: 'pnpm'
    - run: pnpm install
    - name: Build and publish (x64 + ARM64)
      run: pnpm run release:win
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    - run: dir dist-electron
    - uses: actions/upload-artifact@v4
      with:
        name: foozol-windows-${{ github.ref_name }}
        path: |
          dist-electron/*.exe
          dist-electron/latest.yml
        if-no-files-found: error
        retention-days: 90
```

**Note**: Windows job does NOT have separate `build:main` or `build:frontend` steps — `build-win.js` handles everything internally. No Python setup needed since `npmRebuild=false` skips native compilation.

### Task 4: Update `build.yml` (canary) to include Windows builds

**File**: `.github/workflows/build.yml`

Add a third job for Windows. Keep the existing macOS and Linux matrix, and add a separate Windows job:

```yaml
  build-windows:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22.15.1'
        cache: 'pnpm'
    - name: Cache Electron binaries
      uses: actions/cache@v4
      with:
        path: |
          ~/AppData/Local/electron/Cache
          ~/AppData/Local/electron-builder/Cache
        key: windows-electron-${{ hashFiles('**/pnpm-lock.yaml') }}
        restore-keys: windows-electron-
    - run: pnpm install
    - name: Build Windows (x64 + ARM64)
      run: pnpm run build:win
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    - run: dir dist-electron
    - uses: actions/upload-artifact@v4
      with:
        name: foozol-windows-canary
        path: |
          dist-electron/*.exe
          dist-electron/latest.yml
        if-no-files-found: error
        retention-days: 30
```

### Task 5: Create `scripts/release.js` trigger script

**File**: `scripts/release.js` (Node.js for cross-platform compatibility, consistent with all other scripts in `scripts/`)

```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release.js <version>');
  console.error('Example: node scripts/release.js 0.1.0');
  process.exit(1);
}

// Strip leading 'v' if present
const cleanVersion = version.replace(/^v/, '');

// Validate semver format
if (!/^\d+\.\d+\.\d+/.test(cleanVersion)) {
  console.error(`Invalid version format: ${cleanVersion}`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

console.log(`Releasing v${cleanVersion} (was ${pkg.version})...`);

// Update version
pkg.version = cleanVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Commit, tag, push
execSync('git add package.json', { cwd: rootDir, stdio: 'inherit' });
execSync(`git commit -m "release: v${cleanVersion}"`, { cwd: rootDir, stdio: 'inherit' });
execSync(`git tag v${cleanVersion}`, { cwd: rootDir, stdio: 'inherit' });
execSync('git push origin HEAD --follow-tags', { cwd: rootDir, stdio: 'inherit' });

console.log(`\nRelease v${cleanVersion} triggered!`);
console.log('Watch progress at: https://github.com/parsakhaz/foozol/actions');
```

Uses `git push origin HEAD --follow-tags` to respect current branch (works from `main` or `release/*` branches).

## Validation Gates

1. `pnpm lint` passes (no TS changes)
2. Verify YAML syntax of both workflow files
3. Verify `build-win.js` `--publish` flag works by reading argument parsing logic
4. Test `scripts/release.js` with `node scripts/release.js --help` (should show usage)

## Files to Modify

1. `package.json` — Add release/canary scripts for Windows + release trigger
2. `scripts/build-win.js` — Add `--publish` flag support
3. `.github/workflows/release.yml` — Restructure to 3 separate jobs (macOS, Linux, Windows)
4. `.github/workflows/build.yml` — Add Windows canary job

## Files to Create

1. `scripts/release.js` — Cross-platform release trigger script

## Deprecated Code to Remove

None — this is purely additive.
