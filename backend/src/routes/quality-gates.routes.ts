import express, { Request, Response } from 'express';
import {
  ApiError,
  QualityGateConfigResponse,
  QualityGateConfigsResponse,
  QualityGateResetResponse,
  QualityGateStatusResponse,
  QualityGateUpdateResponse,
  QualityGateValidationResponse,
} from '@app-monitor/api-contracts';
import { getQualityGateValidator, resetQualityGateValidator, QualityGateConfig } from '../services/qualityGates.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const qualityGates = getQualityGateValidator();

const respondSuccess = <T>(res: Response, data: T, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

const respondError = (res: Response, status: number, error: string, message?: string) => {
  const payload: ApiError = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  return res.status(status).json(payload);
};

/**
 * GET /quality-gates/config
 * Get all gate configurations
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const configs = qualityGates.getAllGateConfigs();
    const configObject = Object.fromEntries(configs);
    respondSuccess(res, { configs: configObject } as unknown as QualityGateConfigsResponse['data']);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_config_list_failed',
      message: 'Failed to load quality gate configurations',
      error,
    });
    respondError(res, 500, 'FAILED_TO_GET_QUALITY_CONFIGS', 'Failed to get quality gate configurations');
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
      return respondError(res, 404, 'QUALITY_GATE_NOT_FOUND', `Gate not found: ${gate}`);
    }

    respondSuccess<QualityGateConfigResponse['data']>(res, config);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'quality_gates_config_fetch_failed',
      message: `Failed to load config for gate ${req.params.gate}`,
      error,
    });
    respondError(res, 500, 'FAILED_TO_GET_GATE_CONFIG', 'Failed to get gate configuration');
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
      return respondError(res, 404, 'QUALITY_GATE_NOT_FOUND', `Gate not found: ${gate}`);
    }

    // Validate update fields
    if (updates.enabled !== undefined && typeof updates.enabled !== 'boolean') {
      return respondError(res, 400, 'INVALID_GATE_CONFIG', 'enabled must be a boolean');
    }
    if (updates.required !== undefined && typeof updates.required !== 'boolean') {
      return respondError(res, 400, 'INVALID_GATE_CONFIG', 'required must be a boolean');
    }
    if (updates.weight !== undefined && (typeof updates.weight !== 'number' || updates.weight < 1 || updates.weight > 10)) {
      return respondError(res, 400, 'INVALID_GATE_CONFIG', 'weight must be a number between 1 and 10');
    }
    if (updates.timeout !== undefined && (typeof updates.timeout !== 'number' || updates.timeout <= 0)) {
      return respondError(res, 400, 'INVALID_GATE_CONFIG', 'timeout must be a positive number');
    }

    qualityGates.setGateConfig(gate, updates);

    const updatedConfig = qualityGates.getGateConfig(gate)!;
    respondSuccess<QualityGateUpdateResponse['data']>(res, {
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
    respondError(res, 500, 'FAILED_TO_UPDATE_GATE_CONFIG', 'Failed to update gate configuration');
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
      return respondError(res, 400, 'INVALID_VALIDATION_REQUEST', 'taskId is required');
    }
    if (!workspacePath) {
      return respondError(res, 400, 'INVALID_VALIDATION_REQUEST', 'workspacePath is required');
    }
    if (!project) {
      return respondError(res, 400, 'INVALID_VALIDATION_REQUEST', 'project is required');
    }

    logger.info({
      category: 'api',
      action: 'validation_requested',
      message: `Quality validation requested for task ${taskId}`,
      details: { workspacePath, project }
    });

    const result = await qualityGates.validateTask(taskId, workspacePath, project);

    respondSuccess<QualityGateValidationResponse['data']>(res, result);
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
    respondError(res, 500, 'FAILED_TO_VALIDATE_TASK', 'Failed to validate task');
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

    respondSuccess<QualityGateResetResponse['data']>(res, {
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
    respondError(res, 500, 'FAILED_TO_RESET_QUALITY_CONFIGS', 'Failed to reset configurations');
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

    respondSuccess<QualityGateStatusResponse['data']>(res, {
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
    respondError(res, 500, 'FAILED_TO_GET_QUALITY_STATUS', 'Failed to get status');
  }
});

export default router;
