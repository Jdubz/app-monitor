/**
 * Context Recipe Type Definitions
 *
 * Defines types for YAML-based context recipes that specify how to
 * generate context bundles for dev-bot tasks.
 */

/**
 * Valid task types for context recipes
 */
export type RecipeTaskType = 'implementation' | 'fix' | 'review' | 'deployment' | 'pr-follow-up' | 'analysis';

/**
 * Valid source types for recipe sources
 */
export type SourceType = 'code' | 'markdown' | 'json' | 'yaml' | 'config' | 'text';

/**
 * Valid transform types
 */
export type TransformType = 'none' | 'summarize' | 'strip-comments' | 'minify' | 'bullet-list';

/**
 * Valid output formats
 */
export type OutputFormat = 'markdown' | 'json' | 'text' | 'yaml';

/**
 * Content extraction configuration
 */
export interface ContentExtraction {
  headings?: string[];           // Extract specific markdown headings
  sections?: string[];            // Extract specific code sections (functions, classes)
  codeBlocks?: boolean;           // Extract only code blocks
  tables?: boolean;               // Extract only tables
  jsonPath?: string;              // JSONPath expression for JSON extraction
}

/**
 * Size limit configuration
 */
export interface SizeLimit {
  maxBytes?: number;              // Maximum total bytes for profile
  maxInlineBytes?: number;        // Maximum bytes for inline content display
}

/**
 * Recipe source configuration
 */
export interface RecipeSource {
  type: SourceType;
  path: string;
  optional?: boolean;
  extract?: ContentExtraction;
  transform?: TransformType;
}

/**
 * Recipe output configuration
 */
export interface RecipeOutput {
  format: OutputFormat;
  filename: string;
  includeMetadata?: boolean;
}

/**
 * Complete context recipe definition
 */
export interface ContextRecipe {
  profile: string;
  version: string;
  description: string;
  taskTypes: RecipeTaskType[];
  required?: boolean;
  sizeLimit?: SizeLimit;
  constraints?: string[];
  investigationSteps?: string[];
  sources: RecipeSource[];
  outputs?: RecipeOutput;
  ttl?: number;                   // Time to live in seconds
}

/**
 * Recipe validation result
 */
export interface RecipeValidationResult {
  valid: boolean;
  profile?: string;
  errors?: string[];
  warnings?: string[];
}

/**
 * Recipe load result
 */
export interface RecipeLoadResult {
  success: boolean;
  recipe?: ContextRecipe;
  errors?: string[];
}
