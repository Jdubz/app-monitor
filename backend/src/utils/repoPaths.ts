import fs from 'fs';
import path from 'path';

export function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  // Try to find .git directory (development environment)
  while (!fs.existsSync(path.join(current, '.git'))) {
    const parent = path.dirname(current);

    // If we've reached filesystem root without finding .git, we're likely in a deployed environment
    if (parent === current) {
      // In production, the structure is /.../releases/TIMESTAMP/backend/...
      // Walk up from the original startDir to find a directory named 'backend'
      let p = path.resolve(startDir);

      while (path.basename(p) !== 'backend' && path.dirname(p) !== p) {
        p = path.dirname(p);
      }

      // If we found the 'backend' directory, its parent is the release root
      if (path.basename(p) === 'backend') {
        return path.dirname(p);
      }

      // Fallback: Could not determine repo root. Try environment variable, else throw error.
      if (process.env.REPO_ROOT) {
        console.warn(
          '[repoPaths] WARNING: Could not determine repo root from filesystem. Using REPO_ROOT environment variable: ' +
          process.env.REPO_ROOT
        );
        return process.env.REPO_ROOT;
      }

      throw new Error(
        `[repoPaths] Unable to determine repository root from ${startDir}. ` +
        'No .git directory found, and no backend directory in path. ' +
        'Set the REPO_ROOT environment variable to override.'
      );
    }
    current = parent;
  }

  return current;
}

export function resolveArtifactsDir(startDir: string = process.cwd()): string {
  const repoRoot = findRepoRoot(startDir);
  return path.join(repoRoot, 'dev-bots', 'artifacts');
}
