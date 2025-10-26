import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogSourceManager } from '../logSourceManager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LogSourceManager', () => {
  let manager: LogSourceManager;
  const testConfigDir = path.join(__dirname, '../../../../test-config');
  const testConfigFile = path.join(testConfigDir, 'log-sources.json');

  const mockConfig = {
    version: '1.0.0',
    logSources: {
      backend: {
        id: 'backend',
        name: 'Backend',
        enabled: true,
        path: '../logs/backend.log',
        format: 'json',
        color: '#3b82f6',
        parser: 'json',
        displayOrder: 1,
      },
      frontend: {
        id: 'frontend',
        name: 'Frontend',
        enabled: true,
        path: '../logs/frontend.log',
        format: 'text',
        color: '#10b981',
        parser: 'text',
        displayOrder: 2,
      },
      disabled: {
        id: 'disabled',
        name: 'Disabled Service',
        enabled: false,
        path: '../logs/disabled.log',
        format: 'text',
        color: '#6b7280',
        parser: 'text',
        displayOrder: 3,
      },
    },
    globalSettings: {
      maxLogLines: 1000,
      tailLines: 100,
      updateInterval: 1000,
      enableTimestampParsing: true,
      enableLevelParsing: true,
    },
  };

  beforeEach(async () => {
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.writeFile(testConfigFile, JSON.stringify(mockConfig, null, 2));
    
    // Mock the config module
    vi.mock('../config.js', () => ({
      config: {
        logSourcesConfig: testConfigFile,
      },
    }));
    
    manager = new LogSourceManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load configuration from file', async () => {
      const config = await manager.loadConfig();
      
      expect(config).toBeDefined();
      expect(config.version).toBe('1.0.0');
      expect(config.logSources).toBeDefined();
      expect(Object.keys(config.logSources).length).toBe(3);
    });

    it('should throw error if config file does not exist', async () => {
      await fs.rm(testConfigFile);
      
      await expect(manager.loadConfig()).rejects.toThrow();
    });

    it('should throw error if config file is invalid JSON', async () => {
      await fs.writeFile(testConfigFile, 'invalid json {]');
      
      await expect(manager.loadConfig()).rejects.toThrow();
    });
  });

  describe('getEnabledSources', () => {
    it('should throw error if config not loaded', () => {
      const freshManager = new LogSourceManager();
      expect(() => freshManager.getEnabledSources()).toThrow('Configuration not loaded');
    });

    it('should return only enabled sources', async () => {
      await manager.loadConfig();
      const sources = manager.getEnabledSources();
      
      expect(sources.length).toBe(2);
      expect(sources.every((s) => s.enabled)).toBe(true);
      expect(sources.find((s) => s.id === 'disabled')).toBeUndefined();
    });

    it('should return sources sorted by displayOrder', async () => {
      await manager.loadConfig();
      const sources = manager.getEnabledSources();
      
      expect(sources[0].displayOrder).toBeLessThan(sources[1].displayOrder);
      expect(sources[0].id).toBe('backend');
      expect(sources[1].id).toBe('frontend');
    });
  });

  describe('getAllSources', () => {
    it('should return all sources including disabled', async () => {
      await manager.loadConfig();
      const sources = manager.getAllSources();
      
      expect(sources.length).toBe(3);
      expect(sources.find((s) => s.id === 'disabled')).toBeDefined();
    });
  });

  describe('getSource', () => {
    it('should return specific source by ID', async () => {
      await manager.loadConfig();
      const source = manager.getSource('backend');
      
      expect(source).toBeDefined();
      expect(source?.id).toBe('backend');
      expect(source?.name).toBe('Backend');
    });

    it('should return undefined for non-existent source', async () => {
      await manager.loadConfig();
      const source = manager.getSource('non-existent');
      
      expect(source).toBeUndefined();
    });
  });

  describe('resolveLogPath', () => {
    it('should resolve relative paths correctly', async () => {
      await manager.loadConfig();
      const source = manager.getSource('backend');
      
      if (source) {
        const resolvedPath = manager.resolveLogPath(source);
        expect(path.isAbsolute(resolvedPath)).toBe(true);
        expect(resolvedPath).toContain('backend.log');
      }
    });
  });

  describe('getGlobalSettings', () => {
    it('should return global settings', async () => {
      await manager.loadConfig();
      const settings = manager.getGlobalSettings();
      
      expect(settings).toBeDefined();
      expect(settings.maxLogLines).toBe(1000);
      expect(settings.tailLines).toBe(100);
      expect(settings.updateInterval).toBe(1000);
      expect(settings.enableTimestampParsing).toBe(true);
      expect(settings.enableLevelParsing).toBe(true);
    });
  });

  describe('validateSourceDirectory', () => {
    it('should return false if directory does not exist', async () => {
      await manager.loadConfig();
      const source = manager.getSource('backend');
      
      if (source) {
        const isValid = await manager.validateSourceDirectory(source);
        expect(isValid).toBe(false);
      }
    });

    it('should return true if directory exists', async () => {
      await manager.loadConfig();
      const source = manager.getSource('backend');
      
      if (source) {
        const logDir = path.dirname(manager.resolveLogPath(source));
        await fs.mkdir(logDir, { recursive: true });
        
        const isValid = await manager.validateSourceDirectory(source);
        expect(isValid).toBe(true);
        
        await fs.rm(logDir, { recursive: true, force: true });
      }
    });
  });

  describe('validateAllSources', () => {
    it('should validate all enabled sources', async () => {
      await manager.loadConfig();
      const result = await manager.validateAllSources();
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('invalid');
      expect(Array.isArray(result.valid)).toBe(true);
      expect(Array.isArray(result.invalid)).toBe(true);
    });

    it('should separate valid and invalid sources', async () => {
      await manager.loadConfig();
      
      // Create directory for one source
      const backendSource = manager.getSource('backend');
      if (backendSource) {
        const logDir = path.dirname(manager.resolveLogPath(backendSource));
        await fs.mkdir(logDir, { recursive: true });
      }
      
      const result = await manager.validateAllSources();
      
      expect(result.valid.length).toBeGreaterThan(0);
      expect(result.invalid.length).toBeGreaterThan(0);
      
      // Cleanup
      if (backendSource) {
        const logDir = path.dirname(manager.resolveLogPath(backendSource));
        await fs.rm(logDir, { recursive: true, force: true });
      }
    });
  });

  describe('reloadConfig', () => {
    it('should reload configuration from disk', async () => {
      await manager.loadConfig();
      
      // Modify config file
      const modifiedConfig = { ...mockConfig };
      modifiedConfig.version = '2.0.0';
      await fs.writeFile(testConfigFile, JSON.stringify(modifiedConfig, null, 2));
      
      await manager.reloadConfig();
      
      const config = await manager.loadConfig();
      expect(config.version).toBe('2.0.0');
    });
  });

  describe('getConfigJSON', () => {
    it('should return config as JSON for API', async () => {
      await manager.loadConfig();
      const json = manager.getConfigJSON();
      
      expect(json).toHaveProperty('version');
      expect(json).toHaveProperty('sources');
      expect(json).toHaveProperty('globalSettings');
      expect(json.sources.length).toBe(2); // Only enabled sources
    });

    it('should include resolved paths in sources', async () => {
      await manager.loadConfig();
      const json = manager.getConfigJSON();
      
      const backendSource = json.sources.find((s) => s.id === 'backend');
      expect(backendSource?.path).toBeDefined();
      expect(path.isAbsolute(backendSource?.path || '')).toBe(true);
    });
  });
});
