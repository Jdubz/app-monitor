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
   * Get current Dev-Bots settings
   */
  router.get('/settings', (_req: Request, res: Response) => {
    try {
      // For now, return default settings
      // TODO: Integrate with actual settings storage when implemented
      const settings: DevBotsSettings = {
        modelStrategy: 'alternate',
        maxWorkers: 5,
        dryRun: false,
        autoCleanup: true,
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

    try {
      const payload = req.body as Partial<DevBotsSettings>;
      
      // Get current settings (for now, using defaults)
      // TODO: Integrate with actual settings storage when implemented
      const currentSettings: DevBotsSettings = {
        modelStrategy: 'alternate',
        maxWorkers: 5,
        dryRun: false,
        autoCleanup: true,
        updatedAt: new Date().toISOString(),
      };

      // Build updated settings with only validated fields
      const updatedSettings: DevBotsSettings = {
        ...currentSettings,
        ...(payload.modelStrategy !== undefined && { modelStrategy: payload.modelStrategy }),
        ...(payload.maxWorkers !== undefined && { maxWorkers: payload.maxWorkers }),
        ...(payload.dryRun !== undefined && { dryRun: payload.dryRun }),
        ...(payload.autoCleanup !== undefined && { autoCleanup: payload.autoCleanup }),
        updatedAt: new Date().toISOString(),
      };

      logger.info({
        category: 'api',
        action: 'update_settings',
        message: 'Dev-Bots settings updated',
        details: { settings: updatedSettings }
      });

      const response: DevBotsSettingsResponse = { success: true, data: updatedSettings };
      res.json(response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'update_settings_failed',
        message: 'Failed to update Dev-Bots settings',
        error,
        details: { payload: req.body }
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'update_failed',
        message: error instanceof Error ? error.message : 'Failed to update settings',
      };
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
