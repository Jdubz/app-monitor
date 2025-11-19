// @ts-nocheck
/**
 * Context Recipe Validator Tests
 *
 * Comprehensive test suite for ContextRecipeValidator
 * Tests all validation rules and edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextRecipeValidator } from '../contextRecipeValidator.js';
import { mockRecipe } from './helpers/testMocks.js';

describe('ContextRecipeValidator', () => {
  let validator: ContextRecipeValidator;

  beforeEach(() => {
    validator = new ContextRecipeValidator();
  });

  describe('validate - required fields', () => {
    it('should validate a valid recipe', () => {
      const recipe = mockRecipe();
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing profile', () => {
      const recipe = mockRecipe();
      delete (recipe as any).profile;
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: profile');
    });

    it('should reject invalid profile name format', () => {
      const recipe = mockRecipe({ profile: 'Invalid-Profile' });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid profile name');
    });

    it('should accept valid profile names', () => {
      const validNames = ['test', 'test-profile', 'test123', 't', 'abc-123-def'];
      validNames.forEach(name => {
        const recipe = mockRecipe({ profile: name });
        const result = validator.validate(recipe);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject missing version', () => {
      const recipe = mockRecipe();
      delete (recipe as any).version;
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should reject invalid version format', () => {
      const recipe = mockRecipe({ version: '1.0' });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid version format');
    });

    it('should accept valid semver versions', () => {
      const validVersions = ['1.0.0', '0.0.1', '10.20.30'];
      validVersions.forEach(version => {
        const recipe = mockRecipe({ version });
        const result = validator.validate(recipe);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject missing description', () => {
      const recipe = mockRecipe();
      delete (recipe as any).description;
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: description');
    });

    it('should reject non-string description', () => {
      const recipe = mockRecipe({ description: 123 as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Description must be a string');
    });

    it('should reject too short description', () => {
      const recipe = mockRecipe({ description: 'Short' });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Description must be at least 10 characters');
    });

    it('should reject too long description', () => {
      const recipe = mockRecipe({ description: 'x'.repeat(201) });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Description must be at most 200 characters');
    });

    it('should reject missing sources', () => {
      const recipe = mockRecipe();
      delete (recipe as any).sources;
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Missing or invalid required field: sources');
    });

    it('should reject non-array sources', () => {
      const recipe = mockRecipe({ sources: 'not an array' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('sources (must be an array)');
    });

    it('should reject empty sources array', () => {
      const recipe = mockRecipe({ sources: [] });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Sources array must have at least one element');
    });

    it('should accumulate multiple errors', () => {
      const recipe: any = {
        // Missing profile, version, description, sources
      };
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
    });
  });

  describe('validate - optional fields', () => {
    it('should validate taskTypes', () => {
      const recipe = mockRecipe({ taskTypes: ['implementation', 'fix'] });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array taskTypes', () => {
      const recipe = mockRecipe({ taskTypes: 'not-array' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('taskTypes must be an array');
    });

    it('should reject invalid task type', () => {
      const recipe = mockRecipe({ taskTypes: ['invalid-type' as any] });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid task type');
    });

    it('should validate all valid task types', () => {
      const validTypes = ['implementation', 'review', 'fix', 'pr-follow-up', 'analysis'];
      const recipe = mockRecipe({ taskTypes: validTypes as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should validate dependencies array', () => {
      const recipe = mockRecipe({ dependencies: ['profile-a', 'profile-b'] } as any);
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array dependencies', () => {
      const recipe = mockRecipe({ dependencies: 'not-array' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('dependencies must be an array');
    });

    it('should reject non-string dependency', () => {
      const recipe = mockRecipe({ dependencies: ['profile-a', 123, 'profile-b'] } as any);
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Each dependency must be a string');
    });

    it('should reject invalid dependency profile name', () => {
      const recipe = mockRecipe({ dependencies: ['profile-a', 'invalid profile!', 'profile-b'] } as any);
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('Invalid dependency profile name'))).toBe(true);
    });

    it('should validate ttl number', () => {
      const recipe = mockRecipe({ ttl: 3600 });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-number ttl', () => {
      const recipe = mockRecipe({ ttl: '3600' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ttl must be a number');
    });

    it('should reject NaN ttl', () => {
      const recipe = mockRecipe({ ttl: NaN });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ttl cannot be NaN');
    });

    it('should reject Infinity ttl', () => {
      const recipe = mockRecipe({ ttl: Infinity });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ttl must be finite (not Infinity)');
    });

    it('should reject negative ttl', () => {
      const recipe = mockRecipe({ ttl: -1 });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ttl must be non-negative');
    });
  });

  describe('validateSource', () => {
    it('should validate a valid source', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'docs/test.md',
          optional: false
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject missing source type', () => {
      const recipe = mockRecipe({
        sources: [{
          path: 'docs/test.md'
        } as any]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("Missing required field 'type'");
    });

    it('should reject invalid source type', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'invalid' as any,
          path: 'docs/test.md'
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid type');
    });

    it('should validate all valid source types', () => {
      const validTypes = ['markdown', 'code', 'json', 'yaml', 'config', 'text'];
      validTypes.forEach(type => {
        const recipe = mockRecipe({
          sources: [{
            type: type as any,
            path: 'test.md',
            optional: false
          }]
        });
        const result = validator.validate(recipe);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject missing source path', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown'
        } as any]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("Missing required field 'path'");
    });

    it('should reject non-string source path', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 123 as any
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('path must be a string');
    });

    it('should validate valid transforms', () => {
      const validTransforms = ['none', 'summarize', 'strip-comments', 'minify', 'bullet-list'];
      validTransforms.forEach(transform => {
        const recipe = mockRecipe({
          sources: [{
            type: 'markdown',
            path: 'test.md',
            optional: false,
            transform: transform as any
          }]
        });
        const result = validator.validate(recipe);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid transform', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          transform: 'invalid' as any
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid transform');
    });
  });

  describe('validateExtraction', () => {
    it('should validate headings array', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: { headings: ['Heading 1', 'Heading 2'] }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-object extract', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: 'not-object' as any
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('extract: must be an object');
    });

    it('should reject array extract', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: [] as any
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('extract: must be an object');
    });

    it('should reject non-array headings', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: { headings: 'not-array' as any }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('headings: must be an array');
    });

    it('should reject non-array sections', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'code',
          path: 'test.ts',
          optional: false,
          extract: { sections: 'not-array' as any }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('sections: must be an array');
    });

    it('should reject non-boolean codeBlocks', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: { codeBlocks: 'true' as any }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('codeBlocks: must be a boolean');
    });

    it('should reject non-boolean tables', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'markdown',
          path: 'test.md',
          optional: false,
          extract: { tables: 1 as any }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('tables: must be a boolean');
    });

    it('should reject non-string jsonPath', () => {
      const recipe = mockRecipe({
        sources: [{
          type: 'json',
          path: 'test.json',
          optional: false,
          extract: { jsonPath: 123 as any }
        }]
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('jsonPath: must be a string');
    });
  });

  describe('validateSizeLimit', () => {
    it('should validate valid size limits', () => {
      const recipe = mockRecipe({
        sizeLimit: {
          maxBytes: 1024 * 1024,
          maxInlineBytes: 512 * 1024
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-object sizeLimit', () => {
      const recipe = mockRecipe({ sizeLimit: 'not-object' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sizeLimit must be an object');
    });

    it('should reject array sizeLimit', () => {
      const recipe = mockRecipe({ sizeLimit: [] as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sizeLimit must be an object');
    });

    it('should reject maxBytes below minimum', () => {
      const recipe = mockRecipe({
        sizeLimit: {
          maxBytes: 1000
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sizeLimit.maxBytes must be a number >= 1024');
    });

    it('should reject maxInlineBytes below minimum', () => {
      const recipe = mockRecipe({
        sizeLimit: {
          maxInlineBytes: 500
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sizeLimit.maxInlineBytes must be a number >= 512');
    });

    it('should reject maxInlineBytes exceeding maxBytes', () => {
      const recipe = mockRecipe({
        sizeLimit: {
          maxBytes: 10000,
          maxInlineBytes: 20000
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sizeLimit.maxInlineBytes cannot exceed maxBytes');
    });
  });

  describe('validateOutputs', () => {
    it('should validate valid outputs', () => {
      const recipe = mockRecipe({
        outputs: {
          format: 'markdown',
          filename: 'context-test.md',
          includeMetadata: true
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
    });

    it('should reject non-object outputs', () => {
      const recipe = mockRecipe({ outputs: 'not-object' as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('outputs must be an object');
    });

    it('should reject array outputs', () => {
      const recipe = mockRecipe({ outputs: [] as any });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('outputs must be an object');
    });

    it('should validate all valid output formats', () => {
      const validFormats = ['markdown', 'json', 'yaml', 'text'];
      validFormats.forEach(format => {
        const recipe = mockRecipe({
          outputs: {
            format: format as any,
            filename: 'test.md',
            includeMetadata: false
          }
        });
        const result = validator.validate(recipe);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid output format', () => {
      const recipe = mockRecipe({
        outputs: {
          format: 'invalid' as any,
          filename: 'test.md',
          includeMetadata: false
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid output format');
    });

    it('should reject non-string filename', () => {
      const recipe = mockRecipe({
        outputs: {
          format: 'markdown',
          filename: 123 as any,
          includeMetadata: false
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('outputs.filename must be a string');
    });

    it('should reject invalid filename format', () => {
      const recipe = mockRecipe({
        outputs: {
          format: 'markdown',
          filename: 'Invalid-File.md',
          includeMetadata: false
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid output filename');
    });

    it('should reject non-boolean includeMetadata', () => {
      const recipe = mockRecipe({
        outputs: {
          format: 'markdown',
          filename: 'test.md',
          includeMetadata: 'true' as any
        }
      });
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('outputs.includeMetadata must be a boolean');
    });
  });

  describe('validation result structure', () => {
    it('should return profile name in result', () => {
      const recipe = mockRecipe({ profile: 'test-profile' });
      const result = validator.validate(recipe);
      expect(result.profile).toBe('test-profile');
    });

    it('should return warnings array', () => {
      const recipe = mockRecipe();
      const result = validator.validate(recipe);
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should set valid to false when errors exist', () => {
      const recipe = mockRecipe();
      delete (recipe as any).profile;
      const result = validator.validate(recipe);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should set valid to true when no errors', () => {
      const recipe = mockRecipe();
      const result = validator.validate(recipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
