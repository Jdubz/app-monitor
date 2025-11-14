/**
 * Context Recipe Validator
 *
 * Validates context recipe files against the schema and business rules.
 */

import type {
  RecipeValidationResult,
  RecipeTaskType,
  SourceType,
  TransformType,
  OutputFormat
} from '../../types/contextRecipe.js';

const PROFILE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const FILENAME_PATTERN = /^[a-z0-9][a-z0-9._\-{}]*$/;

const VALID_TASK_TYPES: RecipeTaskType[] = [
  'implementation',
  'review',
  'fix',
  'deployment',
  'pr-follow-up',
  'analysis'
];

const VALID_SOURCE_TYPES: SourceType[] = [
  'markdown',
  'code',
  'json',
  'yaml',
  'config',
  'text'
];

const VALID_TRANSFORMS: TransformType[] = [
  'none',
  'summarize',
  'strip-comments',
  'minify',
  'bullet-list'
];

const VALID_OUTPUT_FORMATS: OutputFormat[] = [
  'markdown',
  'json',
  'yaml',
  'text'
];

export class ContextRecipeValidator {
  /**
   * Validate a context recipe
   */
  validate(recipe: unknown): RecipeValidationResult {
    const errors: string[] = [];
    const _warnings: string[] = [];

    // Type guard
    if (typeof recipe !== 'object' || recipe === null || Array.isArray(recipe)) {
      return {
        valid: false,
        errors: ['Recipe must be a non-null object'],
        warnings: []
      };
    }

    const recipeObj = recipe as Record<string, unknown>;

    // Required field validation
    if (!recipeObj.profile) {
      errors.push('Missing required field: profile');
    } else if (typeof recipeObj.profile === 'string' && !PROFILE_NAME_PATTERN.test(recipeObj.profile)) {
      errors.push(
        `Invalid profile name '${recipeObj.profile}': must start with lowercase letter and contain only lowercase letters, numbers, and hyphens`
      );
    }

    if (!recipeObj.version) {
      errors.push('Missing required field: version');
    } else if (typeof recipeObj.version === 'string' && !SEMVER_PATTERN.test(recipeObj.version)) {
      errors.push(
        `Invalid version format '${recipeObj.version}': must be valid semver (e.g., 1.0.0)`
      );
    }

    if (!recipeObj.description) {
      errors.push('Missing required field: description');
    } else if (typeof recipeObj.description !== 'string') {
      errors.push('Description must be a string');
    } else if (recipeObj.description.length < 10) {
      errors.push('Description must be at least 10 characters');
    } else if (recipeObj.description.length > 200) {
      errors.push('Description must be at most 200 characters');
    }

    if (!recipeObj.sources || !Array.isArray(recipeObj.sources)) {
      errors.push('Missing or invalid required field: sources (must be an array)');
    } else if (recipeObj.sources.length === 0) {
      errors.push('Sources array must have at least one element');
    } else {
      // Validate each source
      recipeObj.sources.forEach((source: unknown, index: number) => {
        this.validateSource(source, index, errors);
      });
    }

    // Optional field validation
    if (recipeObj.taskTypes !== undefined) {
      if (!Array.isArray(recipeObj.taskTypes)) {
        errors.push('taskTypes must be an array');
      } else {
        recipeObj.taskTypes.forEach((taskType: unknown) => {
          if (!VALID_TASK_TYPES.includes(taskType as RecipeTaskType)) {
            errors.push(
              `Invalid task type '${taskType}': must be one of ${VALID_TASK_TYPES.join(', ')}`
            );
          }
        });
      }
    }

    if (recipeObj.sizeLimit !== undefined) {
      this.validateSizeLimit(recipeObj.sizeLimit, errors);
    }

    if (recipeObj.outputs !== undefined) {
      this.validateOutputs(recipeObj.outputs, errors);
    }

    if (recipeObj.dependencies !== undefined) {
      if (!Array.isArray(recipeObj.dependencies)) {
        errors.push('dependencies must be an array');
      } else {
        recipeObj.dependencies.forEach((dep: unknown) => {
          if (typeof dep !== 'string') {
            errors.push('Each dependency must be a string');
          } else if (!PROFILE_NAME_PATTERN.test(dep)) {
            errors.push(`Invalid dependency profile name '${dep}'`);
          }
        });
      }
    }

    if (recipeObj.ttl !== undefined) {
      if (typeof recipeObj.ttl !== 'number') {
        errors.push('ttl must be a number');
      } else if (isNaN(recipeObj.ttl)) {
        errors.push('ttl cannot be NaN');
      } else if (!isFinite(recipeObj.ttl)) {
        errors.push('ttl must be finite (not Infinity)');
      } else if (recipeObj.ttl < 0) {
        errors.push('ttl must be non-negative');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: _warnings,
      profile: recipeObj.profile as string
    };
  }

  /**
   * Validate a recipe source
   */
  private validateSource(source: unknown, index: number, errors: string[]): void {
    const prefix = `Source[${index}]`;

    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      errors.push(`${prefix}: must be an object`);
      return;
    }

    const sourceObj = source as Record<string, unknown>;

    if (!sourceObj.type) {
      errors.push(`${prefix}: Missing required field 'type'`);
    } else if (!VALID_SOURCE_TYPES.includes(sourceObj.type as SourceType)) {
      errors.push(
        `${prefix}: Invalid type '${sourceObj.type}': must be one of ${VALID_SOURCE_TYPES.join(', ')}`
      );
    }

    if (!sourceObj.path) {
      errors.push(`${prefix}: Missing required field 'path'`);
    } else if (typeof sourceObj.path !== 'string') {
      errors.push(`${prefix}: path must be a string`);
    }

    if (sourceObj.transform !== undefined) {
      if (!VALID_TRANSFORMS.includes(sourceObj.transform as TransformType)) {
        errors.push(
          `${prefix}: Invalid transform '${sourceObj.transform}': must be one of ${VALID_TRANSFORMS.join(', ')}`
        );
      }
    }

    if (sourceObj.extract !== undefined) {
      this.validateExtraction(sourceObj.extract, index, errors);
    }
  }

