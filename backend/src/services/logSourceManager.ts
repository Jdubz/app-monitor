import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface LogSource {
  id: string;
  name: string;
  enabled: boolean;
  path: string;
  format: string;
  color: string;
  parser: string;
  displayOrder: number;
  note?: string;
}

export interface LogSourcesConfig {
  version: string;
  logSources: Record<string, LogSource>;
  globalSettings: {
    maxLogLines: number;
    tailLines: number;
    updateInterval: number;
    enableTimestampParsing: boolean;
    enableLevelParsing: boolean;
  };
}

export class LogSourceManager {
  private config: LogSourcesConfig | null = null;
  private baseDir: string;

  constructor() {
    // Base directory is backend/config, so resolve paths relative to backend/
    this.baseDir = path.dirname(config.logSourcesConfig);
  }

  /**
   * Load the log sources configuration from file
   */
  async loadConfig(): Promise<LogSourcesConfig> {
    try {
      const configPath = config.logSourcesConfig;
      const content = await fs.readFile(configPath, 'utf-8');
      const loadedConfig = JSON.parse(content);
      this.config = loadedConfig;

      logger.info({
        category: 'system',
        action: 'log_sources_loaded',
        message: 'Log sources configuration loaded',
        details: {
          version: this.config.version,
          totalSources: Object.keys(this.config.logSources).length,
          enabledSources: this.getEnabledSources().length,
        },
      });

      return this.config;
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'log_sources_load_error',
        message: 'Failed to load log sources configuration',
        error,
      });
      throw error;
    }
  }

  /**
   * Get all enabled log sources, sorted by display order
   */
  getEnabledSources(): LogSource[] {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    return Object.entries(this.config.logSources)
      .filter(([_, source]) => source.enabled)
      .map(([id, source]) => ({ ...source, id }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Get all log sources (enabled and disabled)
   */
  getAllSources(): LogSource[] {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    return Object.entries(this.config.logSources).map(([id, source]) => ({
      ...source,
      id,
    }));
  }

  /**
   * Get a specific log source by ID
   */
  getSource(id: string): LogSource | undefined {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    const source = this.config.logSources[id];
    if (!source) return undefined;

    return { ...source, id };
  }

  /**
   * Resolve the absolute path for a log source
   */
  resolveLogPath(source: LogSource): string {
    // Resolve relative to backend directory (parent of config/)
    return path.resolve(this.baseDir, source.path);
  }

  /**
   * Get global settings
   */
  getGlobalSettings() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    return this.config.globalSettings;
  }

  /**
   * Validate that a log source's directory exists
   */
  async validateSourceDirectory(source: LogSource): Promise<boolean> {
    const logPath = this.resolveLogPath(source);
    const logDir = path.dirname(logPath);

    try {
      await fs.access(logDir);
      return true;
    } catch {
      logger.warn({
        category: 'system',
        action: 'log_directory_missing',
        message: `Log directory does not exist for ${source.name}`,
        details: {
          source: source.id,
          path: logDir,
        },
      });
      return false;
    }
  }

  /**
   * Validate all enabled sources
   */
  async validateAllSources(): Promise<{
    valid: LogSource[];
    invalid: LogSource[];
  }> {
    const sources = this.getEnabledSources();
    const valid: LogSource[] = [];
    const invalid: LogSource[] = [];

    for (const source of sources) {
      const isValid = await this.validateSourceDirectory(source);
      if (isValid) {
        valid.push(source);
      } else {
        invalid.push(source);
      }
    }

    if (invalid.length > 0) {
      logger.warn({
        category: 'system',
        action: 'invalid_log_sources',
        message: `${invalid.length} log source(s) have invalid directories`,
        details: {
          invalid: invalid.map((s) => s.id),
        },
      });
    }

    return { valid, invalid };
  }

  /**
   * Reload configuration from disk
   */
  async reloadConfig(): Promise<void> {
    await this.loadConfig();
    logger.info({
      category: 'system',
      action: 'log_sources_reloaded',
      message: 'Log sources configuration reloaded',
    });
  }

  /**
   * Get configuration as JSON (for API responses)
   */
  getConfigJSON() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    return {
      version: this.config.version,
      sources: this.getEnabledSources().map((source) => ({
        id: source.id,
        name: source.name,
        format: source.format,
        parser: source.parser,
        color: source.color,
        displayOrder: source.displayOrder,
        path: this.resolveLogPath(source),
      })),
      globalSettings: this.config.globalSettings,
    };
  }
}
