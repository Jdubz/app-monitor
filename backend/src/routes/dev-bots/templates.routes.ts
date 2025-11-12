/**
 * Templates & Guidelines Routes
 *
 * Endpoints for task templates, guidelines, examples, and checklists
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';

/**
 * Create templates and guidelines routes
 */
export function createTemplatesRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  /**
   * GET /templates
   * Get all task templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = devBotsManager.getTaskTemplates();
      res.json({ data: { templates } });
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
   * GET /guidelines
   * Get all task guidelines
   */
  router.get('/guidelines', (_req: Request, res: Response) => {
    try {
      const guidelines = devBotsManager.getTaskGuidelines();
      res.json({ data: { guidelines } });
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
   * GET /guidelines/:taskType
   * Get guidelines for specific task type
   */
  router.get('/guidelines/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const guidelines = devBotsManager.getTaskGuidelines(taskType);
      res.json({ data: { guidelines } });
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
   * GET /examples/:taskType
   * Get examples for specific task type
   */
  router.get('/examples/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const example = devBotsManager.getTaskExample(taskType);
      res.json({ data: { examples: [example] } });
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
   * GET /checklist/:taskType
   * Get checklist for specific task type
   */
  router.get('/checklist/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const checklist = devBotsManager.getTaskChecklist(taskType);
      res.json({ data: { checklist } });
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

  return router;
}
