/**
 * Settings Input Validation Utilities
 *
 * Validates Dev-Bots settings input data for API endpoints
 */

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

  // Validate that maxWorkers is provided
  const validFields = ['maxWorkers'];
  const providedFields = Object.keys(data).filter(key => validFields.includes(key));

  if (providedFields.length === 0) {
    errors.push({
      field: 'body',
      message: 'maxWorkers field must be provided',
    });
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
