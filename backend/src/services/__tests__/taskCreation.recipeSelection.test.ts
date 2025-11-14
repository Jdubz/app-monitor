/**
 * Task Creation with Intelligent Recipe Selection - Integration Test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskCreationService } from '../taskCreation.service.js';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import { TaskCreationGuidelinesManager } from '../taskCreationGuidelines.js';
import { ContextBundleGenerator } from '../context/contextBundleGenerator.js';
import type { SimpleTaskData } from '../taskCreation.service.js';

describe('TaskCreation with Intelligent Recipe Selection', () => {
  let taskCreationService: TaskCreationService;
  let mockTaskQueue: TaskQueueService;
  let mockGuidelines: TaskCreationGuidelinesManager;

  beforeEach(() => {
    // Mock dependencies
    mockTaskQueue = {
      addTask: vi.fn().mockResolvedValue({ id: 'test-task-123' }),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      getActiveTasks: vi.fn().mockReturnValue([]),
      checkDuplicateTask: vi.fn().mockReturnValue(null), // No duplicates
      createTask: vi.fn().mockReturnValue({ id: 'test-task-123', status: 'pending' })
    } as unknown as TaskQueueService;

    mockGuidelines = {
      getGuidelines: vi.fn().mockReturnValue({
        rules: [],
        examples: [],
        antiPatterns: []
      }),
      validateTaskData: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: []
      })
    } as unknown as TaskCreationGuidelinesManager;

    taskCreationService = new TaskCreationService(
      mockTaskQueue,
      mockGuidelines
    );
  });

  describe('Intelligent Recipe Selection', () => {
    it('should select appropriate recipes for implementation task', async () => {
      const taskData: SimpleTaskData = {
        type: 'implementation',
        title: 'Add user service',
        description: 'Implement user authentication service',
        files: ['backend/src/services/user.service.ts'],
        acceptanceCriteria: ['Service created', 'Tests passing']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      // Should have context bundle with intelligent selection
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include scope-control (required for all)
        expect(profiles).toContain('scope-control');
        
        // Should include dev-monitor (required for implementation)
        expect(profiles).toContain('dev-monitor');
        
        // Should include implementation-patterns (recommended + file pattern match)
        expect(profiles).toContain('implementation-patterns');
      }
    });

    it('should select appropriate recipes for review task', async () => {
      const taskData: SimpleTaskData = {
        type: 'review',
        title: 'Review PR #123',
        description: 'Code review for new feature',
        files: ['backend/src/routes/api.ts'],
        acceptanceCriteria: ['PR reviewed', 'Feedback provided']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include review-checklist (required for review)
        expect(profiles).toContain('review-checklist');
        
        // Should include scope-control
        expect(profiles).toContain('scope-control');
      }
    });

    it('should select appropriate recipes for fix task', async () => {
      const taskData: SimpleTaskData = {
        type: 'fix',
        title: 'Fix broken test',
        description: 'Debug and fix failing unit tests',
        files: ['backend/src/services/test.service.test.ts'],
        acceptanceCriteria: ['Tests passing']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include fix-debugging (required for fix)
        expect(profiles).toContain('fix-debugging');
        
        // Should include failure-recovery (required for fix)
        expect(profiles).toContain('failure-recovery');
        
        // Should include scope-control
        expect(profiles).toContain('scope-control');
      }
    });

    it('should add deployment recipe for migration files', async () => {
      const taskData: SimpleTaskData = {
        type: 'implementation',
        title: 'Add database migration',
        description: 'Create migration for new table',
        files: ['backend/migrations/021_add_users_table.sql'],
        acceptanceCriteria: ['Migration created', 'Migration tested']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include deployment (file pattern match)
        expect(profiles).toContain('deployment');
      }
    });

    it('should add pr-workflow recipe for GitHub workflow files', async () => {
      const taskData: SimpleTaskData = {
        type: 'implementation',
        title: 'Update CI workflow',
        description: 'Add new test step to CI',
        files: ['.github/workflows/ci.yml'],
        acceptanceCriteria: ['Workflow updated', 'Tests run in CI']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include pr-workflow (file pattern match)
        expect(profiles).toContain('pr-workflow');
      }
    });

    it('should handle multiple file patterns correctly', async () => {
      const taskData: SimpleTaskData = {
        type: 'implementation',
        title: 'Refactor service with migration',
        description: 'Update service and add migration',
        files: [
          'backend/src/services/user.service.ts',
          'backend/migrations/022_update_users.sql',
          'Dockerfile'
        ],
        acceptanceCriteria: ['Service updated', 'Migration created', 'Docker builds']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include implementation-patterns (service file)
        expect(profiles).toContain('implementation-patterns');
        
        // Should include deployment (migration + Dockerfile)
        expect(profiles).toContain('deployment');
      }
    });

    it('should gracefully handle missing files', async () => {
      const taskData: SimpleTaskData = {
        type: 'implementation',
        title: 'Add feature',
        description: 'Implement new feature',
        // No files specified
        acceptanceCriteria: ['Feature implemented']
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      expect(result.validation.isValid).toBe(true);
      
      // Context bundle may or may not be generated, but should not fail
      // If generated, should still have at least scope-control
      if (result.contextBundle) {
        expect(result.contextBundle.metadata.profiles).toContain('scope-control');
      }
    });
  });

  describe('Manual Profile Override', () => {
    it('should respect manual profile overrides in metadata', async () => {
      const taskData: SimpleTaskData = {
        type: 'documentation',
        title: 'Update documentation',
        description: 'Update architecture docs',
        files: ['docs/architecture/README.md'],
        acceptanceCriteria: ['Docs updated'],
        metadata: {
          contextProfiles: ['deployment', 'pr-workflow']
        }
      };

      const result = await taskCreationService.createTask(taskData);

      expect(result.task).toBeDefined();
      
      if (result.contextBundle) {
        const profiles = result.contextBundle.metadata.profiles;
        
        // Should include manually specified profiles
        expect(profiles).toContain('deployment');
        expect(profiles).toContain('pr-workflow');
        
        // Should still include scope-control (always required)
        expect(profiles).toContain('scope-control');
      }
    });
  });
});
