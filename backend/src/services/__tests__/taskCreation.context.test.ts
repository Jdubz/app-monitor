/**
 * TaskCreationService Context Integration Tests
 * 
 * Tests context bundle generation during task creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskCreationService } from '../taskCreation.service.js';
import type { TaskQueueService } from '../taskQueue.sqlite.js';
import type { TaskCreationGuidelinesManager } from '../taskCreationGuidelines.js';
import type { ContextBundleGenerator } from '../context/index.js';
import type { ContextBundle } from '../../types/contextBundle.js';
import type { EnhancedTaskData } from '../taskMetadataFields.js';

describe('TaskCreationService - Context Integration', () => {
  let taskQueue: TaskQueueService;
  let guidelinesManager: TaskCreationGuidelinesManager;
  let contextGenerator: ContextBundleGenerator;
  let service: TaskCreationService;

  beforeEach(() => {
    // Mock TaskQueueService
    taskQueue = {
      createTask: vi.fn((data) => ({
        id: 'test-task-id',
        ...data,
        status: 'pending',
        created_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null
      })),
      checkDuplicateTask: vi.fn().mockResolvedValue(null)
    } as any;

    // Mock TaskCreationGuidelinesManager
    guidelinesManager = {
      validateTaskData: vi.fn().mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: []
      })
    } as any;

    // Mock ContextBundleGenerator
    contextGenerator = {
      generateBundle: vi.fn().mockResolvedValue({
        success: true,
        bundle: {
          id: 'test-bundle-id',
          cacheKey: 'test-cache-key',
          metadata: {
            profiles: ['scope-control', 'dev-monitor'],
            totalBytes: 1024
          }
        } as ContextBundle,
        cached: false
      })
    } as any;

    service = new TaskCreationService(taskQueue, guidelinesManager, contextGenerator);
  });

  describe('Context Bundle Generation', () => {
    it('should generate context bundle when files are specified', async () => {
      const taskData: EnhancedTaskData = {
        type: 'implementation',
        title: 'Test task with files',
        description: 'Test description',
        assignedAgent: 'backend-specialist',
        files: ['backend/src/services/test.ts'],
        acceptanceCriteria: ['Test passes'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'simple', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      const result = await service.createTask(taskData);

      expect(result.task).toBeDefined();
      expect(result.contextBundle).toBeDefined();
      expect(result.contextBundle?.id).toBe('test-bundle-id');
      expect(contextGenerator.generateBundle).toHaveBeenCalledWith({
        taskType: 'implementation',
        targetFiles: ['backend/src/services/test.ts'],
        force: false
      });
    });

    it('should store context metadata in task record', async () => {
      const taskData: EnhancedTaskData = {
        type: 'implementation',
        title: 'Test task with context',
        description: 'Test',
        assignedAgent: 'backend-specialist',
        files: ['backend/src/services/test.ts'],
        acceptanceCriteria: ['Works'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'medium', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      await service.createTask(taskData);

      expect(taskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          context_bundle_id: 'test-bundle-id',
          context_cache_key: 'test-cache-key',
          context_profiles: ['scope-control', 'dev-monitor'],
          risk_level: 'medium' // backend/src/services + medium complexity
        })
      );
    });

    it('should skip context generation when no files specified', async () => {
      const taskData: EnhancedTaskData = {
        type: 'analysis',
        title: 'Test task without files',
        description: 'Test',
        assignedAgent: 'backend-specialist',
        files: [],
        acceptanceCriteria: ['Complete'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'simple', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      const result = await service.createTask(taskData);

      expect(result.contextBundle).toBeUndefined();
      expect(contextGenerator.generateBundle).not.toHaveBeenCalled();
    });

    it('should handle context generation failures gracefully', async () => {
      // Mock failure
      (contextGenerator.generateBundle as any).mockRejectedValue(new Error('Recipe not found'));

      const taskData: EnhancedTaskData = {
        type: 'implementation',
        title: 'Test task with failing context',
        description: 'Test',
        assignedAgent: 'backend-specialist',
        files: ['backend/src/services/test.ts'],
        acceptanceCriteria: ['Works'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'simple', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      // Should NOT throw - task creation should succeed even if context generation fails
      const result = await service.createTask(taskData);

      expect(result.task).toBeDefined();
      expect(result.contextBundle).toBeUndefined();
    });
  });

  describe('Risk Level Determination', () => {
    it('should set risk level to "high" for Docker files', async () => {
      const taskData: EnhancedTaskData = {
        type: 'implementation',
        title: 'Docker change',
        description: 'Test',
        assignedAgent: 'backend-specialist',
        files: ['docker/Dockerfile'],
        acceptanceCriteria: ['Works'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'simple', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      await service.createTask(taskData);

      expect(taskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          risk_level: 'high'
        })
      );
    });

    it('should set risk level to "minimal" for documentation-only tasks', async () => {
      const taskData: EnhancedTaskData = {
        type: 'documentation',
        title: 'Update docs',
        description: 'Test',
        assignedAgent: 'backend-specialist',
        files: ['docs/README.md'],
        acceptanceCriteria: ['Complete'],
        documentation: '',
        notes: '',
        architectureReferences: [],
        longTermGoals: [],
        estimatedEffort: { hours: 1, complexity: 'simple', confidence: 'medium' },
        prerequisites: [],
        contextBoundaries: { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
        validationSteps: [],
        rollbackPlan: [],
        successMetrics: [],
        testingRequirements: [],
        documentationRequirements: [],
        requiredSkills: [],
        relatedTasks: [],
        blockers: [],
        assumptions: [],
        risks: [],
        alternatives: []
      };

      await service.createTask(taskData);

      expect(taskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          risk_level: 'minimal'
        })
      );
    });
  });
});
