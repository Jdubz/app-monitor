/**
 * Claude Workers Management Routes
 * 
 * Comprehensive API for Claude Workers system:
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
import type { ClaudeWorkersManager } from '../services/claudeWorkersManager.js';
import { logger } from '../utils/logger.js';

/**
 * Create Claude Workers router
 * 
 * @param claudeWorkersManager - ClaudeWorkersManager instance
 * @returns Express router with Claude Workers endpoints
 */
export function createClaudeWorkersRouter(claudeWorkersManager: ClaudeWorkersManager): Router {
  const router = Router();

  // ============================================================================
  // System Status & Health
  // ============================================================================

  /**
   * GET /claude-workers/status
   * Get overall system status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await claudeWorkersManager.getSystemStatus();
      if (status) {
        res.json(status);
      } else {
        res.status(503).json({
          error: 'Claude Workers coordinator is not available',
          healthy: claudeWorkersManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_status_error',
        message: `Error getting Claude Workers status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Claude Workers status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /claude-workers/health
   * Get health check status
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      healthy: claudeWorkersManager.isHealthy(),
      status: claudeWorkersManager.isHealthy() ? 'healthy' : 'unhealthy'
    });
  });

  /**
   * POST /claude-workers/start
   * Start Claude Workers system
   */
  router.post('/start', (_req: Request, res: Response) => {
    try {
      claudeWorkersManager.start();
      res.json({ success: true, message: 'Claude Workers started' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_claude_workers_error',
        message: `Error starting Claude Workers: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to start Claude Workers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /claude-workers/stop
   * Stop Claude Workers system
   */
  router.post('/stop', (_req: Request, res: Response) => {
    try {
      claudeWorkersManager.stop();
      res.json({ success: true, message: 'Claude Workers stopped' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_stopping_claude_workers_error',
        message: `Error stopping Claude Workers: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to stop Claude Workers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Task Management
  // ============================================================================

  /**
   * GET /claude-workers/tasks
   * Get all tasks
   */
  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await claudeWorkersManager.getTasks();
      if (tasks) {
        res.json(tasks);
      } else {
        res.status(503).json({
          error: 'Claude Workers coordinator is not available',
          healthy: claudeWorkersManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_tasks_error',
        message: `Error getting Claude Workers tasks: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Claude Workers tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /claude-workers/tasks
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

      const task = await claudeWorkersManager.addTask(type, title, documentation, acceptanceCriteria, {
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
        message: `Error adding Claude Workers task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to add task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /claude-workers/tasks/enhanced
   * Create enhanced task with additional metadata
   */
  router.post('/tasks/enhanced', async (req: Request, res: Response) => {
    try {
      const taskData = req.body;
      const task = await claudeWorkersManager.addEnhancedTask(taskData);
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
   * GET /claude-workers/tasks/completed
   * Get all completed tasks
   */
  router.get('/tasks/completed', (_req: Request, res: Response) => {
    try {
      const tasks = claudeWorkersManager.getCompletedTasks();
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
   * POST /claude-workers/validate
   * Validate task data
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const result = await claudeWorkersManager.validateTask(req.body);
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
   * GET /claude-workers/agents
   * Get all agent personalities
   */
  router.get('/agents', (_req: Request, res: Response) => {
    try {
      const agents = claudeWorkersManager.getAgentPersonalities();
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
   * GET /claude-workers/agents/valid
   * Get list of valid agent IDs
   */
  router.get('/agents/valid', (_req: Request, res: Response) => {
    try {
      const validAgents = claudeWorkersManager.getValidAgents();
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
   * GET /claude-workers/templates
   * Get all task templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = claudeWorkersManager.getTaskTemplates();
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
   * GET /claude-workers/guidelines
   * Get all task guidelines
   */
  router.get('/guidelines', (_req: Request, res: Response) => {
    try {
      const guidelines = claudeWorkersManager.getGuidelines();
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
   * GET /claude-workers/guidelines/:taskType
   * Get guidelines for specific task type
   */
  router.get('/guidelines/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const guidelines = claudeWorkersManager.getGuidelinesForType(taskType);
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
   * GET /claude-workers/examples/:taskType
   * Get examples for specific task type
   */
  router.get('/examples/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const examples = claudeWorkersManager.getExamplesForType(taskType);
      res.json({ examples });
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
   * GET /claude-workers/checklist/:taskType
   * Get checklist for specific task type
   */
  router.get('/checklist/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const checklist = claudeWorkersManager.getChecklistForType(taskType);
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
   * GET /claude-workers/projects
   * Get all projects
   */
  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = claudeWorkersManager.getProjects();
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
   * POST /claude-workers/export
   * Export system data
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const { format } = req.body;
      const data = await claudeWorkersManager.exportData(format);
      res.json({ success: true, data });
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
   * POST /claude-workers/import
   * Import system data
   */
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const { data } = req.body;
      const result = await claudeWorkersManager.importData(data);
      res.json({ success: true, result });
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
   * POST /claude-workers/onboarding/complete
   * Mark onboarding as complete
   */
  router.post('/onboarding/complete', async (req: Request, res: Response) => {
    try {
      await claudeWorkersManager.completeOnboarding();
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
   * GET /claude-workers/workspace-sync/status
   * Get workspace sync status
   */
  router.get('/workspace-sync/status', async (_req: Request, res: Response) => {
    try {
      const status = await claudeWorkersManager.getWorkspaceSyncStatus();
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
   * POST /claude-workers/workspace-sync/trigger
   * Trigger workspace synchronization
   */
  router.post('/workspace-sync/trigger', async (req: Request, res: Response) => {
    try {
      const { force } = req.body;
      const result = await claudeWorkersManager.triggerWorkspaceSync(force);
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
   * GET /claude-workers/docker/status
   * Get Docker integration status
   */
  router.get('/docker/status', async (_req: Request, res: Response) => {
    try {
      const status = await claudeWorkersManager.getDockerStatus();
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
   * POST /claude-workers/docker/revalidate
   * Revalidate Docker containers
   */
  router.post('/docker/revalidate', async (_req: Request, res: Response) => {
    try {
      const result = await claudeWorkersManager.revalidateDockerContainers();
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
   * POST /claude-workers/docker/cleanup
   * Clean up Docker resources
   */
  router.post('/docker/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await claudeWorkersManager.cleanupDockerResources();
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
   * GET /claude-workers/containers/:containerId/health
   * Get health status of specific container
   */
  router.get('/containers/:containerId/health', async (req: Request, res: Response) => {
    try {
      const { containerId } = req.params;
      const health = await claudeWorkersManager.getContainerHealth(containerId);
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
   * GET /claude-workers/cleanup-status
   * Get cleanup system status
   */
  router.get('/cleanup-status', async (_req: Request, res: Response) => {
    try {
      const status = await claudeWorkersManager.getCleanupStatus();
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
   * POST /claude-workers/trigger-cleanup
   * Manually trigger cleanup
   */
  router.post('/trigger-cleanup', async (req: Request, res: Response) => {
    try {
      const { aggressive } = req.body;
      const result = await claudeWorkersManager.triggerCleanup(aggressive);
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
   * GET /claude-workers/scope-violations
   * Get scope violation reports
   */
  router.get('/scope-violations', async (_req: Request, res: Response) => {
    try {
      const violations = await claudeWorkersManager.getScopeViolations();
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
   * POST /claude-workers/emergency-recovery
   * Trigger emergency recovery procedures
   */
  router.post('/emergency-recovery', async (_req: Request, res: Response) => {
    try {
      const result = await claudeWorkersManager.emergencyRecovery();
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
