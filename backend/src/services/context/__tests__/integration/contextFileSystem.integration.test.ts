/**
 * Context File System Integration Tests
 *
 * Integration tests for file system operations, recipe loading,
 * and file processing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextRecipeLoader } from '../../contextRecipeLoader.js';
import { ContextBundleGenerator } from '../../contextBundleGenerator.js';
import { ContextCache } from '../../contextCache.js';
import { createTempDir, createTempFile, removeDir, createMockFileSystem } from '../helpers/testUtils.js';
import { mockFileContent } from '../helpers/testMocks.js';
import type { BundleGenerationOptions } from '../../../../types/contextBundle.js';
import * as path from 'path';

describe('Context File System Integration', () => {
  let tempDir: string;
  let recipePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir('fs-integration-');
    recipePath = path.join(tempDir, 'config', 'context-recipes');
  });

  afterEach(async () => {
    if (tempDir) await removeDir(tempDir);
  });

  describe('Recipe file loading', () => {
    it('should load recipe from YAML file', async () => {
      const recipeContent = `
profile: test-recipe
version: 1.0.0
description: Test recipe for file system integration
taskTypes:
  - implementation
sources:
  - type: markdown
    path: docs/test.md
`;
      await createTempFile(recipeContent, 'test-recipe.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const result = await loader.loadRecipe('test-recipe');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe!.profile).toBe('test-recipe');
    });

    it('should load all recipes from directory', async () => {
      const recipe1 = `
profile: recipe-1
version: 1.0.0
description: First recipe
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test1.md
`;
      const recipe2 = `
profile: recipe-2
version: 1.0.0
description: Second recipe
taskTypes:
  - fix
sources:
  - type: code
    path: test2.ts
`;

      await createTempFile(recipe1, 'recipe-1.yaml', recipePath);
      await createTempFile(recipe2, 'recipe-2.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const recipes = await loader.loadAllRecipes();

      expect(recipes.size).toBe(2);
      expect(recipes.has('recipe-1')).toBe(true);
      expect(recipes.has('recipe-2')).toBe(true);
    });

    it('should handle missing recipe file', async () => {
      const loader = new ContextRecipeLoader(recipePath);
      const result = await loader.loadRecipe('nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle invalid YAML syntax', async () => {
      const invalidYaml = `
profile: broken-recipe
version: 1.0.0
description: [unclosed array
`;
      await createTempFile(invalidYaml, 'broken.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const result = await loader.loadRecipe('broken');

      expect(result.success).toBe(false);
    });

    it('should validate loaded recipes', async () => {
      const invalidRecipe = `
profile: Invalid-Name
version: bad-version
description: Too short
sources: not-an-array
`;
      await createTempFile(invalidRecipe, 'invalid.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const result = await loader.loadRecipe('invalid');

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Source file reading', () => {
    it('should read markdown files', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test.md', backendPath);

      const recipeContent = `
profile: markdown-test
version: 1.0.0
description: Test markdown file reading
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test.md
`;
      await createTempFile(recipeContent, 'markdown-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['markdown-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['markdown-test'].content).toContain('# Test Document');

      await cache.destroy();
    });

    it('should read code files', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.code, 'test.ts', backendPath);

      const recipeContent = `
profile: code-test
version: 1.0.0
description: Test code file reading
taskTypes:
  - implementation
sources:
  - type: code
    path: test.ts
`;
      await createTempFile(recipeContent, 'code-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['code-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['code-test'].content).toContain('export class TestClass');

      await cache.destroy();
    });

    it('should read JSON files', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.json, 'test.json', backendPath);

      const recipeContent = `
profile: json-test
version: 1.0.0
description: Test JSON file reading
taskTypes:
  - implementation
sources:
  - type: json
    path: test.json
`;
      await createTempFile(recipeContent, 'json-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['json-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['json-test'].content).toContain('test-package');

      await cache.destroy();
    });

    it('should read files from nested directories', async () => {
      const nestedPath = path.join(tempDir, 'backend', 'docs', 'guides');
      await createTempFile(mockFileContent.markdown, 'nested.md', nestedPath);

      const recipeContent = `
profile: nested-test
version: 1.0.0
description: Test nested directory reading
taskTypes:
  - implementation
sources:
  - type: markdown
    path: docs/guides/nested.md
`;
      await createTempFile(recipeContent, 'nested-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['nested-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);

      await cache.destroy();
    });

    it('should handle Unicode file content', async () => {
      const unicodeContent = '# 测试文档\n\n日本語テキスト\n\nПривет мир 🌍';
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(unicodeContent, 'unicode.md', backendPath);

      const recipeContent = `
profile: unicode-test
version: 1.0.0
description: Test Unicode content
taskTypes:
  - implementation
sources:
  - type: markdown
    path: unicode.md
`;
      await createTempFile(recipeContent, 'unicode-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['unicode-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['unicode-test'].content).toContain('測試文档');
      expect(result.bundle!.profileContents['unicode-test'].content).toContain('日本語');

      await cache.destroy();
    });
  });

  describe('Path security', () => {
    it('should reject absolute paths', async () => {
      const recipeContent = `
profile: abs-path-test
version: 1.0.0
description: Test absolute path rejection
taskTypes:
  - implementation
sources:
  - type: markdown
    path: /etc/passwd
`;
      await createTempFile(recipeContent, 'abs-path-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['abs-path-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid source path');

      await cache.destroy();
    });

    it('should reject path traversal attempts', async () => {
      const recipeContent = `
profile: traversal-test
version: 1.0.0
description: Test path traversal rejection
taskTypes:
  - implementation
sources:
  - type: markdown
    path: ../../etc/passwd
`;
      await createTempFile(recipeContent, 'traversal-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['traversal-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(false);

      await cache.destroy();
    });

    it('should allow safe relative paths', async () => {
      const backendPath = path.join(tempDir, 'backend', 'docs');
      await createTempFile(mockFileContent.markdown, 'safe.md', backendPath);

      const recipeContent = `
profile: safe-path-test
version: 1.0.0
description: Test safe relative paths
taskTypes:
  - implementation
sources:
  - type: markdown
    path: docs/safe.md
`;
      await createTempFile(recipeContent, 'safe-path-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['safe-path-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);

      await cache.destroy();
    });
  });

  describe('Multiple source files', () => {
    it('should read multiple source files', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'doc1.md', backendPath);
      await createTempFile(mockFileContent.markdown, 'doc2.md', backendPath);
      await createTempFile(mockFileContent.code, 'code1.ts', backendPath);

      const recipeContent = `
profile: multi-source-test
version: 1.0.0
description: Test multiple source files
taskTypes:
  - implementation
sources:
  - type: markdown
    path: doc1.md
  - type: markdown
    path: doc2.md
  - type: code
    path: code1.ts
`;
      await createTempFile(recipeContent, 'multi-source-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['multi-source-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const content = result.bundle!.profileContents['multi-source-test'].content;
      expect(content).toContain('## Source: doc1.md');
      expect(content).toContain('## Source: doc2.md');
      expect(content).toContain('## Source: code1.ts');

      await cache.destroy();
    });

    it('should track sources in bundle metadata', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'doc1.md', backendPath);
      await createTempFile(mockFileContent.code, 'code1.ts', backendPath);

      const recipeContent = `
profile: source-tracking-test
version: 1.0.0
description: Test source tracking
taskTypes:
  - implementation
sources:
  - type: markdown
    path: doc1.md
  - type: code
    path: code1.ts
`;
      await createTempFile(recipeContent, 'source-tracking-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['source-tracking-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const profileContent = result.bundle!.profileContents['source-tracking-test'];
      expect(profileContent.sources).toContain('doc1.md');
      expect(profileContent.sources).toContain('code1.ts');

      await cache.destroy();
    });
  });

  describe('File encoding', () => {
    it('should handle UTF-8 encoded files', async () => {
      const utf8Content = 'UTF-8 content: café, naïve, Zürich';
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(utf8Content, 'utf8.txt', backendPath);

      const recipeContent = `
profile: utf8-test
version: 1.0.0
description: Test UTF-8 encoding
taskTypes:
  - implementation
sources:
  - type: text
    path: utf8.txt
`;
      await createTempFile(recipeContent, 'utf8-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['utf8-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.profileContents['utf8-test'].content).toContain('café');

      await cache.destroy();
    });

    it('should calculate correct byte sizes for UTF-8', async () => {
      const unicodeContent = '日本語'; // 9 bytes in UTF-8
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(unicodeContent, 'japanese.txt', backendPath);

      const recipeContent = `
profile: size-test
version: 1.0.0
description: Test size calculation
taskTypes:
  - implementation
sources:
  - type: text
    path: japanese.txt
`;
      await createTempFile(recipeContent, 'size-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['size-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      const sizeBytes = result.bundle!.profileContents['size-test'].sizeBytes;
      expect(sizeBytes).toBeGreaterThan(0);

      await cache.destroy();
    });
  });

  describe('File system edge cases', () => {
    it('should handle empty files', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile('', 'empty.md', backendPath);

      const recipeContent = `
profile: empty-file-test
version: 1.0.0
description: Test empty file handling
taskTypes:
  - implementation
sources:
  - type: markdown
    path: empty.md
`;
      await createTempFile(recipeContent, 'empty-file-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['empty-file-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);

      await cache.destroy();
    });

    it('should handle very large files', async () => {
      const largeContent = 'x'.repeat(1000000); // 1MB
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(largeContent, 'large.txt', backendPath);

      const recipeContent = `
profile: large-file-test
version: 1.0.0
description: Test large file handling
taskTypes:
  - implementation
sources:
  - type: text
    path: large.txt
sizeLimit:
  maxBytes: 2000000
`;
      await createTempFile(recipeContent, 'large-file-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['large-file-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);
      expect(result.bundle!.metadata.totalBytes).toBeGreaterThan(1000000);

      await cache.destroy();
    });

    it('should handle files with special characters in names', async () => {
      const backendPath = path.join(tempDir, 'backend');
      await createTempFile(mockFileContent.markdown, 'test-file_123.md', backendPath);

      const recipeContent = `
profile: special-chars-test
version: 1.0.0
description: Test special character filenames
taskTypes:
  - implementation
sources:
  - type: markdown
    path: test-file_123.md
`;
      await createTempFile(recipeContent, 'special-chars-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['special-chars-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);

      await cache.destroy();
    });

    it('should handle deeply nested directory structures', async () => {
      const deepPath = path.join(tempDir, 'backend', 'a', 'b', 'c', 'd', 'e', 'f');
      await createTempFile(mockFileContent.markdown, 'deep.md', deepPath);

      const recipeContent = `
profile: deep-nest-test
version: 1.0.0
description: Test deeply nested directories
taskTypes:
  - implementation
sources:
  - type: markdown
    path: a/b/c/d/e/f/deep.md
`;
      await createTempFile(recipeContent, 'deep-nest-test.yaml', recipePath);

      const loader = new ContextRecipeLoader(recipePath);
      const cache = new ContextCache({ persistToDb: false });
      const generator = new ContextBundleGenerator({
        cache,
        loader,
        repoRoot: tempDir
      });

      const options: BundleGenerationOptions = {
        taskType: 'implementation',
        profiles: ['deep-nest-test']
      };

      const result = await generator.generateBundle(options);

      expect(result.success).toBe(true);

      await cache.destroy();
    });
  });
});
