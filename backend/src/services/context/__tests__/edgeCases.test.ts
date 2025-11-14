/**
 * Edge Cases and Performance Tests
 *
 * Tests for edge cases, boundary conditions, concurrent operations,
 * and performance characteristics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextCache } from '../contextCache.js';
import { ContextBundleGenerator } from '../contextBundleGenerator.js';
import { ContextTransforms } from '../contextTransforms.js';
import { ContextRecipeValidator } from '../contextRecipeValidator.js';
import { createTestDatabase, TestDatabase } from './helpers/testDatabase.js';
import { mockBundle, mockRecipe, mockFileContent } from './helpers/testMocks.js';
import { createTempDir, removeDir, createTempFile } from './helpers/testUtils.js';
import type { BundleGenerationOptions } from '../../../types/contextBundle.js';
import * as path from 'path';

describe('Edge Cases and Performance', () => {
  let testDb: TestDatabase;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    tempDir = await createTempDir('edge-cases-');
  });

  afterEach(async () => {
    if (testDb) testDb.destroy();
    if (tempDir) await removeDir(tempDir);
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent cache writes', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundles = Array.from({ length: 20 }, (_, i) => mockBundle({ id: `concurrent-${i}` }));

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

      // Verify all are cached
      const results = await Promise.all(
        keys.map(key => cache.get(key))
      );

      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result!.id).toBe(bundles[i].id);
      });

      await cache.destroy();
    });

    it('should handle concurrent cache reads', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      // Read concurrently
      const results = await Promise.all(
        Array.from({ length: 100 }, () => cache.get(cacheKey))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result!.id).toBe(bundle.id);
      });

      await cache.destroy();
    });

    it('should handle concurrent recipe validation', async () => {
      const validator = new ContextRecipeValidator();

      const recipes = Array.from({ length: 50 }, (_, i) =>
        mockRecipe({ profile: `profile-${i}` })
      );

      const results = await Promise.all(
        recipes.map(recipe => validator.validate(recipe))
      );

      results.forEach(result => {
        expect(result.valid).toBe(true);
      });
    });

    it('should handle concurrent transform operations', async () => {
      const transforms = new ContextTransforms();

      const contents = Array.from({ length: 50 }, () => mockFileContent.markdown);

      const results = await Promise.all(
        contents.map(content => transforms.summarize(content))
      );

      results.forEach(result => {
        expect(result).toContain('# Test Document');
      });
    });
  });

  describe('Large data handling', () => {
    it('should handle very large bundles', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const largeContent = 'x'.repeat(5000000); // 5MB
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

      const retrieved = await cache.get(cacheKey);

      expect(retrieved).toBeDefined();
      expect(retrieved!.profileContents['large-profile'].content.length).toBe(largeContent.length);

      await cache.destroy();
    });

    it('should handle many small files in a bundle', async () => {
      const backendPath = path.join(tempDir, 'backend');

      // Create 100 small files
      for (let i = 0; i < 100; i++) {
        await createTempFile(`Content ${i}`, `file${i}.txt`, backendPath);
      }

      const sources = Array.from({ length: 100 }, (_, i) => ({
        type: 'text' as const,
        path: `file${i}.txt`,
        optional: false
      }));

      const recipeContent = `
profile: many-files-test
version: 1.0.0
description: Test many files
taskTypes:
  - implementation
sources: ${JSON.stringify(sources)}
`;

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      await createTempFile(recipeContent, 'many-files-test.yaml', recipePath);

      const { ContextRecipeLoader } = await import('../contextRecipeLoader.js');
      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['many-files-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['many-files-test'].sources).toHaveLength(100);

      await cache.destroy();
    });

    it('should handle deeply nested JSON extraction', async () => {
      const transforms = new ContextTransforms();

      const deepJson = JSON.stringify({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'found'
                }
              }
            }
          }
        }
      });

      const result = transforms.extractJsonPath(deepJson, '$.level1.level2.level3.level4.level5.value');

      expect(result).toBe('found');
    });

    it('should handle long markdown documents', async () => {
      const transforms = new ContextTransforms();

      const longMarkdown = Array.from({ length: 1000 }, (_, i) => `# Heading ${i}\n\nContent for section ${i}.`).join('\n\n');

      const result = transforms.summarize(longMarkdown);

      expect(result).toContain('# Heading 0');
      expect(result).toContain('# Heading 999');
    });
  });

  describe('Boundary conditions', () => {
    it('should handle cache at max capacity', async () => {
      const cache = new ContextCache({ maxEntries: 5, persistToDb: false });

      const bundles = Array.from({ length: 10 }, (_, i) => mockBundle({ id: `bundle-${i}` }));

      const keys = await Promise.all(
        bundles.map((_, i) =>
          cache.generateCacheKey({
            taskType: 'implementation',
            profiles: [`profile-${i}`]
          })
        )
      );

      // Add more than max
      for (let i = 0; i < bundles.length; i++) {
        await cache.set(keys[i], bundles[i]);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(5);

      await cache.destroy();
    });

    it('should handle zero-sized cache', async () => {
      const cache = new ContextCache({ maxEntries: 0, persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);

      await cache.destroy();
    });

    it('should handle TTL at minimum (1 second)', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle, 1);

      // Should exist immediately
      expect(await cache.get(cacheKey)).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Cleanup
      await cache.cleanupExpiredEntries();

      // Should be expired
      expect(await cache.get(cacheKey)).toBeNull();

      await cache.destroy();
    });

    it('should handle empty cache operations', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      cache.clear();
      expect(cache.getStats().totalEntries).toBe(0);

      await cache.destroy();
    });

    it('should handle validator with minimal valid recipe', async () => {
      const validator = new ContextRecipeValidator();

      const minimalRecipe = {
        profile: 'minimal',
        version: '1.0.0',
        description: 'Minimal valid recipe for testing',
        sources: [{ type: 'markdown', path: 'test.md' }]
      };

      const result = validator.validate(minimalRecipe);

      expect(result.valid).toBe(true);
    });

    it('should handle transform with empty content', async () => {
      const transforms = new ContextTransforms();

      expect(transforms.summarize('')).toBe('');
      expect(transforms.stripComments('')).toBe('');
      expect(transforms.minify('')).toBe('');
      expect(transforms.bulletList('')).toBe('');
    });
  });

  describe('Error recovery', () => {
    it('should recover from corrupted cache data', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      // Simulate corruption by clearing memory without destroying
      cache.clear();

      // Should handle gracefully
      const retrieved = await cache.get(cacheKey);
      expect(retrieved).toBeNull();

      await cache.destroy();
    });

    it('should handle invalid JSON in extractJsonPath', async () => {
      const transforms = new ContextTransforms();

      const result = transforms.extractJsonPath('{ invalid json }', '$.test');

      expect(result).toBe('');
    });

    it('should handle malformed markdown in extractHeadings', async () => {
      const transforms = new ContextTransforms();

      const malformed = '###No space\n#### ## Mixed\n##### ';

      const result = transforms.extractHeadings(malformed, ['test']);

      expect(result).toBeDefined();
    });
  });

  describe('Memory efficiency', () => {
    it('should not leak memory on repeated operations', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await cache.set(cacheKey, bundle);
        await cache.get(cacheKey);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1); // Should only have one entry

      await cache.destroy();
    });

    it('should efficiently handle cache eviction', async () => {
      const cache = new ContextCache({ maxEntries: 10, persistToDb: false });

      // Add 100 bundles (should evict 90)
      for (let i = 0; i < 100; i++) {
        const bundle = mockBundle({ id: `bundle-${i}` });
        const key = await cache.generateCacheKey({
          taskType: 'implementation',
          profiles: [`profile-${i}`]
        });
        await cache.set(key, bundle);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(10);

      await cache.destroy();
    });
  });

  describe('Performance benchmarks', () => {
    it('should generate cache key quickly', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cache.generateCacheKey({
          taskType: 'implementation',
          profiles: ['test-profile'],
          targetFiles: ['file1.ts', 'file2.ts']
        });
      }

      const duration = Date.now() - start;

      // Should complete 1000 cache key generations in under 1 second
      expect(duration).toBeLessThan(1000);

      await cache.destroy();
    });

    it('should validate recipes quickly', async () => {
      const validator = new ContextRecipeValidator();

      const recipe = mockRecipe();

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        validator.validate(recipe);
      }

      const duration = Date.now() - start;

      // Should complete 1000 validations in under 500ms
      expect(duration).toBeLessThan(500);
    });

    it('should transform content quickly', async () => {
      const transforms = new ContextTransforms();

      const content = mockFileContent.markdown;

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        transforms.summarize(content);
      }

      const duration = Date.now() - start;

      // Should complete 1000 transforms in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Race conditions', () => {
    it('should handle simultaneous cache set and get', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      // Simultaneously set and get
      const [, getResult] = await Promise.all([
        cache.set(cacheKey, bundle),
        cache.get(cacheKey)
      ]);

      // Get might be null or the bundle, both are acceptable
      expect(getResult === null || getResult?.id === bundle.id).toBe(true);

      await cache.destroy();
    });

    it('should handle simultaneous cache clear and get', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const bundle = mockBundle();
      const cacheKey = await cache.generateCacheKey({
        taskType: 'implementation',
        profiles: ['test-profile']
      });

      await cache.set(cacheKey, bundle);

      // Simultaneously clear and get
      await Promise.all([
        (async () => { cache.clear(); })(),
        cache.get(cacheKey)
      ]);

      // Should not crash
      expect(true).toBe(true);

      await cache.destroy();
    });
  });

  describe('Stress tests', () => {
    it('should handle rapid cache operations', async () => {
      const cache = new ContextCache({ persistToDb: false });

      const operations = [];

      for (let i = 0; i < 100; i++) {
        const bundle = mockBundle({ id: `bundle-${i}` });
        const key = await cache.generateCacheKey({
          taskType: 'implementation',
          profiles: [`profile-${i}`]
        });

        operations.push(cache.set(key, bundle));
        operations.push(cache.get(key));
        operations.push(cache.has(key));
      }

      await Promise.all(operations);

      expect(cache.getStats().totalEntries).toBeGreaterThan(0);

      await cache.destroy();
    });

    it('should handle rapid validation requests', async () => {
      const validator = new ContextRecipeValidator();

      const recipes = Array.from({ length: 100 }, (_, i) =>
        mockRecipe({ profile: `profile-${i}` })
      );

      const start = Date.now();

      const results = await Promise.all(
        recipes.map(recipe => validator.validate(recipe))
      );

      const duration = Date.now() - start;

      results.forEach(result => {
        expect(result.valid).toBe(true);
      });

      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});
