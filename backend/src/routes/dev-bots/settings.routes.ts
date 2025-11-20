/**
 * Settings Routes
 *
 * Endpoints for managing Dev-Bots system settings
 * - GET /settings - Get current settings
 * - PUT /settings - Update settings
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { validateSettingsUpdatePayload } from '../../utils/settingsValidation.js';
import { config } from '../../config.js';
import type {
  DevBotsSettings,
  DevBotsSettingsResponse,
  ApiError,
} from '@app-monitor/api-contracts';

/**
 * Create settings routes
 */
export function createSettingsRoutes(_devBotsManager: DevBotsManager): Router {
  const router = Router();

  /**
   * GET /settings
   * Get current Dev-Bots settings from config
   */
  router.get('/settings', (_req: Request, res: Response) => {
    try {
      // Read from config (which reads from MAX_DEV_BOTS env var, default 3)
      const settings: DevBotsSettings = {
        maxWorkers: config.devBots.maxWorkers,
        updatedAt: new Date().toISOString(),
      };

      const response: DevBotsSettingsResponse = { success: true, data: settings };
      res.json(response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'fetch_settings_failed',
        message: 'Failed to fetch Dev-Bots settings',
        error
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch settings',
      };
      res.status(500).json(errorResponse);
    }
  });

  /**
   * PUT /settings
   * Update Dev-Bots settings
   *
   * NOTE: Settings are currently read-only from environment variables.
   * This endpoint validates the request but does not persist changes.
   * To change maxWorkers, update the MAX_DEV_BOTS environment variable and restart the service.
   */
  router.put('/settings', (req: Request, res: Response) => {
    // Validate input
    const validation = validateSettingsUpdatePayload(req.body);
    if (!validation.valid) {
      const errorMessage = validation.errors.length > 0
        ? validation.errors.map(e => e.message).join('; ')
        : 'Validation failed';
      const errorResponse: ApiError = {
        success: false,
        error: 'validation_failed',
        message: errorMessage,
        details: validation.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    // Settings are read-only from config/environment
    // Return 501 Not Implemented
    const errorResponse: ApiError = {
      success: false,
      error: 'not_implemented',
      message: 'Settings updates are not yet implemented. Settings are currently read from environment variables (MAX_DEV_BOTS). To change maxWorkers, update the environment variable and restart the service.',
    };
    res.status(501).json(errorResponse);
  });

  return router;
}
