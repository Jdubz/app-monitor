/**
 * Task Queue Service Factory
 *
 * Provides singleton access to TaskQueueService instance.
 * Ensures single instance is shared across the application.
 */

import { TaskQueueService } from './taskQueue.sqlite.js';
import { config } from '../config.js';

// Singleton instance
let taskQueueInstance: TaskQueueService | null = null;

/**
 * Get the singleton TaskQueueService instance
 */
export function getTaskQueueService(dbPath?: string): TaskQueueService {
  if (!taskQueueInstance) {
    const queueDbPath = dbPath ?? config.databasePath;
    taskQueueInstance = new TaskQueueService(queueDbPath);
  }
  return taskQueueInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTaskQueueService(): void {
  taskQueueInstance = null;
}

/**
 * Set a specific TaskQueueService instance (useful for testing or custom initialization)
 */
export function setTaskQueueService(instance: TaskQueueService): void {
  taskQueueInstance = instance;
}
