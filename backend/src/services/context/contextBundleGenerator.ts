/**
 * Context Bundle Generator
 *
 * Orchestrates the generation of context bundles from recipes.
 * Handles file reading, content extraction, transforms, and caching.
 */

import { promises as fs, constants as fsConstants } from 'fs';
import * as path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import type {
  BundleGenerationOptions,
  BundleGenerationResult,
  ContextBundle,
  ProfileContent
} from '../../types/contextBundle.js';
import type { ContextRecipe, RecipeSource } from '../../types/contextRecipe.js';
import { ContextCache } from './contextCache.js';
import { ContextRecipeLoader } from './contextRecipeLoader.js';
import { ContextTransforms } from './contextTransforms.js';
import { findRepoRoot } from '../../utils/repoPaths.js';
import { getContextLogger } from './contextLogger.js';

interface GeneratorOptions {
  cache?: ContextCache;
  loader?: ContextRecipeLoader;
  repoRoot?: string;
  bundleRootDir?: string;
}

export class ContextBundleGenerator {
  private cache: ContextCache;
  private loader: ContextRecipeLoader;
  private transforms: ContextTransforms;
  private repoRoot: string;
  private readonly bundleRootCandidates: string[];
  private resolvedBundleRoot?: string;
  private readonly logger = getContextLogger();

  constructor(options: GeneratorOptions = {}) {
    this.cache = options.cache ?? new ContextCache({ persistToDb: false });
    this.loader = options.loader ?? new ContextRecipeLoader();
    this.transforms = new ContextTransforms();

    // Initialize repo root
    if (options.repoRoot) {
      this.repoRoot = options.repoRoot;
    } else {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      this.repoRoot = findRepoRoot(__dirname);
    }

    // Preferred bundle roots (first writable wins)
    this.bundleRootCandidates = [
      options.bundleRootDir,
      process.env.CONTEXT_BUNDLE_DIR,
      '/opt/app-monitor/shared/context-bundles',
      path.join(os.tmpdir(), 'context-bundles')
    ]
      .filter((p): p is string => !!p)
      .map(p => path.resolve(p));
  }

