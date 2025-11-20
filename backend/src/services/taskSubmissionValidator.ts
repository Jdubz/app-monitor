import type { TaskSubmissionPayload } from '@app-monitor/api-contracts';

export interface TaskSubmissionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalized: TaskSubmissionPayload;
}

const TASK_TYPES = new Set<TaskSubmissionPayload['taskType']>([
  'implementation',
  'review',
  'fix',
  'pr-follow-up',
  'analysis',
]);

const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 140;
const MIN_INTENT_LENGTH = 20;

/**
 * Validate human-submitted task payloads before auto-detection/creation.
 * Keeps the rules intentionally light since every task is reviewed by agents.
 */
export function validateTaskSubmissionPayload(
  payload: TaskSubmissionPayload
): TaskSubmissionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized: TaskSubmissionPayload = {
    ...payload,
    title: payload.title?.trim() ?? '',
    intent: payload.intent?.trim() ?? '',
  };

  if (!normalized.title) {
    errors.push('Title is required.');
  } else {
    if (normalized.title.length < MIN_TITLE_LENGTH) {
      warnings.push(`Title is quite short (<${MIN_TITLE_LENGTH} chars). Consider adding detail.`);
    }
    if (normalized.title.length > MAX_TITLE_LENGTH) {
      warnings.push('Title is very long. Consider tightening the summary.');
    }
  }

  if (!normalized.intent) {
    errors.push('Intent is required.');
  } else if (normalized.intent.length < MIN_INTENT_LENGTH) {
    warnings.push('Intent is short; include what success looks like so the planner has context.');
  }

  if (!normalized.taskType) {
    errors.push('taskType is required.');
  } else if (!TASK_TYPES.has(normalized.taskType)) {
    errors.push(`Unknown taskType: ${normalized.taskType}`);
  }

  if (normalized.targetFiles && normalized.targetFiles.length > 0) {
    const emptyValues = normalized.targetFiles.filter((f) => !f.trim());
    if (emptyValues.length > 0) {
      warnings.push('Remove blank paths from targetFiles.');
      normalized.targetFiles = normalized.targetFiles.filter((f) => !!f.trim());
    }
  }

  if (normalized.priority !== undefined) {
    if (normalized.priority < 1 || normalized.priority > 10) {
      warnings.push('Priority should be between 1 (default) and 10.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}
