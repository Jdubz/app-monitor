/**
 * Context Database Integration Tests
 *
 * Integration tests for database persistence, cache storage,
 * and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextCache } from '../../contextCache.js';
import { createTestDatabase, TestDatabase } from '../helpers/testDatabase.js';
import { mockBundle } from '../helpers/testMocks.js';

describe('Context Database Integration', () => {
  let cache: ContextCache;
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    cache = new ContextCache({ persistToDb: true });
  });

  afterEach(async () => {
    if (cache) await cache.destroy();
    if (testDb) testDb.destroy();
  });

  describe('Cache persistence', () => {
    it('should persist bundle to database on set', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      const db = testDb.getConnection();
      const entry = db.prepare('SELECT * FROM context_bundle_cache WHERE cache_key = ?').get(cacheKey);

      expect(entry).toBeDefined();
      expect((entry as any).cache_key).toBe(cacheKey);
    });

    it('should load bundle from database on get', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // First set
      await cache.set(cacheKey, bundle);

      // Clear memory cache
      cache.clear();

      // Should load from DB
      const retrieved = await cache.get(cacheKey);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(bundle.id);
    });

    it('should update hit count on database access', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);
      cache.clear();

      // First hit
      await cache.get(cacheKey);

      const db = testDb.getConnection();
      let entry: any = db.prepare('SELECT hit_count FROM context_bundle_cache WHERE cache_key = ?').get(cacheKey);
      expect(entry.hit_count).toBe(1);

      // Second hit
      await cache.get(cacheKey);
      entry = db.prepare('SELECT hit_count FROM context_bundle_cache WHERE cache_key = ?').get(cacheKey);
      expect(entry.hit_count).toBe(2);
    });

    it('should update last_accessed_at on access', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);
      cache.clear();

      const db = testDb.getConnection();
      const before: any = db.prepare('SELECT last_accessed_at FROM context_bundle_cache WHERE cache_key = ?').get(cacheKey);
      const beforeTime = new Date(before.last_accessed_at).getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      await cache.get(cacheKey);

      const after: any = db.prepare('SELECT last_accessed_at FROM context_bundle_cache WHERE cache_key = ?').get(cacheKey);
      const afterTime = new Date(after.last_accessed_at).getTime();

      expect(afterTime).toBeGreaterThan(beforeTime);
    });

    it('should handle database unavailable gracefully', async () => {
      // Create cache without database
      const cacheNoDB = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cacheNoDB.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Should not throw
      await cacheNoDB.set(cacheKey, bundle);

      // Should work from memory
      const retrieved = await cacheNoDB.get(cacheKey);
      expect(retrieved).toBeDefined();

      await cacheNoDB.destroy();
    });
  });

  describe('Database cleanup', () => {
    it('should remove expired entries from database', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Set with very short TTL
      await cache.set(cacheKey, bundle, 1);

      const db = testDb.getConnection();
      let count = db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };
      expect(count.count).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Cleanup
      const removed = await cache.cleanupExpiredEntries();
      expect(removed).toBe(1);

      count = db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };
      expect(count.count).toBe(0);
    });

    it('should not remove non-expired entries', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Set with long TTL
      await cache.set(cacheKey, bundle, 3600);

      const removed = await cache.cleanupExpiredEntries();
      expect(removed).toBe(0);

      const db = testDb.getConnection();
      const count = db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };
      expect(count.count).toBe(1);
    });

    it('should evict LRU entries when cache is full', async () => {
      const cache = new ContextCache({ maxEntries: 3, persistToDb: true });

      const bundles = [
        mockBundle({ id: 'bundle-1' }),
        mockBundle({ id: 'bundle-2' }),
        mockBundle({ id: 'bundle-3' }),
        mockBundle({ id: 'bundle-4' })
      ];

      const keys = await Promise.all(
        bundles.map((_, i) =>
          cache.generateCacheKey({
            taskType: 'implementation',
            profiles: [`profile-${i}`]
          })
        )
      );

      // Add 4 bundles (max is 3)
      await cache.set(keys[0], bundles[0]);
      await cache.set(keys[1], bundles[1]);
      await cache.set(keys[2], bundles[2]);
      await cache.set(keys[3], bundles[3]); // Should evict keys[0]

      // First one should be evicted
      const evicted = await cache.get(keys[0]);
      expect(evicted).toBeNull();

      // Others should still exist
      const exists = await cache.get(keys[3]);
      expect(exists).toBeDefined();

      await cache.destroy();
    });
  });

  describe('Database transactions', () => {
    it('should handle concurrent database writes', async () => {
      const bundles = Array.from({ length: 10 }, (_, i) => mockBundle({ id: `bundle-${i}` }));

      const keys = await Promise.all(
        bundles.map((_, i) =>
          cache.generateCacheKey({
            taskType: 'implementation',
            profiles: [`profile-${i}`]
          })
        )
      );

      // Write all concurrently
      await Promise.all(
        bundles.map((bundle, i) => cache.set(keys[i], bundle))
      );

      const db = testDb.getConnection();
      const count = db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };
      expect(count.count).toBe(10);
    });

    it('should handle concurrent reads', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      // Read concurrently
      const results = await Promise.all(
        Array.from({ length: 10 }, () => cache.get(cacheKey))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result!.id).toBe(bundle.id);
      });
    });
  });

  describe('Database schema', () => {
    it('should have all required columns', () => {
      const db = testDb.getConnection();
      const columns = db.prepare("PRAGMA table_info(context_bundle_cache)").all() as any[];

      const columnNames = columns.map((col: any) => col.name);

      expect(columnNames).toContain('bundle_id');
      expect(columnNames).toContain('cache_key');
      expect(columnNames).toContain('task_type');
      expect(columnNames).toContain('profiles');
      expect(columnNames).toContain('mount_path');
      expect(columnNames).toContain('size_bytes');
      expect(columnNames).toContain('bundle_content');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('hit_count');
      expect(columnNames).toContain('last_accessed_at');
    });

    it('should have cache_key as primary key', () => {
      const db = testDb.getConnection();
      const columns = db.prepare("PRAGMA table_info(context_bundle_cache)").all() as any[];

      const cacheKeyColumn = columns.find((col: any) => col.name === 'cache_key');
      expect(cacheKeyColumn).toBeDefined();
      expect(cacheKeyColumn.pk).toBe(1);
    });

    it('should have index on bundle_id', () => {
      const db = testDb.getConnection();
      const indexes = db.prepare("PRAGMA index_list(context_bundle_cache)").all() as any[];

      const bundleIdIndex = indexes.find((idx: any) => idx.name === 'idx_context_bundle_cache_bundle_id');
      expect(bundleIdIndex).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors during write', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Close database to force error
      testDb.destroy();

      // Should not throw, should gracefully degrade
      await expect(cache.set(cacheKey, bundle)).resolves.not.toThrow();
    });

    it('should handle database errors during read', async () => {
      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      // Close database
      testDb.destroy();

      // Should return null gracefully
      const result = await cache.get(cacheKey);
      expect(result).toBeNull();
    });
  });

  describe('Data integrity', () => {
    it('should store and retrieve exact bundle data', async () => {
      const bundle = mockBundle({
        profileContents: {
          'test-profile': {
            profile: 'test-profile',
            content: 'Test content with special characters: café, 日本語, emoji 🚀',
            sizeBytes: 100,
            sources: ['test.md', 'another.md'],
            generatedAt: new Date()
          }
        }
      });

      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);
      cache.clear();

      const retrieved = await cache.get(cacheKey);

      expect(retrieved).toBeDefined();
      expect(retrieved!.profileContents['test-profile'].content).toBe(bundle.profileContents['test-profile'].content);
      expect(retrieved!.profileContents['test-profile'].sources).toEqual(bundle.profileContents['test-profile'].sources);
    });

    it('should handle large bundles', async () => {
      const largeContent = 'x'.repeat(500000); // 500KB
      const bundle = mockBundle({
        profileContents: {
          'large-profile': {
            profile: 'large-profile',
            content: largeContent,
            sizeBytes: largeContent.length,
            sources: ['large.md'],
            generatedAt: new Date()
          }
        }
      });

      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['large-profile']
      });

      await cache.set(cacheKey, bundle);
      cache.clear();

      const retrieved = await cache.get(cacheKey);

      expect(retrieved).toBeDefined();
      expect(retrieved!.profileContents['large-profile'].content.length).toBe(largeContent.length);
    });
  });

  describe('Cache statistics', () => {
    it('should track cache size in database', async () => {
      const bundles = [
        mockBundle({ id: 'bundle-1' }),
        mockBundle({ id: 'bundle-2' }),
        mockBundle({ id: 'bundle-3' })
      ];

      const keys = await Promise.all(
        bundles.map((_, i) =>
          cache.generateCacheKey({
            taskType: 'implementation',
            profiles: [`profile-${i}`]
          })
        )
      );

      await Promise.all(bundles.map((bundle, i) => cache.set(keys[i], bundle)));

      const db = testDb.getConnection();
      const count = db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };

      expect(count.count).toBe(3);
    });

    it('should track total size of cached bundles', async () => {
      const bundles = [
        mockBundle({ id: 'bundle-1' }),
        mockBundle({ id: 'bundle-2' })
      ];

      const keys = await Promise.all(
        bundles.map((_, i) =>
          cache.generateCacheKey({
            taskType: 'implementation',
            profiles: [`profile-${i}`]
          })
        )
      );

      await Promise.all(bundles.map((bundle, i) => cache.set(keys[i], bundle)));

      const db = testDb.getConnection();
      const result: any = db.prepare('SELECT SUM(size_bytes) as total FROM context_bundle_cache').get();

      expect(result.total).toBeGreaterThan(0);
    });
  });
});
