/**
 * Context System - Centralized Exports
 *
 * This module provides a centralized export point for all context system components.
 */

// Core services
export { ContextCache } from './contextCache.js';
export { ContextRecipeLoader } from './contextRecipeLoader.js';
export { ContextRecipeValidator } from './contextRecipeValidator.js';
export { ContextBundleGenerator } from './contextBundleGenerator.js';
export { ContextRecipeSelector } from './contextRecipeSelector.js';

// Transforms and utilities
export { ContextTransforms } from './contextTransforms.js';

// Types (re-export for convenience)
export type {
  ContextRecipe,
  RecipeTaskType,
  SourceType,
  TransformType,
  OutputFormat,
  ContentExtraction,
  SizeLimit,
  RecipeSource,
  RecipeOutput,
  RecipeValidationResult,
  RecipeLoadResult
} from '../../types/contextRecipe.js';

export type {
  ProfileContent,
  BundleMetadata,
  ContextBundle,
  BundleGenerationOptions,
  BundleGenerationResult,
  BundleCacheEntry,
  BundleCacheStats
} from '../../types/contextBundle.js';
