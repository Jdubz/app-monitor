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
const FILENAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const VALID_TASK_TYPES: RecipeTaskType[] = [
  'implementation',
  'review',
  'fix',
  'pr-follow-up',
  'analysis'
];

const VALID_SOURCE_TYPES: SourceType[] = [
  'markdown',
  'code',
  'json',
  'yaml',
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
  validate(recipe: any): RecipeValidationResult {
    const errors: string[] = [];
    const _warnings: string[] = [];

    // Required field validation
    if (!recipe.profile) {
      errors.push('Missing required field: profile');
    } else if (!PROFILE_NAME_PATTERN.test(recipe.profile)) {
      errors.push(
        `Invalid profile name '${recipe.profile}': must start with lowercase letter and contain only lowercase letters, numbers, and hyphens`
      );
    }

    if (!recipe.version) {
      errors.push('Missing required field: version');
    } else if (!SEMVER_PATTERN.test(recipe.version)) {
      errors.push(
        `Invalid version format '${recipe.version}': must be valid semver (e.g., 1.0.0)`
      );
    }

    if (!recipe.description) {
      errors.push('Missing required field: description');
    } else if (typeof recipe.description !== 'string') {
      errors.push('Description must be a string');
    } else if (recipe.description.length < 10) {
      errors.push('Description must be at least 10 characters');
    } else if (recipe.description.length > 200) {
      errors.push('Description must be at most 200 characters');
    }

    if (!recipe.sources || !Array.isArray(recipe.sources)) {
      errors.push('Missing or invalid required field: sources (must be an array)');
    } else if (recipe.sources.length === 0) {
      errors.push('Sources array must have at least one element');
    } else {
      // Validate each source
      recipe.sources.forEach((source: any, index: number) => {
        this.validateSource(source, index, errors);
      });
    }

    // Optional field validation
    if (recipe.taskTypes !== undefined) {
      if (!Array.isArray(recipe.taskTypes)) {
        errors.push('taskTypes must be an array');
      } else {
        recipe.taskTypes.forEach((taskType: any) => {
          if (!VALID_TASK_TYPES.includes(taskType)) {
            errors.push(
              `Invalid task type '${taskType}': must be one of ${VALID_TASK_TYPES.join(', ')}`
            );
          }
        });
      }
    }

    if (recipe.sizeLimit !== undefined) {
      this.validateSizeLimit(recipe.sizeLimit, errors);
    }

    if (recipe.outputs !== undefined) {
      this.validateOutputs(recipe.outputs, errors);
    }

    if (recipe.dependencies !== undefined) {
      if (!Array.isArray(recipe.dependencies)) {
        errors.push('dependencies must be an array');
      } else {
        recipe.dependencies.forEach((dep: any) => {
          if (typeof dep !== 'string') {
            errors.push('Each dependency must be a string');
          } else if (!PROFILE_NAME_PATTERN.test(dep)) {
            errors.push(`Invalid dependency profile name '${dep}'`);
          }
        });
      }
    }

    if (recipe.ttl !== undefined) {
      if (typeof recipe.ttl !== 'number' || recipe.ttl < 0) {
        errors.push('ttl must be a non-negative number');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: _warnings,
      profile: recipe.profile
    };
  }

  /**
   * Validate a recipe source
   */
  private validateSource(source: any, index: number, errors: string[]): void {
    const prefix = `Source[${index}]`;

    if (!source.type) {
      errors.push(`${prefix}: Missing required field 'type'`);
    } else if (!VALID_SOURCE_TYPES.includes(source.type)) {
      errors.push(
        `${prefix}: Invalid type '${source.type}': must be one of ${VALID_SOURCE_TYPES.join(', ')}`
      );
    }

    if (!source.path) {
      errors.push(`${prefix}: Missing required field 'path'`);
    } else if (typeof source.path !== 'string') {
      errors.push(`${prefix}: path must be a string`);
    }

    if (source.transform !== undefined) {
      if (!VALID_TRANSFORMS.includes(source.transform)) {
        errors.push(
          `${prefix}: Invalid transform '${source.transform}': must be one of ${VALID_TRANSFORMS.join(', ')}`
        );
      }
    }

    if (source.extract !== undefined) {
      this.validateExtraction(source.extract, index, errors);
    }
  }

  /**
   * Validate extraction configuration
   */
  private validateExtraction(extract: any, sourceIndex: number, errors: string[]): void {
    const prefix = `Source[${sourceIndex}].extract`;

    if (typeof extract !== 'object' || Array.isArray(extract)) {
      errors.push(`${prefix}: must be an object`);
      return;
    }

    if (extract.headings !== undefined && !Array.isArray(extract.headings)) {
      errors.push(`${prefix}.headings: must be an array`);
    }

    if (extract.sections !== undefined && !Array.isArray(extract.sections)) {
      errors.push(`${prefix}.sections: must be an array`);
    }

    if (extract.codeBlocks !== undefined && typeof extract.codeBlocks !== 'boolean') {
      errors.push(`${prefix}.codeBlocks: must be a boolean`);
    }

    if (extract.tables !== undefined && typeof extract.tables !== 'boolean') {
      errors.push(`${prefix}.tables: must be a boolean`);
    }

    if (extract.jsonPath !== undefined && typeof extract.jsonPath !== 'string') {
      errors.push(`${prefix}.jsonPath: must be a string`);
    }
  }

  /**
   * Validate size limit configuration
   */
  private validateSizeLimit(sizeLimit: any, errors: string[]): void {
    if (typeof sizeLimit !== 'object' || Array.isArray(sizeLimit)) {
      errors.push('sizeLimit must be an object');
      return;
    }

    if (sizeLimit.maxBytes !== undefined) {
      if (typeof sizeLimit.maxBytes !== 'number' || sizeLimit.maxBytes < 1024) {
        errors.push('sizeLimit.maxBytes must be a number >= 1024');
      }
    }

    if (sizeLimit.maxInlineBytes !== undefined) {
      if (typeof sizeLimit.maxInlineBytes !== 'number' || sizeLimit.maxInlineBytes < 512) {
        errors.push('sizeLimit.maxInlineBytes must be a number >= 512');
      }
    }

    if (
      sizeLimit.maxBytes !== undefined &&
      sizeLimit.maxInlineBytes !== undefined &&
      sizeLimit.maxInlineBytes > sizeLimit.maxBytes
    ) {
      errors.push('sizeLimit.maxInlineBytes cannot exceed maxBytes');
    }
  }

  /**
   * Validate output configuration
   */
  private validateOutputs(outputs: any, errors: string[]): void {
    if (typeof outputs !== 'object' || Array.isArray(outputs)) {
      errors.push('outputs must be an object');
      return;
    }

    if (outputs.format !== undefined) {
      if (!VALID_OUTPUT_FORMATS.includes(outputs.format)) {
        errors.push(
          `Invalid output format '${outputs.format}': must be one of ${VALID_OUTPUT_FORMATS.join(', ')}`
        );
      }
    }

    if (outputs.filename !== undefined) {
      if (typeof outputs.filename !== 'string') {
        errors.push('outputs.filename must be a string');
      } else if (!FILENAME_PATTERN.test(outputs.filename)) {
        errors.push(
          `Invalid output filename '${outputs.filename}': must start with lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens`
        );
      }
    }

    if (outputs.includeMetadata !== undefined && typeof outputs.includeMetadata !== 'boolean') {
      errors.push('outputs.includeMetadata must be a boolean');
    }
  }
}
