/**
 * Base Manager Class
 * 
 * Provides common functionality for all service managers.
 * Eliminates duplication in ProcessManager, ScriptManager, ClaudeWorkersManager, etc.
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { withErrorHandling } from '../../utils/errorHandler.js';

export interface ManagerStatus {
  isRunning: boolean;
  isHealthy: boolean;
  lastError?: string;
  startedAt?: number;
  uptime?: number;
}

export abstract class BaseManager extends EventEmitter {
  protected isRunning: boolean = false;
  protected healthy: boolean = true;
  protected lastError?: string;
  protected startedAt?: number;

  constructor() {
    super();
    this.setupErrorHandling();
  }

  /**
   * Start the manager
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({
        category: 'system',
        action: 'manager_start',
        message: `${this.constructor.name} is already running`,
      });
      return;
    }

    try {
      logger.info({
        category: 'system',
        action: 'manager_start',
        message: `Starting ${this.constructor.name}`,
      });

      await this.onStart();
      
      this.isRunning = true;
      this.healthy = true;
      this.startedAt = Date.now();
      this.lastError = undefined;

      this.emit('started');
      
      logger.info({
        category: 'system',
        action: 'manager_started',
        message: `${this.constructor.name} started successfully`,
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.healthy = false;
      
      logger.error({
        category: 'system',
        action: 'manager_start_failed',
        message: `Failed to start ${this.constructor.name}`,
        error,
      });
      
      throw error;
    }
  }

  /**
   * Stop the manager
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn({
        category: 'system',
        action: 'manager_stop',
        message: `${this.constructor.name} is not running`,
      });
      return;
    }

    try {
      logger.info({
        category: 'system',
        action: 'manager_stop',
        message: `Stopping ${this.constructor.name}`,
      });

      await this.onStop();
      
      this.isRunning = false;
      this.emit('stopped');
      
      logger.info({
        category: 'system',
        action: 'manager_stopped',
        message: `${this.constructor.name} stopped successfully`,
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.healthy = false;
      
      logger.error({
        category: 'system',
        action: 'manager_stop_failed',
        message: `Failed to stop ${this.constructor.name}`,
        error,
      });
      
      throw error;
    }
  }

  /**
   * Restart the manager
   */
  public async restart(): Promise<void> {
    logger.info({
      category: 'system',
      action: 'manager_restart',
      message: `Restarting ${this.constructor.name}`,
    });

    await this.stop();
    await this.start();
  }

  /**
   * Get manager status
   */
  public getStatus(): ManagerStatus {
    const uptime = this.startedAt ? Date.now() - this.startedAt : undefined;

    return {
      isRunning: this.isRunning,
      isHealthy: this.isHealthy(),
      lastError: this.lastError,
      startedAt: this.startedAt,
      uptime,
    };
  }

  /**
   * Check if manager is healthy
   */
  public isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Get uptime in milliseconds
   */
  public getUptime(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.on('error', (error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.healthy = false;
      
      logger.error({
        category: 'system',
        action: 'manager_error',
        message: `Error in ${this.constructor.name}`,
        error,
      });
    });
  }

  /**
   * Wrapper for operations with error handling
   */
  protected async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    return withErrorHandling(operation, context);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
}
