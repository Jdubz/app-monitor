// @ts-nocheck
/**
 * Context Recipe Loader Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextRecipeLoader } from '../contextRecipeLoader.js';

describe('ContextRecipeLoader', () => {
  let loader: ContextRecipeLoader;

  beforeEach(() => {
    // Create loader with caching enabled
    loader = new ContextRecipeLoader({ cacheRecipes: true });
  });

  describe('loadRecipe()', () => {
    it('should load deployment recipe successfully', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.profile).toBe('deployment');
      expect(result.recipe?.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.recipe?.sources).toBeInstanceOf(Array);
      expect(result.recipe?.sources.length).toBeGreaterThan(0);
    });

    it('should load pr-workflow recipe successfully', async () => {
      const result = await loader.loadRecipe('pr-workflow');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.profile).toBe('pr-workflow');
      expect(result.recipe?.required).toBe(true);
    });

    it('should load failure-recovery recipe successfully', async () => {
      const result = await loader.loadRecipe('failure-recovery');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.profile).toBe('failure-recovery');
      expect(result.recipe?.taskTypes).toContain('fix');
      expect(result.recipe?.taskTypes).toContain('analysis');
    });

    it('should load dev-monitor recipe successfully', async () => {
      const result = await loader.loadRecipe('dev-monitor');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.profile).toBe('dev-monitor');
    });

    it('should load scope-control recipe successfully', async () => {
      const result = await loader.loadRecipe('scope-control');

      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe?.profile).toBe('scope-control');
      expect(result.recipe?.required).toBe(true);
    });

    it('should fail gracefully for non-existent recipe', async () => {
      const result = await loader.loadRecipe('non-existent-recipe');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Failed to load recipe');
    });

    it('should cache loaded recipes', async () => {
      const result1 = await loader.loadRecipe('deployment');
      const result2 = await loader.loadRecipe('deployment');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.recipe).toBe(result2.recipe);  // Same instance from cache
    });

    it('should not cache when caching is disabled', async () => {
      const noCacheLoader = new ContextRecipeLoader({ cacheRecipes: false });

      const result1 = await noCacheLoader.loadRecipe('deployment');
      const result2 = await noCacheLoader.loadRecipe('deployment');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Different instances (not cached)
      expect(result1.recipe).not.toBe(result2.recipe);
    });
  });

  describe('loadAllRecipes()', () => {
    it('should load all recipes successfully', async () => {
      const recipes = await loader.loadAllRecipes();

      expect(recipes.size).toBeGreaterThanOrEqual(5);
      expect(recipes.has('deployment')).toBe(true);
      expect(recipes.has('pr-workflow')).toBe(true);
      expect(recipes.has('failure-recovery')).toBe(true);
      expect(recipes.has('dev-monitor')).toBe(true);
      expect(recipes.has('scope-control')).toBe(true);
    });

    it('should return valid recipe objects', async () => {
      const recipes = await loader.loadAllRecipes();

      recipes.forEach((recipe, profile) => {
        expect(recipe.profile).toBe(profile);
        expect(recipe.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(recipe.description).toBeDefined();
        expect(recipe.description.length).toBeGreaterThanOrEqual(10);
        expect(recipe.sources).toBeInstanceOf(Array);
        expect(recipe.sources.length).toBeGreaterThan(0);
      });
    });
  });

  describe('validateRecipeFile()', () => {
    it('should validate deployment recipe file', async () => {
      const filePath = `${loader.getRecipeDir()}/deployment.yaml`;
      const result = await loader.validateRecipeFile(filePath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.profile).toBe('deployment');
    });

    it('should validate all recipe files', async () => {
      const recipeFiles = [
        'deployment.yaml',
        'pr-workflow.yaml',
        'failure-recovery.yaml',
        'dev-monitor.yaml',
        'scope-control.yaml'
      ];

      for (const file of recipeFiles) {
        const filePath = `${loader.getRecipeDir()}/${file}`;
        const result = await loader.validateRecipeFile(filePath);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe('validateAllRecipes()', () => {
    it('should validate all recipes in directory', async () => {
      const results = await loader.validateAllRecipes();

      expect(results.size).toBeGreaterThanOrEqual(5);

      results.forEach((result, /*filename*/) => {
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('default application', () => {
    it('should apply default size limits', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(result.recipe?.sizeLimit).toBeDefined();
      expect(result.recipe?.sizeLimit?.maxBytes).toBeGreaterThan(0);
      expect(result.recipe?.sizeLimit?.maxInlineBytes).toBeGreaterThan(0);
    });

    it('should apply default output configuration', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(result.recipe?.outputs).toBeDefined();
      expect(result.recipe?.outputs?.format).toBeDefined();
      expect(result.recipe?.outputs?.filename).toBeDefined();
      expect(result.recipe?.outputs?.includeMetadata).toBeDefined();
    });

    it('should apply default TTL', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(result.recipe?.ttl).toBeDefined();
      expect(result.recipe?.ttl).toBeGreaterThanOrEqual(0);
    });

    it('should ensure arrays exist', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(result.recipe?.taskTypes).toBeInstanceOf(Array);
      expect(result.recipe?.investigationSteps).toBeInstanceOf(Array);
      expect(result.recipe?.constraints).toBeInstanceOf(Array);
      expect(result.recipe?.dependencies).toBeInstanceOf(Array);
    });

    it('should ensure required is boolean', async () => {
      const result = await loader.loadRecipe('deployment');

      expect(result.success).toBe(true);
      expect(typeof result.recipe?.required).toBe('boolean');
    });
  });

  describe('recipe content validation', () => {
    it('should have valid investigation steps in pr-workflow', async () => {
      const result = await loader.loadRecipe('pr-workflow');

      expect(result.success).toBe(true);
      expect(result.recipe?.investigationSteps).toBeDefined();
      expect(result.recipe?.investigationSteps?.length).toBeGreaterThan(0);

      result.recipe?.investigationSteps?.forEach(step => {
        expect(typeof step).toBe('string');
        expect(step.length).toBeGreaterThan(0);
      });
    });

    it('should have valid constraints in scope-control', async () => {
      const result = await loader.loadRecipe('scope-control');

      expect(result.success).toBe(true);
      expect(result.recipe?.constraints).toBeDefined();
      expect(result.recipe?.constraints?.length).toBeGreaterThan(0);

      result.recipe?.constraints?.forEach(constraint => {
        expect(typeof constraint).toBe('string');
        expect(constraint.length).toBeGreaterThan(0);
      });
    });

    it('should have valid sources in all recipes', async () => {
      const recipeNames = ['deployment', 'pr-workflow', 'failure-recovery', 'dev-monitor', 'scope-control'];

      for (const name of recipeNames) {
        const result = await loader.loadRecipe(name);

        expect(result.success).toBe(true);
        expect(result.recipe?.sources).toBeInstanceOf(Array);
        expect(result.recipe?.sources.length).toBeGreaterThan(0);

        result.recipe?.sources.forEach(source => {
          expect(source.type).toBeDefined();
          expect(source.path).toBeDefined();
          expect(['markdown', 'code', 'json', 'yaml', 'config', 'text']).toContain(source.type);
        });
      }
    });
  });

  describe('cache management', () => {
    it('should clear cache successfully', async () => {
      // Load a recipe to cache it
      const result1 = await loader.loadRecipe('deployment');
      expect(result1.success).toBe(true);

      // Clear cache
      loader.clearCache();

      // Load again (should read from file, not cache)
      const result2 = await loader.loadRecipe('deployment');
      expect(result2.success).toBe(true);

      // Different instances after cache clear
      expect(result1.recipe).not.toBe(result2.recipe);
    });
  });

  describe('getRecipeDir()', () => {
    it('should return valid recipe directory path', () => {
      const recipeDir = loader.getRecipeDir();

      expect(recipeDir).toBeDefined();
      expect(recipeDir).toContain('context-recipes');
    });
  });
});
