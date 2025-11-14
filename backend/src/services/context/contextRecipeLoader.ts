/**
 * Context Recipe Loader
 *
 * Loads and validates context recipe files from the config directory.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';
import { getContextLogger } from './contextLogger.js';
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
  private logger = getContextLogger();

  constructor(pathOrOptions?: string | LoaderOptions) {
    this.validator = new ContextRecipeValidator();

    // Handle both string path and options object
    if (typeof pathOrOptions === 'string') {
      this.recipeDir = path.resolve(pathOrOptions);
      this.cacheEnabled = true;
    } else {
      const options = pathOrOptions ?? {};
      this.cacheEnabled = options.cacheRecipes ?? true;

      // Initialize recipe directory path (ES module compatible)
      // Can be overridden via CONTEXT_RECIPE_DIR environment variable
      if (process.env.CONTEXT_RECIPE_DIR) {
        this.recipeDir = path.resolve(process.env.CONTEXT_RECIPE_DIR);
      } else {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const repoRoot = findRepoRoot(__dirname);
        this.recipeDir = path.join(repoRoot, 'backend', 'config', 'context-recipes');
      }
    }
  }

  /**
   * Load a recipe by profile name
   */
  async loadRecipe(profile: string): Promise<RecipeLoadResult> {
    // Sanitize profile name to prevent path traversal
    const PROFILE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
    if (!PROFILE_NAME_PATTERN.test(profile)) {
      return {
        success: false,
        errors: [`Invalid profile name: '${profile}'. Must match pattern: ^[a-z][a-z0-9-]*$`]
      };
    }

    // Check cache first
    if (this.cacheEnabled && this.recipeCache.has(profile)) {
      return {
        success: true,
        recipe: this.recipeCache.get(profile)!
      };
    }

    try {
      const filePath = path.join(this.recipeDir, `${profile}.yaml`);

      // Verify the resolved path is still within recipeDir (prevent path traversal)
      const resolvedPath = path.resolve(filePath);
      const resolvedRecipeDir = path.resolve(this.recipeDir);

      if (!resolvedPath.startsWith(resolvedRecipeDir)) {
        return {
          success: false,
          errors: [`Security violation: attempted directory traversal for profile '${profile}'`]
        };
      }

      // Read and parse YAML file
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.parse(content);

      // Validate the recipe
      const validation = this.validator.validate(parsed);
      if (!validation.valid) {
        return {
          success: false,
          errors: [`Recipe validation failed:\n${validation.errors?.join('\n') ?? 'Unknown validation error'}`]
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
        errors: [`Failed to load recipe '${profile}': ${error instanceof Error ? error.message : String(error)}`]
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
      this.logger.error('Failed to load recipes', { component: 'ContextRecipeLoader', operation: 'loadAllRecipes' }, error instanceof Error ? error : undefined);
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
      this.logger.error('Failed to validate recipes', { component: 'ContextRecipeLoader', operation: 'validateAllRecipes' }, error instanceof Error ? error : undefined);
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
  private applyDefaults(recipe: unknown): ContextRecipe {
    // Type assertion after validation
    const recipeObj = recipe as Record<string, unknown>;

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
    if (!recipeObj.sizeLimit && recipeObj.taskTypes && Array.isArray(recipeObj.taskTypes) && recipeObj.taskTypes.length > 0) {
      const taskType = recipeObj.taskTypes[0];
      recipeObj.sizeLimit = DEFAULT_SIZE_LIMITS_VALUE[taskType as keyof typeof DEFAULT_SIZE_LIMITS_VALUE];
    }

    // Apply output defaults
    if (!recipeObj.outputs) {
      recipeObj.outputs = { ...DEFAULT_RECIPE_OUTPUT_VALUE };
    } else {
      recipeObj.outputs = {
        ...DEFAULT_RECIPE_OUTPUT_VALUE,
        ...(recipeObj.outputs as object)
      };
    }

    // Apply TTL default
    if (recipeObj.ttl === undefined) {
      recipeObj.ttl = DEFAULT_TTL_VALUE;
    }

    // Ensure arrays exist
    recipeObj.taskTypes = recipeObj.taskTypes || [];
    recipeObj.investigationSteps = recipeObj.investigationSteps || [];
    recipeObj.constraints = recipeObj.constraints || [];
    recipeObj.dependencies = recipeObj.dependencies || [];

    // Ensure required is boolean
    recipeObj.required = Boolean(recipeObj.required);

    return recipeObj as ContextRecipe;
  }
}