  /**
   * Generate a context bundle for the given options
   */
  async generateBundle(options: BundleGenerationOptions): Promise<BundleGenerationResult> {
    try {
      // Validate input options
      const validationErrors = this.validateBundleOptions(options);
      if (validationErrors.length > 0) {
        return {
          success: false,
          errors: validationErrors
        };
      }

      // Generate cache key
      const cacheKey = await this.cache.generateCacheKey(options);

      // Check cache first (unless force flag is set)
      if (!options.force) {
        const cachedBundle = await this.cache.get(cacheKey);
        if (cachedBundle) {
          await this.materializeBundle(cachedBundle);
          return {
            success: true,
            bundle: cachedBundle,
            cached: true
          };
        }
      }

      // Load recipes for the task type
      const recipes = await this.loadRecipesForTask(options);

      if (recipes.length === 0) {
        return {
          success: false,
          errors: [`No recipes found for task type: ${options.taskType}`]
        };
      }

      // Generate profile contents
      const profileContents: Record<string, ProfileContent> = {};
      const warnings: string[] = [];

      for (const recipe of recipes) {
        try {
          const content = await this.generateProfileContent(recipe, options);
          profileContents[recipe.profile] = content;
        } catch (error) {
          const errorMsg = `Failed to generate content for profile '${recipe.profile}': ${error instanceof Error ? error.message : String(error)}`;

          // If recipe is required, fail the whole bundle generation
          if (recipe.required) {
            return {
              success: false,
              errors: [errorMsg]
            };
          }

          // Otherwise, just add a warning
          warnings.push(errorMsg);
        }
      }

      // Check total bundle size limit
      const totalSize = Object.values(profileContents).reduce((sum, profile) => sum + profile.sizeBytes, 0);
      const maxBundleSize = this.getMaxBundleSize();

      if (totalSize > maxBundleSize) {
        return {
          success: false,
          errors: [`Bundle size (${totalSize} bytes) exceeds maximum allowed size (${maxBundleSize} bytes)`]
        };
      }

      // Create bundle
      const bundle = this.createBundle(cacheKey, options, profileContents);

      // Materialize bundle to disk (and update mountPath)
      await this.materializeBundle(bundle);

      // Cache the bundle (use TTL from first recipe)
      const ttl = recipes[0]?.ttl;
      await this.cache.set(cacheKey, bundle, ttl);

      return {
        success: true,
        bundle,
        cached: false,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Load all applicable recipes for a task type
   */
  private async loadRecipesForTask(options: BundleGenerationOptions): Promise<ContextRecipe[]> {
    // If specific profiles requested, load only those
    if (options.profiles && options.profiles.length > 0) {
      const recipes: ContextRecipe[] = [];

      for (const profile of options.profiles) {
        const result = await this.loader.loadRecipe(profile);
        if (result.success && result.recipe) {
          recipes.push(result.recipe);
        }
      }

      return recipes;
    }

    // Otherwise, load all recipes and filter by task type
    const allRecipes = await this.loader.loadAllRecipes();
    const matchingRecipes: ContextRecipe[] = [];

    for (const recipe of allRecipes.values()) {
      if (recipe.taskTypes.includes(options.taskType)) {
        matchingRecipes.push(recipe);
      }
    }

    // Sort by required flag (required recipes first)
    return matchingRecipes.sort((a, b) => {
      if (a.required && !b.required) return -1;
      if (!a.required && b.required) return 1;
      return 0;
    });
  }

  /**
   * Generate content for a single profile
   */
  private async generateProfileContent(
    recipe: ContextRecipe,
    options: BundleGenerationOptions
  ): Promise<ProfileContent> {
    const contents: string[] = [];
    const sources: string[] = [];
    let totalSize = 0;

    // Add recipe metadata if configured
    if (recipe.outputs?.includeMetadata) {
      contents.push(this.generateMetadataSection(recipe));
    }

    // Add constraints if present
    if (recipe.constraints && recipe.constraints.length > 0) {
      contents.push(this.generateConstraintsSection(recipe.constraints));
    }

    // Add investigation steps if present
    if (recipe.investigationSteps && recipe.investigationSteps.length > 0) {
      contents.push(this.generateInvestigationSection(recipe.investigationSteps));
    }

    // Process each source
    for (const source of recipe.sources) {
      try {
        const content = await this.processSource(source, options);

        if (content) {
          contents.push(content);
          sources.push(source.path);
          totalSize += Buffer.byteLength(content, 'utf-8');
        }
      } catch (error) {
        // If source is not optional, rethrow the error
        if (!source.optional) {
          throw error;
        }
        // Otherwise, silently skip optional missing sources
      }
    }

    // Check size limits
    const sizeLimit = recipe.sizeLimit?.maxBytes;
    if (sizeLimit && totalSize > sizeLimit) {
      throw new Error(
        `Profile '${recipe.profile}' exceeded size limit: ${totalSize} > ${sizeLimit} bytes`
      );
    }

    // Combine all contents
    const finalContent = contents.join('\n\n---\n\n');

    return {
      profile: recipe.profile,
      content: finalContent,
      sizeBytes: Buffer.byteLength(finalContent, 'utf-8'),
      sources,
      generatedAt: new Date()
    };
  }

  /**
   * Process a single source file
   */
  private async processSource(
    source: RecipeSource,
    _options: BundleGenerationOptions
  ): Promise<string | null> {
    // Sanitize the source path to prevent path traversal
    const normalizedPath = path.normalize(source.path);

    // Prevent path traversal attacks
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      throw new Error(`Invalid source path: ${source.path}. Paths must be relative and cannot contain '..'`);
    }

    // Resolve file path
    const backendPath = this.getBackendPath();
    const filePath = path.join(backendPath, normalizedPath);

    // CRITICAL: Verify the resolved path is within the backend directory
    // Use path.sep to ensure we check for directory boundary
    const resolvedPath = path.resolve(filePath);
    const allowedRoot = path.resolve(backendPath);

    if (!resolvedPath.startsWith(allowedRoot + path.sep) && resolvedPath !== allowedRoot) {
      throw new Error(`Path traversal detected in source: ${source.path}. Resolved path '${resolvedPath}' is outside allowed root '${allowedRoot}'`);
    }

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (source.optional) {
        return null;
      }
      throw new Error(`Failed to read file '${source.path}': ${error instanceof Error ? error.message : String(error)}`);
    }

    // Apply extraction if specified
    if (source.extract) {
      content = await this.applyExtraction(content, source, filePath);
    }

    // Apply transform if specified
    if (source.transform && source.transform !== 'none') {
      content = await this.applyTransform(content, source.transform, source.type);
    }

    // Add source header
    const header = `## Source: ${source.path}\n\n`;
    return header + content;
  }

  /**
   * Apply content extraction
   */
  private async applyExtraction(
    content: string,
    source: RecipeSource,
    _filePath: string
  ): Promise<string> {
    const extract = source.extract!;

    // Markdown extractions
    if (source.type === 'markdown' || source.type === 'text') {
      if (extract.headings && extract.headings.length > 0) {
        return this.transforms.extractHeadings(content, extract.headings);
      }

      if (extract.codeBlocks) {
        return this.transforms.extractCodeBlocks(content);
      }

      if (extract.tables) {
        return this.transforms.extractTables(content);
      }
    }

    // Code extractions
    if (source.type === 'code') {
      if (extract.sections && extract.sections.length > 0) {
        return this.transforms.extractCodeSections(content, extract.sections);
      }
    }

    // JSON extractions
    if (source.type === 'json') {
      if (extract.jsonPath) {
        return this.transforms.extractJsonPath(content, extract.jsonPath);
      }
    }

    return content;
  }

  /**
   * Apply content transform
   */
  private async applyTransform(
    content: string,
    transform: string,
    sourceType: string
  ): Promise<string> {
    switch (transform) {
      case 'summarize':
        return this.transforms.summarize(content);

      case 'strip-comments':
        if (sourceType === 'code') {
          return this.transforms.stripComments(content);
        }
        return content;

      case 'minify':
        if (sourceType === 'json') {
          return this.transforms.minify(content);
        }
        return content;

      case 'bullet-list':
        return this.transforms.bulletList(content);

      default:
        return content;
    }
  }

  /**
   * Generate metadata section
   */
  private generateMetadataSection(recipe: ContextRecipe): string {
    return `# ${recipe.profile} Context\n\n` +
           `**Version:** ${recipe.version}\n` +
           `**Description:** ${recipe.description}\n` +
           `**Task Types:** ${recipe.taskTypes.join(', ')}`;
  }

  /**
   * Generate constraints section
   */
  private generateConstraintsSection(constraints: string[]): string {
    const items = constraints.map(c => `- ${c}`).join('\n');
    return `## Constraints\n\n${items}`;
  }

  /**
   * Generate investigation steps section
   */
  private generateInvestigationSection(steps: string[]): string {
    const items = steps.map(s => `- ${s}`).join('\n');
    return `## Investigation Steps\n\n${items}`;
  }

  /**
   * Create bundle from profile contents
   */
  private createBundle(
    cacheKey: string,
    options: BundleGenerationOptions,
    profileContents: Record<string, ProfileContent>
  ): ContextBundle {
    const bundleId = uuidv4();
    const now = new Date();

    // Calculate total size
    const totalBytes = Object.values(profileContents)
      .reduce((sum, profile) => sum + profile.sizeBytes, 0);

    // Get profile names
    const profiles = Object.keys(profileContents);

    return {
      id: bundleId,
      profileContents,
      metadata: {
        bundleId,
        taskType: options.taskType,
        profiles,
        totalBytes,
        cacheKey,
        createdAt: now,
        expiresAt: undefined // Will be set by cache if TTL specified
      },
      mountPath: path.join(this.getDefaultBundleRoot(), bundleId),
      cacheKey
    };
  }

  /**
   * Ensure bundle files exist on disk and return absolute bundle path.
   * Writes each profile to {bundleRoot}/{bundleId}/context/<profile>.md plus a metadata file.
   */
  public async materializeBundle(bundle: ContextBundle): Promise<string> {
    const root = await this.ensureWritableBundleRoot();
    let bundlePath = path.isAbsolute(bundle.mountPath)
      ? bundle.mountPath
      : path.join(root, bundle.id);

    let contextDir = path.join(bundlePath, 'context');

    try {
      await fs.mkdir(contextDir, { recursive: true });
    } catch (err) {
      // If the stored mountPath is not writable (old cache, permission change), fall back to writable root
      this.logger.warn('Failed to use bundle mountPath; falling back to writable root', {
        component: 'ContextBundleGenerator',
        bundlePath,
        error: err instanceof Error ? err.message : String(err)
      });
      bundlePath = path.join(root, bundle.id);
      contextDir = path.join(bundlePath, 'context');
      await fs.mkdir(contextDir, { recursive: true });
    }

    // Write profile files
    for (const [profile, content] of Object.entries(bundle.profileContents)) {
      const filePath = path.join(contextDir, `${profile}.md`);
      await fs.writeFile(filePath, content.content, 'utf-8');
    }

    // Write metadata for debugging/inspection
    const metadataPath = path.join(bundlePath, 'bundle-metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          ...bundle.metadata,
          files: Object.keys(bundle.profileContents).map(p => `context/${p}.md`)
        }, null, 2),
        'utf-8'
      );

