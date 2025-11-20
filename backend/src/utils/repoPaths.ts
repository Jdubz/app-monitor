import fs from 'fs';
import path from 'path';

function searchUpwardsForGit(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function searchUpwardsForBackend(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (path.basename(current) !== 'backend' && path.dirname(current) !== current) {
    current = path.dirname(current);
  }

  return path.basename(current) === 'backend' ? path.dirname(current) : null;
}

function uniqueCandidates(candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    normalized.push(resolved);
  }

  return normalized;
}

export interface FindRepoRootOptions {
  allowProcessCwdFallback?: boolean;
}

export function findRepoRoot(
  startDir: string = process.cwd(),
  options?: FindRepoRootOptions
): string {
  const allowProcessCwdFallback = options?.allowProcessCwdFallback ?? true;
  const useCwdFallback = allowProcessCwdFallback && !process.env.REPO_ROOT;
  const candidates = uniqueCandidates([
    startDir,
    useCwdFallback ? process.cwd() : undefined,
  ]);

  for (const candidate of candidates) {
    const gitRoot = searchUpwardsForGit(candidate);
    if (gitRoot) {
      return gitRoot;
    }

    const backendRoot = searchUpwardsForBackend(candidate);
    if (backendRoot) {
      return backendRoot;
    }
  }

  if (process.env.REPO_ROOT) {
    console.warn(
      `[repoPaths] WARNING: Using REPO_ROOT override: ${process.env.REPO_ROOT}`
    );
    return path.resolve(process.env.REPO_ROOT);
  }

  throw new Error(
    `[repoPaths] Unable to determine repository root from ${startDir}. ` +
    'No .git file/directory or backend folder found in any ancestor directories. ' +
    'Set REPO_ROOT to override in exotic environments.'
  );
}

export function resolveArtifactsDir(startDir: string = process.cwd()): string {
  const repoRoot = findRepoRoot(startDir);
  return path.join(repoRoot, 'dev-bots', 'artifacts');
}

const PROD_SHARED_ROOT = '/opt/app-monitor/shared';
const PROD_LOGS_DIR = path.join(PROD_SHARED_ROOT, 'logs');

/**
 * Resolve the canonical logs directory.
 * - Production: /opt/app-monitor/shared/logs (shared between blue/green releases)
 * - Development: <repo-root>/backend/data/logs
 * - Override: LOGS_DIR environment variable
 */
export function resolveLogsDir(startDir: string = process.cwd()): string {
  if (process.env.LOGS_DIR) {
    return process.env.LOGS_DIR;
  }

  if (process.env.NODE_ENV === 'production') {
    return PROD_LOGS_DIR;
  }

  try {
    const repoRoot = findRepoRoot(startDir);
    return path.join(repoRoot, 'backend', 'data', 'logs');
  } catch (error) {
    const cwd = process.cwd();
    const base =
      path.basename(cwd) === 'backend' ? path.join(cwd, 'data') : path.join(cwd, 'backend', 'data');
    console.warn(
      `[repoPaths] WARNING: Falling back to ${base}/logs because repo root detection failed: ${
        (error as Error).message
      }`
    );
    return path.join(base, 'logs');
  }
}
