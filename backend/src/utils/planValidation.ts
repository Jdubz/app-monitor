/**
 * Plan Input Validation Utilities
 *
 * Validates plan input data for API endpoints
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CreatePlanInput, UpdatePlanInput, PlanQueryFilters } from '../types/plan.js';

const VALID_PLAN_TYPES = ['feature', 'refactor', 'fix', 'investigation'] as const;
const VALID_PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;
const VALID_STATUSES = ['planning', 'in_progress', 'blocked', 'completed', 'cancelled'] as const;

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_MARKDOWN_REF_LENGTH = 1000;
const MAX_CREATED_BY_LENGTH = 255;
const MAX_ASSIGNED_TO_LENGTH = 255;
const MAX_SUCCESS_CRITERIA_ITEMS = 50;
const MAX_SUCCESS_CRITERIA_ITEM_LENGTH = 500;
const MAX_SCOPE_BOUNDARIES_ITEMS = 50;
const MAX_SCOPE_BOUNDARIES_ITEM_LENGTH = 500;
const MIN_ESTIMATED_HOURS = 0;
const MAX_ESTIMATED_HOURS = 10000;

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
 * Validate CreatePlanInput
 */
export function validateCreatePlanInput(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = input as Record<string, unknown>;

  // Required: title
  if (!data.title || typeof data.title !== 'string') {
    errors.push({ field: 'title', message: 'Title is required and must be a string' });
  } else if (data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title cannot be empty' });
  } else if (data.title.length > MAX_TITLE_LENGTH) {
    errors.push({
      field: 'title',
      message: `Title must not exceed ${MAX_TITLE_LENGTH} characters`,
      value: data.title.length,
    });
  }

  // Required: plan_type
  if (!data.plan_type) {
    errors.push({ field: 'plan_type', message: 'Plan type is required' });
  } else if (!VALID_PLAN_TYPES.includes(data.plan_type as typeof VALID_PLAN_TYPES[number])) {
    errors.push({
      field: 'plan_type',
      message: `Plan type must be one of: ${VALID_PLAN_TYPES.join(', ')}`,
      value: data.plan_type,
    });
  }

  // Required: priority
  if (!data.priority) {
    errors.push({ field: 'priority', message: 'Priority is required' });
  } else if (!VALID_PRIORITIES.includes(data.priority as typeof VALID_PRIORITIES[number])) {
    errors.push({
      field: 'priority',
      message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
      value: data.priority,
    });
  }

  // Optional: description
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
        value: data.description.length,
      });
    }
  }

  // Optional: markdown_ref
  if (data.markdown_ref !== undefined && data.markdown_ref !== null) {
    if (typeof data.markdown_ref !== 'string') {
      errors.push({ field: 'markdown_ref', message: 'Markdown reference must be a string' });
    } else if (data.markdown_ref.length > MAX_MARKDOWN_REF_LENGTH) {
      errors.push({
        field: 'markdown_ref',
        message: `Markdown reference must not exceed ${MAX_MARKDOWN_REF_LENGTH} characters`,
        value: data.markdown_ref.length,
      });
    }
  }

  // Optional: created_by
  if (data.created_by !== undefined && data.created_by !== null) {
    if (typeof data.created_by !== 'string') {
      errors.push({ field: 'created_by', message: 'Created by must be a string' });
    } else if (data.created_by.length > MAX_CREATED_BY_LENGTH) {
      errors.push({
        field: 'created_by',
        message: `Created by must not exceed ${MAX_CREATED_BY_LENGTH} characters`,
        value: data.created_by.length,
      });
    }
  }

  // Optional: assigned_to
  if (data.assigned_to !== undefined && data.assigned_to !== null) {
    if (typeof data.assigned_to !== 'string') {
      errors.push({ field: 'assigned_to', message: 'Assigned to must be a string' });
    } else if (data.assigned_to.length > MAX_ASSIGNED_TO_LENGTH) {
      errors.push({
        field: 'assigned_to',
        message: `Assigned to must not exceed ${MAX_ASSIGNED_TO_LENGTH} characters`,
        value: data.assigned_to.length,
      });
    }
  }

  // Optional: success_criteria
  if (data.success_criteria !== undefined && data.success_criteria !== null) {
    if (!Array.isArray(data.success_criteria)) {
      errors.push({ field: 'success_criteria', message: 'Success criteria must be an array' });
    } else {
      if (data.success_criteria.length > MAX_SUCCESS_CRITERIA_ITEMS) {
        errors.push({
          field: 'success_criteria',
          message: `Success criteria must not exceed ${MAX_SUCCESS_CRITERIA_ITEMS} items`,
          value: data.success_criteria.length,
        });
      }
      data.success_criteria.forEach((item, index) => {
        if (typeof item !== 'string') {
          errors.push({
            field: `success_criteria[${index}]`,
            message: 'Success criteria items must be strings',
          });
        } else if (item.length > MAX_SUCCESS_CRITERIA_ITEM_LENGTH) {
          errors.push({
            field: `success_criteria[${index}]`,
            message: `Success criteria item must not exceed ${MAX_SUCCESS_CRITERIA_ITEM_LENGTH} characters`,
            value: item.length,
          });
        }
      });
    }
  }

  // Optional: scope_boundaries
  if (data.scope_boundaries !== undefined && data.scope_boundaries !== null) {
    if (typeof data.scope_boundaries !== 'object' || Array.isArray(data.scope_boundaries)) {
      errors.push({ field: 'scope_boundaries', message: 'Scope boundaries must be an object' });
    } else {
      const boundaries = data.scope_boundaries as Record<string, unknown>;

      // Validate mustNotChange
      if (boundaries.mustNotChange !== undefined && boundaries.mustNotChange !== null) {
        if (!Array.isArray(boundaries.mustNotChange)) {
          errors.push({
            field: 'scope_boundaries.mustNotChange',
            message: 'mustNotChange must be an array',
          });
        } else {
          if (boundaries.mustNotChange.length > MAX_SCOPE_BOUNDARIES_ITEMS) {
            errors.push({
              field: 'scope_boundaries.mustNotChange',
              message: `mustNotChange must not exceed ${MAX_SCOPE_BOUNDARIES_ITEMS} items`,
              value: boundaries.mustNotChange.length,
            });
          }
          boundaries.mustNotChange.forEach((item, index) => {
            if (typeof item !== 'string') {
              errors.push({
                field: `scope_boundaries.mustNotChange[${index}]`,
                message: 'mustNotChange items must be strings',
              });
            } else if (item.length > MAX_SCOPE_BOUNDARIES_ITEM_LENGTH) {
              errors.push({
                field: `scope_boundaries.mustNotChange[${index}]`,
                message: `mustNotChange item must not exceed ${MAX_SCOPE_BOUNDARIES_ITEM_LENGTH} characters`,
                value: item.length,
              });
            }
          });
        }
      }

      // Validate mustNotAffect
      if (boundaries.mustNotAffect !== undefined && boundaries.mustNotAffect !== null) {
        if (!Array.isArray(boundaries.mustNotAffect)) {
          errors.push({
            field: 'scope_boundaries.mustNotAffect',
            message: 'mustNotAffect must be an array',
          });
        } else {
          if (boundaries.mustNotAffect.length > MAX_SCOPE_BOUNDARIES_ITEMS) {
            errors.push({
              field: 'scope_boundaries.mustNotAffect',
              message: `mustNotAffect must not exceed ${MAX_SCOPE_BOUNDARIES_ITEMS} items`,
              value: boundaries.mustNotAffect.length,
            });
          }
          boundaries.mustNotAffect.forEach((item, index) => {
            if (typeof item !== 'string') {
              errors.push({
                field: `scope_boundaries.mustNotAffect[${index}]`,
                message: 'mustNotAffect items must be strings',
              });
            } else if (item.length > MAX_SCOPE_BOUNDARIES_ITEM_LENGTH) {
              errors.push({
                field: `scope_boundaries.mustNotAffect[${index}]`,
                message: `mustNotAffect item must not exceed ${MAX_SCOPE_BOUNDARIES_ITEM_LENGTH} characters`,
                value: item.length,
              });
            }
          });
        }
      }
    }
  }

  // Optional: estimated_effort_hours
  if (data.estimated_effort_hours !== undefined && data.estimated_effort_hours !== null) {
    if (typeof data.estimated_effort_hours !== 'number') {
      errors.push({
        field: 'estimated_effort_hours',
        message: 'Estimated effort hours must be a number',
      });
    } else if (data.estimated_effort_hours < MIN_ESTIMATED_HOURS) {
      errors.push({
        field: 'estimated_effort_hours',
        message: `Estimated effort hours must be at least ${MIN_ESTIMATED_HOURS}`,
        value: data.estimated_effort_hours,
      });
    } else if (data.estimated_effort_hours > MAX_ESTIMATED_HOURS) {
      errors.push({
        field: 'estimated_effort_hours',
        message: `Estimated effort hours must not exceed ${MAX_ESTIMATED_HOURS}`,
        value: data.estimated_effort_hours,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate UpdatePlanInput
 */
export function validateUpdatePlanInput(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const data = input as Record<string, unknown>;

  // Optional: title
  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.push({ field: 'title', message: 'Title must be a string' });
    } else if (data.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title cannot be empty' });
    } else if (data.title.length > MAX_TITLE_LENGTH) {
      errors.push({
        field: 'title',
        message: `Title must not exceed ${MAX_TITLE_LENGTH} characters`,
        value: data.title.length,
      });
    }
  }

  // Optional: plan_type
  if (data.plan_type !== undefined) {
    if (!VALID_PLAN_TYPES.includes(data.plan_type as typeof VALID_PLAN_TYPES[number])) {
      errors.push({
        field: 'plan_type',
        message: `Plan type must be one of: ${VALID_PLAN_TYPES.join(', ')}`,
        value: data.plan_type,
      });
    }
  }

  // Optional: priority
  if (data.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(data.priority as typeof VALID_PRIORITIES[number])) {
      errors.push({
        field: 'priority',
        message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
        value: data.priority,
      });
    }
  }

  // Other fields use same validation as create
  // (description, markdown_ref, assigned_to, success_criteria, scope_boundaries, estimated_effort_hours)
  // Reuse the validation logic but only for provided fields

  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
        value: data.description.length,
      });
    }
  }

  if (data.markdown_ref !== undefined && data.markdown_ref !== null) {
    if (typeof data.markdown_ref !== 'string') {
      errors.push({ field: 'markdown_ref', message: 'Markdown reference must be a string' });
    } else if (data.markdown_ref.length > MAX_MARKDOWN_REF_LENGTH) {
      errors.push({
        field: 'markdown_ref',
        message: `Markdown reference must not exceed ${MAX_MARKDOWN_REF_LENGTH} characters`,
        value: data.markdown_ref.length,
      });
    }
  }

  if (data.assigned_to !== undefined && data.assigned_to !== null) {
    if (typeof data.assigned_to !== 'string') {
      errors.push({ field: 'assigned_to', message: 'Assigned to must be a string' });
    } else if (data.assigned_to.length > MAX_ASSIGNED_TO_LENGTH) {
      errors.push({
        field: 'assigned_to',
        message: `Assigned to must not exceed ${MAX_ASSIGNED_TO_LENGTH} characters`,
        value: data.assigned_to.length,
      });
    }
  }

  if (data.estimated_effort_hours !== undefined && data.estimated_effort_hours !== null) {
    if (typeof data.estimated_effort_hours !== 'number') {
      errors.push({
        field: 'estimated_effort_hours',
        message: 'Estimated effort hours must be a number',
      });
    } else if (data.estimated_effort_hours < MIN_ESTIMATED_HOURS) {
      errors.push({
        field: 'estimated_effort_hours',
        message: `Estimated effort hours must be at least ${MIN_ESTIMATED_HOURS}`,
        value: data.estimated_effort_hours,
      });
    } else if (data.estimated_effort_hours > MAX_ESTIMATED_HOURS) {
      errors.push({
        field: 'estimated_effort_hours',
        message: `Estimated effort hours must not exceed ${MAX_ESTIMATED_HOURS}`,
        value: data.estimated_effort_hours,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate PlanQueryFilters
 */
export function validatePlanQueryFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  // Optional: status
  if (query.status !== undefined) {
    const statuses = Array.isArray(query.status) ? query.status : [query.status];
    statuses.forEach((status, index) => {
      if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        errors.push({
          field: Array.isArray(query.status) ? `status[${index}]` : 'status',
          message: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
          value: status,
        });
      }
    });
  }

  // Optional: priority
  if (query.priority !== undefined) {
    const priorities = Array.isArray(query.priority) ? query.priority : [query.priority];
    priorities.forEach((priority, index) => {
      if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
        errors.push({
          field: Array.isArray(query.priority) ? `priority[${index}]` : 'priority',
          message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
          value: priority,
        });
      }
    });
  }

  // Optional: plan_type
  if (query.plan_type !== undefined) {
    const planTypes = Array.isArray(query.plan_type) ? query.plan_type : [query.plan_type];
    planTypes.forEach((planType, index) => {
      if (!VALID_PLAN_TYPES.includes(planType as typeof VALID_PLAN_TYPES[number])) {
        errors.push({
          field: Array.isArray(query.plan_type) ? `plan_type[${index}]` : 'plan_type',
          message: `Plan type must be one of: ${VALID_PLAN_TYPES.join(', ')}`,
          value: planType,
        });
      }
    });
  }

  // Optional: created_by
  if (query.created_by !== undefined && typeof query.created_by !== 'string') {
    errors.push({ field: 'created_by', message: 'Created by must be a string' });
  }

  // Optional: assigned_to
  if (query.assigned_to !== undefined && typeof query.assigned_to !== 'string') {
    errors.push({ field: 'assigned_to', message: 'Assigned to must be a string' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
