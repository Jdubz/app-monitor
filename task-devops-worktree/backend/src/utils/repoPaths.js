import fs from 'fs';
import path from 'path';

export function findRepoRoot(startDir) {
  let current = path.resolve(startDir);

  while (!fs.existsSync(path.join(current, '.git'))) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate git repository root from ${startDir}`);
    }
    current = parent;
  }

  return current;
}

export function resolveArtifactsDir(startDir = process.cwd()) {
  const repoRoot = findRepoRoot(startDir);
  return path.join(repoRoot, 'dev-bots', 'artifacts');
}
