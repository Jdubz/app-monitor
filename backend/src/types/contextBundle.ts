/**
 * Context Bundle Type Definitions
 *
 * Defines types for generated context bundles that are
 * mounted into dev-bot containers.
 */

import type { RecipeTaskType } from './contextRecipe.js';

/**
 * Content from a single profile
 */
export interface ProfileContent {
  profile: string;
  content: string;
  sizeBytes: number;
  sources: string[];
  generatedAt: Date;
}

/**
 * Bundle metadata
 */
export interface BundleMetadata {
  bundleId: string;
  taskType: RecipeTaskType;
  profiles: string[];
  totalBytes: number;
  cacheKey: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Complete context bundle
 */
export interface ContextBundle {
  id: string;
  profileContents: Record<string, ProfileContent>;
  metadata: BundleMetadata;
  mountPath: string;
  cacheKey: string;
}

/**
 * Options for bundle generation
 */
export interface BundleGenerationOptions {
  taskType: RecipeTaskType;
  profiles?: string[];
  targetFiles?: string[];
  force?: boolean;
}

/**
 * Bundle generation result
 */
export interface BundleGenerationResult {
  success: boolean;
  bundle?: ContextBundle;
  cached?: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Cache entry for generated bundles
 */
export interface BundleCacheEntry {
  bundleId: string;
  cacheKey: string;
  taskType: RecipeTaskType;
  profiles: string[];
  mountPath: string;
  sizeBytes: number;
  createdAt: Date;
  expiresAt?: Date;
  hitCount: number;
  lastAccessedAt: Date;
  accessSequence?: number; // For stable LRU ordering
}

/**
 * Bundle cache statistics
 */
export interface BundleCacheStats {
  totalEntries: number;
  totalBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}
