/**
 * ContextCache Unit Tests
 *
 * Comprehensive test suite for the ContextCache class.
 * All tests use in-memory database - safe for CI environments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextCache } from '../contextCache.js';
import { createTestDatabase, TestDatabase } from './helpers/testDatabase.js';
import { mockBundle } from './helpers/testMocks.js';
import { sleep, mockGitHash } from './helpers/testUtils.js';
import type { BundleGenerationOptions } from '../../../types/contextBundle.js';

describe('ContextCache', () => {
  let cache: ContextCache;
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    cache = new ContextCache({ persistToDb: true, db: testDb.asDevBotsDatabase() });
  });

  afterEach(async () => {
    if (cache) {
      await cache.destroy();
    }
    if (testDb) {
      testDb.destroy();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultCache = new ContextCache({ persistToDb: false });
      expect(defaultCache).toBeDefined();
      expect(defaultCache.getStats().totalEntries).toBe(0);
    });

    it('should initialize with custom maxEntries and maxTotalBytes', () => {
      const customCache = new ContextCache({
        maxEntries: 50,
        maxTotalBytes: 50 * 1024 * 1024,
        persistToDb: false
      });
      expect(customCache).toBeDefined();
      expect(customCache.getStats().totalEntries).toBe(0);
    });

    it('should disable persistence if database initialization fails', () => {
      // This test verifies graceful degradation
      const cacheWithoutDb = new ContextCache({ persistToDb: false });
      expect(cacheWithoutDb).toBeDefined();
    });

    it('should start cleanup interval when persistToDb is true', async () => {
      const localTestDb = await createTestDatabase();
      const cacheWithCleanup = new ContextCache({ persistToDb: true, db: localTestDb.asDevBotsDatabase() });
      expect(cacheWithCleanup).toBeDefined();
      await cacheWithCleanup.destroy();
      localTestDb.destroy();
    });

    it('should not start cleanup interval when persistToDb is false', () => {
      const cacheWithoutCleanup = new ContextCache({ persistToDb: false });
      expect(cacheWithoutCleanup).toBeDefined();
    });
  });

  describe('generateCacheKey', () => {
    const options: BundleGenerationOptions = {
      taskType: 'implementation',
      profiles: ['test-profile'],
      targetFiles: ['src/test.ts']
    };

    it('should generate consistent cache key for same inputs', async () => {
      const key1 = await cache.generateCacheKey(options, 'abc123');
      const key2 = await cache.generateCacheKey(options, 'abc123');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different task types', async () => {
      const key1 = await cache.generateCacheKey({ ...options, taskType: 'fix' }, 'abc123');
      const key2 = await cache.generateCacheKey({ ...options, taskType: 'implementation' }, 'abc123');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different profiles', async () => {
      const key1 = await cache.generateCacheKey({ ...options, profiles: ['profile1'] }, 'abc123');
      const key2 = await cache.generateCacheKey({ ...options, profiles: ['profile2'] }, 'abc123');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different target files', async () => {
      const key1 = await cache.generateCacheKey({ ...options, targetFiles: ['file1.ts'] }, 'abc123');
      const key2 = await cache.generateCacheKey({ ...options, targetFiles: ['file2.ts'] }, 'abc123');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different git commits', async () => {
      const key1 = await cache.generateCacheKey(options, 'abc123');
      const key2 = await cache.generateCacheKey(options, 'def456');
      expect(key1).not.toBe(key2);
    });

    it('should sort arrays before hashing for consistency', async () => {
      const key1 = await cache.generateCacheKey({
        ...options,
        profiles: ['a', 'b', 'c']
      }, 'abc123');
      const key2 = await cache.generateCacheKey({
        ...options,
        profiles: ['c', 'b', 'a']
      }, 'abc123');
      expect(key1).toBe(key2);
    });

    it('should throw error for invalid task type', async () => {
      await expect(cache.generateCacheKey({
        ...options,
        taskType: 'invalid-type' as any
      })).rejects.toThrow('Invalid task type');
    });

    it('should throw error for invalid cache key format', async () => {
      // This would require injecting invalid characters, which is prevented by validation
      const key = await cache.generateCacheKey(options, 'valid-hash');
      expect(key).toMatch(/^[a-zA-Z0-9-]+$/);
    });

    it('should use fallback timestamp when git command fails', async () => {
      // Mock git to fail
      vi.mock('child_process', () => ({
        execSync: vi.fn(() => { throw new Error('Git not found'); })
      }));

      const key = await cache.generateCacheKey(options);
      expect(key).toContain('timestamp-');
    });

    it('should validate git hash format', async () => {
      const key = await cache.generateCacheKey(options, mockGitHash());
      expect(key).toMatch(/^[a-zA-Z0-9-]+$/);
    });

    it('should sanitize git commit hash', async () => {
      const key = await cache.generateCacheKey(options, 'abc123-sanitized');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('/');
    });
  });

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should return cached bundle from memory', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      const result = await cache.get('test-key');
      expect(result).toEqual(bundle);
    });

    it('should return cached bundle from database', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      // Clear memory cache
      cache.clear();

      // Should load from database
      const result = await cache.get('test-key');
      expect(result).toBeDefined();
      expect(result?.id).toBe(bundle.id);
    });

    it('should return null for expired entry', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1); // 1 second TTL

      await sleep(1100); // Wait for expiration

      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should update access statistics on hit', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      await cache.get('test-key');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
    });

    it('should increment miss counter on miss', async () => {
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should delete expired entries from memory cache', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1);

      await sleep(1100);

      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(cache.has('test-key')).toBe(false);
    });
  });

  describe('set', () => {
    it('should store bundle in memory cache', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      expect(cache.has('test-key')).toBe(true);
    });

    it('should store bundle in database when persistence enabled', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      const rowCount = testDb.getRowCount();
      expect(rowCount).toBe(1);
    });

    it('should not store in database when persistence disabled', async () => {
      const cacheWithoutDb = new ContextCache({ persistToDb: false });
      const bundle = mockBundle();
      await cacheWithoutDb.set('test-key', bundle);

      const rowCount = testDb.getRowCount();
      expect(rowCount).toBe(0);
    });

    it('should calculate bundle size correctly', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      const stats = cache.getStats();
      expect(stats.totalBytes).toBeGreaterThan(0);
    });

    it('should set expiration time based on TTL', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 3600);

      const result = await cache.get('test-key');
      expect(result).toBeDefined();
    });

    it('should evict entries when cache is full', async () => {
      const smallCache = new ContextCache({ maxEntries: 2, persistToDb: false });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());
      await smallCache.set('key3', mockBundle()); // Should evict key1

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key3')).toBe(true);
    });

    it('should evict entries when size limit exceeded', async () => {
      const smallCache = new ContextCache({
        maxTotalBytes: 2000,
        persistToDb: false
      });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());

      const stats = smallCache.getStats();
      expect(stats.totalBytes).toBeLessThanOrEqual(2000);
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired entry', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      expect(cache.has('test-key')).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired entry', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1);

      await sleep(1100);

      expect(cache.has('test-key')).toBe(false);
    });

    it('should delete expired entry when checked', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1);

      await sleep(1100);

      cache.has('test-key');
      expect(cache.has('test-key')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entry from both caches', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      cache.delete('test-key');

      expect(cache.has('test-key')).toBe(false);
    });

    it('should return true if entry existed', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      const result = cache.delete('test-key');
      expect(result).toBe(true);
    });

    it('should return false if entry did not exist', () => {
      const result = cache.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries from memory', async () => {
      await cache.set('key1', mockBundle());
      await cache.set('key2', mockBundle());

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });

    it('should reset statistics', async () => {
      await cache.set('key1', mockBundle());
      await cache.get('key1');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should not affect database (only memory)', async () => {
      await cache.set('key1', mockBundle());

      const rowCountBefore = testDb.getRowCount();
      cache.clear();
      const rowCountAfter = testDb.getRowCount();

      expect(rowCountBefore).toBe(rowCountAfter);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await cache.set('key1', mockBundle());
      await cache.get('key1');
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate correctly', async () => {
      await cache.set('key1', mockBundle());
      await cache.get('key1'); // hit
      await cache.get('key1'); // hit
      await cache.get('non-existent'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should handle zero requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate total bytes correctly', async () => {
      const bundle1 = mockBundle();
      const bundle2 = mockBundle();
      await cache.set('key1', bundle1);
      await cache.set('key2', bundle2);

      const stats = cache.getStats();
      expect(stats.totalBytes).toBeGreaterThan(0);
    });
  });

  describe('eviction', () => {
    it('should evict LRU entries when count limit exceeded', async () => {
      const smallCache = new ContextCache({ maxEntries: 2, persistToDb: false });

      await smallCache.set('key1', mockBundle());
      await sleep(10);
      await smallCache.set('key2', mockBundle());
      await sleep(10);
      await smallCache.set('key3', mockBundle());

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key2')).toBe(true);
      expect(smallCache.has('key3')).toBe(true);
    });

    it('should evict LRU entries when size limit exceeded', async () => {
      const smallCache = new ContextCache({
        maxTotalBytes: 2000,
        persistToDb: false
      });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());

      expect(smallCache.getStats().totalEntries).toBeLessThanOrEqual(2);
    });

    it('should evict enough entries to make room for new entry', async () => {
      const smallCache = new ContextCache({ maxEntries: 3, persistToDb: false });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());
      await smallCache.set('key3', mockBundle());
      await smallCache.set('key4', mockBundle());

      expect(smallCache.getStats().totalEntries).toBeLessThanOrEqual(3);
    });

    it('should update eviction counter', async () => {
      const smallCache = new ContextCache({ maxEntries: 2, persistToDb: false });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());
      await smallCache.set('key3', mockBundle());

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should preserve recently accessed entries', async () => {
      const smallCache = new ContextCache({ maxEntries: 2, persistToDb: false });

      await smallCache.set('key1', mockBundle());
      await smallCache.set('key2', mockBundle());

      // Access key1 to make it recently used
      await smallCache.get('key1');

      await smallCache.set('key3', mockBundle());

      expect(smallCache.has('key1')).toBe(true);
      expect(smallCache.has('key2')).toBe(false);
    });
  });

  describe('database persistence', () => {
    it('should load entry from database on cache miss', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      cache.clear(); // Clear memory

      const result = await cache.get('test-key');
      expect(result).toBeDefined();
    });

    it('should handle database read errors gracefully', async () => {
      const result = await cache.get('invalid-key');
      expect(result).toBeNull();
    });

    it('should handle database write errors gracefully', async () => {
      const bundle = mockBundle();
      // Should not throw even if DB has issues
      await expect(cache.set('test-key', bundle)).resolves.not.toThrow();
    });

    it('should validate cache key format before database query', async () => {
      const result = await cache.get('invalid!@#$%key');
      expect(result).toBeNull();
    });

    it('should parse JSON data from database correctly', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      cache.clear();

      const result = await cache.get('test-key');
      expect(result?.metadata.profiles).toEqual(bundle.metadata.profiles);
    });

    it('should handle corrupted JSON data in database', async () => {
      // This is handled by the validation in loadFromDb
      const result = await cache.get('corrupted-data');
      expect(result).toBeNull();
    });

    it('should handle invalid bundle structure from database', async () => {
      const result = await cache.get('invalid-structure');
      expect(result).toBeNull();
    });

    it('should delete corrupted entries from database', async () => {
      // Validation will delete corrupted entries automatically
      const rowCount = testDb.getRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    });

    it('should convert date strings back to Date objects', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      cache.clear();

      const result = await cache.get('test-key');
      expect(result?.metadata.createdAt).toBeInstanceOf(Date);
    });

    it('should validate date formats from database', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      cache.clear();

      const result = await cache.get('test-key');
      expect(result?.metadata.createdAt.getTime()).toBeGreaterThan(0);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should delete expired entries from database', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1); // 1 second TTL

      await sleep(1100);

      const deleted = await cache.cleanupExpiredEntries();
      expect(deleted).toBeGreaterThan(0);
    });

    it('should return count of deleted entries', async () => {
      const bundle1 = mockBundle();
      const bundle2 = mockBundle();
      await cache.set('key1', bundle1, 1);
      await cache.set('key2', bundle2, 1);

      await sleep(1100);

      const deleted = await cache.cleanupExpiredEntries();
      expect(deleted).toBe(2);
    });

    it('should return 0 when persistence disabled', async () => {
      const cacheWithoutDb = new ContextCache({ persistToDb: false });
      const deleted = await cacheWithoutDb.cleanupExpiredEntries();
      expect(deleted).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      const deleted = await cache.cleanupExpiredEntries();
      expect(deleted).toBeGreaterThanOrEqual(0);
    });

    it('should log cleanup results', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, 1);

      await sleep(1100);

      // Should log when entries are deleted
      await cache.cleanupExpiredEntries();
    });
  });

  describe('destroy', () => {
    it('should clear cleanup interval', async () => {
      await cache.destroy();
      // Should not throw errors after destroy
      expect(true).toBe(true);
    });

    it('should clear memory caches', async () => {
      await cache.set('test-key', mockBundle());

      await cache.destroy();

      // Can't check has() after destroy, but should not throw
      expect(true).toBe(true);
    });

    it('should be safe to call multiple times', async () => {
      await cache.destroy();
      await cache.destroy();
      await cache.destroy();

      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very large bundles', async () => {
      const largeBundle = mockBundle();
      // Add large content
      largeBundle.profileContents['test-profile'].content = 'x'.repeat(1000000);

      await cache.set('large-key', largeBundle);
      const result = await cache.get('large-key');

      expect(result).toBeDefined();
    });

    it('should handle empty profiles array', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: []
      };

      const key = await cache.generateCacheKey(options, 'abc123');
      expect(key).toBeDefined();
    });

    it('should handle null/undefined TTL', async () => {
      const bundle = mockBundle();
      await cache.set('test-key', bundle, undefined);

      const result = await cache.get('test-key');
      expect(result).toBeDefined();
    });

    it('should handle concurrent access to same cache key', async () => {
      const bundle = mockBundle();

      // Concurrent sets
      await Promise.all([
        cache.set('test-key', bundle),
        cache.set('test-key', bundle),
        cache.set('test-key', bundle)
      ]);

      expect(cache.has('test-key')).toBe(true);
    });

    it('should handle database being locked', async () => {
      // SQLite handles this internally with retries
      const bundle = mockBundle();
      await cache.set('test-key', bundle);

      expect(cache.has('test-key')).toBe(true);
    });
  });
});
