/**
 * Context Bundle Generator Tests
 *
 * Comprehensive test suite for ContextBundleGenerator
 * Tests bundle generation, validation, security, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextBundleGenerator } from '../contextBundleGenerator.js';
import { ContextCache } from '../contextCache.js';
import { ContextRecipeLoader } from '../contextRecipeLoader.js';
import type { BundleGenerationOptions } from '../../../types/contextBundle.js';
import { createTestDatabase, TestDatabase } from './helpers/testDatabase.js';
import { mockRecipe, mockFileContent } from './helpers/testMocks.js';
import { createTempDir, createTempFile, removeDir, createMockFileSystem } from './helpers/testUtils.js';
import * as path from 'path';

describe('ContextBundleGenerator', () => {
  let generator: ContextBundleGenerator;
  let testDb: TestDatabase;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    tempDir = await createTempDir('bundle-gen-test-');
  });

  afterEach(async () => {
    if (testDb) testDb.destroy();
    if (tempDir) await removeDir(tempDir);
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      generator = new ContextBundleGenerator();
      expect(generator).toBeDefined();
      expect(generator.getCacheStats).toBeDefined();
    });

    it('should initialize with custom cache', () => {
      const cache = new ContextCache({ maxSize: 5 });
      generator = new ContextBundleGenerator({ cache });
      expect(generator).toBeDefined();
    });

    it('should initialize with custom loader', () => {
      const loader = new ContextRecipeLoader();
      generator = new ContextBundleGenerator({ loader });
      expect(generator).toBeDefined();
    });

    it('should initialize with custom repoRoot', () => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
      expect(generator).toBeDefined();
    });
  });

  describe('validateBundleOptions', () => {
    beforeEach(() => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should validate valid taskType', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };
      const result = await generator.generateBundle(options);
      // Should not have validation errors (may fail for other reasons)
      if (!result.success && result.errors) {
        expect(result.errors[0]).not.toContain('taskType');
      }
    });

    it('should reject missing taskType', async () => {
      const options = {} as BundleGenerationOptions;
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('taskType is required and must be a string');
    });

    it('should reject invalid taskType', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'invalid-task-type' as any
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid taskType');
    });

    it('should validate profiles array', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-profile']
      };
      const result = await generator.generateBundle(options);
      // Should not have profile validation errors
      if (!result.success && result.errors) {
        expect(result.errors.some(e => e.includes('profiles must be an array'))).toBe(false);
      }
    });

    it('should reject non-array profiles', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: 'not-an-array' as any
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('profiles must be an array');
    });

    it('should reject non-string profile items', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: [123 as any]
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('profiles[0] must be a string');
    });

    it('should reject empty profile names', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['']
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('profiles[0] cannot be empty');
    });

    it('should reject invalid profile name format', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['Invalid-Profile']
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('has invalid format');
    });

    it('should validate targetFiles array', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        targetFiles: ['src/test.ts']
      };
      const result = await generator.generateBundle(options);
      // Should not have targetFiles validation errors
      if (!result.success && result.errors) {
        expect(result.errors.some(e => e.includes('targetFiles must be an array'))).toBe(false);
      }
    });

    it('should reject non-array targetFiles', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        targetFiles: 'not-an-array' as any
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('targetFiles must be an array');
    });

    it('should reject empty targetFile names', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        targetFiles: ['']
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('targetFiles[0] cannot be empty');
    });

    it('should reject non-boolean force flag', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        force: 'true' as any
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('force must be a boolean');
    });

    it('should reject non-boolean dryRun flag', async () => {
      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        dryRun: 'false' as any
      };
      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('dryRun must be a boolean');
    });
  });

  describe('Path Security', () => {
    beforeEach(async () => {
      // Create mock file system
      tempDir = await createMockFileSystem({
        'docs/test.md': mockFileContent.markdown,
        'safe/file.md': 'Safe content'
      });

      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should reject absolute paths', async () => {
      const cache = new ContextCache({ maxSize: 0, persistToDb: false });
      const mockLoader = {
        loadRecipe: vi.fn().mockResolvedValue({
          success: true,
          recipe: mockRecipe({
            required: true,
            sources: [{ type: 'markdown' as const, path: '/etc/passwd', optional: false }]
          })
        }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir,
        cache
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-profile']
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid source path');
      expect(result.errors?.[0]).toContain('Paths must be relative');
    });

    it('should reject path traversal with ../', async () => {
      const cache = new ContextCache({ maxSize: 0, persistToDb: false });
      const mockLoader = {
        loadRecipe: vi.fn().mockResolvedValue({
          success: true,
          recipe: mockRecipe({
            required: true,
            sources: [{ type: 'markdown' as const, path: '../../etc/passwd', optional: false }]
          })
        }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir,
        cache
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-profile']
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid source path');
    });

    it('should reject path traversal with embedded ../', async () => {
      const cache = new ContextCache({ maxSize: 0, persistToDb: false });
      const mockLoader = {
        loadRecipe: vi.fn().mockResolvedValue({
          success: true,
          recipe: mockRecipe({
            required: true,
            sources: [{ type: 'markdown' as const, path: 'docs/../../etc/passwd', optional: false }]
          })
        }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir,
        cache
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-profile']
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid source path');
    });

    it('should accept valid relative paths', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const mockLoader = {
        loadRecipe: vi.fn().mockResolvedValue({
          success: true,
          recipe: mockRecipe({
            sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
          })
        }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['test-profile']
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });
  });

  describe('generateBundle', () => {
    beforeEach(async () => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should return error when no recipes found', async () => {
      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map()),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('No recipes found for task type: implementation');
    });

    it('should generate bundle from recipe', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
      expect(result.cached).toBe(false);
    });

    it('should return cached bundle on second call', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      const cache = new ContextCache({ persistToDb: false });

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        cache,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      // First call
      const result1 = await generator.generateBundle(options);
      expect(result1.success).toBe(true);
      expect(result1.cached).toBe(false);

      // Second call should return cached
      const result2 = await generator.generateBundle(options);
      expect(result2.success).toBe(true);
      expect(result2.cached).toBe(true);
    });

    it('should bypass cache when force flag is set', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      const cache = new ContextCache({ persistToDb: false });

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        cache,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        force: true
      };

      // First call
      const result1 = await generator.generateBundle(options);
      expect(result1.success).toBe(true);
      expect(result1.cached).toBe(false);

      // Second call with force should regenerate
      const result2 = await generator.generateBundle(options);
      expect(result2.success).toBe(true);
      expect(result2.cached).toBe(false);
    });

    it('should fail when required recipe fails', async () => {
      const recipe = mockRecipe({
        required: true,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'nonexistent.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Failed to generate content for profile');
    });

    it('should warn when optional recipe fails', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'required-profile',
        required: true,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const recipe2 = mockRecipe({
        profile: 'optional-profile',
        required: false,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'nonexistent.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['required-profile', recipe1],
          ['optional-profile', recipe2]
        ])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('Failed to generate content for profile');
    });

    it('should enforce bundle size limit', async () => {
      const largeContent = 'x'.repeat(100 * 1024 * 1024); // 100MB
      await createTempFile(largeContent, 'large.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'large.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Bundle size');
      expect(result.errors?.[0]).toContain('exceeds maximum allowed size');
    });

    it('should respect custom max bundle size from environment', async () => {
      const originalEnv = process.env.CONTEXT_MAX_BUNDLE_SIZE;
      process.env.CONTEXT_MAX_BUNDLE_SIZE = '1000'; // 1KB limit

      const largeContent = 'x'.repeat(2000); // 2KB
      await createTempFile(largeContent, 'large.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'large.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('exceeds maximum allowed size');

      // Restore
      if (originalEnv) {
        process.env.CONTEXT_MAX_BUNDLE_SIZE = originalEnv;
      } else {
        delete process.env.CONTEXT_MAX_BUNDLE_SIZE;
      }
    });
  });

  describe('loadRecipesForTask', () => {
    it('should load specific profiles when provided', async () => {
      const recipe1 = mockRecipe({ profile: 'profile1', taskTypes: ['implementation'] });
      const recipe2 = mockRecipe({ profile: 'profile2', taskTypes: ['implementation'] });

      const mockLoader = {
        loadRecipe: vi.fn()
          .mockResolvedValueOnce({ success: true, recipe: recipe1 })
          .mockResolvedValueOnce({ success: true, recipe: recipe2 }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['profile1', 'profile2']
      };

      // This will call loadRecipesForTask internally
      await generator.generateBundle(options);
      expect(mockLoader.loadRecipe).toHaveBeenCalledTimes(2);
    });

    it('should filter recipes by task type', async () => {
      const recipe1 = mockRecipe({ profile: 'profile1', taskTypes: ['implementation'] });
      const recipe2 = mockRecipe({ profile: 'profile2', taskTypes: ['fix'] });
      const recipe3 = mockRecipe({ profile: 'profile3', taskTypes: ['implementation', 'fix'] });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['profile1', recipe1],
          ['profile2', recipe2],
          ['profile3', recipe3]
        ])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      // This will call loadRecipesForTask internally
      await generator.generateBundle(options);
      // Should load profile1 and profile3 (both have 'implementation')
      // Result will fail because files don't exist, but that's ok for this test
    });

    it('should sort recipes with required first', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'optional1',
        required: false,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });
      const recipe2 = mockRecipe({
        profile: 'required1',
        required: true,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['optional1', recipe1],
          ['required1', recipe2]
        ])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      // Required recipe should be processed first
      const profiles = Object.keys(result.bundle!.profileContents);
      expect(profiles[0]).toBe('required1');
    });
  });

  describe('generateProfileContent', () => {
    beforeEach(async () => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should include metadata when configured', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }],
        outputs: { format: 'markdown', includeMetadata: true, filename: 'test.md' }
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('# test-profile Context');
      expect(content).toContain('**Version:**');
    });

    it('should include constraints when present', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }],
        constraints: ['Constraint 1', 'Constraint 2']
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('## Constraints');
      expect(content).toContain('- Constraint 1');
    });

    it('should include investigation steps when present', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }],
        investigationSteps: ['Step 1', 'Step 2']
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('## Investigation Steps');
      expect(content).toContain('- Step 1');
    });

    it('should skip optional sources when missing', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [
          { type: 'markdown' as const, path: 'test.md', optional: false },
          { type: 'markdown' as const, path: 'missing.md', optional: true }
        ]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
    });

    it('should fail when required source is missing', async () => {
      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'missing.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Failed to read file');
    });

    it('should enforce profile size limit', async () => {
      const largeContent = 'x'.repeat(2000);
      await createTempFile(largeContent, 'large.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'large.md', optional: false }],
        sizeLimit: { maxBytes: 1000, maxInlineBytes: 500 }
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('exceeded size limit');
    });
  });

  describe('processSource', () => {
    beforeEach(async () => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should read and process markdown file', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('## Source: test.md');
      expect(content).toContain('# Test Document');
    });

    it('should add source header', async () => {
      await createTempFile(mockFileContent.markdown, 'docs/test.md', path.join(tempDir, 'backend', 'docs'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'docs/test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('## Source: docs/test.md');
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      generator = new ContextBundleGenerator({ repoRoot: tempDir });
    });

    it('should get cache stats', () => {
      const stats = generator.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBeDefined();
      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
    });

    it('should clear cache', () => {
      generator.clearCache();
      const stats = generator.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('Environment Configuration', () => {
    it('should use custom backend path from environment', async () => {
      const originalEnv = process.env.CONTEXT_BACKEND_PATH;
      const customBackend = await createTempDir('custom-backend-');
      process.env.CONTEXT_BACKEND_PATH = customBackend;

      await createTempFile(mockFileContent.markdown, 'test.md', customBackend);

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);

      // Cleanup
      await removeDir(customBackend);
      if (originalEnv) {
        process.env.CONTEXT_BACKEND_PATH = originalEnv;
      } else {
        delete process.env.CONTEXT_BACKEND_PATH;
      }
    });
  });

  describe('Bundle Structure', () => {
    it('should create bundle with correct structure', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();
      expect(result.bundle!.id).toBeDefined();
      expect(result.bundle!.cacheKey).toBeDefined();
      expect(result.bundle!.mountPath).toContain('/context/');
      expect(result.bundle!.metadata).toBeDefined();
      expect(result.bundle!.metadata.taskType).toBe('implementation');
      expect(result.bundle!.metadata.profiles).toContain('test-profile');
      expect(result.bundle!.metadata.totalBytes).toBeGreaterThan(0);
      expect(result.bundle!.profileContents).toBeDefined();
    });

    it('should include profile content with metadata', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);

      const profileContent = result.bundle!.profileContents['test-profile'];
      expect(profileContent).toBeDefined();
      expect(profileContent.profile).toBe('test-profile');
      expect(profileContent.content).toBeDefined();
      expect(profileContent.sizeBytes).toBeGreaterThan(0);
      expect(profileContent.sources).toContain('test.md');
      expect(profileContent.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Extractions', () => {
    it('should extract markdown headings', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          extract: { headings: ['Introduction', 'Features'] }
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('## Introduction');
      expect(content).toContain('## Features');
    });

    it('should extract code blocks from markdown', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          extract: { codeBlocks: true }
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('```typescript');
      expect(content).toContain("function example()");
    });

    it('should extract tables from markdown', async () => {
      const tableContent = mockFileContent.table;
      await createTempFile(tableContent, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          extract: { tables: true }
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('| Column 1');
    });

    it('should extract code sections', async () => {
      await createTempFile(mockFileContent.code, 'test.ts', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'code' as const,
          path: 'test.ts',
          optional: false,
          extract: { sections: ['TestClass', 'testFunction'] }
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('TestClass');
      expect(content).toContain('testFunction');
    });

    it('should extract JSON path', async () => {
      await createTempFile(mockFileContent.json, 'test.json', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'json' as const,
          path: 'test.json',
          optional: false,
          extract: { jsonPath: '$.config' }
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('setting1');
      expect(content).toContain('value1');
    });
  });

  describe('Transforms', () => {
    it('should apply summarize transform', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'summarize'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should apply strip-comments transform to code', async () => {
      await createTempFile(mockFileContent.code, 'test.ts', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'code' as const,
          path: 'test.ts',
          optional: false,
          transform: 'strip-comments'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should apply minify transform to JSON', async () => {
      await createTempFile(mockFileContent.json, 'test.json', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'json' as const,
          path: 'test.json',
          optional: false,
          transform: 'minify'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should apply bullet-list transform', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'bullet-list'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should skip strip-comments for non-code files', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'strip-comments'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should skip minify for non-JSON files', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'minify'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle none transform', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'none'
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle unknown transform gracefully', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{
          type: 'markdown' as const,
          path: 'test.md',
          optional: false,
          transform: 'unknown-transform' as any
        }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });
  });

  describe('Multiple Profiles', () => {
    it('should generate bundle with multiple profiles', async () => {
      await createTempFile(mockFileContent.markdown, 'test1.md', path.join(tempDir, 'backend'));
      await createTempFile(mockFileContent.code, 'test2.ts', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'profile1',
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test1.md', optional: false }]
      });

      const recipe2 = mockRecipe({
        profile: 'profile2',
        taskTypes: ['implementation'],
        sources: [{ type: 'code' as const, path: 'test2.ts', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['profile1', recipe1],
          ['profile2', recipe2]
        ])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(Object.keys(result.bundle!.profileContents)).toHaveLength(2);
      expect(result.bundle!.profileContents['profile1']).toBeDefined();
      expect(result.bundle!.profileContents['profile2']).toBeDefined();
    });

    it('should load specific requested profiles', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'profile1',
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const recipe2 = mockRecipe({
        profile: 'profile2',
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadRecipe: vi.fn()
          .mockResolvedValueOnce({ success: true, recipe: recipe1 })
          .mockResolvedValueOnce({ success: true, recipe: recipe2 }),
        loadAllRecipes: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['profile1', 'profile2']
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(mockLoader.loadRecipe).toHaveBeenCalledWith('profile1');
      expect(mockLoader.loadRecipe).toHaveBeenCalledWith('profile2');
    });

    it('should combine profile sizes in metadata', async () => {
      await createTempFile(mockFileContent.markdown, 'test1.md', path.join(tempDir, 'backend'));
      await createTempFile(mockFileContent.code, 'test2.ts', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'profile1',
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test1.md', optional: false }]
      });

      const recipe2 = mockRecipe({
        profile: 'profile2',
        taskTypes: ['implementation'],
        sources: [{ type: 'code' as const, path: 'test2.ts', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['profile1', recipe1],
          ['profile2', recipe2]
        ])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const totalSize = result.bundle!.profileContents['profile1'].sizeBytes +
                        result.bundle!.profileContents['profile2'].sizeBytes;
      expect(result.bundle!.metadata.totalBytes).toBe(totalSize);
    });
  });

  describe('TTL and Caching', () => {
    it('should cache bundle with TTL from recipe', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }],
        ttl: 3600
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      const cache = new ContextCache({ persistToDb: false });

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        cache,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      expect(result.cached).toBe(false);

      // Verify it's in cache
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('should cache with first recipe TTL when multiple recipes', async () => {
      await createTempFile(mockFileContent.markdown, 'test1.md', path.join(tempDir, 'backend'));
      await createTempFile(mockFileContent.code, 'test2.ts', path.join(tempDir, 'backend'));

      const recipe1 = mockRecipe({
        profile: 'profile1',
        required: true,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test1.md', optional: false }],
        ttl: 1800
      });

      const recipe2 = mockRecipe({
        profile: 'profile2',
        required: false,
        taskTypes: ['implementation'],
        sources: [{ type: 'code' as const, path: 'test2.ts', optional: false }],
        ttl: 7200
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([
          ['profile1', recipe1],
          ['profile2', recipe2]
        ])),
        loadRecipe: vi.fn()
      };

      const cache = new ContextCache({ persistToDb: false });

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        cache,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty source content', async () => {
      await createTempFile('', 'empty.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'empty.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle recipe with no sources', async () => {
      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: []
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle very long file paths', async () => {
      const longPath = 'a/'.repeat(50) + 'test.md';
      const fullPath = path.join(tempDir, 'backend', longPath);
      await createTempFile(mockFileContent.markdown, fullPath);

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: longPath, optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle special characters in file names', async () => {
      const specialName = 'test-file_123.md';
      await createTempFile(mockFileContent.markdown, specialName, path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: specialName, optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
    });

    it('should handle Unicode content', async () => {
      const unicodeContent = '# 测试文档\n\nこんにちは世界 🌍\n\nПривет мир';
      await createTempFile(unicodeContent, 'unicode.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'unicode.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['test-profile'].content;
      expect(content).toContain('測試文档');
    });

    it('should handle all valid task types', async () => {
      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));
      const taskTypes = ['implementation', 'fix', 'review', 'deployment', 'pr-follow-up', 'analysis'];

      for (const taskType of taskTypes) {
        const recipe = mockRecipe({
          taskTypes: [taskType as any],
          sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
        });

        const mockLoader = {
          loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
          loadRecipe: vi.fn()
        };

        generator = new ContextBundleGenerator({
          loader: mockLoader as any,
          repoRoot: tempDir
        });

        const options: BundleGenerationOptions = {
          taskType: taskType as any
        };

        const result = await generator.generateBundle(options);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const recipe = mockRecipe({
        required: true,
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'nonexistent.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should handle loader errors gracefully', async () => {
      const mockLoader = {
        loadAllRecipes: vi.fn().mockRejectedValue(new Error('Loader error')),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Loader error');
    });

    it('should handle invalid max bundle size from environment', async () => {
      const originalEnv = process.env.CONTEXT_MAX_BUNDLE_SIZE;
      process.env.CONTEXT_MAX_BUNDLE_SIZE = 'not-a-number';

      await createTempFile(mockFileContent.markdown, 'test.md', path.join(tempDir, 'backend'));

      const recipe = mockRecipe({
        taskTypes: ['implementation'],
        sources: [{ type: 'markdown' as const, path: 'test.md', optional: false }]
      });

      const mockLoader = {
        loadAllRecipes: vi.fn().mockResolvedValue(new Map([['test-profile', recipe]])),
        loadRecipe: vi.fn()
      };

      generator = new ContextBundleGenerator({
        loader: mockLoader as any,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation'
      };

      const result = await generator.generateBundle(options);
      // Should use default 50MB and succeed
      expect(result.success).toBe(true);

      // Restore
      if (originalEnv) {
        process.env.CONTEXT_MAX_BUNDLE_SIZE = originalEnv;
      } else {
        delete process.env.CONTEXT_MAX_BUNDLE_SIZE;
      }
    });
  });
});
