/**
 * Base Service Class
 *
 * Provides common functionality for service classes.
 * Eliminates duplication in service implementations.
 */

import { logger } from "../../utils/logger.js";
import { withErrorHandling } from "../../utils/errorHandler.js";

export interface ServiceConfig {
  name: string;
  displayName: string;
  enabled: boolean;
  timeout?: number;
  retries?: number;
}

export abstract class BaseService {
  protected config: ServiceConfig;
  protected isInitialized: boolean = false;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn({
        category: "system",
        action: "service_initialize",
        message: `${this.config.name} is already initialized`,
      });
      return;
    }

    try {
      logger.info({
        category: "system",
        action: "service_initialize",
        message: `Initializing ${this.config.name}`,
      });

      await this.onInitialize();
      this.isInitialized = true;

      logger.info({
        category: "system",
        action: "service_initialized",
        message: `${this.config.name} initialized successfully`,
      });
    } catch (error) {
      logger.error({
        category: "system",
        action: "service_initialize_failed",
        message: `Failed to initialize ${this.config.name}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Cleanup the service
   */
  public async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      logger.info({
        category: "system",
        action: "service_cleanup",
        message: `Cleaning up ${this.config.name}`,
      });

      await this.onCleanup();
      this.isInitialized = false;

      logger.info({
        category: "system",
        action: "service_cleaned",
        message: `${this.config.name} cleaned up successfully`,
      });
    } catch (error) {
      logger.error({
        category: "system",
        action: "service_cleanup_failed",
        message: `Failed to cleanup ${this.config.name}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if service is ready
   */
  public async isReady(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      return await this.onHealthCheck();
    } catch (error) {
      logger.error({
        category: "system",
        action: "service_health_check_failed",
        message: `Health check failed for ${this.config.name}`,
        error,
      });
      return false;
    }
  }

  /**
   * Get service status
   */
  public getStatus() {
    return {
      name: this.config.name,
      displayName: this.config.displayName,
      enabled: this.config.enabled,
      initialized: this.isInitialized,
      ready: this.isReady(),
    };
  }

  /**
   * Wrapper for operations with error handling
   */
  protected async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    return withErrorHandling(operation, context);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract onInitialize(): Promise<void>;
  protected abstract onCleanup(): Promise<void>;
  protected abstract onHealthCheck(): Promise<boolean>;
}
