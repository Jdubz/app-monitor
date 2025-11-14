/**
 * Context System Integration Tests
 *
 * End-to-end tests for the complete context system workflow
 * from recipe loading to bundle generation to caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextBundleGenerator } from '../../contextBundleGenerator.js';
import { ContextCache } from '../../contextCache.js';
import { ContextRecipeLoader } from '../../contextRecipeLoader.js';
import type { BundleGenerationOptions } from '../../../../types/contextBundle.js';
import { createTestDatabase, TestDatabase } from '../helpers/testDatabase.js';
import { createTempDir, createTempFile, removeDir } from '../helpers/testUtils.js';
import { mockFileContent } from '../helpers/testMocks.js';
import * as path from 'path';

describe('Context System Integration', () => {
  let cache: ContextCache;
  let testDb: TestDatabase;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    tempDir = await createTempDir('system-integration-');

    cache = new ContextCache({ persistToDb: true, db: testDb.asDevBotsDatabase() });
  });

  afterEach(async () => {
    if (cache) await cache.destroy();
    if (testDb) testDb.destroy();
    if (tempDir) await removeDir(tempDir);
  });

  describe('End-to-end bundle generation', () => {
    it('should generate bundle from real recipe file', async () => {
      // Create test files
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      // Create recipe file
      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: test-integration
version: 1.0.0
description: Integration test recipe for testing
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
    optional: false
sizeLimit:
  maxBytes: 1048576
  maxInlineBytes: 524288
outputs:
  format: markdown
  filename: context-test-integration.md
  includeMetadata: true
`;
      await createTempFile(recipeContent, 'test-integration.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-integration']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
      expect(result.bundle!.profileContents['test-integration']).toBeDefined();
      expect(result.bundle!.profileContents['test-integration'].content).toContain('# Test Document');
    });

    it('should cache generated bundles', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: cache-test
version: 1.0.0
description: Recipe for cache testing
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
`;
      await createTempFile(recipeContent, 'cache-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['cache-test']
      };

      // First generation
      const result1 = await generator.generateBundle(options);
      expect(result1.success).toBe(true);
      expect(result1.cached).toBe(false);

      // Second generation should be cached
      const result2 = await generator.generateBundle(options);
      expect(result2.success).toBe(true);
      expect(result2.cached).toBe(true);
      expect(result2.bundle!.id).toBe(result1.bundle!.id);
    });

    it('should handle multiple profiles', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'doc1.md', backendPath);
      await createTempFile(mockFileContent.code, 'code1.ts', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');

      const recipe1 = `
profile: multi-profile-1
version: 1.0.0
description: First profile for multi-profile test
taskTypes:
  - implementation
sources:
  - type: markdown
    path: doc1.md
`;
      const recipe2 = `
profile: multi-profile-2
version: 1.0.0
description: Second profile for multi-profile test
taskTypes:
  - implementation
sources:
  - type: code
    path: code1.ts
`;

      await createTempFile(recipe1, 'multi-profile-1.yaml', recipePath);
      await createTempFile(recipe2, 'multi-profile-2.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['multi-profile-1', 'multi-profile-2']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(Object.keys(result.bundle!.profileContents)).toHaveLength(2);
      expect(result.bundle!.profileContents['multi-profile-1']).toBeDefined();
      expect(result.bundle!.profileContents['multi-profile-2']).toBeDefined();
    });

    it('should apply transforms during generation', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.code, 'test.ts', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: transform-test
version: 1.0.0
description: Recipe with transform for testing
taskTypes:
  - implementation
sources:
  - type: code
    path: test.ts
    transform: strip-comments
`;
      await createTempFile(recipeContent, 'transform-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['transform-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['transform-test'].content;
      expect(content).not.toContain('/**');
      expect(content).toContain('export class TestClass');
    });

    it('should apply extractions during generation', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: extraction-test
version: 1.0.0
description: Recipe with extraction for testing
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
    extract:
      headings:
        - Introduction
        - Features
`;
      await createTempFile(recipeContent, 'extraction-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['extraction-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['extraction-test'].content;
      expect(content).toContain('## Introduction');
      expect(content).toContain('## Features');
    });

    it('should respect size limits', async () => {
      const largeContent = 'x'.repeat(2000);
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(largeContent, 'large.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: size-limit-test
version: 1.0.0
description: Recipe with size limit for testing
required: true
taskTypes:
  - implementation
sources:
  - type: markdown
    path: large.md
    optional: false
sizeLimit:
  maxBytes: 1500
`;
      await createTempFile(recipeContent, 'size-limit-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['size-limit-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('exceeded size limit');
    });

    it('should handle optional sources gracefully', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'exists.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: optional-source-test
version: 1.0.0
description: Recipe with optional sources
taskTypes:
  - implementation
sources:
  - type: markdown
    path: exists.md
    optional: false
  - type: markdown
    path: missing.md
    optional: true
`;
      await createTempFile(recipeContent, 'optional-source-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['optional-source-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['optional-source-test'].content).toContain('# Test Document');
    });

    it('should fail when required source is missing', async () => {
      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: missing-required-test
version: 1.0.0
description: Recipe with missing required source
taskTypes:
  - implementation
sources:
  - type: markdown
    path: missing.md
    optional: false
required: true
`;
      await createTempFile(recipeContent, 'missing-required-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['missing-required-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should filter recipes by task type', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');

      const recipe1 = `
profile: impl-recipe
version: 1.0.0
description: Implementation recipe
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
`;
      const recipe2 = `
profile: fix-recipe
version: 1.0.0
description: Fix recipe
taskTypes:
  - fix
sources:
  - type: markdown
    path: test.md
`;

      await createTempFile(recipe1, 'impl-recipe.yaml', recipePath);
      await createTempFile(recipe2, 'fix-recipe.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['impl-recipe']).toBeDefined();
      expect(result.bundle!.profileContents['fix-recipe']).toBeUndefined();
    });

    it('should generate metadata when configured', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: metadata-test
version: 1.0.0
description: Recipe with metadata enabled
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
outputs:
  format: markdown
  filename: context-metadata-test.md
  includeMetadata: true
`;
      await createTempFile(recipeContent, 'metadata-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['metadata-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['metadata-test'].content;
      expect(content).toContain('# metadata-test Context');
      expect(content).toContain('**Version:** 1.0.0');
      expect(content).toContain('**Description:** Recipe with metadata enabled');
    });

    it('should include constraints and investigation steps', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: guidance-test
version: 1.0.0
description: Recipe with constraints and steps
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
constraints:
  - Stay within the defined scope
  - Follow coding standards
investigationSteps:
  - Review the implementation
  - Check for edge cases
`;
      await createTempFile(recipeContent, 'guidance-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['guidance-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['guidance-test'].content;
      expect(content).toContain('## Constraints');
      expect(content).toContain('Stay within the defined scope');
      expect(content).toContain('## Investigation Steps');
      expect(content).toContain('Review the implementation');
    });

    it('should respect force flag to bypass cache', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipePath = path.join(tempDir, 'config', 'context-recipes');
      const recipeContent = `
profile: force-test
version: 1.0.0
description: Recipe for force flag testing
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
`;
      await createTempFile(recipeContent, 'force-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['force-test']
      };

      // First generation
      const result1 = await generator.generateBundle(options);
      expect(result1.cached).toBe(false);

      // Second with force should regenerate
      const result2 = await generator.generateBundle({ ...options, force: true });
      expect(result2.cached).toBe(false);
      expect(result2.bundle!.id).not.toBe(result1.bundle!.id);
    });
  });
});