  /**
   * Validate extraction configuration
   */
  private validateExtraction(extract: unknown, sourceIndex: number, errors: string[]): void {
    const prefix = `Source[${sourceIndex}].extract`;

    if (typeof extract !== 'object' || extract === null || Array.isArray(extract)) {
      errors.push(`${prefix}: must be an object`);
      return;
    }

    const extractObj = extract as Record<string, unknown>;

    if (extractObj.headings !== undefined && !Array.isArray(extractObj.headings)) {
      errors.push(`${prefix}.headings: must be an array`);
    }

    if (extractObj.sections !== undefined && !Array.isArray(extractObj.sections)) {
      errors.push(`${prefix}.sections: must be an array`);
    }

    if (extractObj.codeBlocks !== undefined && typeof extractObj.codeBlocks !== 'boolean') {
      errors.push(`${prefix}.codeBlocks: must be a boolean`);
    }

    if (extractObj.tables !== undefined && typeof extractObj.tables !== 'boolean') {
      errors.push(`${prefix}.tables: must be a boolean`);
    }

    if (extractObj.jsonPath !== undefined && typeof extractObj.jsonPath !== 'string') {
      errors.push(`${prefix}.jsonPath: must be a string`);
    }
  }

  /**
   * Validate size limit configuration
   */
  private validateSizeLimit(sizeLimit: unknown, errors: string[]): void {
    if (typeof sizeLimit !== 'object' || sizeLimit === null || Array.isArray(sizeLimit)) {
      errors.push('sizeLimit must be an object');
      return;
    }

    const limitObj = sizeLimit as Record<string, unknown>;

    if (limitObj.maxBytes !== undefined) {
      if (typeof limitObj.maxBytes !== 'number' || limitObj.maxBytes < 1024) {
        errors.push('sizeLimit.maxBytes must be a number >= 1024');
      }
    }

    if (limitObj.maxInlineBytes !== undefined) {
      if (typeof limitObj.maxInlineBytes !== 'number' || limitObj.maxInlineBytes < 512) {
        errors.push('sizeLimit.maxInlineBytes must be a number >= 512');
      }
    }

    if (
      limitObj.maxBytes !== undefined &&
      limitObj.maxInlineBytes !== undefined &&
      typeof limitObj.maxBytes === 'number' &&
      typeof limitObj.maxInlineBytes === 'number' &&
      limitObj.maxInlineBytes > limitObj.maxBytes
    ) {
      errors.push('sizeLimit.maxInlineBytes cannot exceed maxBytes');
    }
  }

  /**
   * Validate output configuration
   */
  private validateOutputs(outputs: unknown, errors: string[]): void {
    if (typeof outputs !== 'object' || outputs === null || Array.isArray(outputs)) {
      errors.push('outputs must be an object');
      return;
    }

    const outputsObj = outputs as Record<string, unknown>;

    if (outputsObj.format !== undefined) {
      if (!VALID_OUTPUT_FORMATS.includes(outputsObj.format as OutputFormat)) {
        errors.push(
          `Invalid output format '${outputsObj.format}': must be one of ${VALID_OUTPUT_FORMATS.join(', ')}`
        );
      }
    }

    if (outputsObj.filename !== undefined) {
      if (typeof outputsObj.filename !== 'string') {
        errors.push('outputs.filename must be a string');
      } else if (!FILENAME_PATTERN.test(outputsObj.filename)) {
        errors.push(
          `Invalid output filename '${outputsObj.filename}': must start with lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens`
        );
      }
    }

    if (outputsObj.includeMetadata !== undefined && typeof outputsObj.includeMetadata !== 'boolean') {
      errors.push('outputs.includeMetadata must be a boolean');
    }
  }
}
