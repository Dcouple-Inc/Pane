import path from 'path';
import fs from 'fs/promises';
import { linuxToUNCPath, posixJoin } from './wslUtils';

export type ProjectEnvironment = 'wsl' | 'windows' | 'linux' | 'macos';

export class PathResolver {
  readonly environment: ProjectEnvironment;
  private readonly distribution?: string;

  constructor(project: { path: string; wsl_enabled?: boolean; wsl_distribution?: string | null }) {
    if (project.wsl_enabled && project.wsl_distribution) {
      this.environment = 'wsl';
      this.distribution = project.wsl_distribution;
    } else if (process.platform === 'win32') {
      this.environment = 'windows';
    } else if (process.platform === 'darwin') {
      this.environment = 'macos';
    } else {
      this.environment = 'linux';
    }
  }

  /** Convert a stored path (Linux for WSL) to one Node's fs module can use. Idempotent — already-converted UNC paths are returned unchanged. */
  toFileSystem(storedPath: string): string {
    if (this.environment === 'wsl' && this.distribution) {
      // Skip conversion if already a UNC path (prevents double-prefixing)
      if (storedPath.startsWith('\\\\')) {
        return storedPath;
      }
      return linuxToUNCPath(storedPath, this.distribution);
    }
    return storedPath;
  }

  /** Join path segments using the correct separator for this environment */
  join(...segments: string[]): string {
    if (this.environment === 'wsl') {
      return posixJoin(...segments);
    }
    return path.join(...segments);
  }

  /** Compute relative path — converts both to filesystem format first so path.relative works */
  relative(from: string, to: string): string {
    const fsFrom = this.toFileSystem(from);
    const fsTo = this.toFileSystem(to);
    return path.relative(fsFrom, fsTo);
  }

  /** Check if targetPath is within basePath — resolves symlinks and converts to filesystem format */
  async isWithin(basePath: string, targetPath: string): Promise<boolean> {
    const fsBase = this.toFileSystem(basePath);
    const fsTarget = this.toFileSystem(targetPath);
    // Resolve symlinks to prevent escape via symlinked paths
    const resolvedBase = await fs.realpath(fsBase).catch(() => fsBase);
    const resolvedTarget = await fs.realpath(fsTarget).catch(() => fsTarget);
    const rel = path.relative(resolvedBase, resolvedTarget);
    // rel === '' means paths are equal (base is within itself) — that's valid
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }
}
