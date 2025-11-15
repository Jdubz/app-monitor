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

export interface DevBotsSettings {
  modelStrategy: 'alternate' | 'claude-only' | 'codex-only' | 'random';
  maxWorkers: number;
  dryRun: boolean;
  autoCleanup: boolean;
  updatedAt: string;
}

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

      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'fetch_settings_failed',
        message: 'Failed to fetch Dev-Bots settings',
        error
      });
      res.status(500).json({
        success: false,
        error: 'fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch settings',
      });
    }
  });

  /**
   * PUT /settings
   * Update Dev-Bots settings
   */
  router.put('/settings', (req: Request, res: Response) => {
    const payload = req.body as Partial<DevBotsSettings> | undefined;
    
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_payload',
        message: 'Settings payload is required and cannot be empty',
      });
    }

    try {
      // For now, just return the updated settings merged with defaults
      // TODO: Integrate with actual settings storage when implemented
      const currentSettings: DevBotsSettings = {
        modelStrategy: 'alternate',
        maxWorkers: 5,
        dryRun: false,
        autoCleanup: true,
        updatedAt: new Date().toISOString(),
      };

      const updatePayload: Partial<DevBotsSettings> = {};
      const allowedKeys: (keyof DevBotsSettings)[] = ['modelStrategy', 'maxWorkers', 'dryRun', 'autoCleanup'];
      
      allowedKeys.forEach(key => {
        if (payload[key] !== undefined) {
          (updatePayload as any)[key] = payload[key];
        }
      });

      const updatedSettings: DevBotsSettings = {
        ...currentSettings,
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      };

      logger.info({
        category: 'api',
        action: 'update_settings',
        message: 'Dev-Bots settings updated',
        details: { settings: updatedSettings }
      });

      res.json({ success: true, data: updatedSettings });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'update_settings_failed',
        message: 'Failed to update Dev-Bots settings',
        error,
        details: { payload }
      });
      res.status(500).json({
        success: false,
        error: 'update_failed',
        message: error instanceof Error ? error.message : 'Failed to update settings',
      });
    }
  });

  return router;
}
