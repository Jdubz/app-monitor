/**
 * Settings Input Validation Utilities
 *
 * Validates Dev-Bots settings input data for API endpoints
 */

const VALID_MODEL_STRATEGIES = ['alternate', 'claude-only', 'codex-only', 'random'] as const;
const MIN_MAX_WORKERS = 1;
const MAX_MAX_WORKERS = 20;

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate settings update payload
 */
export function validateSettingsUpdatePayload(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = input as Record<string, unknown>;

  // Validate that at least one field is provided
  const validFields = ['modelStrategy', 'maxWorkers', 'dryRun', 'autoCleanup'];
  const providedFields = Object.keys(data).filter(key => validFields.includes(key));
  
  if (providedFields.length === 0) {
    errors.push({
      field: 'body',
      message: 'At least one setting field must be provided',
    });
  }

  // Validate modelStrategy if provided
  if (data.modelStrategy !== undefined) {
    if (typeof data.modelStrategy !== 'string') {
      errors.push({
        field: 'modelStrategy',
        message: 'Model strategy must be a string',
        value: data.modelStrategy,
      });
    } else if (!VALID_MODEL_STRATEGIES.includes(data.modelStrategy as typeof VALID_MODEL_STRATEGIES[number])) {
      errors.push({
        field: 'modelStrategy',
        message: `Model strategy must be one of: ${VALID_MODEL_STRATEGIES.join(', ')}`,
        value: data.modelStrategy,
      });
    }
  }

  // Validate maxWorkers if provided
  if (data.maxWorkers !== undefined) {
    if (typeof data.maxWorkers !== 'number') {
      errors.push({
        field: 'maxWorkers',
        message: 'Max workers must be a number',
        value: data.maxWorkers,
      });
    } else if (!Number.isInteger(data.maxWorkers)) {
      errors.push({
        field: 'maxWorkers',
        message: 'Max workers must be an integer',
        value: data.maxWorkers,
      });
    } else if (data.maxWorkers < MIN_MAX_WORKERS || data.maxWorkers > MAX_MAX_WORKERS) {
      errors.push({
        field: 'maxWorkers',
        message: `Max workers must be between ${MIN_MAX_WORKERS} and ${MAX_MAX_WORKERS}`,
        value: data.maxWorkers,
      });
    }
  }

  // Validate dryRun if provided
  if (data.dryRun !== undefined) {
    if (typeof data.dryRun !== 'boolean') {
      errors.push({
        field: 'dryRun',
        message: 'Dry run must be a boolean',
        value: data.dryRun,
      });
    }
  }

  // Validate autoCleanup if provided
  if (data.autoCleanup !== undefined) {
    if (typeof data.autoCleanup !== 'boolean') {
      errors.push({
        field: 'autoCleanup',
        message: 'Auto cleanup must be a boolean',
        value: data.autoCleanup,
      });
    }
  }

  // Check for unknown fields
  const unknownFields = Object.keys(data).filter(key => !validFields.includes(key));
  if (unknownFields.length > 0) {
    errors.push({
      field: 'body',
      message: `Unknown fields: ${unknownFields.join(', ')}. Valid fields are: ${validFields.join(', ')}`,
      value: unknownFields,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
