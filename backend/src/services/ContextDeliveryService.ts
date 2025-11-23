/**
 * Context Delivery Service
 *
 * Manages context bundle generation and delivery to worker containers.
 * Extracted from EphemeralWorkerService to apply Single Responsibility Principle.
 *
 * Part of P1 refactoring plan - Week 2: Extract Context Management
 */

import fs from 'fs';
import tar from 'tar-fs';
import type Docker from 'dockerode';
import { TASK_TYPES } from '@app-monitor/api-contracts';
import { logger } from '../utils/logger.js';
import { mapTaskType } from '../utils/taskTypeMapper.js';
import { ContextBundleGenerator } from './context/index.js';
import type { Task } from './taskQueue.sqlite.js';

export interface ContextDeliveryConfig {
  containerTargetPath?: string;
}

/**
 * Service for delivering context bundles to worker containers
 */
export class ContextDeliveryService {
  private readonly docker: Docker;
  private readonly contextGenerator: ContextBundleGenerator;
  private readonly config: ContextDeliveryConfig;

  constructor(
    docker: Docker,
    contextGenerator?: ContextBundleGenerator,
    config: ContextDeliveryConfig = {}
  ) {
    this.docker = docker;
    this.contextGenerator = contextGenerator || new ContextBundleGenerator();
    this.config = {
      containerTargetPath: '/workspace',
      ...config
    };
  }

  /**
   * Copy context bundle to container
   * 
   * Generates (or retrieves from cache) context bundle and copies it to the container.
   * Gracefully handles errors - task execution continues even if context delivery fails.
   * 
   * @param containerId Container ID to copy context to
   * @param task Task with context bundle metadata
   */
  async copyContextBundleToContainer(containerId: string, task: Task): Promise<void> {
    // Skip if no context bundle metadata
    if (!task.context_cache_key || !task.files || task.files.length === 0) {
      logger.debug({
        category: 'context',
        action: 'context_copy_skipped',
        message: 'No context bundle to copy (no cache key or files)',
        details: {
          taskId: task.id,
          hasCacheKey: !!task.context_cache_key,
          hasFiles: !!(task.files && task.files.length > 0)
        }
      });
      return;
    }

    try {
      // Regenerate bundle (will use cache if available)
      const contextResult = await this.contextGenerator.generateBundle({
        taskType: mapTaskType(task.type || TASK_TYPES.IMPLEMENTATION),
        targetFiles: task.files,
        force: false  // Use cached bundle if available
      });

      if (!contextResult.success || !contextResult.bundle?.mountPath) {
        logger.warn({
          category: 'context',
          action: 'context_bundle_generation_failed',
          message: 'Failed to generate context bundle for copying',
          details: {
            taskId: task.id,
            cacheKey: task.context_cache_key,
            errors: contextResult.errors,
            note: 'Task will proceed without context'
          }
        });
        return;
      }

      const bundlePath = await this.contextGenerator.materializeBundle(contextResult.bundle);

      // Verify bundle path exists
      if (!fs.existsSync(bundlePath)) {
        logger.warn({
          category: 'context',
          action: 'context_bundle_path_not_found',
          message: `Context bundle path does not exist: ${bundlePath}`,
          details: {
            taskId: task.id,
            bundleId: task.context_bundle_id,
            bundlePath,
            note: 'Task will proceed without context'
          }
        });
        return;
      }

      logger.info({
        category: 'context',
        action: 'copying_context_bundle',
        message: `Copying context bundle to container`,
        details: {
          taskId: task.id,
          bundleId: task.context_bundle_id,
          cacheKey: task.context_cache_key,
          profiles: task.context_profiles,
          bundlePath,
          containerPath: `${this.config.containerTargetPath}/context`,
          cached: contextResult.cached || false
        }
      });

      const container = this.docker.getContainer(containerId);

      // Create tar stream from bundle directory
      const tarStream = tar.pack(bundlePath);

      // Copy tar stream into container at configured path
      await container.putArchive(tarStream, {
        path: this.config.containerTargetPath  // Will create /workspace/context directory
      });

      logger.info({
        category: 'context',
        action: 'context_bundle_copied',
        message: `Context bundle successfully copied to container`,
        details: {
          taskId: task.id,
          bundleId: task.context_bundle_id,
          profiles: task.context_profiles,
          containerPath: `${this.config.containerTargetPath}/context`,
          sizeBytes: contextResult.bundle.metadata.totalBytes
        }
      });

    } catch (error) {
      // Context bundle copy failure should NOT block task execution
      logger.warn({
        category: 'context',
        action: 'context_copy_failed',
        message: `Failed to copy context bundle to container`,
        error,
        details: {
          taskId: task.id,
          cacheKey: task.context_cache_key,
          note: 'Task will proceed without context'
        }
      });
    }
  }

  /**
   * Check if task has context bundle to deliver
   * 
   * @param task Task to check
   * @returns true if task has context bundle metadata
   */
  hasContextBundle(task: Task): boolean {
    return !!(task.context_cache_key && task.files && task.files.length > 0);
  }

  /**
   * Get context bundle info for task
   * 
   * @param task Task with context bundle metadata
   * @returns Context bundle info or null if not available
   */
  async getContextBundleInfo(task: Task): Promise<{
    bundleId: string | null;
    cacheKey: string;
    profiles: string[];
    cached: boolean;
    sizeBytes?: number;
  } | null> {
    if (!this.hasContextBundle(task)) {
      return null;
    }

    try {
      const contextResult = await this.contextGenerator.generateBundle({
        taskType: mapTaskType(task.type || TASK_TYPES.IMPLEMENTATION),
        targetFiles: task.files!,
        force: false
      });

      if (!contextResult.success || !contextResult.bundle) {
        return null;
      }

      return {
        bundleId: task.context_bundle_id || null,
        cacheKey: task.context_cache_key!,
        profiles: task.context_profiles || [],
        cached: contextResult.cached || false,
        sizeBytes: contextResult.bundle.metadata.totalBytes
      };
    } catch (error) {
      logger.warn({
        category: 'context',
        action: 'context_info_failed',
        message: 'Failed to get context bundle info',
        error,
        details: { taskId: task.id }
      });
      return null;
    }
  }
}
