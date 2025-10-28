import express, { Request, Response } from 'express';
import { getQualityGateValidator, resetQualityGateValidator, QualityGateConfig } from '../services/qualityGates.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const qualityGates = getQualityGateValidator();

/**
 * GET /quality-gates/config
 * Get all gate configurations
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const configs = qualityGates.getAllGateConfigs();
    const configObject = Object.fromEntries(configs);
    res.json({ configs: configObject });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_config_list_failed',
      message: 'Failed to load quality gate configurations',
      error,
    });
    res.status(500).json({ error: 'Failed to get quality gate configurations' });
  }
});

/**
 * GET /quality-gates/config/:gate
 * Get configuration for a specific gate
 */
router.get('/config/:gate', (req: Request, res: Response) => {
  try {
    const { gate } = req.params;
    const config = qualityGates.getGateConfig(gate);

    if (!config) {
      return res.status(404).json({ error: `Gate not found: ${gate}` });
    }

    res.json(config);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_config_fetch_failed',
      message: `Failed to load config for gate ${req.params.gate}`,
      error,
    });
    res.status(500).json({ error: 'Failed to get gate configuration' });
  }
});

/**
 * PUT /quality-gates/config/:gate
 * Update configuration for a specific gate
 */
router.put('/config/:gate', (req: Request, res: Response) => {
  try {
    const { gate } = req.params;
    const updates: Partial<QualityGateConfig> = req.body;

    // Validate gate exists
    const existingConfig = qualityGates.getGateConfig(gate);
    if (!existingConfig) {
      return res.status(404).json({ error: `Gate not found: ${gate}` });
    }

    // Validate update fields
    if (updates.enabled !== undefined && typeof updates.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    if (updates.required !== undefined && typeof updates.required !== 'boolean') {
      return res.status(400).json({ error: 'required must be a boolean' });
    }
    if (updates.weight !== undefined && (typeof updates.weight !== 'number' || updates.weight < 1 || updates.weight > 10)) {
      return res.status(400).json({ error: 'weight must be a number between 1 and 10' });
    }
    if (updates.timeout !== undefined && (typeof updates.timeout !== 'number' || updates.timeout <= 0)) {
      return res.status(400).json({ error: 'timeout must be a positive number' });
    }

    qualityGates.setGateConfig(gate, updates);

    const updatedConfig = qualityGates.getGateConfig(gate);
    res.json({
      message: `Configuration updated for gate: ${gate}`,
      config: updatedConfig
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_config_update_failed',
      message: `Failed to update config for gate ${req.params.gate}`,
      error,
      details: { gate: req.params.gate },
    });
    res.status(500).json({ error: 'Failed to update gate configuration' });
  }
});

/**
 * POST /quality-gates/validate
 * Validate a task through all quality gates
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { taskId, workspacePath, project } = req.body;

    // Validate required fields
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }
    if (!workspacePath) {
      return res.status(400).json({ error: 'workspacePath is required' });
    }
    if (!project) {
      return res.status(400).json({ error: 'project is required' });
    }

    logger.info({
      category: 'api',
      action: 'validation_requested',
      message: `Quality validation requested for task ${taskId}`,
      details: { workspacePath, project }
    });

    const result = await qualityGates.validateTask(taskId, workspacePath, project);

    res.json(result);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_validation_failed',
      message: `Quality validation failed for task ${req.body?.taskId ?? 'unknown'}`,
      error,
      details: {
        workspacePath: req.body?.workspacePath,
        project: req.body?.project,
      },
    });
    res.status(500).json({ error: 'Failed to validate task' });
  }
});

/**
 * POST /quality-gates/config/reset
 * Reset all gate configurations to defaults
 */
router.post('/config/reset', (req: Request, res: Response) => {
  try {
    // Create a new validator instance to get defaults
    resetQualityGateValidator();
    const newValidator = getQualityGateValidator();

    res.json({
      message: 'Quality gate configurations reset to defaults',
      configs: Object.fromEntries(newValidator.getAllGateConfigs())
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_reset_failed',
      message: 'Failed to reset quality gate configurations',
      error,
    });
    res.status(500).json({ error: 'Failed to reset configurations' });
  }
});

/**
 * GET /quality-gates/status
 * Get quality gates system status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const configs = qualityGates.getAllGateConfigs();

    let enabledCount = 0;
    let requiredCount = 0;

    for (const [, config] of configs) {
      if (config.enabled) enabledCount++;
      if (config.required) requiredCount++;
    }

    res.json({
      status: 'operational',
      totalGates: configs.size,
      enabledGates: enabledCount,
      requiredGates: requiredCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_status_failed',
      message: 'Failed to get quality gate status',
      error,
    });
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
