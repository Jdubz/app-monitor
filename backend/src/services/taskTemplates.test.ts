import { describe, it, expect } from 'vitest';
import {
  createMigrationTaskTemplate,
  createExtensionTaskTemplate,
  createBugfixTaskTemplate,
  createRefactorTaskTemplate
} from './taskTemplates.js';
import { validateTaskTemplate, isV3Template } from './taskTemplateValidator.js';

describe('Task Templates', () => {
  describe('createMigrationTaskTemplate', () => {
    it('should create a valid v3 migration template', () => {
      const template = createMigrationTaskTemplate({
        title: 'Add retry_limit column to tasks table',
        description: 'Extend tasks table with configurable retry limit',
        schemaFile: 'backend/src/services/database.ts',
        tableName: 'tasks',
        columns: ['retry_limit INTEGER DEFAULT 3'],
        existingMigrationFile: 'backend/migrations/001_initial_schema.sql',
        typeFile: 'backend/src/types/taskSchema.ts'
      });

      // Should be v3 compliant
      expect(isV3Template(template)).toBe(true);

      // Should pass validation
      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Should have correct type
      expect(template.type).toBe('migration');

      // Should have investigation
      expect(template.investigation.required).toBe(true);
      expect(template.investigation.steps.length).toBeGreaterThan(0);

      // Should have constraints
      expect(template.constraints.length).toBeGreaterThan(0);
      expect(template.constraints.some(c => c.includes('MUST NOT'))).toBe(true);

      // Should have acceptance criteria with "EXACTLY"
      expect(template.acceptanceCriteria.some(c => c.includes('EXACTLY'))).toBe(true);
    });

    it('should include all specified columns in acceptance criteria', () => {
      const template = createMigrationTaskTemplate({
        title: 'Add columns',
        description: 'Test',
        schemaFile: 'test.ts',
        tableName: 'test_table',
        columns: ['col1', 'col2', 'col3'],
        existingMigrationFile: 'test.sql'
      });

      const criteriaText = template.acceptanceCriteria.join(' ');
      expect(criteriaText).toContain('col1');
      expect(criteriaText).toContain('col2');
      expect(criteriaText).toContain('col3');
      expect(criteriaText).toContain('EXACTLY 3 column(s)');
    });

    it('should include metadata', () => {
      const template = createMigrationTaskTemplate({
        title: 'Test',
        description: 'Test',
        schemaFile: 'test.ts',
        tableName: 'test',
        columns: ['col1'],
        existingMigrationFile: 'test.sql'
      });

      expect(template.metadata?.promptEngineeringVersion).toBe('v3');
      expect(template.metadata?.strictScopeEnforcement).toBe(true);
      expect(template.metadata?.mandatoryInvestigation).toBe(true);
      expect(template.metadata?.duplicateProtection).toBe(true);
      expect(template.metadata?.templateType).toBe('migration');
    });
  });

  describe('createExtensionTaskTemplate', () => {
    it('should create a valid v3 extension template', () => {
      const template = createExtensionTaskTemplate({
        title: 'Add task prioritization to queue',
        description: 'Add priority-based task sorting',
        baseFile: 'backend/src/services/taskQueue.ts',
        newFunctionality: 'priority sorting',
        existingFunctions: [
          'Task queue implementation',
          'Task retrieval logic'
        ],
        doNotDuplicate: [
          'Queue management functions',
          'Task persistence code'
        ]
      });

      // Should be v3 compliant
      expect(isV3Template(template)).toBe(true);

      // Should pass validation
      const result = validateTaskTemplate(template);
      if (!result.isValid) {
        console.log('Extension template VALIDATION ERRORS:', JSON.stringify(result.errors, null, 2));
        console.log('acceptanceCriteria:', JSON.stringify(template.acceptanceCriteria, null, 2));
      }
      expect(result.isValid).toBe(true);

      // Should have correct type
      expect(template.type).toBe('extension');

      // Should reference base file
      expect(template.files).toContain('backend/src/services/taskQueue.ts');
      expect(template.modifyOnly).toContain('backend/src/services/taskQueue.ts');
    });

    it('should include mustFind and mustNotDuplicate from params', () => {
      const template = createExtensionTaskTemplate({
        title: 'Test',
        description: 'Test',
        baseFile: 'test.ts',
        newFunctionality: 'test feature',
        existingFunctions: ['func1', 'func2'],
        doNotDuplicate: ['dup1', 'dup2']
      });

      expect(template.investigation.mustFind).toEqual(['func1', 'func2']);
      expect(template.investigation.mustNotDuplicate).toEqual(['dup1', 'dup2']);
    });

    it('should map doNotDuplicate to doNotCreate with explanations', () => {
      const template = createExtensionTaskTemplate({
        title: 'Test',
        description: 'Test',
        baseFile: 'test.ts',
        newFunctionality: 'test',
        existingFunctions: ['test'],
        doNotDuplicate: ['helper.ts', 'utils.ts']
      });

      expect(template.doNotCreate).toEqual([
        'helper.ts (extend existing code instead)',
        'utils.ts (extend existing code instead)'
      ]);
    });
  });

  describe('createBugfixTaskTemplate', () => {
    it('should create a valid v3 bugfix template', () => {
      const template = createBugfixTaskTemplate({
        title: 'Fix task queue memory leak',
        description: 'Queue grows unbounded when tasks fail',
        errorMessage: 'RangeError: Maximum call stack size exceeded',
        affectedFiles: [
          'backend/src/services/taskQueue.ts',
          'backend/src/services/taskRetry.ts'
        ],
        rootCause: 'Failed tasks not removed from queue',
        relatedTests: ['backend/src/services/taskQueue.test.ts']
      });

      // Should be v3 compliant
      expect(isV3Template(template)).toBe(true);

      // Should pass validation
      const result = validateTaskTemplate(template);
      expect(result.isValid).toBe(true);

      // Should have correct type
      expect(template.type).toBe('bugfix');

      // Should include error details in description
      expect(template.description).toContain('RangeError');
      expect(template.description).toContain('Failed tasks not removed');

      // Should have high priority
      expect(template.priority).toBe(8);
    });

    it('should include affected files in investigation and modifyOnly', () => {
      const template = createBugfixTaskTemplate({
        title: 'Test',
        description: 'Test',
        errorMessage: 'Error',
        affectedFiles: ['file1.ts', 'file2.ts'],
        rootCause: 'Test'
      });

      expect(template.files).toEqual(['file1.ts', 'file2.ts']);
      expect(template.modifyOnly).toEqual(['file1.ts', 'file2.ts']);

      const investigationText = template.investigation.steps.join(' ');
      expect(investigationText).toContain('file1.ts');
      expect(investigationText).toContain('file2.ts');
    });

    it('should include related tests in investigation when provided', () => {
      const template = createBugfixTaskTemplate({
        title: 'Test',
        description: 'Test',
        errorMessage: 'Error',
        affectedFiles: ['test.ts'],
        rootCause: 'Test',
        relatedTests: ['test.test.ts', 'integration.test.ts']
      });

      const investigationText = template.investigation.steps.join(' ');
      expect(investigationText).toContain('test.test.ts');
      expect(investigationText).toContain('integration.test.ts');

      const checklistText = template.preImplementationChecklist.join(' ');
      expect(checklistText).toContain('test.test.ts');
    });

    it('should enforce minimal changes in constraints', () => {
      const template = createBugfixTaskTemplate({
        title: 'Test',
        description: 'Test',
        errorMessage: 'Error',
        affectedFiles: ['test.ts'],
        rootCause: 'Test'
      });

      expect(template.constraints.some(c => c.includes('minimal'))).toBe(true);
      expect(template.constraints.some(c => c.includes('20 lines'))).toBe(true);
      expect(template.acceptanceCriteria.some(c => c.includes('20 lines'))).toBe(true);
    });
  });

  describe('createRefactorTaskTemplate', () => {
    it('should create a valid v3 refactor template', () => {
      const template = createRefactorTaskTemplate({
        title: 'Replace callback pattern with async/await',
        description: 'Modernize error handling code',
        targetFiles: [
          'backend/src/services/taskQueue.ts',
          'backend/src/services/taskRetry.ts'
        ],
        pattern: 'callback-based error handling',
        replacement: 'async/await with try/catch',
        testFiles: [
          'backend/src/services/taskQueue.test.ts',
          'backend/src/services/taskRetry.test.ts'
        ]
      });

      // Should be v3 compliant
      expect(isV3Template(template)).toBe(true);

      // Should pass validation
      const result = validateTaskTemplate(template);
      if (!result.isValid) {
        console.log('Refactor template VALIDATION ERRORS:', JSON.stringify(result.errors, null, 2));
        console.log('investigation.steps:', JSON.stringify(template.investigation.steps, null, 2));
      }
      expect(result.isValid).toBe(true);

      // Should have correct type
      expect(template.type).toBe('refactor');

      // Should include pattern and replacement in description
      expect(template.description).toContain('callback-based error handling');
      expect(template.description).toContain('async/await with try/catch');
    });

    it('should include all target files and test files', () => {
      const template = createRefactorTaskTemplate({
        title: 'Test',
        description: 'Test',
        targetFiles: ['file1.ts', 'file2.ts'],
        pattern: 'old',
        replacement: 'new',
        testFiles: ['test1.test.ts', 'test2.test.ts']
      });

      expect(template.files).toEqual([
        'file1.ts',
        'file2.ts',
        'test1.test.ts',
        'test2.test.ts'
      ]);

      expect(template.modifyOnly).toEqual(['file1.ts', 'file2.ts']);
      expect(template.doNotModify).toContainEqual(expect.stringContaining('test1.test.ts'));
      expect(template.doNotModify).toContainEqual(expect.stringContaining('test2.test.ts'));
    });

    it('should emphasize behavior preservation in constraints', () => {
      const template = createRefactorTaskTemplate({
        title: 'Test',
        description: 'Test',
        targetFiles: ['test.ts'],
        pattern: 'old',
        replacement: 'new',
        testFiles: ['test.test.ts']
      });

      const constraintsText = template.constraints.join(' ');
      expect(constraintsText).toContain('preserve existing behavior');
      expect(constraintsText).toContain('NOT change functionality');
      expect(constraintsText).toContain('NOT modify tests');

      const criteriaText = template.acceptanceCriteria.join(' ');
      expect(criteriaText).toContain('EXACTLY the same');
      expect(criteriaText).toContain('ALL existing tests pass');
    });
  });

  describe('Template Validation', () => {
    it('all templates should pass v3 validation', () => {
      const templates = [
        createMigrationTaskTemplate({
          title: 'Test Migration',
          description: 'Test',
          schemaFile: 'test.ts',
          tableName: 'test',
          columns: ['col1'],
          existingMigrationFile: 'test.sql'
        }),
        createExtensionTaskTemplate({
          title: 'Test Extension',
          description: 'Test',
          baseFile: 'test.ts',
          newFunctionality: 'test',
          existingFunctions: ['func1'],
          doNotDuplicate: ['dup1']
        }),
        createBugfixTaskTemplate({
          title: 'Test Bugfix',
          description: 'Test',
          errorMessage: 'Error',
          affectedFiles: ['test.ts'],
          rootCause: 'Test'
        }),
        createRefactorTaskTemplate({
          title: 'Test Refactor',
          description: 'Test',
          targetFiles: ['test.ts'],
          pattern: 'old',
          replacement: 'new',
          testFiles: ['test.test.ts']
        })
      ];

      templates.forEach(template => {
        const result = validateTaskTemplate(template);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(isV3Template(template)).toBe(true);
      });
    });

    it('all templates should have v3 metadata', () => {
      const templates = [
        createMigrationTaskTemplate({
          title: 'Test',
          description: 'Test',
          schemaFile: 'test.ts',
          tableName: 'test',
          columns: ['col1'],
          existingMigrationFile: 'test.sql'
        }),
        createExtensionTaskTemplate({
          title: 'Test',
          description: 'Test',
          baseFile: 'test.ts',
          newFunctionality: 'test',
          existingFunctions: ['test'],
          doNotDuplicate: ['test']
        }),
        createBugfixTaskTemplate({
          title: 'Test',
          description: 'Test',
          errorMessage: 'Error',
          affectedFiles: ['test.ts'],
          rootCause: 'Test'
        }),
        createRefactorTaskTemplate({
          title: 'Test',
          description: 'Test',
          targetFiles: ['test.ts'],
          pattern: 'old',
          replacement: 'new',
          testFiles: ['test.test.ts']
        })
      ];

      templates.forEach(template => {
        expect(template.metadata?.promptEngineeringVersion).toBe('v3');
        expect(template.metadata?.strictScopeEnforcement).toBe(true);
        expect(template.metadata?.mandatoryInvestigation).toBe(true);
        expect(template.metadata?.duplicateProtection).toBe(true);
      });
    });
  });
});
