import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { escapeRegExp } from '../utils/stringUtils.js';

type WorkerLogStreamConfig = {
  pattern: string;
  label?: string;
  encoding?: BufferEncoding;
};

type WorkTargetLogConfig = {
  artifactRoot: string;
  streams: Record<string, WorkerLogStreamConfig>;
};

type WorkerLogStreamsConfig = Record<string, WorkTargetLogConfig>;

export interface TaskLogFileDescriptor {
  filename: string;
  path: string;
  size: number;
  updatedAt: string;
  stream: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

export class WorkerLogLocator {
  private config: WorkerLogStreamsConfig;

  constructor(logConfig?: WorkerLogStreamsConfig) {
    this.config = logConfig ?? this.loadConfig();
  }

  private loadConfig(): WorkerLogStreamsConfig {
    try {
      const configPath = config.workerLogStreamsConfig;
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as WorkerLogStreamsConfig;
    } catch (error) {
      logger.warn({
        category: 'process',
        action: 'worker_log_config_missing',
        message: 'Unable to load worker log streams configuration, falling back to empty config',
        error,
      });
      return {};
    }
  }

  async getDescriptor(workTarget: string, taskId: string, stream: string): Promise<TaskLogFileDescriptor | null> {
    const targetConfig = this.config[workTarget];
    if (!targetConfig) {
      return null;
    }

    const streamConfig = targetConfig.streams[stream];
    if (!streamConfig) {
      return null;
    }

    const artifactRoot = path.resolve(REPO_ROOT, targetConfig.artifactRoot);
    try {
      const stats = await fsp.stat(artifactRoot);
      if (!stats.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const matcher = this.buildMatcher(streamConfig.pattern, taskId);
    const files = await fsp.readdir(artifactRoot);
    const candidates = files.filter((filename) => matcher(filename));

    if (candidates.length === 0) {
      return null;
    }

    const descriptors = await Promise.all(
      candidates.map(async (filename) => {
        const fullPath = path.join(artifactRoot, filename);
        const stat = await fsp.stat(fullPath);
        return {
          filename,
          path: fullPath,
          size: stat.size,
          updatedAt: new Date(stat.mtimeMs).toISOString(),
          stream,
        };
      }),
    );

    descriptors.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return descriptors[0];
  }

  private buildMatcher(pattern: string, taskId: string) {
    const resolved = pattern.replace('{taskId}', taskId);
    if (!resolved.includes('*')) {
      return (filename: string) => filename === resolved;
    }

    const escapedSegments = resolved.split('*').map((segment) => escapeRegExp(segment));
    const regex = new RegExp(`^${escapedSegments.join('.*')}$`);
    return (filename: string) => regex.test(filename);
  }
}