    bundle.mountPath = bundlePath;
    return bundlePath;
  }

  /**
   * Remove materialized bundle files from disk. Leaves cache entries intact so future
   * requests can re-materialize quickly.
   *
   * @returns true if a directory was removed, false if nothing to do
   */
  public async cleanupMaterializedBundle(options: { cacheKey?: string; bundleId?: string }): Promise<boolean> {
    const root = await this.ensureWritableBundleRoot();

    let bundlePath: string | undefined;

    // Prefer cache lookup to honor updated mountPath
    if (options.cacheKey) {
      const cached = await this.cache.get(options.cacheKey);
      if (cached?.mountPath) {
        bundlePath = cached.mountPath;
      }
    }

    if (!bundlePath && options.bundleId) {
      bundlePath = path.join(root, options.bundleId);
    }

    if (!bundlePath) {
      return false; // Nothing to clean
    }

    const resolved = path.resolve(bundlePath);
    const candidateRoots = this.bundleRootCandidates.map(r => path.resolve(r));

    // Safety: only delete inside one of the configured bundle roots (including fallbacks)
    const isSafeToDelete = candidateRoots.some(rootPath =>
      resolved === rootPath || resolved.startsWith(rootPath + path.sep)
    );

    if (!isSafeToDelete) {
      this.logger.warn('Refusing to delete bundle outside of any configured bundle root', {
        component: 'ContextBundleGenerator',
        bundlePath: resolved,
        candidateRoots
      });
      return false;
    }

    try {
      await fs.rm(resolved, { recursive: true, force: true });
      return true;
    } catch (err) {
      this.logger.warn('Failed to cleanup materialized bundle', {
        component: 'ContextBundleGenerator',
        bundlePath: resolved,
        error: err instanceof Error ? err.message : String(err)
      });
      return false;
    }
  }

  /**
   * Choose a default bundle root without touching the filesystem (used for initial mountPath).
   */
  private getDefaultBundleRoot(): string {
    const preferred = this.bundleRootCandidates.find(Boolean);
    return preferred ?? path.join(os.tmpdir(), 'context-bundles');
  }

  /**
   * Find the first writable bundle root (creates it). Falls back automatically.
   */
  private async ensureWritableBundleRoot(): Promise<string> {
    if (this.resolvedBundleRoot) return this.resolvedBundleRoot;

    for (const candidate of this.bundleRootCandidates) {
      try {
        await fs.mkdir(candidate, { recursive: true });
        await fs.access(candidate, fsConstants.W_OK);
        this.resolvedBundleRoot = candidate;
        if (candidate !== this.bundleRootCandidates[0]) {
          this.logger.info('Using fallback bundle directory', { component: 'ContextBundleGenerator', candidate });
        }
        return candidate;
      } catch (err) {
        this.logger.warn('Bundle root not writable, trying next', {
          component: 'ContextBundleGenerator',
          candidate,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Last resort: temp dir
    const fallback = path.join(os.tmpdir(), 'context-bundles');
    await fs.mkdir(fallback, { recursive: true });
    this.resolvedBundleRoot = fallback;
    this.logger.warn('All configured bundle roots failed; using temp directory', {
      component: 'ContextBundleGenerator',
      fallback
    });
    return fallback;
  }

  /**
   * Get backend path for source file resolution
   * Can be overridden via environment variable CONTEXT_BACKEND_PATH
   */
  private getBackendPath(): string {
    if (process.env.CONTEXT_BACKEND_PATH) {
      return path.resolve(process.env.CONTEXT_BACKEND_PATH);
    }
    // Default to repoRoot/backend
    return path.join(this.repoRoot, 'backend');
  }

  /**
   * Get maximum bundle size in bytes
   * Can be overridden via environment variable CONTEXT_MAX_BUNDLE_SIZE
   */
  private getMaxBundleSize(): number {
    const envSize = process.env.CONTEXT_MAX_BUNDLE_SIZE;
    if (envSize) {
      const parsed = parseInt(envSize, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    // Default to 50MB
    return 50 * 1024 * 1024;
  }

  /**
   * Validate bundle generation options
   */
  private validateBundleOptions(options: BundleGenerationOptions): string[] {
    const errors: string[] = [];

    // Validate taskType
    if (!options.taskType || typeof options.taskType !== 'string') {
      errors.push('taskType is required and must be a string');
    } else {
      const validTaskTypes = ['implementation', 'fix', 'review', 'pr-follow-up', 'analysis'];
      if (!validTaskTypes.includes(options.taskType)) {
        errors.push(`Invalid taskType: '${options.taskType}'. Must be one of: ${validTaskTypes.join(', ')}`);
      }
    }

    // Validate profiles (if provided)
    if (options.profiles !== undefined) {
      if (!Array.isArray(options.profiles)) {
        errors.push('profiles must be an array');
      } else {
        options.profiles.forEach((profile, index) => {
          if (typeof profile !== 'string') {
            errors.push(`profiles[${index}] must be a string`);
          } else if (profile.length === 0) {
            errors.push(`profiles[${index}] cannot be empty`);
          } else if (!/^[a-z][a-z0-9-]*$/.test(profile)) {
            errors.push(`profiles[${index}] '${profile}' has invalid format. Must match: ^[a-z][a-z0-9-]*$`);
          }
        });
      }
    }

    // Validate targetFiles (if provided)
    if (options.targetFiles !== undefined) {
      if (!Array.isArray(options.targetFiles)) {
        errors.push('targetFiles must be an array');
      } else {
        options.targetFiles.forEach((file, index) => {
          if (typeof file !== 'string') {
            errors.push(`targetFiles[${index}] must be a string`);
          } else if (file.length === 0) {
            errors.push(`targetFiles[${index}] cannot be empty`);
          }
        });
      }
    }

    // Validate force flag (if provided)
    if (options.force !== undefined && typeof options.force !== 'boolean') {
      errors.push('force must be a boolean');
    }

    return errors;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
}
