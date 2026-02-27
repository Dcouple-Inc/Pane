import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { getShellPath } from '../utils/shellPath';
import { withLock } from '../utils/mutex';
import { escapeShellArg } from '../utils/shellEscape';
import type { ConfigManager } from './configManager';
import type { AnalyticsManager } from './analyticsManager';
import { WSLContext, posixJoin, wrapCommandForWSL, getWSLContextFromProject } from '../utils/wslUtils';
import { GIT_ATTRIBUTION_ENV } from '../utils/attribution';

// Interface for raw commit data
interface RawCommitData {
  hash: string;
  message: string;
  date: string | Date;
  author?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

const execAsync = promisify(exec);

// Wrapper for execAsync that includes enhanced PATH
async function execWithShellPath(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  const shellPath = getShellPath();
  return execAsync(command, {
    ...options,
    env: {
      ...process.env,
      ...GIT_ATTRIBUTION_ENV,
      PATH: shellPath
    }
  });
}

// WSL-aware exec helper
async function execForProject(command: string, cwd: string, wslContext?: WSLContext | null): Promise<{ stdout: string; stderr: string }> {
  if (wslContext) {
    const wrappedCommand = wrapCommandForWSL(command, wslContext.distribution, cwd);
    return execAsync(wrappedCommand, {
      env: { ...process.env, ...GIT_ATTRIBUTION_ENV, PATH: getShellPath() }
    });
  }
  return execWithShellPath(command, { cwd });
}

export class WorktreeManager {
  private projectsCache: Map<string, { baseDir: string }> = new Map();

  constructor(
    private configManager?: ConfigManager,
    private analyticsManager?: AnalyticsManager
  ) {
    // No longer initialized with a single repo path
  }

  private getProjectPaths(projectPath: string, worktreeFolder?: string, wslContext?: WSLContext | null) {
    const cacheKey = `${projectPath}:${worktreeFolder || 'worktrees'}`;
    if (!this.projectsCache.has(cacheKey)) {
      const folderName = worktreeFolder || 'worktrees';
      let baseDir: string;

      if (wslContext) {
        if (worktreeFolder && worktreeFolder.startsWith('/')) {
          baseDir = worktreeFolder;
        } else {
          baseDir = posixJoin(projectPath, folderName);
        }
      } else {
        // Check if worktreeFolder is an absolute path
        if (worktreeFolder && (worktreeFolder.startsWith('/') || worktreeFolder.includes(':'))) {
          baseDir = worktreeFolder;
        } else {
          baseDir = join(projectPath, folderName);
        }
      }

      this.projectsCache.set(cacheKey, { baseDir });
    }
    return this.projectsCache.get(cacheKey)!;
  }

