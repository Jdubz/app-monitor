/**
 * Artifact Storage Service
 * 
 * Hybrid storage strategy for phase artifacts:
 * - Structured data (JSON) stored in database (task_stage_runs.artifacts_blob)
 * - Large files stored on host filesystem (organized by task ID)
 * 
 * Filesystem layout:
 *   /opt/app-monitor/shared/artifacts/{taskId}/
 *     ├── phase-{N}-attempt-{M}/
 *     │   ├── coverage.lcov
 *     │   ├── test-results.json
 *     │   └── screenshots/
 *     └── latest -> phase-{N}-attempt-{M}  (symlink)
 * 
 * See: docs/technicalDesigns/task-processing-stage-implementation-clarifications.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

export interface ArtifactFile {
  name: string;
  path: string;
  size: number;
  mimeType?: string;
}

export interface ArtifactStorageOptions {
  taskId: string;
  phaseIndex: number;
  attempt: number;
}

export class ArtifactStorageService {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    // Default to shared artifacts directory in production, data/artifacts in development
    this.baseDir = baseDir ?? path.join(
      config.isDevelopment 
        ? path.join(process.cwd(), 'data', 'artifacts')
        : '/opt/app-monitor/shared/artifacts'
    );

    this.ensureBaseDirectory();
  }

  /**
   * Ensure base artifacts directory exists.
   */
  private ensureBaseDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info({
        category: 'artifact',
        action: 'base_directory_created',
        message: `Created artifacts base directory at ${this.baseDir}`,
      });
    }
  }

  /**
   * Get directory path for specific task/phase/attempt.
   */
  private getArtifactDir(options: ArtifactStorageOptions): string {
    const { taskId, phaseIndex, attempt } = options;
    return path.join(this.baseDir, taskId, `phase-${phaseIndex}-attempt-${attempt}`);
  }

  /**
   * Get latest symlink path for a task.
   */
  private getLatestSymlink(taskId: string): string {
    return path.join(this.baseDir, taskId, 'latest');
  }

  /**
   * Ensure artifact directory exists for task/phase/attempt.
   */
  ensureArtifactDirectory(options: ArtifactStorageOptions): string {
    const dir = this.getArtifactDir(options);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info({
        category: 'artifact',
        action: 'artifact_directory_created',
        message: `Created artifact directory for task ${options.taskId} phase ${options.phaseIndex} attempt ${options.attempt}`,
        details: { path: dir },
      });
    }

    // Update 'latest' symlink to point to this directory
    this.updateLatestSymlink(options.taskId, dir);

    return dir;
  }

  /**
   * Update 'latest' symlink to point to most recent artifact directory.
   */
  private updateLatestSymlink(taskId: string, targetDir: string): void {
    const symlinkPath = this.getLatestSymlink(taskId);
    
    // Remove existing symlink if it exists
    if (fs.existsSync(symlinkPath)) {
      fs.unlinkSync(symlinkPath);
    }

    // Create new symlink
    try {
      fs.symlinkSync(targetDir, symlinkPath);
    } catch (error) {
      logger.warn({
        category: 'artifact',
        action: 'symlink_creation_failed',
        message: `Failed to create latest symlink for task ${taskId}`,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /**
   * Store a file artifact.
   * @returns Path where file was stored
   */
  storeFile(options: ArtifactStorageOptions, filename: string, content: string | Buffer): string {
    const dir = this.ensureArtifactDirectory(options);
    const filePath = path.join(dir, filename);

    fs.writeFileSync(filePath, content);

    logger.info({
      category: 'artifact',
      action: 'file_stored',
      message: `Stored artifact file: ${filename}`,
      details: {
        taskId: options.taskId,
        phaseIndex: options.phaseIndex,
        attempt: options.attempt,
        filename,
        size: Buffer.byteLength(content),
      },
    });

    return filePath;
  }

  /**
   * Store multiple files at once.
   */
  storeFiles(options: ArtifactStorageOptions, files: Map<string, string | Buffer>): string[] {
    const paths: string[] = [];
    
    for (const [filename, content] of files) {
      const filePath = this.storeFile(options, filename, content);
      paths.push(filePath);
    }

    return paths;
  }

  /**
   * Read a file artifact.
   * @returns File content or null if not found
   */
  readFile(options: ArtifactStorageOptions, filename: string): string | null {
    const dir = this.getArtifactDir(options);
    const filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * List all files in artifact directory.
   */
  listFiles(options: ArtifactStorageOptions): ArtifactFile[] {
    const dir = this.getArtifactDir(options);

    if (!fs.existsSync(dir)) {
      return [];
    }

    const files: ArtifactFile[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        const stats = fs.statSync(filePath);
        
        files.push({
          name: entry.name,
          path: filePath,
          size: stats.size,
        });
      }
    }

    return files;
  }

  /**
   * Get latest artifacts directory for a task.
   * Follows 'latest' symlink if it exists.
   */
  getLatestArtifactsDir(taskId: string): string | null {
    const symlinkPath = this.getLatestSymlink(taskId);

    if (fs.existsSync(symlinkPath)) {
      return fs.realpathSync(symlinkPath);
    }

    return null;
  }

  /**
   * List all artifact directories for a task.
   * Returns them sorted by phase/attempt.
   */
  listArtifactDirs(taskId: string): Array<{ phaseIndex: number; attempt: number; path: string }> {
    const taskDir = path.join(this.baseDir, taskId);

    if (!fs.existsSync(taskDir)) {
      return [];
    }

    const dirs: Array<{ phaseIndex: number; attempt: number; path: string }> = [];
    const entries = fs.readdirSync(taskDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('phase-')) {
        // Parse phase-{N}-attempt-{M}
        const match = entry.name.match(/^phase-(\d+)-attempt-(\d+)$/);
        if (match) {
          dirs.push({
            phaseIndex: parseInt(match[1], 10),
            attempt: parseInt(match[2], 10),
            path: path.join(taskDir, entry.name),
          });
        }
      }
    }

    // Sort by phase, then attempt
    dirs.sort((a, b) => {
      if (a.phaseIndex !== b.phaseIndex) {
        return a.phaseIndex - b.phaseIndex;
      }
      return a.attempt - b.attempt;
    });

    return dirs;
  }

  /**
   * Delete all artifacts for a task.
   * Use carefully - this is permanent!
   */
  deleteTaskArtifacts(taskId: string): void {
    const taskDir = path.join(this.baseDir, taskId);

    if (fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
      
      logger.info({
        category: 'artifact',
        action: 'task_artifacts_deleted',
        message: `Deleted all artifacts for task ${taskId}`,
      });
    }
  }

  /**
   * Calculate total size of artifacts for a task.
   */
  getTaskArtifactsSize(taskId: string): number {
    const taskDir = path.join(this.baseDir, taskId);

    if (!fs.existsSync(taskDir)) {
      return 0;
    }

    let totalSize = 0;

    const calculateDirSize = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile()) {
          totalSize += fs.statSync(fullPath).size;
        } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
          calculateDirSize(fullPath);
        }
      }
    };

    calculateDirSize(taskDir);

    return totalSize;
  }

  /**
   * Get base directory path.
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}

// Singleton instance
let artifactStorageInstance: ArtifactStorageService | null = null;

export function getArtifactStorage(): ArtifactStorageService {
  if (!artifactStorageInstance) {
    artifactStorageInstance = new ArtifactStorageService();
  }
  return artifactStorageInstance;
}
