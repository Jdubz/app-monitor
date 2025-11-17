import fs from 'fs';
import path from 'path';

export function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  // Try to find .git directory (development environment)
  while (!fs.existsSync(path.join(current, '.git'))) {
    const parent = path.dirname(current);

    // If we've reached root without finding .git, we're likely in a deployed environment
    if (parent === current) {
      // In production, the structure is /opt/app-monitor/releases/TIMESTAMP/backend/...
      // We want to return the release directory (e.g., /opt/app-monitor/releases/TIMESTAMP)
      // which is 2 levels up from backend
      const potentialBackendDir = current.split(path.sep).find(segment => segment === 'backend');
      if (potentialBackendDir) {
        // Walk back to find the parent of 'backend' directory
        const backendIndex = current.split(path.sep).indexOf('backend');
        if (backendIndex > 0) {
          const releaseRoot = current.split(path.sep).slice(0, backendIndex).join(path.sep);
          return releaseRoot || current;
        }
      }

      // Fallback: assume current directory is close enough
      return current;
    }
    current = parent;
  }

  return current;
}

export function resolveArtifactsDir(startDir: string = process.cwd()): string {
  const repoRoot = findRepoRoot(startDir);
  return path.join(repoRoot, 'dev-bots', 'artifacts');
}
