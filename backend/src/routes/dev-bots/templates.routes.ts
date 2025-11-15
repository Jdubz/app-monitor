/**
 * Templates & Guidelines Routes
 *
 * Endpoints for task templates, guidelines, examples, and checklists
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

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
      sendSuccess(res, { templates });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_templates_error',
        message: `Error getting templates: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get templates',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * GET /guidelines
   * Get all task guidelines
   */
  router.get('/guidelines', (_req: Request, res: Response) => {
    try {
      const guidelines = devBotsManager.getTaskGuidelines();
      sendSuccess(res, { guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_guidelines_error',
        message: `Error getting guidelines: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get guidelines',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
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
      sendSuccess(res, { guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_guidelines_error',
        message: `Error getting guidelines for ${req.params.taskType}: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get task guidelines',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
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
      sendSuccess(res, { examples: [example] });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_examples_error',
        message: `Error getting examples for ${req.params.taskType}: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get task examples',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
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
      sendSuccess(res, { checklist });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_checklist_error',
        message: `Error getting checklist for ${req.params.taskType}: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get task checklist',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  return router;
}
