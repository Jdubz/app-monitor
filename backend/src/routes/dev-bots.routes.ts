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
      const { type, title, documentation, acceptanceCriteria, files, dependencies, repository, assignedAgent, notes } = req.body;

      if (!type || !title || !documentation || !acceptanceCriteria) {
        return res.status(400).json({
          error: 'Type, title, documentation, and acceptanceCriteria are required'
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

      const task = await devBotsManager.addTask(type, title, documentation, acceptanceCriteria, {
        files,
        dependencies,
        repository,
        assignedAgent,
        notes
      });
      res.json({ task, message: 'Task added successfully' });
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
   * Create enhanced task with additional metadata
   */
  router.post('/tasks/enhanced', async (req: Request, res: Response) => {
    try {
      const taskData = req.body;
      const task = await devBotsManager.addEnhancedTask(taskData);
      res.json({ task, message: 'Enhanced task added successfully' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_adding_enhanced_task_error',
        message: `Error adding enhanced task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to add enhanced task',
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
