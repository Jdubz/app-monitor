import { describe, it, expect } from 'vitest';
import {
  validateTaskTemplate,
  formatValidationErrors,
  isV3Template,
  type TaskTemplateV3
} from './taskTemplateValidator.js';

describe('TaskTemplateValidator', () => {
  describe('validateTaskTemplate', () => {
    it('should validate a complete v3 template', () => {
      const template: TaskTemplateV3 = {
        type: 'implementation',
        title: 'Add retry limit to tasks',
        description: 'Extend tasks table with retry_limit column',
        investigation: {
          required: true,
          steps: [
            'READ backend/src/services/database.ts',
            'GREP for retry in backend/src'
          ],
          mustFind: ['Current tasks schema'],
          mustNotDuplicate: ['Migration logic']
        },
        preImplementationChecklist: [
          '[ ] Read database.ts',
          '[ ] Grep for retry',
          '[ ] Verify no duplicates'
        ],
        acceptanceCriteria: [
          'EXACTLY ONE column added',
          'DO NOT add extra features'
        ],
        constraints: [
          'MUST NOT create new files',
          'MUST use existing patterns'
        ],
        files: ['backend/src/services/database.ts'],
        doNotCreate: ['backend/src/types/retry.ts (use existing)'],
        gitWorkflow: {
          required: true,
          branch: 'staging',
          commitMessage: 'feat: add retry limit\n\n🤖 Generated with Claude Code'
        },
        metadata: {
          promptEngineeringVersion: 'v3',
          strictScopeEnforcement: true,
          mandatoryInvestigation: true,
          duplicateProtection: true
        }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when investigation is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Add feature',
        description: 'Add new feature',
        preImplementationChecklist: ['[ ] Read code'],
        acceptanceCriteria: ['Feature added'],
        constraints: ['MUST NOT break existing code'],
        files: ['src/index.ts'],
        gitWorkflow: {
          required: true,
          branch: 'main',
          commitMessage: 'feat: add feature'
        }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'investigation',
          severity: 'error'
        })
      );
    });

    it('should fail when investigation.required is false', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: false, // Should be true
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'investigation.required',
          message: expect.stringContaining('must be marked as required')
        })
      );
    });

    it('should fail when investigation steps are empty', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: [], // Empty!
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'investigation.steps',
          severity: 'error'
        })
      );
    });

    it('should warn when investigation lacks READ step', () => {
      const template: Partial<TaskTemplateV3> = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['GREP for something'], // No READ!
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['MUST NOT test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'investigation.steps',
          message: expect.stringContaining('READ step')
        })
      );
    });

    it('should fail when mustFind is empty', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: [], // Empty!
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'investigation.mustFind'
        })
      );
    });

    it('should fail when mustNotDuplicate is empty', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: [] // Empty!
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'investigation.mustNotDuplicate'
        })
      );
    });

    it('should fail when preImplementationChecklist is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        // No checklist!
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'preImplementationChecklist'
        })
      );
    });

    it('should warn when checklist has fewer than 3 items', () => {
      const template: Partial<TaskTemplateV3> = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['[ ] one', '[ ] two'], // Only 2!
        acceptanceCriteria: ['test'],
        constraints: ['MUST NOT test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'preImplementationChecklist',
          message: expect.stringContaining('at least 3 items')
        })
      );
    });

    it('should fail when acceptanceCriteria is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        // No acceptanceCriteria!
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'acceptanceCriteria'
        })
      );
    });

    it('should warn when acceptanceCriteria lacks EXACTLY language', () => {
      const template: Partial<TaskTemplateV3> = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['Feature works'], // No "EXACTLY"!
        constraints: ['MUST NOT test'],
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'acceptanceCriteria',
          message: expect.stringContaining('EXACTLY')
        })
      );
    });

    it('should fail when constraints is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        // No constraints!
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'constraints'
        })
      );
    });

    it('should warn when constraints lack MUST NOT language', () => {
      const template: Partial<TaskTemplateV3> = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['EXACTLY one thing'],
        constraints: ['Keep it simple'], // No "MUST NOT"!
        files: ['test.ts'],
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'constraints',
          message: expect.stringContaining('MUST NOT')
        })
      );
    });

    it('should fail when files array is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        // No files!
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'files'
        })
      );
    });

    it('should warn when doNotCreate lacks explanations', () => {
      const template: Partial<TaskTemplateV3> = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['EXACTLY one'],
        constraints: ['MUST NOT add extras'],
        files: ['test.ts'],
        doNotCreate: ['helper.ts'], // No explanation!
        gitWorkflow: { required: true, branch: 'main', commitMessage: 'test 🤖' }
      };

      const result = validateTaskTemplate(template);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'doNotCreate',
          message: expect.stringContaining('explanations in parentheses')
        })
      );
    });

    it('should fail when gitWorkflow is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts']
        // No gitWorkflow!
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'gitWorkflow'
        })
      );
    });

    it('should fail when gitWorkflow.branch is missing', () => {
      const template = {
        type: 'implementation',
        title: 'Test',
        description: 'Test',
        investigation: {
          required: true,
          steps: ['READ file'],
          mustFind: ['something'],
          mustNotDuplicate: ['something']
        },
        preImplementationChecklist: ['test'],
        acceptanceCriteria: ['test'],
        constraints: ['test'],
        files: ['test.ts'],
        gitWorkflow: {
          required: true,
          branch: '', // Empty!
          commitMessage: 'test'
        }
      };

      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'gitWorkflow.branch'
        })
      );
    });
  });

  describe('formatValidationErrors', () => {
    it('should format valid template message', () => {
      const result = {
        isValid: true,
        errors: [],
        warnings: []
      };

      const message = formatValidationErrors(result);
      expect(message).toContain('✅');
      expect(message).toContain('valid');
    });

    it('should format errors and warnings', () => {
      const result = {
        isValid: false,
        errors: [
          { field: 'investigation', message: 'Missing', severity: 'error' as const }
        ],
        warnings: [
          { field: 'metadata', message: 'Recommended', severity: 'warning' as const }
        ]
      };

      const message = formatValidationErrors(result);
      expect(message).toContain('❌');
      expect(message).toContain('Errors:');
      expect(message).toContain('investigation');
      expect(message).toContain('Warnings:');
      expect(message).toContain('metadata');
    });
  });

});

