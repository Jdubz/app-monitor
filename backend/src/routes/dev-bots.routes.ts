/**
 * Dev-Bots Management Routes
 * 
 * Comprehensive API for Dev-Bots system:
 * - System status and health
 * - Task management
 * - Agent management
 * - Templates and guidelines
 * - Docker integration
 * - Workspace synchronization
 * - Emergency recovery
 * 
 * Total: 30+ endpoints organized into logical groups
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';
import { logger } from '../utils/logger.js';

const TECHNICAL_TASK_TYPES = new Set(['refactor', 'implementation', 'bug', 'feature']);
const MIN_DOCUMENTATION_LENGTH = 50;
const MIN_ACCEPTANCE_CRITERION_LENGTH = 30;

/**
 * Create Dev-Bots router
 * 
 * @param devBotsManager - DevBotsManager instance
 * @returns Express router with Dev-Bots endpoints
 */
export function createClaudeWorkersRouter(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // ============================================================================
  // System Status & Health
  // ============================================================================

  /**
   * GET /dev-bots/status
   * Get overall system status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getSystemStatus();
      if (status) {
        res.json(status);
      } else {
        res.status(503).json({
          error: 'Dev-Bots coordinator is not available',
          healthy: devBotsManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_status_error',
        message: `Error getting Dev-Bots status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Dev-Bots status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/health
   * Get health check status
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      healthy: devBotsManager.isHealthy(),
      status: devBotsManager.isHealthy() ? 'healthy' : 'unhealthy'
    });
  });

  /**
   * POST /dev-bots/start
   * Start Dev-Bots system
   */
  router.post('/start', (_req: Request, res: Response) => {
    try {
      devBotsManager.startSystem();
      res.json({ success: true, message: 'Dev-Bots started' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_claude_workers_error',
        message: `Error starting Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to start Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/stop
   * Stop Dev-Bots system
   */
  router.post('/stop', (_req: Request, res: Response) => {
    try {
      devBotsManager.stopSystem();
      res.json({ success: true, message: 'Dev-Bots stopped' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_stopping_claude_workers_error',
        message: `Error stopping Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to stop Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Task Management
  // ============================================================================

  /**
   * GET /dev-bots/tasks
   * Get all tasks
   */
  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await devBotsManager.getTasks();
      if (tasks) {
        res.json(tasks);
      } else {
        res.status(503).json({
          error: 'Dev-Bots coordinator is not available',
          healthy: devBotsManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_tasks_error',
        message: `Error getting Dev-Bots tasks: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Dev-Bots tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/tasks
   * Create a new task
   */
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const {
        type,
        title,
        documentation,
        description,
        acceptanceCriteria,
        files,
        dependencies,
        repository,
        project,
        assignedAgent,
        notes,
        architectureReferences,
        validationSteps,
        successMetrics,
        estimatedEffort,
      } = req.body;

      // Accept either 'documentation' or 'description' field
      const taskDescription = documentation || description;

      if (!type || !title || !taskDescription || !acceptanceCriteria) {
        return res.status(400).json({
          error: 'Type, title, description, and acceptanceCriteria are required'
        });
      }

      // Validate assignedAgent if provided
      if (assignedAgent) {
        const validAgents = devBotsManager.getValidAgents();
        if (!validAgents.includes(assignedAgent)) {
          return res.status(400).json({
            error: `Invalid agent: ${assignedAgent}. Valid agents: ${validAgents.join(', ')}`
          });
        }
      }

      if (TECHNICAL_TASK_TYPES.has(type)) {
        const warnings: Array<{
          category: string;
          action: string;
          message: string;
          details: { taskId: string };
        }> = [];

        if (!Array.isArray(files) || files.length === 0) {
          warnings.push({
            category: 'api',
            action: 'task_missing_files_array',
            message: `Technical task type '${type}' created without files array`,
            details: { taskId: title },
          });
        }

        const documentationLength = typeof taskDescription === 'string' ? taskDescription.trim().length : 0;
        if (documentationLength < MIN_DOCUMENTATION_LENGTH) {
          warnings.push({
            category: 'api',
            action: 'task_missing_description',
            message: `Technical task type '${type}' created without detailed description`,
            details: { taskId: title },
          });
        }

        const criteriaArray = Array.isArray(acceptanceCriteria)
          ? acceptanceCriteria
          : typeof acceptanceCriteria === 'string'
          ? [acceptanceCriteria]
          : [];

        if (criteriaArray.length === 1) {
          const rawCriterion = criteriaArray[0];
          const criterionText = typeof rawCriterion === 'string' ? rawCriterion : '';
          if (criterionText.trim().length > 0 && criterionText.trim().length < MIN_ACCEPTANCE_CRITERION_LENGTH) {
            warnings.push({
              category: 'api',
              action: 'vague_acceptance_criteria',
              message: `Task has vague acceptance criteria: "${criterionText}"`,
              details: { taskId: title },
            });
          }
        }

        warnings.forEach((warning) => logger.warn(warning));
      }

      const result = await devBotsManager.addTask({
        type,
        title,
        description: taskDescription,
        acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [acceptanceCriteria],
        files,
        dependencies,
        project: project || repository, // Accept either 'project' or 'repository'
        assignedAgent,
        notes,
        architectureReferences,
        validationSteps,
        successMetrics,
        estimatedEffort
      });
      res.json({
        task: result.task,
        validation: result.validation,
        message: 'Task added successfully'
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_adding_claude_workers_task_error',
        message: `Error adding Dev-Bots task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to add task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/tasks/enhanced
   * DEPRECATED: Use POST /dev-bots/tasks instead
   * Kept for backward compatibility - routes to unified addTask method
   */
  router.post('/tasks/enhanced', async (req: Request, res: Response) => {
    try {
      const taskData = req.body;
      const result = await devBotsManager.addTask(taskData);
      res.json({
        task: result.task,
        validation: result.validation,
        message: 'Task added successfully (Note: /tasks/enhanced is deprecated, use /tasks instead)'
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_adding_enhanced_task_error',
        message: `Error adding enhanced task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to add task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/completed
   * Get all completed tasks
   */
  router.get('/tasks/completed', (_req: Request, res: Response) => {
    try {
      const tasks = devBotsManager.getCompletedTasks();
      res.json({ tasks });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_completed_tasks_error',
        message: `Error getting completed tasks: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get completed tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/metrics
   * Get queue metrics and task duration statistics
   */
  router.get('/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = devBotsManager.getQueueMetrics();
      const stats = devBotsManager.getTaskDurationStats();
      res.json({ metrics, stats });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_metrics',
        message: `Error getting metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/agent-comparison
   * Get performance comparison metrics between Claude and Codex agents
   */
  router.get('/agent-comparison', (_req: Request, res: Response) => {
    try {
      const comparison = devBotsManager.getAgentComparisonMetrics();
      res.json({ comparison });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_comparison',
        message: `Error getting agent comparison metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get agent comparison metrics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/tasks/:taskId/timeout
   * Manually timeout a task after verification
   */
  router.post('/tasks/:taskId/timeout', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          error: 'Reason is required for manual timeout'
        });
      }

      devBotsManager.manuallyTimeoutTask(taskId, reason);
      res.json({
        success: true,
        message: `Task ${taskId} manually timed out`,
        reason
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_timing_out_task',
        message: `Error timing out task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to timeout task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/validate
   * Validate task data
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const { type, ...taskData } = req.body;
      const result = devBotsManager.validateTaskData(taskData, type || 'general');
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_validating_task_error',
        message: `Error validating task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to validate task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/assign
   * Manually trigger task assignment
   */
  router.post('/assign', async (_req: Request, res: Response) => {
    try {
      await devBotsManager.assignNextTask();
      const metrics = devBotsManager.getQueueMetrics();
      res.json({
        success: true,
        message: 'Task assignment triggered',
        metrics
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_assigning_task',
        message: `Error assigning task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to assign task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * GET /dev-bots/agents
   * Get all agent personalities
   */
  router.get('/agents', (_req: Request, res: Response) => {
    try {
      const agents = devBotsManager.getAgentPersonalities();
      res.json({ agents });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_personalities_error',
        message: `Error getting agent personalities: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get agent personalities',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/agents/valid
   * Get list of valid agent IDs
   */
  router.get('/agents/valid', (_req: Request, res: Response) => {
    try {
      const validAgents = devBotsManager.getValidAgents();
      res.json({ validAgents });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_valid_agents_error',
        message: `Error getting valid agents: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get valid agents',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Templates & Guidelines
  // ============================================================================

  /**
   * GET /dev-bots/templates
   * Get all task templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = devBotsManager.getTaskTemplates();
      res.json({ templates });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_templates_error',
        message: `Error getting templates: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get templates',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/guidelines
   * Get all task guidelines
   */
  router.get('/guidelines', (_req: Request, res: Response) => {
    try {
      const guidelines = devBotsManager.getTaskGuidelines();
      res.json({ guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_guidelines_error',
        message: `Error getting guidelines: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get guidelines',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/guidelines/:taskType
   * Get guidelines for specific task type
   */
  router.get('/guidelines/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const guidelines = devBotsManager.getTaskGuidelines(taskType);
      res.json({ guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_guidelines_error',
        message: `Error getting guidelines for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task guidelines',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/examples/:taskType
   * Get examples for specific task type
   */
  router.get('/examples/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const example = devBotsManager.getTaskExample(taskType);
      res.json({ examples: [example] });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_examples_error',
        message: `Error getting examples for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task examples',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/checklist/:taskType
   * Get checklist for specific task type
   */
  router.get('/checklist/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const checklist = devBotsManager.getTaskChecklist(taskType);
      res.json({ checklist });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_checklist_error',
        message: `Error getting checklist for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task checklist',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Project Management
  // ============================================================================

  /**
   * GET /dev-bots/projects
   * Get all projects
   */
  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = devBotsManager.getValidProjects();
      res.json({ projects });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_projects_error',
        message: `Error getting projects: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get projects',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Data Import/Export
  // ============================================================================

  /**
   * POST /dev-bots/export
   * Export system data
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const { path = './task-export.json' } = req.body;
      devBotsManager.exportTasks(path);
      res.json({ success: true, message: `Tasks exported to ${path}` });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_exporting_data_error',
        message: `Error exporting data: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to export data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/import
   * Import system data
   */
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const { path = './task-export.json' } = req.body;
      devBotsManager.importTasks(path);
      res.json({ success: true, message: `Tasks imported from ${path}` });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_importing_data_error',
        message: `Error importing data: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to import data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Onboarding
  // ============================================================================

  /**
   * POST /dev-bots/onboarding/complete
   * Mark onboarding as complete
   */
  router.post('/onboarding/complete', async (req: Request, res: Response) => {
    try {
      const { workerId } = req.body;
      if (!workerId) {
        return res.status(400).json({ error: 'Worker ID is required' });
      }
      devBotsManager.completeWorkerOnboarding(workerId);
      res.json({ success: true, message: 'Onboarding completed' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_completing_onboarding_error',
        message: `Error completing onboarding: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to complete onboarding',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Workspace Synchronization
  // ============================================================================

  /**
   * GET /dev-bots/workspace-sync/status
   * Get workspace sync status
   */
  router.get('/workspace-sync/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getWorkspaceSyncStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_workspace_sync_status_error',
        message: `Error getting workspace sync status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get workspace sync status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/workspace-sync/trigger
   * Trigger workspace synchronization
   */
  router.post('/workspace-sync/trigger', async (req: Request, res: Response) => {
    try {
      const { force } = req.body;
      const result = await devBotsManager.triggerWorkspaceSync(force);
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_workspace_sync_error',
        message: `Error triggering workspace sync: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger workspace sync',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Docker Integration
  // ============================================================================

  /**
   * GET /dev-bots/docker/status
   * Get Docker integration status
   */
  router.get('/docker/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getDockerStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_docker_status_error',
        message: `Error getting Docker status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Docker status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/docker/revalidate
   * Revalidate Docker containers
   */
  router.post('/docker/revalidate', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.revalidateDockerEnvironment();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_revalidating_docker_error',
        message: `Error revalidating Docker containers: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to revalidate Docker containers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/docker/cleanup
   * Clean up Docker resources
   */
  router.post('/docker/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.cleanupOrphanedResources();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cleaning_docker_error',
        message: `Error cleaning Docker resources: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to clean Docker resources',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/containers/:containerId/health
   * Get health status of specific container
   */
  router.get('/containers/:containerId/health', async (req: Request, res: Response) => {
    try {
      const { containerId } = req.params;
      const health = await devBotsManager.getContainerHealth(containerId);
      res.json(health);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_container_health_error',
        message: `Error getting container health for ${req.params.containerId}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get container health',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  /**
   * GET /dev-bots/cleanup-status
   * Get cleanup system status
   */
  router.get('/cleanup-status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getCleanupStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cleanup_status_error',
        message: `Error getting cleanup status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get cleanup status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/trigger-cleanup
   * Manually trigger cleanup
   */
  router.post('/trigger-cleanup', async (req: Request, res: Response) => {
    try {
      const { aggressive } = req.body;
      const result = await devBotsManager.triggerCleanup(aggressive);
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_cleanup_error',
        message: `Error triggering cleanup: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger cleanup',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/scope-violations
   * Get scope violation reports
   */
  router.get('/scope-violations', async (_req: Request, res: Response) => {
    try {
      const violations = await devBotsManager.getScopeViolations();
      res.json(violations);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_scope_violations_error',
        message: `Error getting scope violations: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get scope violations',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/emergency-recovery
   * Trigger emergency recovery procedures
   */
  router.post('/emergency-recovery', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.triggerEmergencyRecovery();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_emergency_recovery_error',
        message: `Error during emergency recovery: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to execute emergency recovery',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
