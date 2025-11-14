/**
 * Context Recipe Selector Tests
 */

import { describe, it, expect } from 'vitest';
import { ContextRecipeSelector } from '../contextRecipeSelector';
import type { TaskType } from '../../../types/task.types';

describe('ContextRecipeSelector', () => {
  describe('selectRecipes', () => {
    it('should select required recipes for implementation tasks', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType
      });

      expect(selection.required).toContain('scope-control');
      expect(selection.required).toContain('dev-monitor');
      expect(selection.recommended).toContain('implementation-patterns');
    });

    it('should select required recipes for review tasks', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'review' as TaskType
      });

      expect(selection.required).toContain('scope-control');
      expect(selection.required).toContain('review-checklist');
      expect(selection.recommended).toContain('dev-monitor');
    });

    it('should select required recipes for fix tasks', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'fix' as TaskType
      });

      expect(selection.required).toContain('scope-control');
      expect(selection.required).toContain('fix-debugging');
      expect(selection.required).toContain('failure-recovery');
    });

    it('should add recipes based on target files', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: ['backend/src/services/test.service.ts', 'backend/migrations/001_init.sql']
      });

      // Should include implementation-patterns (from service file)
      expect(selection.recommended).toContain('implementation-patterns');
      
      // Should include deployment (from migrations)
      expect(selection.recommended).toContain('deployment');
    });

    it('should respect manual profile overrides', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'documentation' as TaskType,
        manualProfiles: ['deployment', 'pr-workflow']
      });

      // Manual profiles should be in required
      expect(selection.required).toContain('deployment');
      expect(selection.required).toContain('pr-workflow');
    });

    it('should include optional profiles when requested', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        includeOptional: true
      });

      // Should have some optional profiles
      expect(selection.optional.length).toBeGreaterThan(0);
    });
  });

  describe('getProfilesToInclude', () => {
    it('should combine required and recommended by default', () => {
      const profiles = ContextRecipeSelector.getProfilesToInclude({
        taskType: 'implementation' as TaskType
      });

      expect(profiles).toContain('scope-control'); // required
      expect(profiles).toContain('dev-monitor'); // required
      expect(profiles).toContain('implementation-patterns'); // recommended
    });

    it('should include optional profiles when requested', () => {
      const profilesWithoutOptional = ContextRecipeSelector.getProfilesToInclude({
        taskType: 'implementation' as TaskType
      }, false);

      const profilesWithOptional = ContextRecipeSelector.getProfilesToInclude({
        taskType: 'implementation' as TaskType,
        includeOptional: true
      }, true);

      expect(profilesWithOptional.length).toBeGreaterThanOrEqual(profilesWithoutOptional.length);
    });

    it('should remove duplicates', () => {
      const profiles = ContextRecipeSelector.getProfilesToInclude({
        taskType: 'implementation' as TaskType,
        manualProfiles: ['scope-control'] // Already in required
      });

      const uniqueProfiles = new Set(profiles);
      expect(profiles.length).toBe(uniqueProfiles.size);
    });
  });

  describe('isProfileRelevant', () => {
    it('should return true for required profiles', () => {
      const relevant = ContextRecipeSelector.isProfileRelevant('scope-control', {
        taskType: 'implementation' as TaskType
      });

      expect(relevant).toBe(true);
    });

    it('should return true for recommended profiles', () => {
      const relevant = ContextRecipeSelector.isProfileRelevant('implementation-patterns', {
        taskType: 'implementation' as TaskType
      });

      expect(relevant).toBe(true);
    });

    it('should return false for excluded profiles', () => {
      const relevant = ContextRecipeSelector.isProfileRelevant('review-checklist', {
        taskType: 'implementation' as TaskType
      });

      expect(relevant).toBe(false);
    });
  });

  describe('explainSelection', () => {
    it('should provide explanation for selection', () => {
      const explanation = ContextRecipeSelector.explainSelection({
        taskType: 'implementation' as TaskType,
        targetFiles: ['backend/src/services/test.service.ts']
      });

      expect(explanation).toContain('implementation');
      expect(explanation).toContain('Required');
      expect(explanation).toContain('scope-control');
    });
  });

  describe('file pattern matching', () => {
    it('should add implementation-patterns for TypeScript files', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: ['src/utils/helper.ts']
      });

      expect(selection.recommended).toContain('implementation-patterns');
    });

    it('should add deployment for migration files', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: ['backend/migrations/002_add_column.sql']
      });

      expect(selection.recommended).toContain('deployment');
    });

    it('should add deployment for Docker files', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: ['Dockerfile', 'docker-compose.yml']
      });

      expect(selection.recommended).toContain('deployment');
    });

    it('should add pr-workflow for GitHub workflows', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: ['.github/workflows/ci.yml']
      });

      expect(selection.recommended).toContain('pr-workflow');
    });

    it('should handle multiple file patterns', () => {
      const selection = ContextRecipeSelector.selectRecipes({
        taskType: 'implementation' as TaskType,
        targetFiles: [
          'backend/src/services/test.service.ts',
          'backend/migrations/001_init.sql',
          'Dockerfile'
        ]
      });

      expect(selection.recommended).toContain('implementation-patterns');
      expect(selection.recommended).toContain('deployment');
    });
  });

  describe('task type coverage', () => {
    const taskTypes: TaskType[] = [
      'implementation',
      'review',
      'fix',
      'bug',
      'documentation',
      'refactor',
      'test',
      'analysis',
      'deployment',
      'maintenance'
    ];

    taskTypes.forEach(taskType => {
      it(`should handle ${taskType} task type`, () => {
        const selection = ContextRecipeSelector.selectRecipes({ taskType });
        
        expect(selection.required).toContain('scope-control'); // All tasks need scope control
        expect(selection.required.length).toBeGreaterThan(0);
      });
    });
  });
});
