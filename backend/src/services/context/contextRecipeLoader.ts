/**
 * Context Recipe Loader
 *
 * Loads and validates context recipe files from the config directory.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';
import type {
  ContextRecipe,
  RecipeLoadResult,
  RecipeValidationResult,
} from '../../types/contextRecipe.js';
import { ContextRecipeValidator } from './contextRecipeValidator.js';
import { findRepoRoot } from '../../utils/repoPaths.js';

interface LoaderOptions {
  cacheRecipes?: boolean;
}

export class ContextRecipeLoader {
  private validator: ContextRecipeValidator;
  private recipeCache: Map<string, ContextRecipe> = new Map();
  private cacheEnabled: boolean;
  private recipeDir: string;

  constructor(options: LoaderOptions = {}) {
    this.validator = new ContextRecipeValidator();
    this.cacheEnabled = options.cacheRecipes ?? true;

    // Initialize recipe directory path (ES module compatible)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = findRepoRoot(__dirname);
    this.recipeDir = path.join(repoRoot, 'backend', 'config', 'context-recipes');
  }

  /**
   * Load a recipe by profile name
   */
  async loadRecipe(profile: string): Promise<RecipeLoadResult> {
    // Check cache first
    if (this.cacheEnabled && this.recipeCache.has(profile)) {
      return {
        success: true,
        recipe: this.recipeCache.get(profile)!
      };
    }

    try {
      const filePath = path.join(this.recipeDir, `${profile}.yaml`);

      // Read and parse YAML file
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.parse(content);

      // Validate the recipe
      const validation = this.validator.validate(parsed);
      if (!validation.valid) {
        return {
          success: false,
          error: `Recipe validation failed:\n${validation.errors.join('\n')}`
        };
      }

      // Apply defaults and cache
      const recipe = this.applyDefaults(parsed);

      if (this.cacheEnabled) {
        this.recipeCache.set(profile, recipe);
      }

      return {
        success: true,
        recipe
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load recipe '${profile}': ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Load all recipes from the directory
   */
  async loadAllRecipes(): Promise<Map<string, ContextRecipe>> {
    const recipes = new Map<string, ContextRecipe>();

    try {
      const files = await fs.readdir(this.recipeDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        const profile = file.replace(/\.(yaml|yml)$/, '');
        const result = await this.loadRecipe(profile);

        if (result.success && result.recipe) {
          recipes.set(profile, result.recipe);
        }
      }
    } catch (error) {
      // Return empty map on error
      console.error('Failed to load recipes:', error);
    }

    return recipes;
  }

  /**
   * Validate a recipe file without loading it into cache
   */
  async validateRecipeFile(filePath: string): Promise<RecipeValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.parse(content);
      return this.validator.validate(parsed);
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to read/parse file: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Validate all recipe files in the directory
   */
  async validateAllRecipes(): Promise<Map<string, RecipeValidationResult>> {
    const results = new Map<string, RecipeValidationResult>();

    try {
      const files = await fs.readdir(this.recipeDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of yamlFiles) {
        const filePath = path.join(this.recipeDir, file);
        const result = await this.validateRecipeFile(filePath);
        results.set(file, result);
      }
    } catch (error) {
      console.error('Failed to validate recipes:', error);
    }

    return results;
  }

  /**
   * Clear the recipe cache
   */
  clearCache(): void {
    this.recipeCache.clear();
  }

  /**
   * Get the recipe directory path
   */
  getRecipeDir(): string {
    return this.recipeDir;
  }

  /**
   * Apply default values to a recipe
   */
  private applyDefaults(recipe: any): ContextRecipe {
    // Import constants (workaround for type-only import)
    const DEFAULT_SIZE_LIMITS_VALUE = {
      implementation: { maxBytes: 50000, maxInlineBytes: 12000 },
      review: { maxBytes: 40000, maxInlineBytes: 8000 },
      fix: { maxBytes: 45000, maxInlineBytes: 10000 },
      'pr-follow-up': { maxBytes: 30000, maxInlineBytes: 6000 },
      analysis: { maxBytes: 35000, maxInlineBytes: 5000 }
    };

    const DEFAULT_RECIPE_OUTPUT_VALUE = {
      format: 'markdown' as const,
      filename: 'context.md',
      includeMetadata: true
    };

    const DEFAULT_TTL_VALUE = 86400;

    // Apply size limit defaults based on task type
    if (!recipe.sizeLimit && recipe.taskTypes && recipe.taskTypes.length > 0) {
      const taskType = recipe.taskTypes[0];
      recipe.sizeLimit = DEFAULT_SIZE_LIMITS_VALUE[taskType as keyof typeof DEFAULT_SIZE_LIMITS_VALUE];
    }

    // Apply output defaults
    if (!recipe.outputs) {
      recipe.outputs = { ...DEFAULT_RECIPE_OUTPUT_VALUE };
    } else {
      recipe.outputs = {
        ...DEFAULT_RECIPE_OUTPUT_VALUE,
        ...recipe.outputs
      };
    }

    // Apply TTL default
    if (recipe.ttl === undefined) {
      recipe.ttl = DEFAULT_TTL_VALUE;
    }

    // Ensure arrays exist
    recipe.taskTypes = recipe.taskTypes || [];
    recipe.investigationSteps = recipe.investigationSteps || [];
    recipe.constraints = recipe.constraints || [];
    recipe.dependencies = recipe.dependencies || [];

    // Ensure required is boolean
    recipe.required = Boolean(recipe.required);

    return recipe as ContextRecipe;
  }
}
