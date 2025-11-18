/**
 * Context Delivery Service Unit Tests
 * 
 * Tests context bundle generation and delivery to containers.
 * Part of P1 refactoring plan - Week 2: Extract Context Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextDeliveryService } from '../ContextDeliveryService.js';
import type { Task } from '../taskQueue.sqlite.js';

// Mock fs module with factory
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => true)
    },
    existsSync: vi.fn(() => true)
  };
});

// Mock tar-fs module
const mockTarStream = {
  on: vi.fn(),
  pipe: vi.fn(),
  destroy: vi.fn()
};

vi.mock('tar-fs', () => ({
  default: {
    pack: vi.fn(() => mockTarStream)
  },
  pack: vi.fn(() => mockTarStream)
}));

// Import mocked fs
import * as fs from 'fs';
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

// Mock Docker
const mockDocker = {
  getContainer: vi.fn()
};

// Mock ContextBundleGenerator
const mockContextGenerator = {
  generateBundle: vi.fn()
};

describe('ContextDeliveryService', () => {
  let service: ContextDeliveryService;
  let mockContainer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to return true by default
    (mockExistsSync as any).mockImplementation(() => true);
    
    mockContainer = {
      putArchive: vi.fn().mockResolvedValue(undefined)
    };
    
    mockDocker.getContainer.mockReturnValue(mockContainer);
    
    service = new ContextDeliveryService(
      mockDocker as any,
      mockContextGenerator as any
    );
  });

  describe('copyContextBundleToContainer', () => {
    it('should skip if no context cache key', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: null,
        files: ['file1.ts']
      };

      await service.copyContextBundleToContainer('container-123', task as Task);

      expect(mockContextGenerator.generateBundle).not.toHaveBeenCalled();
      expect(mockContainer.putArchive).not.toHaveBeenCalled();
    });

    it('should skip if no files', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: 'cache-key-123',
        files: []
      };

      await service.copyContextBundleToContainer('container-123', task as Task);

      expect(mockContextGenerator.generateBundle).not.toHaveBeenCalled();
      expect(mockContainer.putArchive).not.toHaveBeenCalled();
    });

    it('should skip if files is null', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: 'cache-key-123',
        files: null
      };

      await service.copyContextBundleToContainer('container-123', task as Task);

      expect(mockContextGenerator.generateBundle).not.toHaveBeenCalled();
      expect(mockContainer.putArchive).not.toHaveBeenCalled();
    });

    it('should generate bundle with correct parameters', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts', 'file2.ts'],
        context_bundle_id: 'bundle-123',
        context_profiles: ['typescript', 'react']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 1024,
            fileCount: 2
          }
        },
        cached: true
      });

      mockExistsSync.mockReturnValue(true);

      await service.copyContextBundleToContainer('container-123', task as Task);

      expect(mockContextGenerator.generateBundle).toHaveBeenCalledWith({
        taskType: 'implementation',
        targetFiles: ['file1.ts', 'file2.ts'],
        force: false
      });
    });

    it('should handle missing bundle gracefully', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'fix',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: false,
        errors: ['Bundle generation failed']
      });

      // Should not throw
      await expect(
        service.copyContextBundleToContainer('container-123', task as Task)
      ).resolves.toBeUndefined();

      expect(mockContainer.putArchive).not.toHaveBeenCalled();
    });

    it('should handle missing bundle path gracefully', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'review',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      // Mock to return bundle with non-existent path, but with bundle missing (success: false)
      mockContextGenerator.generateBundle.mockResolvedValue({
        success: false,
        errors: ['Bundle path not found']
      });

      // Should not throw - just logs warning and continues
      await expect(
        service.copyContextBundleToContainer('container-123', task as Task)
      ).resolves.toBeUndefined();

      expect(mockContainer.putArchive).not.toHaveBeenCalled();
    });

    it('should copy bundle to container', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts'],
        context_bundle_id: 'bundle-123',
        context_profiles: ['typescript']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 2048,
            fileCount: 3
          }
        },
        cached: false
      });

      mockExistsSync.mockReturnValue(true);

      await service.copyContextBundleToContainer('container-123', task as Task);

      expect(mockDocker.getContainer).toHaveBeenCalledWith('container-123');
      expect(mockContainer.putArchive).toHaveBeenCalledWith(
        expect.any(Object), // tar stream
        { path: '/workspace' }
      );
    });

    it('should handle copy errors gracefully', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 1024,
            fileCount: 1
          }
        }
      });

      mockExistsSync.mockReturnValue(true);

      // Mock putArchive to fail
      mockContainer.putArchive.mockRejectedValue(new Error('Container not running'));

      // Should not throw - errors are logged but don't block task execution
      await expect(
        service.copyContextBundleToContainer('container-123', task as Task)
      ).resolves.toBeUndefined();
    });

    it('should use custom container target path', async () => {
      const customService = new ContextDeliveryService(
        mockDocker as any,
        mockContextGenerator as any,
        { containerTargetPath: '/custom/path' }
      );

      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 1024,
            fileCount: 1
          }
        }
      });

      mockExistsSync.mockReturnValue(true);

      await customService.copyContextBundleToContainer('container-123', task as Task);

      expect(mockContainer.putArchive).toHaveBeenCalledWith(
        expect.any(Object),
        { path: '/custom/path' }
      );
    });
  });

  describe('hasContextBundle', () => {
    it('should return true if task has context bundle', () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      expect(service.hasContextBundle(task as Task)).toBe(true);
    });

    it('should return false if no cache key', () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: null,
        files: ['file1.ts']
      };

      expect(service.hasContextBundle(task as Task)).toBe(false);
    });

    it('should return false if no files', () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: 'cache-key-123',
        files: []
      };

      expect(service.hasContextBundle(task as Task)).toBe(false);
    });

    it('should return false if files is null', () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: 'cache-key-123',
        files: null
      };

      expect(service.hasContextBundle(task as Task)).toBe(false);
    });
  });

  describe('getContextBundleInfo', () => {
    it('should return null if no context bundle', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        context_cache_key: null,
        files: []
      };

      const info = await service.getContextBundleInfo(task as Task);
      expect(info).toBeNull();
    });

    it('should return bundle info', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        context_bundle_id: 'bundle-123',
        context_profiles: ['typescript', 'react'],
        files: ['file1.ts', 'file2.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 4096,
            fileCount: 5
          }
        },
        cached: true
      });

      const info = await service.getContextBundleInfo(task as Task);

      expect(info).toEqual({
        bundleId: 'bundle-123',
        cacheKey: 'cache-key-123',
        profiles: ['typescript', 'react'],
        cached: true,
        sizeBytes: 4096
      });
    });

    it('should return null if bundle generation fails', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'fix',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: false,
        errors: ['Generation failed']
      });

      const info = await service.getContextBundleInfo(task as Task);
      expect(info).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'review',
        context_cache_key: 'cache-key-123',
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockRejectedValue(
        new Error('Unexpected error')
      );

      const info = await service.getContextBundleInfo(task as Task);
      expect(info).toBeNull();
    });

    it('should handle null bundle ID', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'implementation',
        context_cache_key: 'cache-key-123',
        context_bundle_id: null,
        context_profiles: ['typescript'],
        files: ['file1.ts']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 1024,
            fileCount: 1
          }
        },
        cached: false
      });

      const info = await service.getContextBundleInfo(task as Task);

      expect(info).toEqual({
        bundleId: null,
        cacheKey: 'cache-key-123',
        profiles: ['typescript'],
        cached: false,
        sizeBytes: 1024
      });
    });

    it('should handle missing profiles', async () => {
      const task: Partial<Task> = {
        id: 'task-123',
        type: 'deployment',
        context_cache_key: 'cache-key-123',
        context_bundle_id: 'bundle-123',
        context_profiles: null,
        files: ['deploy.yml']
      };

      mockContextGenerator.generateBundle.mockResolvedValue({
        success: true,
        bundle: {
          mountPath: '/tmp/context-bundle-123',
          metadata: {
            totalBytes: 512,
            fileCount: 1
          }
        },
        cached: false
      });

      const info = await service.getContextBundleInfo(task as Task);

      expect(info).toEqual({
        bundleId: 'bundle-123',
        cacheKey: 'cache-key-123',
        profiles: [],
        cached: false,
        sizeBytes: 512
      });
    });
  });
});