  async initializeProject(projectPath: string, worktreeFolder?: string, wslContext?: WSLContext | null): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder, wslContext);
    try {
      if (wslContext) {
        await execForProject(`mkdir -p '${baseDir}'`, baseDir, wslContext);
      } else {
        await mkdir(baseDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create worktrees directory:', error);
    }
  }

  async createWorktree(projectPath: string, name: string, branch?: string, baseBranch?: string, worktreeFolder?: string, wslContext?: WSLContext | null): Promise<{ worktreePath: string; baseCommit: string; baseBranch: string }> {
    return await withLock(`worktree-create-${projectPath}-${name}`, async () => {

      const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder, wslContext);
      const worktreePath = wslContext ? posixJoin(baseDir, name) : join(baseDir, name);
      const branchName = branch || name;
    

    try {
      // First check if this is a git repository
      let isGitRepo = false;
      try {
        await execForProject(`git rev-parse --is-inside-work-tree`, projectPath, wslContext);
        isGitRepo = true;
      } catch (error) {
        // Initialize git repository
        await execForProject(`git init`, projectPath, wslContext);
      }

      // Clean up any existing worktree directory first
      try {
        // Use cross-platform approach without shell redirection
        try {
          await execForProject(`git worktree remove "${worktreePath}" --force`, projectPath, wslContext);
        } catch {
          // Ignore cleanup errors
        }
      } catch {
        // Ignore cleanup errors
      }

      // Check if the repository has any commits
      let hasCommits = false;
      try {
        await execForProject(`git rev-parse HEAD`, projectPath, wslContext);
        hasCommits = true;
      } catch (error) {
        // Repository has no commits yet, create initial commit
        // Use cross-platform approach without shell operators
        try {
          await execForProject(`git add -A`, projectPath, wslContext);
        } catch {
          // Ignore add errors (no files to add)
        }
        await execForProject(`git commit -m "Initial commit" --allow-empty`, projectPath, wslContext);
        hasCommits = true;
      }

      // Check if branch already exists
      const checkBranchCmd = `git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execForProject(checkBranchCmd, projectPath, wslContext);
        branchExists = true;
      } catch {
        // Branch doesn't exist, will create it
      }

      // Capture the base commit before creating worktree
      let baseCommit: string;
      let actualBaseBranch: string;

      if (branchExists) {
        // Use existing branch
        await execForProject(`git worktree add "${worktreePath}" ${branchName}`, projectPath, wslContext);

        // Get the commit this branch is based on
        baseCommit = (await execForProject(`git rev-parse ${branchName}`, projectPath, wslContext)).stdout.trim();
        actualBaseBranch = branchName;
      } else {
        // Create new branch from specified base branch (or current HEAD if not specified)
        const baseRef = baseBranch || 'HEAD';
        actualBaseBranch = baseBranch || 'HEAD';

        // Check if baseBranch is a remote branch (e.g., origin/main)
        const isRemoteBranch = baseBranch && baseBranch.startsWith('origin/');

        // Verify that the base branch exists if specified
        if (baseBranch) {
          try {
            // Use git rev-parse which works for both local and remote refs
            await execForProject(`git rev-parse --verify ${baseBranch}`, projectPath, wslContext);
          } catch {
            throw new Error(`Base branch '${baseBranch}' does not exist`);
          }
        }

        // Capture the base commit before creating the worktree
        baseCommit = (await execForProject(`git rev-parse ${baseRef}`, projectPath, wslContext)).stdout.trim();

        if (isRemoteBranch) {
          // Use --track flag for remote branches to set up tracking automatically
          await execForProject(`git worktree add -b ${branchName} --track "${worktreePath}" ${baseBranch}`, projectPath, wslContext);

          // Verify tracking was set (for debugging)
          try {
            const { stdout: trackingInfo } = await execForProject(`git branch -vv`, worktreePath, wslContext);
            console.log(`[WorktreeManager] Branch tracking set:`, trackingInfo.trim());
          } catch {
            // Ignore verification errors
          }
        } else {
          // Existing logic for local branches (no tracking)
          await execForProject(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`, projectPath, wslContext);
        }
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);

      // Track worktree creation
      if (this.analyticsManager) {
        this.analyticsManager.track('git_worktree_created', {
          branch_existed: branchExists
        });
      }

      return { worktreePath, baseCommit, baseBranch: actualBaseBranch };
      } catch (error) {
        console.error(`[WorktreeManager] Failed to create worktree:`, error);
        throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async removeWorktree(projectPath: string, name: string, worktreeFolder?: string, sessionCreatedAt?: Date, wslContext?: WSLContext | null): Promise<void> {
    return await withLock(`worktree-remove-${projectPath}-${name}`, async () => {
      const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder, wslContext);
      const worktreePath = wslContext ? posixJoin(baseDir, name) : join(baseDir, name);

      try {
        await execForProject(`git worktree remove "${worktreePath}" --force`, projectPath, wslContext);

        // Track worktree cleanup
        if (this.analyticsManager && sessionCreatedAt) {
          const sessionAgeDays = Math.floor((Date.now() - sessionCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
          this.analyticsManager.track('git_worktree_cleaned', {
            session_age_days: sessionAgeDays
          });
        }
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        const errorMessage = err.stderr || err.stdout || err.message || String(err);

        // If the worktree is not found, that's okay - it might have been manually deleted
        if (errorMessage.includes('is not a working tree') ||
            errorMessage.includes('does not exist') ||
            errorMessage.includes('No such file or directory')) {
          console.log(`Worktree ${worktreePath} already removed or doesn't exist, skipping...`);
          return;
        }

        // For other errors, still throw
        throw new Error(`Failed to remove worktree: ${errorMessage}`);
      }
    });
  }

  async listWorktrees(projectPath: string, wslContext?: WSLContext | null): Promise<Array<{ path: string; branch: string }>> {
    try {
      const { stdout } = await execForProject(`git worktree list --porcelain`, projectPath, wslContext);
      
      const worktrees: Array<{ path: string; branch: string }> = [];
      const lines = stdout.split('\n');
      
      let currentWorktree: { path?: string; branch?: string } = {};
      
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path && currentWorktree.branch) {
            worktrees.push({ 
              path: currentWorktree.path, 
              branch: currentWorktree.branch 
            });
          }
          currentWorktree = { path: line.substring(9) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
        }
      }
      
      if (currentWorktree.path && currentWorktree.branch) {
        worktrees.push({ 
          path: currentWorktree.path, 
          branch: currentWorktree.branch 
        });
      }
      
      return worktrees;
    } catch (error) {
      throw new Error(`Failed to list worktrees: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listBranches(projectPath: string, wslContext?: WSLContext | null): Promise<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }>> {
    try {
      // Fetch latest from all remotes (silent, catch errors)
      try {
        await execForProject(`git fetch --all --prune`, projectPath, wslContext);
      } catch {
        // Ignore fetch errors - user may be offline
      }

      // Get all local branches
      const { stdout: localOutput } = await execForProject(`git branch`, projectPath, wslContext);

      // Get remote branches
      let remoteOutput = '';
      try {
        const result = await execForProject(`git branch -r`, projectPath, wslContext);
        remoteOutput = result.stdout;
      } catch {
        // Ignore remote branch errors - repo may not have remotes
      }

      // Get all worktrees to identify which branches have worktrees
      const worktrees = await this.listWorktrees(projectPath, wslContext);
      const worktreeBranches = new Set(worktrees.map(w => w.branch));

      // Parse local branches
      const localBranches: Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }> = [];
      const localLines = localOutput.split('\n').filter(line => line.trim());

      for (const line of localLines) {
        const isCurrent = line.startsWith('*');
        // Remove leading *, +, and spaces. The + indicates uncommitted changes
        const name = line.replace(/^[\*\+]?\s*[\+]?\s*/, '').trim();
        if (name) {
          localBranches.push({
            name,
            isCurrent,
            hasWorktree: worktreeBranches.has(name),
            isRemote: false
          });
        }
      }

      // Parse remote branches
      const remoteBranches: Array<{ name: string; isCurrent: boolean; hasWorktree: boolean; isRemote: boolean }> = remoteOutput
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.includes('HEAD ->')) // Filter out "HEAD -> origin/main"
        .map(name => ({
          name,
          isCurrent: false,
          hasWorktree: false, // Remote branches never have worktrees directly
          isRemote: true
        }));

      // Sort: remotes first (alphabetically), then locals (worktrees first, then alphabetically)
      return [
        ...remoteBranches.sort((a, b) => a.name.localeCompare(b.name)),
        ...localBranches.sort((a, b) => {
          if (a.hasWorktree !== b.hasWorktree) return a.hasWorktree ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
      ];
    } catch (error) {
      console.error(`[WorktreeManager] Error listing branches:`, error);
      return [];
    }
  }

  async getProjectMainBranch(projectPath: string, wslContext?: WSLContext | null): Promise<string> {

    try {
      // ONLY check the current branch in the project root directory
      const currentBranchResult = await execForProject(`git branch --show-current`, projectPath, wslContext);
      const currentBranch = currentBranchResult.stdout.trim();
      
      if (currentBranch) {
        return currentBranch;
      }
      
      // Throw error if we're in detached HEAD state
      throw new Error(`Cannot determine main branch: repository at ${projectPath} is in detached HEAD state`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('detached HEAD')) {
        throw error;
      }
      throw new Error(`Failed to get main branch for project at ${projectPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Deprecated: Use getProjectMainBranch instead
  async detectMainBranch(projectPath: string): Promise<string> {
    console.warn('[WorktreeManager] detectMainBranch is deprecated, use getProjectMainBranch instead');
    return await this.getProjectMainBranch(projectPath);
  }

  // Deprecated: Use getProjectMainBranch instead
  async getEffectiveMainBranch(project: { path: string; main_branch?: string }): Promise<string> {
    console.warn('[WorktreeManager] getEffectiveMainBranch is deprecated, use getProjectMainBranch instead');
    return await this.getProjectMainBranch(project.path);
  }

  async hasChangesToRebase(worktreePath: string, mainBranch: string, wslContext?: WSLContext | null): Promise<boolean> {
    try {
      // Check if main branch has commits that the current branch doesn't have
      // Use cross-platform approach
      let stdout = '0';
      try {
        const result = await execForProject(`git rev-list --count HEAD..${mainBranch}`, worktreePath, wslContext);
        stdout = result.stdout;
      } catch {
        // Error checking, assume no changes
        stdout = '0';
      }
      const commitCount = parseInt(stdout.trim());
      return commitCount > 0;
    } catch (error) {
      console.error(`[WorktreeManager] Error checking for changes to rebase:`, error);
      return false;
    }
  }

  async checkForRebaseConflicts(worktreePath: string, mainBranch: string, wslContext?: WSLContext | null): Promise<{
    hasConflicts: boolean;
    conflictingFiles?: string[];
    conflictingCommits?: { ours: string[]; theirs: string[] };
    canAutoMerge?: boolean;
  }> {
    try {

      // First check if there are any changes to rebase
      const hasChanges = await this.hasChangesToRebase(worktreePath, mainBranch, wslContext);
      if (!hasChanges) {
        return { hasConflicts: false, canAutoMerge: true };
      }

      // Get the merge base
      const { stdout: mergeBase } = await execForProject(
        `git merge-base HEAD ${mainBranch}`,
        worktreePath,
        wslContext
      );
      const base = mergeBase.trim();

      // Try a dry-run merge to detect conflicts
      // We use merge-tree to check for conflicts without modifying the working tree
      try {
        const { stdout: mergeTreeOutput } = await execForProject(
          `git merge-tree ${base} HEAD ${mainBranch}`,
          worktreePath,
          wslContext
        );
        
        // Parse merge-tree output for conflicts
        const conflictMarkers = mergeTreeOutput.match(/<<<<<<< /g);
        const hasConflicts = conflictMarkers && conflictMarkers.length > 0;
        
        if (hasConflicts) {
          // Get list of files that would conflict
          const { stdout: diffOutput } = await execForProject(
            `git diff --name-only ${base}...HEAD`,
            worktreePath,
            wslContext
          );
          const ourFiles = diffOutput.trim().split('\n').filter(f => f);

          const { stdout: theirDiffOutput } = await execForProject(
            `git diff --name-only ${base}...${mainBranch}`,
            worktreePath,
            wslContext
          );
          const theirFiles = theirDiffOutput.trim().split('\n').filter(f => f);

          // Find files modified in both branches
          const conflictingFiles = ourFiles.filter(f => theirFiles.includes(f));

          // Get commit info for better error reporting
          const { stdout: ourCommits } = await execForProject(
            `git log --oneline ${base}..HEAD`,
            worktreePath,
            wslContext
          );
          const { stdout: theirCommits } = await execForProject(
            `git log --oneline ${base}..${mainBranch}`,
            worktreePath,
            wslContext
          );
          
          console.log(`[WorktreeManager] Found conflicts in files: ${conflictingFiles.join(', ')}`);
          
          return {
            hasConflicts: true,
            conflictingFiles,
            conflictingCommits: {
              ours: ourCommits.trim().split('\n').filter(c => c),
              theirs: theirCommits.trim().split('\n').filter(c => c)
            },
            canAutoMerge: false
          };
        }
        
        return { hasConflicts: false, canAutoMerge: true };
        
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        // If merge-tree is not available (older git), fall back to checking modified files
        console.log(`[WorktreeManager] merge-tree not available, using fallback conflict detection`);
        
        // Get files changed in both branches
        const { stdout: diffOutput } = await execForProject(
          `git diff --name-only ${base}...HEAD`,
          worktreePath,
          wslContext
        );
        const ourFiles = diffOutput.trim().split('\n').filter(f => f);

        const { stdout: theirDiffOutput } = await execForProject(
          `git diff --name-only ${base}...${mainBranch}`,
          worktreePath,
          wslContext
        );
        const theirFiles = theirDiffOutput.trim().split('\n').filter(f => f);

        // Find files modified in both branches (potential conflicts)
        const conflictingFiles = ourFiles.filter(f => theirFiles.includes(f));

        if (conflictingFiles.length > 0) {
          // Get commit info
          const { stdout: ourCommits } = await execForProject(
            `git log --oneline ${base}..HEAD`,
            worktreePath,
            wslContext
          );
          const { stdout: theirCommits } = await execForProject(
            `git log --oneline ${base}..${mainBranch}`,
            worktreePath,
            wslContext
          );
          
          console.log(`[WorktreeManager] Potential conflicts in files: ${conflictingFiles.join(', ')}`);
          
          return {
            hasConflicts: true,
            conflictingFiles,
            conflictingCommits: {
              ours: ourCommits.trim().split('\n').filter(c => c),
              theirs: theirCommits.trim().split('\n').filter(c => c)
            },
            canAutoMerge: false
          };
        }
        
        return { hasConflicts: false, canAutoMerge: true };
      }
    } catch (error: unknown) {
      console.error(`[WorktreeManager] Error checking for rebase conflicts:`, error);
      // On error, return unknown status
      return { 
        hasConflicts: false, 
        canAutoMerge: false 
      };
    }
  }

  async rebaseMainIntoWorktree(worktreePath: string, mainBranch: string, wslContext?: WSLContext | null): Promise<void> {
    return await withLock(`git-rebase-${worktreePath}`, async () => {
      const executedCommands: string[] = [];
      let lastOutput = '';
      const startTime = Date.now();
      let conflictOccurred = false;

      try {
        // Rebase the current worktree branch onto local main branch
        const command = `git rebase ${mainBranch}`;
        executedCommands.push(`${command} (in ${worktreePath})`);
        const rebaseResult = await execForProject(command, worktreePath, wslContext);
        lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';

        // Track successful rebase
        if (this.analyticsManager) {
          const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
          this.analyticsManager.track('git_rebase_executed', {
            success: true,
            duration_seconds: durationSeconds,
            conflict_occurred: false
          });
        }
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        console.error(`[WorktreeManager] Failed to rebase ${mainBranch} into worktree:`, err);

        // Check if conflict occurred
        const errorOutput = err.stderr || err.stdout || err.message || '';
        conflictOccurred = errorOutput.includes('CONFLICT');

        // Track failed rebase
        if (this.analyticsManager) {
          const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
          this.analyticsManager.track('git_rebase_executed', {
            success: false,
            duration_seconds: durationSeconds,
            conflict_occurred: conflictOccurred
          });

          // Track operation failure
          const errorCategory = conflictOccurred ? 'conflict' : 'unknown';
          this.analyticsManager.track('git_operation_failed', {
            operation_type: 'rebase_from_main',
            error_category: errorCategory
          });
        }

        // Create detailed error with git command output
        const gitError = new Error(`Failed to rebase ${mainBranch} into worktree`) as Error & {
          gitCommand?: string;
          gitOutput?: string;
          workingDirectory?: string;
          originalError?: Error;
        };
        gitError.gitCommand = executedCommands.join(' && ');
        gitError.gitOutput = err.stderr || err.stdout || lastOutput || err.message || '';
        gitError.workingDirectory = worktreePath;
        gitError.originalError = err;

        throw gitError;
      }
    });
  }

  async abortRebase(worktreePath: string, wslContext?: WSLContext | null): Promise<void> {
    try {
      // Check if we're in the middle of a rebase
      const statusCommand = `git status --porcelain=v1`;
      const { stdout: statusOut } = await execForProject(statusCommand, worktreePath, wslContext);

      // Abort the rebase
      const command = `git rebase --abort`;
      const { stdout, stderr } = await execForProject(command, worktreePath, wslContext);
      
      if (stderr && !stderr.includes('No rebase in progress')) {
        throw new Error(`Failed to abort rebase: ${stderr}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[WorktreeManager] Error aborting rebase:`, err);
      throw new Error(`Failed to abort rebase: ${err.message}`);
    }
  }

  async squashAndMergeWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string, commitMessage: string, wslContext?: WSLContext | null): Promise<void> {
    return await withLock(`git-squash-merge-${worktreePath}`, async () => {
      const executedCommands: string[] = [];
      let lastOutput = '';
      const startTime = Date.now();

      try {
        console.log(`[WorktreeManager] Squashing and merging worktree to ${mainBranch}: ${worktreePath}`);

        // Get current branch name in worktree
        let command = `git branch --show-current`;
        executedCommands.push(`git branch --show-current (in ${worktreePath})`);
        const { stdout: currentBranch, stderr: stderr1 } = await execForProject(command, worktreePath, wslContext);
        lastOutput = currentBranch || stderr1 || '';
        const branchName = currentBranch.trim();

        // Get the base commit (where the worktree branch diverged from main)
        command = `git merge-base ${mainBranch} HEAD`;
        executedCommands.push(`git merge-base ${mainBranch} HEAD (in ${worktreePath})`);
        const { stdout: baseCommit, stderr: stderr2 } = await execForProject(command, worktreePath, wslContext);
        lastOutput = baseCommit || stderr2 || '';
        const base = baseCommit.trim();

        // Check if there are any changes to squash
        command = `git log --oneline ${base}..HEAD`;
        const { stdout: commits, stderr: stderr3 } = await execForProject(command, worktreePath, wslContext);
        lastOutput = commits || stderr3 || '';
        if (!commits.trim()) {
          throw new Error(`No commits to squash. The branch is already up to date with ${mainBranch}.`);
        }

        // SAFETY CHECK 1: Rebase worktree onto main FIRST before squashing
        command = `git rebase ${mainBranch}`;
        executedCommands.push(`git rebase ${mainBranch} (in ${worktreePath})`);
        try {
          const rebaseWorktreeResult = await execForProject(command, worktreePath, wslContext);
          lastOutput = rebaseWorktreeResult.stdout || rebaseWorktreeResult.stderr || '';
          console.log(`[WorktreeManager] Successfully rebased worktree onto ${mainBranch} before squashing`);
        } catch (error: unknown) {
          const err = error as Error & { stderr?: string; stdout?: string };
          // If rebase fails, abort it in the worktree
          try {
            await execForProject(`git rebase --abort`, worktreePath, wslContext);
          } catch {
            // Ignore abort errors
          }

          throw new Error(
            `Failed to rebase worktree onto ${mainBranch} before squashing. Conflicts must be resolved first.\n\n` +
            `Git output: ${err.stderr || err.stdout || err.message}`
          );
        }

        // Now squash all commits since base into one
        command = `git reset --soft ${base}`;
        executedCommands.push(`git reset --soft ${base} (in ${worktreePath})`);
        const resetResult = await execForProject(command, worktreePath, wslContext);
        lastOutput = resetResult.stdout || resetResult.stderr || '';

        // Get config to check if foozol footer is enabled (default: true)
        const config = this.configManager?.getConfig();
        const enableCommitFooter = config?.enableCommitFooter !== false;

        // Add foozol footer if enabled
        const fullMessage = enableCommitFooter ? `${commitMessage}

Co-Authored-By: Pane <runpane@users.noreply.github.com>` : commitMessage;

        // Properly escape commit message for cross-platform compatibility
        const escapedMessage = fullMessage.replace(/"/g, '\\"');
        command = `git commit -m "${escapedMessage}"`;
        executedCommands.push(`git commit -m "..." (in ${worktreePath})`);
        const commitResult = await execForProject(command, worktreePath, wslContext);
        lastOutput = commitResult.stdout || commitResult.stderr || '';

        // Switch to main branch in the main repository
        command = `git checkout ${mainBranch}`;
        executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
        const checkoutResult = await execForProject(command, projectPath, wslContext);
        lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';

        // SAFETY CHECK 2: Use --ff-only merge to prevent history rewriting
        // This will fail if local main has diverged from the worktree branch
        command = `git merge --ff-only ${branchName}`;
        executedCommands.push(`git merge --ff-only ${branchName} (in ${projectPath})`);
        try {
          const mergeResult = await execForProject(command, projectPath, wslContext);
          lastOutput = mergeResult.stdout || mergeResult.stderr || '';
          console.log(`[WorktreeManager] Successfully fast-forwarded ${mainBranch} to ${branchName}`);
        } catch (error: unknown) {
          const err = error as Error & { stderr?: string; stdout?: string };
          throw new Error(
            `Failed to fast-forward ${mainBranch} to ${branchName}.\n\n` +
            `This usually means ${mainBranch} has commits that ${branchName} doesn't have.\n` +
            `You may need to rebase the worktree onto ${mainBranch} first, or reset ${mainBranch} to match origin.\n\n` +
            `Git output: ${err.stderr || err.stdout || err.message}`
          );
        }

        console.log(`[WorktreeManager] Successfully squashed and merged worktree to ${mainBranch}`);

        // Track successful squash and merge
        if (this.analyticsManager) {
          const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
          // Get commit count from the commits variable (already fetched earlier)
          const commitCount = commits.trim().split('\n').filter(Boolean).length;
          const commitCountCategory = this.analyticsManager.categorizeNumber(commitCount, [1, 3, 5, 10, 25]);

          this.analyticsManager.track('git_squash_executed', {
            success: true,
            duration_seconds: durationSeconds,
            commit_count_category: commitCountCategory
          });
        }
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        console.error(`[WorktreeManager] Failed to squash and merge worktree to ${mainBranch}:`, err);

        // Track failed squash
        if (this.analyticsManager) {
          const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
          const errorOutput = err.stderr || err.stdout || err.message || '';
          const errorCategory = errorOutput.includes('CONFLICT') ? 'conflict' :
                                errorOutput.includes('merge') ? 'merge_failed' :
                                errorOutput.includes('rebase') ? 'rebase_failed' : 'unknown';

          this.analyticsManager.track('git_squash_executed', {
            success: false,
            duration_seconds: durationSeconds,
            commit_count_category: '0-1' // Unknown on failure
          });

          this.analyticsManager.track('git_operation_failed', {
            operation_type: 'squash_and_merge',
            error_category: errorCategory
          });
        }

        // Create detailed error with git command output
        const gitError = new Error(`Failed to squash and merge worktree to ${mainBranch}`) as Error & {
          gitCommands?: string[];
          gitOutput?: string;
          workingDirectory?: string;
          projectPath?: string;
          originalError?: Error;
        };
        gitError.gitCommands = executedCommands;
        // Prioritize actual error messages over lastOutput (which may contain unrelated data like commit counts)
        gitError.gitOutput = err.stderr || err.stdout || err.message || lastOutput || '';
        gitError.workingDirectory = worktreePath;
        gitError.projectPath = projectPath;
        gitError.originalError = err;

        throw gitError;
      }
    });
  }

  async mergeWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string, wslContext?: WSLContext | null): Promise<void> {
    return await withLock(`git-merge-worktree-${worktreePath}`, async () => {
      const executedCommands: string[] = [];
      let lastOutput = '';

      try {
        console.log(`[WorktreeManager] Merging worktree to ${mainBranch} (without squashing): ${worktreePath}`);

        // Get current branch name in worktree
        let command = `git branch --show-current`;
        executedCommands.push(`git branch --show-current (in ${worktreePath})`);
        const { stdout: currentBranch, stderr: stderr1 } = await execForProject(command, worktreePath, wslContext);
        lastOutput = currentBranch || stderr1 || '';
        const branchName = currentBranch.trim();

        // Check if there are any changes to merge
        command = `git log --oneline ${mainBranch}..HEAD`;
        const { stdout: commits, stderr: stderr2 } = await execForProject(command, worktreePath, wslContext);
        lastOutput = commits || stderr2 || '';
        if (!commits.trim()) {
          throw new Error(`No commits to merge. The branch is already up to date with ${mainBranch}.`);
        }

        // SAFETY CHECK 1: Rebase worktree onto main FIRST (resolves conflicts in worktree, not main)
        command = `git rebase ${mainBranch}`;
        executedCommands.push(`git rebase ${mainBranch} (in ${worktreePath})`);
        try {
          const rebaseWorktreeResult = await execForProject(command, worktreePath, wslContext);
          lastOutput = rebaseWorktreeResult.stdout || rebaseWorktreeResult.stderr || '';
          console.log(`[WorktreeManager] Successfully rebased worktree onto ${mainBranch}`);
        } catch (error: unknown) {
          const err = error as Error & { stderr?: string; stdout?: string };
          // If rebase fails, abort it in the worktree
          try {
            await execForProject(`git rebase --abort`, worktreePath, wslContext);
          } catch {
            // Ignore abort errors
          }

          throw new Error(
            `Failed to rebase worktree onto ${mainBranch}. Conflicts must be resolved first.\n\n` +
            `Git output: ${err.stderr || err.stdout || err.message}`
          );
        }

        // Switch to main branch in the main repository
        command = `git checkout ${mainBranch}`;
        executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
        const checkoutResult = await execForProject(command, projectPath, wslContext);
        lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';

        // SAFETY CHECK 2: Use --ff-only merge to prevent history rewriting
        // This will fail if local main has diverged from the worktree branch
        command = `git merge --ff-only ${branchName}`;
        executedCommands.push(`git merge --ff-only ${branchName} (in ${projectPath})`);
        try {
          const mergeResult = await execForProject(command, projectPath, wslContext);
          lastOutput = mergeResult.stdout || mergeResult.stderr || '';
          console.log(`[WorktreeManager] Successfully fast-forwarded ${mainBranch} to ${branchName}`);
        } catch (error: unknown) {
          const err = error as Error & { stderr?: string; stdout?: string };
          throw new Error(
            `Failed to fast-forward ${mainBranch} to ${branchName}.\n\n` +
            `This usually means ${mainBranch} has commits that ${branchName} doesn't have.\n` +
            `You may need to rebase the worktree onto ${mainBranch} first, or reset ${mainBranch} to match origin.\n\n` +
            `Git output: ${err.stderr || err.stdout || err.message}`
          );
        }

        console.log(`[WorktreeManager] Successfully merged worktree to ${mainBranch} (without squashing)`);
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        console.error(`[WorktreeManager] Failed to merge worktree to ${mainBranch}:`, err);

        // Create detailed error with git command output
        const gitError = new Error(`Failed to merge worktree to ${mainBranch}`) as Error & {
          gitCommands?: string[];
          gitOutput?: string;
          workingDirectory?: string;
          projectPath?: string;
          originalError?: Error;
        };
        gitError.gitCommands = executedCommands;
        // Prioritize actual error messages over lastOutput (which may contain unrelated data like commit counts)
        gitError.gitOutput = err.stderr || err.stdout || err.message || lastOutput || '';
        gitError.workingDirectory = worktreePath;
        gitError.projectPath = projectPath;
        gitError.originalError = err;

        throw gitError;
      }
    });
  }

  generateRebaseCommands(mainBranch: string): string[] {
    return [
      `git rebase ${mainBranch}`
    ];
  }

  generateSquashCommands(mainBranch: string, branchName: string): string[] {
    return [
      `# In worktree: Rebase onto ${mainBranch} to get latest changes`,
      `git rebase ${mainBranch}`,
      `# In worktree: Squash all commits into one`,
      `git reset --soft $(git merge-base ${mainBranch} HEAD)`,
      `git commit -m "Your commit message"`,
      `# In main repo: Switch to ${mainBranch}`,
      `git checkout ${mainBranch}`,
      `# In main repo: Merge the worktree branch`,
      `git merge --ff-only ${branchName}`
    ];
  }

  generateMergeCommands(mainBranch: string, branchName: string): string[] {
    return [
      `# In worktree: Rebase onto ${mainBranch} to get latest changes`,
      `git rebase ${mainBranch}`,
      `# In main repo: Switch to ${mainBranch}`,
      `git checkout ${mainBranch}`,
      `# In main repo: Merge the worktree branch`,
      `git merge --ff-only ${branchName}`
    ];
  }

  async gitPull(worktreePath: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      const { stdout, stderr } = await execForProject('git pull', worktreePath, wslContext);
      const output = stdout || stderr || 'Pull completed successfully';
      
      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git pull failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async gitPush(worktreePath: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      // Check if branch has an upstream configured
      let hasUpstream = false;
      try {
        await execForProject('git rev-parse --abbrev-ref --symbolic-full-name @{u}', worktreePath, wslContext);
        hasUpstream = true;
      } catch {
        // No upstream configured
        hasUpstream = false;
      }

      // Use -u to set upstream on first push, otherwise regular push
      const pushCommand = hasUpstream ? 'git push' : 'git push -u origin HEAD';
      const { stdout, stderr } = await execForProject(pushCommand, worktreePath, wslContext);
      const output = stdout || stderr || 'Push completed successfully';

      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git push failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async gitFetch(worktreePath: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      const { stdout, stderr } = await execForProject('git fetch --all', worktreePath, wslContext);
      const output = stdout || stderr || 'Fetch completed successfully';

      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git fetch failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async gitStash(worktreePath: string, message?: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      const stashMessage = message || 'foozol stash';
      const escapedMessage = stashMessage.replace(/"/g, '\\"');
      const { stdout, stderr } = await execForProject(`git stash push -m "${escapedMessage}"`, worktreePath, wslContext);
      const output = stdout || stderr || 'Changes stashed successfully';

      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git stash failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async gitStashPop(worktreePath: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      const { stdout, stderr } = await execForProject('git stash pop', worktreePath, wslContext);
      const output = stdout || stderr || 'Stash applied successfully';

      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git stash pop failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async hasStash(worktreePath: string, wslContext?: WSLContext | null): Promise<boolean> {
    try {
      const { stdout } = await execForProject('git stash list', worktreePath, wslContext);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async setUpstream(worktreePath: string, remoteBranch: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      // Escape the remote branch name to prevent shell injection
      const escapedBranch = escapeShellArg(remoteBranch);
      const { stdout, stderr } = await execForProject(`git branch --set-upstream-to=${escapedBranch}`, worktreePath, wslContext);
      const output = stdout || stderr || `Tracking set to ${remoteBranch}`;
      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Failed to set upstream') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async getUpstream(worktreePath: string, wslContext?: WSLContext | null): Promise<string | null> {
    try {
      const { stdout } = await execForProject('git rev-parse --abbrev-ref --symbolic-full-name @{u}', worktreePath, wslContext);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async getRemoteBranches(worktreePath: string, wslContext?: WSLContext | null): Promise<string[]> {
    try {
      const { stdout } = await execForProject('git branch -r', worktreePath, wslContext);
      return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.includes('HEAD ->'));
    } catch {
      return [];
    }
  }

  async gitStageAllAndCommit(worktreePath: string, message: string, wslContext?: WSLContext | null): Promise<{ output: string }> {
    try {
      // Stage all changes including untracked files
      await execForProject('git add -A', worktreePath, wslContext);

      // Commit with message
      const escapedMessage = message.replace(/"/g, '\\"');
      const { stdout, stderr } = await execForProject(`git commit -m "${escapedMessage}"`, worktreePath, wslContext);
      const output = stdout || stderr || 'Committed successfully';

      return { output };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Git commit failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async getLastCommits(worktreePath: string, count: number = 20, wslContext?: WSLContext | null): Promise<RawCommitData[]> {
    try {
      const { stdout } = await execForProject(
        `git log -${count} --pretty=format:'%H|%s|%ai|%an' --shortstat`,
        worktreePath,
        wslContext
      );
      
      const commits: RawCommitData[] = [];
      const lines = stdout.split('\n');
      let i = 0;
      
      while (i < lines.length) {
        const commitLine = lines[i];
        if (!commitLine || !commitLine.includes('|')) {
          i++;
          continue;
        }
        
        const parts = commitLine.split('|');
        const hash = parts.shift() || '';
        const author = (parts.pop() || '').trim();
        const date = (parts.pop() || '').trim();
        const message = parts.join('|');

        const commit: RawCommitData = {
          hash: hash.trim(),
          message: message.trim(),
          date,
          author: author || 'Unknown'
        };
        
        if (i + 1 < lines.length && lines[i + 1].trim()) {
          const statsLine = lines[i + 1].trim();
          const statsMatch = statsLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
          
          if (statsMatch) {
            commit.filesChanged = parseInt(statsMatch[1]) || 0;
            commit.additions = parseInt(statsMatch[2]) || 0;
            commit.deletions = parseInt(statsMatch[3]) || 0;
            i++;
          }
        }
        
        commits.push(commit);
        i++;
      }
      
      return commits;
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const gitError = new Error(err.message || 'Failed to get commits') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    }
  }

  async getOriginBranch(worktreePath: string, branch: string, wslContext?: WSLContext | null): Promise<string | null> {
    try {
      await execForProject(`git rev-parse --verify origin/${branch}`, worktreePath, wslContext);
      return `origin/${branch}`;
    } catch {
      return null;
    }
  }
}
