#!/usr/bin/env node

/**
 * pane-run-script.js
 *
 * Intelligent dev server launcher for Pane with git worktree support.
 *
 * Features:
 * - Auto-detects git worktrees vs main repo
 * - Assigns unique ports using hash(cwd) % 1000 + base_port
 * - Checks port availability, auto-increments if in use
 * - Auto-detects if deps need installing (package.json mtime > node_modules mtime)
 * - Auto-detects if build is stale (src mtime > dist mtime)
 * - Clean Ctrl+C termination (taskkill on Windows, SIGTERM on Unix)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const net = require('net');
const crypto = require('crypto');

const BASE_PORT = 4521;
const WORKTREE_PORT_OFFSET = 1000; // Worktrees start at 5521+
const MAX_PORT_ATTEMPTS = 100;

/**
 * Find the git root directory by traversing upwards
 */
function findGitRoot(dir) {
  let currentDir = dir;

  while (currentDir !== path.parse(currentDir).root) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error('Not in a git repository');
}

/**
 * Check if current directory is a git worktree
 */
function isWorktree(projectRoot) {
  const gitPath = path.join(projectRoot, '.git');

  if (!fs.existsSync(gitPath)) {
    return false;
  }

  const stats = fs.statSync(gitPath);

  // If .git is a file, this is a worktree
  if (stats.isFile()) {
    const gitContent = fs.readFileSync(gitPath, 'utf8');
    // Parse 'gitdir: path/to/main/repo/.git/worktrees/name'
    const match = gitContent.match(/^gitdir:\s*(.+)$/m);
    if (match) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate a unique port based on directory path hash
 * Main repo uses BASE_PORT (4521), worktrees use 5521-6520 range
 */
function calculatePort(dirPath, isWorktreeDir) {
  if (!isWorktreeDir) {
    // Main repo always uses BASE_PORT
    return BASE_PORT;
  }
  // Worktrees get a unique port in the 5521-6520 range
  const hash = crypto.createHash('md5').update(dirPath).digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  return BASE_PORT + WORKTREE_PORT_OFFSET + (hashInt % 1000);
}

/**
 * Check if a port is available
 */
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Find the next available port starting from the given port
 */
async function findNextAvailablePort(startPort) {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find available port after ${MAX_PORT_ATTEMPTS} attempts`);
}

/**
 * Get the most recent modification time recursively
 */
function getMostRecentMtime(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let maxMtime = 0;

  function traverse(currentPath) {
    const stats = fs.statSync(currentPath);

    if (stats.isFile()) {
      maxMtime = Math.max(maxMtime, stats.mtimeMs);
    } else if (stats.isDirectory()) {
      const entries = fs.readdirSync(currentPath);
      for (const entry of entries) {
        // Skip node_modules and .git
        if (entry === 'node_modules' || entry === '.git') {
          continue;
        }
        traverse(path.join(currentPath, entry));
      }
    }
  }

  traverse(dirPath);
  return maxMtime;
}

/**
 * Check if dependencies need to be installed
 */
function needsInstall(root) {
  const nodeModulesPath = path.join(root, 'node_modules');
  const packageJsonPath = path.join(root, 'package.json');

  // If node_modules doesn't exist, we need to install
  if (!fs.existsSync(nodeModulesPath)) {
    return true;
  }

  // Check if package.json is newer than node_modules
  const packageJsonStats = fs.statSync(packageJsonPath);
  const nodeModulesStats = fs.statSync(nodeModulesPath);

  return packageJsonStats.mtimeMs > nodeModulesStats.mtimeMs;
}

/**
 * Check if native modules need rebuilding for Electron
 * This checks if the better-sqlite3 binary exists and has a recent rebuild marker
 */
function needsNativeRebuild(root) {
  // Look for our rebuild marker file
  const markerPath = path.join(root, 'node_modules', '.electron-rebuild-marker');

  if (!fs.existsSync(markerPath)) {
    return true;
  }

  // Check if package.json changed since last rebuild
  const packageJsonPath = path.join(root, 'package.json');
  const packageJsonStats = fs.statSync(packageJsonPath);
  const markerStats = fs.statSync(markerPath);

  return packageJsonStats.mtimeMs > markerStats.mtimeMs;
}

/**
 * Create marker file after successful native rebuild
 */
function markNativeRebuildComplete(root) {
  const markerPath = path.join(root, 'node_modules', '.electron-rebuild-marker');
  fs.writeFileSync(markerPath, new Date().toISOString());
}

/**
 * Check if build is needed
 */
function needsBuild(root) {
  const distPath = path.join(root, 'main', 'dist');
  const srcPath = path.join(root, 'main', 'src');

  // If dist doesn't exist, we need to build
  if (!fs.existsSync(distPath)) {
    return true;
  }

  // Get most recent source file modification time
  const srcMtime = getMostRecentMtime(srcPath);
  const distMtime = getMostRecentMtime(distPath);

  return srcMtime > distMtime;
}

/**
 * Execute a command with proper error handling
 */
function execCommand(command, cwd) {
  console.log(`\n📦 Running: ${command}`);
  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      shell: true
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

/**
 * Kill process tree on Windows
 */
function killProcessWindows(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch (error) {
    // Ignore errors - process might already be dead
  }
}

/**
 * Kill process tree on Unix
 */
function killProcessUnix(pid) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    // Ignore errors - process might already be dead
  }
}

/**
 * Main execution
 */
async function main() {
  const cwd = process.cwd();

  console.log('🚀 pane-run-script.js starting...\n');

  // Find git root
  let projectRoot;
  try {
    projectRoot = findGitRoot(cwd);
    console.log(`📁 Project root: ${projectRoot}`);
  } catch (error) {
    console.error('❌ Error: Not in a git repository');
    process.exit(1);
  }

  // Check if this is a worktree
  const worktree = isWorktree(projectRoot);
  console.log(`🌲 Git worktree: ${worktree ? 'YES' : 'NO (main repo)'}`);

  // Calculate unique port (worktrees get offset range to avoid conflicts)
  let port = calculatePort(projectRoot, worktree);
  console.log(`🔢 Calculated port: ${port}${worktree ? ' (worktree range)' : ' (main repo)'}`);

  // Check port availability
  const portAvailable = await checkPortAvailable(port);
  if (!portAvailable) {
    console.log(`⚠️  Port ${port} is in use, finding next available...`);
    port = await findNextAvailablePort(port);
    console.log(`✅ Using port: ${port}`);
  } else {
    console.log(`✅ Port ${port} is available`);
  }

  // Check if we need to install dependencies
  if (needsInstall(projectRoot)) {
    console.log('\n📦 Dependencies out of date, installing...');
    execCommand('pnpm install', projectRoot);

    // Rebuild native modules for Electron (critical for better-sqlite3, node-pty, etc.)
    console.log('\n🔧 Rebuilding native modules for Electron...');
    execCommand('npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers', projectRoot);
    markNativeRebuildComplete(projectRoot);
  } else if (needsNativeRebuild(projectRoot)) {
    // Dependencies are installed but native modules need rebuild
    console.log('\n🔧 Native modules need rebuilding for Electron...');
    execCommand('npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers', projectRoot);
    markNativeRebuildComplete(projectRoot);
  } else {
    console.log('\n✅ Dependencies and native modules up to date');
  }

  // Check if we need to build
  if (needsBuild(projectRoot)) {
    console.log('\n🔨 Build out of date, building main process...');
    execCommand('pnpm build:main', projectRoot);
  } else {
    console.log('\n✅ Build up to date');
  }

  // Set up environment
  const env = {
    ...process.env,
    PORT: port.toString(),
    VITE_PORT: port.toString()
  };

  console.log('\n🎬 Starting dev server...\n');
  console.log('─'.repeat(50));

  const isWindows = process.platform === 'win32';
  const children = [];

  // 1. Start TypeScript watcher for main process
  const tscWatch = spawn('pnpm', ['run', '--filter', 'main', 'dev'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true
  });
  children.push(tscWatch);
  console.log('[tsc] TypeScript watch started');

  // 2. Start Vite dev server with the correct port
  const vite = spawn('pnpm', ['run', '--filter', 'frontend', 'dev', '--', '--port', port.toString()], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true
  });
  children.push(vite);
  console.log(`[vite] Frontend dev server starting on port ${port}`);

  // 3. Wait for Vite to be ready, then launch Electron
  const waitAndLaunch = spawn('npx', ['wait-on', `http-get://localhost:${port}`, '&&', 'npx', 'electron', '.'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true
  });
  children.push(waitAndLaunch);
  console.log(`[electron] Waiting for http-get://localhost:${port} then launching Electron`);

  // Handle cleanup on exit
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    console.log('\n\n🛑 Shutting down dev server...');

    for (const child of children) {
      if (child.pid) {
        if (isWindows) {
          killProcessWindows(child.pid);
        } else {
          killProcessUnix(child.pid);
        }
      }
    }

    process.exit(0);
  };

  // Register cleanup handlers
  process.on('SIGINT', cleanup);  // Ctrl+C
  process.on('SIGTERM', cleanup); // Kill command

  // If any critical process exits, shut everything down
  vite.on('exit', (code) => {
    if (code !== 0) {
      console.log(`\n📋 Vite exited with code ${code}`);
      cleanup();
    }
  });
  waitAndLaunch.on('exit', (code) => {
    console.log(`\n📋 Electron exited with code ${code}`);
    cleanup();
  });
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