describe('isV3Template', () => {
  it('should return true when all required v3 sections are present', () => {
    const template = {
      type: 'implementation',
      title: 'Add retry limit',
      description: 'Extend tasks schema with retry_limit',
      investigation: {
        required: true,
        steps: ['READ backend/src/services/database.ts'],
        mustFind: ['Current tasks schema'],
        mustNotDuplicate: ['Existing migrations']
      },
      preImplementationChecklist: ['[ ] Review database schema'],
      constraints: ['MUST NOT break existing tasks'],
      files: ['backend/src/services/database.ts'],
      gitWorkflow: {
        required: true,
        branch: 'staging',
        commitMessage: 'feat: add retry limit'
      }
    };

    expect(isV3Template(template)).toBe(true);
  });

  it('should return false when investigation section is missing', () => {
    const template = {
      type: 'implementation',
      title: 'Test',
      description: 'Test',
      preImplementationChecklist: ['[ ] Do something'],
      constraints: ['MUST NOT break prod'],
      gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
    };

    expect(isV3Template(template)).toBe(false);
  });

  it('should return false when preImplementationChecklist is not an array', () => {
    const template = {
      type: 'implementation',
      title: 'Test',
      description: 'Test',
      investigation: {
        required: true,
        steps: ['READ something'],
        mustFind: ['find'],
        mustNotDuplicate: ['duplicate']
      },
      preImplementationChecklist: '[ ] string instead of array',
      constraints: ['MUST NOT break prod'],
      gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
    };

    expect(isV3Template(template)).toBe(false);
  });

  it('should return false when constraints is not an array', () => {
    const template = {
      type: 'implementation',
      title: 'Test',
      description: 'Test',
      investigation: {
        required: true,
        steps: ['READ something'],
        mustFind: ['find'],
        mustNotDuplicate: ['duplicate']
      },
      preImplementationChecklist: ['[ ] Step'],
      constraints: 'MUST NOT break prod',
      gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
    };

    expect(isV3Template(template)).toBe(false);
  });

  it('should return false when gitWorkflow metadata is missing', () => {
    const template = {
      type: 'implementation',
      title: 'Test',
      description: 'Test',
      investigation: {
        required: true,
        steps: ['READ something'],
        mustFind: ['find'],
        mustNotDuplicate: ['duplicate']
      },
      preImplementationChecklist: ['[ ] Step'],
      constraints: ['MUST NOT break prod']
    };

    expect(isV3Template(template)).toBe(false);
  });

  it('should return false for null input', () => {
    expect(isV3Template(null)).toBe(false);
  });

  it('should return false for non-object input', () => {
    expect(isV3Template('test')).toBe(false);
  });
});

describe('isV3Template edge cases', () => {
  it('should allow empty arrays for checklist and constraints', () => {
    const template = {
      type: 'implementation',
      title: 'Empty arrays still valid',
      description: 'Ensure empty arrays pass the guard',
      investigation: {
        required: true,
        steps: [],
        mustFind: [],
        mustNotDuplicate: []
      },
      preImplementationChecklist: [],
      constraints: [],
      gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
    };

    expect(isV3Template(template)).toBe(true);
  });

  it('should return false when gitWorkflow is explicitly null', () => {
    const template = {
      type: 'implementation',
      title: 'Null git workflow',
      description: 'Ensure null gitWorkflow fails',
      investigation: {
        required: true,
        steps: ['READ something'],
        mustFind: ['find'],
        mustNotDuplicate: ['duplicate']
      },
      preImplementationChecklist: ['[ ] Step'],
      constraints: ['Do not break prod'],
      gitWorkflow: null
    };

    expect(isV3Template(template)).toBe(false);
  });

  it('should return false when investigation metadata is null', () => {
    const template = {
      type: 'implementation',
      title: 'Null investigation',
      description: 'Ensure null investigation fails',
      investigation: null,
      preImplementationChecklist: ['[ ] Step'],
      constraints: ['Do not break prod'],
      gitWorkflow: { required: true, branch: 'main', commitMessage: 'test' }
    };

    expect(isV3Template(template)).toBe(false);
  });
});
