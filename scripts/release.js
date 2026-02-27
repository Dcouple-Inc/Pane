#!/usr/bin/env node
/**
 * Release script for Pane
 *
 * IMPORTANT: Before running this script, make sure to merge main into release:
 *   git checkout release
 *   git merge main --no-edit
 *   git push origin release
 *
 * Then run this script from main branch:
 *   pnpm run release patch|minor|major|<version>
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/release.js <patch|minor|major|version>');
  console.error('Examples:');
  console.error('  node scripts/release.js patch   # 0.0.2 -> 0.0.3');
  console.error('  node scripts/release.js minor   # 0.0.2 -> 0.1.0');
  console.error('  node scripts/release.js major   # 0.0.2 -> 1.0.0');
  console.error('  node scripts/release.js 0.1.0   # explicit version');
  process.exit(1);
}

let cleanVersion;

if (['patch', 'minor', 'major'].includes(input)) {
  const parts = pkg.version.split('.').map(Number);
  if (input === 'patch') {
    parts[2]++;
  } else if (input === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else if (input === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  }
  cleanVersion = parts.join('.');
} else {
  cleanVersion = input.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(cleanVersion)) {
    console.error(`Invalid version format: ${cleanVersion}`);
    process.exit(1);
  }
}

console.log(`Releasing v${cleanVersion} (was ${pkg.version})...`);

// Update version
pkg.version = cleanVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Commit, tag, push
execSync('git add package.json', { cwd: rootDir, stdio: 'inherit' });
try {
  execSync(`git commit -m "release: v${cleanVersion}"`, { cwd: rootDir, stdio: 'inherit' });
} catch {
  console.log('No version change to commit, continuing with tag...');
}
execSync(`git tag v${cleanVersion}`, { cwd: rootDir, stdio: 'inherit' });
execSync('git push origin HEAD', { cwd: rootDir, stdio: 'inherit' });
execSync(`git push origin v${cleanVersion}`, { cwd: rootDir, stdio: 'inherit' });

console.log(`\nRelease v${cleanVersion} triggered!`);
console.log('Watch progress at: https://github.com/Dcouple-Inc/Pane/actions');
