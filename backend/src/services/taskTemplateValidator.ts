/**
 * Task Template Validator (v3)
 *
 * Enforces strict scope control and mandatory investigation requirements
 * to prevent scope creep, feature invention, and code duplication.
 *
 * @see docs/plans/BOT_PROMPT_ENGINEERING_V3.md
 */

import { logger } from '../utils/logger.js';

export interface Investigation {
  required: boolean;
  steps: string[];
  mustFind: string[];
  mustNotDuplicate: string[];
}

export interface GitWorkflow {
  required: boolean;
  branch: string;
  commitMessage: string;
}

export interface TaskTemplateV3 {
  // Core fields
  type: string;
  title: string;
  description: string;

  // V3 mandatory fields
  investigation: Investigation;
  preImplementationChecklist: string[];
  acceptanceCriteria: string[];
  constraints: string[];

  // File scope control
  files: string[];
  modifyOnly?: string[];
  doNotModify?: string[];
  doNotCreate: string[];

  // Git workflow
  gitWorkflow: GitWorkflow;

  // Optional fields
  documentation?: string;
  notes?: string;
  assignedAgent?: string;
  priority?: number;
  estimatedEffort?: {
    hours: number;
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';
    confidence: 'low' | 'medium' | 'high';
  };

  // Metadata
  metadata?: {
    promptEngineeringVersion: 'v3';
    strictScopeEnforcement: boolean;
    mandatoryInvestigation: boolean;
    duplicateProtection: boolean;
    [key: string]: boolean | string | number | unknown;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// TODO(templates): introduce minimum length constants for investigation steps,
// acceptance criteria, and constraint text once usage data shows appropriate
// guardrail values.
const DO_NOT_CREATE_ACTIONABLE_KEYWORDS: ReadonlyArray<string> = Object.freeze([
  // Single-word actions capture directives like "reuse the helper"
  'reuse',
  'extend',
  // "existing" is still actionable but matched as a standalone word to avoid noise
  'existing',
  // Explicit phrases retain signal without over-matching every usage of "existing"
  'use existing',
  'leverage existing',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDoNotCreateFileEntry(entry: string): { filePath: string; reason: string } | null {
  const normalized = entry.trim();
  const match = normalized.match(/^([^()]+)\(([^()]+)\)$/);
  if (!match) {
    return null;
  }

  const filePath = match[1]?.trim() ?? '';
  const reason = match[2]?.trim() ?? '';

  if (filePath === '' || reason === '') {
    return null;
  }

  return { filePath, reason };
}

function hasActionableDoNotCreateExplanation(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return DO_NOT_CREATE_ACTIONABLE_KEYWORDS.some((keyword) => {
    if (keyword === 'existing') {
      return /\bexisting\b/.test(normalized);
    }
    return normalized.includes(keyword);
  });
}

const INVESTIGATION_ACTION_VERBS = ['READ', 'GREP', 'CHECK', 'VERIFY', 'INSPECT', 'REVIEW', 'TRACE', 'SEARCH'];
const ACCEPTANCE_SCOPE_KEYWORDS = ['EXACTLY', 'NO MORE', 'NO LESS'];
const ACCEPTANCE_GUARDRAIL_KEYWORDS = ['DO NOT', 'MUST NOT'];
const CONSTRAINT_ALLOWED_PREFIXES = ['MUST', 'DO NOT'];

type ValidationLogDetails = Record<string, unknown>;

function logValidationStage(action: string, message: string, details?: ValidationLogDetails): void {
  logger.debug({
    category: 'utility',
    action,
    message,
    details
  });
}

function containsInvestigationActionVerb(step: string): boolean {
  const normalized = step.trim().toUpperCase();
  return INVESTIGATION_ACTION_VERBS.some(verb => normalized.startsWith(verb) || normalized.includes(`${verb} `));
}

/**
 * Validate a task template against v3 requirements
 */
export function validateTaskTemplate(template: Partial<TaskTemplateV3>): ValidationResult {
  logValidationStage('validate_template_entry', 'Starting task template validation', {
    hasType: !!template.type,
    hasTitle: !!template.title,
    hasInvestigation: !!template.investigation,
    hasGitWorkflow: !!template.gitWorkflow
  });

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Core fields validation
  logValidationStage('validate_core_fields', 'Validating core fields (type, title, description)', {
    templateType: template.type
  });
  if (!template.type || template.type.trim() === '') {
    errors.push({
      field: 'type',
      message: 'Task type is required',
      severity: 'error'
    });
  }

  if (!template.title || template.title.trim() === '') {
    errors.push({
      field: 'title',
      message: 'Task title is required',
      severity: 'error'
    });
  }

  if (!template.description || template.description.trim() === '') {
    errors.push({
      field: 'description',
      message: 'Task description is required',
      severity: 'error'
    });
  }

  // 2. Investigation field validation (MANDATORY in v3)
  logValidationStage('validate_investigation', 'Validating investigation field and requirements', {
    hasInvestigation: !!template.investigation,
    investigationRequired: template.investigation?.required,
    stepsCount: template.investigation?.steps?.length || 0
  });
  if (!template.investigation) {
    errors.push({
      field: 'investigation',
      message: 'V3 templates MUST include investigation field to prevent code duplication',
      severity: 'error'
    });
  } else {
    if (!template.investigation.required) {
      errors.push({
        field: 'investigation.required',
        message: 'Investigation must be marked as required in v3 templates',
        severity: 'error'
      });
    }

    if (!Array.isArray(template.investigation.steps) || template.investigation.steps.length === 0) {
      errors.push({
        field: 'investigation.steps',
        message: 'Investigation must include specific steps (READ, GREP, CHECK, VERIFY)',
        severity: 'error'
      });
    } else {
      const normalizedSteps = template.investigation.steps.filter((step): step is string => typeof step === 'string');
      template.investigation.steps.forEach((step, index) => {
        if (!isNonEmptyString(step)) {
          errors.push({
            field: `investigation.steps[${index}]`,
            message: 'Each investigation step must be a non-empty instruction that tells the worker what to inspect',
            severity: 'error'
          });
          return;
        }

        if (!containsInvestigationActionVerb(step)) {
          errors.push({
            field: `investigation.steps[${index}]`,
            message: 'Investigation steps must start with an action verb (READ, GREP, CHECK, VERIFY) to enforce investigation before coding',
            severity: 'error'
          });
        }
      });

      // Check for investigation action verbs
      const hasReadStep = normalizedSteps.some(step => step.toUpperCase().includes('READ'));
      const hasGrepStep = normalizedSteps.some(step => step.toUpperCase().includes('GREP'));

      if (!hasReadStep) {
        warnings.push({
          field: 'investigation.steps',
          message: 'Investigation should include at least one READ step to understand existing code',
          severity: 'warning'
        });
      }

      if (!hasGrepStep) {
        warnings.push({
          field: 'investigation.steps',
          message: 'Investigation should include GREP/search to find similar functionality',
          severity: 'warning'
        });
      }
    }

    if (!Array.isArray(template.investigation.mustFind) || template.investigation.mustFind.length === 0) {
      errors.push({
        field: 'investigation.mustFind',
        message: 'Investigation must specify what the bot MUST find before implementing',
        severity: 'error'
      });
    } else {
      template.investigation.mustFind.forEach((item, index) => {
        if (!isNonEmptyString(item)) {
          errors.push({
            field: `investigation.mustFind[${index}]`,
            message: 'Each mustFind entry must describe a concrete artifact to locate (file, function, schema, etc.)',
            severity: 'error'
          });
        }
      });
    }

    if (!Array.isArray(template.investigation.mustNotDuplicate) || template.investigation.mustNotDuplicate.length === 0) {
      errors.push({
        field: 'investigation.mustNotDuplicate',
        message: 'Investigation must specify what the bot MUST NOT duplicate',
        severity: 'error'
      });
    } else {
      template.investigation.mustNotDuplicate.forEach((item, index) => {
        if (!isNonEmptyString(item)) {
          errors.push({
            field: `investigation.mustNotDuplicate[${index}]`,
            message: 'Each mustNotDuplicate entry must describe existing logic that must be re-used rather than recreated',
            severity: 'error'
          });
        }
      });
    }
  }

  // 3. Pre-implementation checklist validation
  logValidationStage('validate_checklist', 'Validating pre-implementation checklist', {
    checklistLength: template.preImplementationChecklist?.length || 0,
    isArray: Array.isArray(template.preImplementationChecklist)
  });
  if (!Array.isArray(template.preImplementationChecklist) || template.preImplementationChecklist.length === 0) {
    errors.push({
      field: 'preImplementationChecklist',
      message: 'V3 templates MUST include pre-implementation checklist',
      severity: 'error'
    });
  } else if (template.preImplementationChecklist.length < 3) {
    warnings.push({
      field: 'preImplementationChecklist',
      message: 'Pre-implementation checklist should have at least 3 items',
      severity: 'warning'
    });
  }

  // 4. Acceptance criteria validation (strict scope)
  logValidationStage('validate_acceptance_criteria', 'Validating acceptance criteria for scope control', {
    criteriaCount: template.acceptanceCriteria?.length || 0,
    isArray: Array.isArray(template.acceptanceCriteria)
  });
  if (!Array.isArray(template.acceptanceCriteria) || template.acceptanceCriteria.length === 0) {
    errors.push({
      field: 'acceptanceCriteria',
      message: 'Acceptance criteria required for scope control',
      severity: 'error'
    });
  } else {
    let hasExactScopeLanguage = false;
    let hasGuardrailLanguage = false;

    template.acceptanceCriteria.forEach((criterion, index) => {
      if (!isNonEmptyString(criterion)) {
        errors.push({
          field: `acceptanceCriteria[${index}]`,
          message: 'Acceptance criteria entries must be descriptive strings (e.g. "EXACTLY one file updated")',
          severity: 'error'
        });
        return;
      }

      const normalized = criterion.toUpperCase();
      if (ACCEPTANCE_SCOPE_KEYWORDS.some(keyword => normalized.includes(keyword))) {
        hasExactScopeLanguage = true;
      }
      if (ACCEPTANCE_GUARDRAIL_KEYWORDS.some(keyword => normalized.includes(keyword))) {
        hasGuardrailLanguage = true;
      }
    });

    if (!hasExactScopeLanguage) {
      errors.push({
        field: 'acceptanceCriteria',
        message: 'Acceptance criteria must include "EXACTLY" (or NO MORE/NO LESS) language to lock scope',
        severity: 'error'
      });
    }

    if (!hasGuardrailLanguage) {
      errors.push({
        field: 'acceptanceCriteria',
        message: 'Acceptance criteria must include DO NOT / MUST NOT guardrails to prevent feature creep',
        severity: 'error'
      });
    }
  }

  // 5. Constraints validation
  logValidationStage('validate_constraints', 'Validating constraints to prevent overengineering', {
    constraintsCount: template.constraints?.length || 0,
    isArray: Array.isArray(template.constraints)
  });
  if (!Array.isArray(template.constraints) || template.constraints.length === 0) {
    errors.push({
      field: 'constraints',
      message: 'V3 templates MUST include explicit constraints to prevent overengineering',
      severity: 'error'
    });
  } else {
    let hasMustNot = false;

    template.constraints.forEach((constraint, index) => {
      if (!isNonEmptyString(constraint)) {
        errors.push({
          field: `constraints[${index}]`,
          message: 'Constraints entries must be explicit "MUST ..." directives',
          severity: 'error'
        });
        return;
      }

      const normalized = constraint.trim().toUpperCase();
      if (!CONSTRAINT_ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
        errors.push({
          field: `constraints[${index}]`,
          message: 'Constraints must start with "MUST" or "MUST NOT" to prevent ambiguous instructions',
          severity: 'error'
        });
      }

      if (normalized.includes('MUST NOT') || normalized.includes('DO NOT')) {
        hasMustNot = true;
      }
    });

    if (!hasMustNot) {
      errors.push({
        field: 'constraints',
        message: 'Constraints must include at least one "MUST NOT" guardrail to block over-engineering',
        severity: 'error'
      });
    }
  }

  // 6. File scope validation
  logValidationStage('validate_file_scope', 'Validating file scope and creation restrictions', {
    filesCount: template.files?.length || 0,
    doNotCreateCount: template.doNotCreate?.length || 0,
    hasDoNotCreate: !!template.doNotCreate
  });
  if (!Array.isArray(template.files) || template.files.length === 0) {
    errors.push({
      field: 'files',
      message: 'Files array required to scope work',
      severity: 'error'
    });
  }

  if (!Array.isArray(template.doNotCreate) || template.doNotCreate.length === 0) {
    errors.push({
      field: 'doNotCreate',
      message: 'V3 templates MUST declare doNotCreate restrictions like "backend/src/service.ts (reuse existing service)" to block duplicate files',
      severity: 'error'
    });
  } else {
    template.doNotCreate.forEach((entry, index) => {
      if (!isNonEmptyString(entry)) {
        errors.push({
          field: `doNotCreate[${index}]`,
          message: 'Each doNotCreate entry must be a non-empty string with an explanation in parentheses',
          severity: 'error'
        });
        return;
      }

      const parsed = parseDoNotCreateFileEntry(entry);
      if (!parsed) {
        errors.push({
          field: `doNotCreate[${index}]`,
          message: 'Use "<path> (reason)" format so reviewers understand what existing file should be extended instead',
          severity: 'error'
        });
        return;
      }

      if (!hasActionableDoNotCreateExplanation(parsed.reason)) {
        errors.push({
          field: `doNotCreate[${index}]`,
          message: 'Explanation must mention how to reuse or extend existing code (e.g. "reuse existing helper")',
          severity: 'error'
        });
      }
    });
  }

  // 7. Git workflow validation
  logValidationStage('validate_git_workflow', 'Validating git workflow configuration', {
    hasGitWorkflow: !!template.gitWorkflow,
    required: template.gitWorkflow?.required,
    branch: template.gitWorkflow?.branch
  });
  if (!template.gitWorkflow) {
    errors.push({
      field: 'gitWorkflow',
      message: 'Git workflow configuration required',
      severity: 'error'
    });
  } else {
    if (!template.gitWorkflow.required) {
      warnings.push({
        field: 'gitWorkflow.required',
        message: 'Git workflow should be marked as required',
        severity: 'warning'
      });
    }

    if (!template.gitWorkflow.branch) {
      errors.push({
        field: 'gitWorkflow.branch',
        message: 'Target branch must be specified',
        severity: 'error'
      });
    }

    if (!template.gitWorkflow.commitMessage || !template.gitWorkflow.commitMessage.includes('🤖')) {
      warnings.push({
        field: 'gitWorkflow.commitMessage',
        message: 'Commit message should include bot attribution',
        severity: 'warning'
      });
    }
  }

  // 8. Metadata validation
  logValidationStage('validate_metadata', 'Validating template metadata and v3 compliance flags', {
    hasMetadata: !!template.metadata,
    version: template.metadata?.promptEngineeringVersion,
    strictScopeEnforcement: template.metadata?.strictScopeEnforcement,
    mandatoryInvestigation: template.metadata?.mandatoryInvestigation,
    duplicateProtection: template.metadata?.duplicateProtection
  });
  if (template.metadata) {
    if (template.metadata.promptEngineeringVersion !== 'v3') {
      warnings.push({
        field: 'metadata.promptEngineeringVersion',
        message: 'Should be marked as v3 template',
        severity: 'warning'
      });
    }

    if (!template.metadata.strictScopeEnforcement) {
      warnings.push({
        field: 'metadata.strictScopeEnforcement',
        message: 'Should enable strict scope enforcement',
        severity: 'warning'
      });
    }

    if (!template.metadata.mandatoryInvestigation) {
      warnings.push({
        field: 'metadata.mandatoryInvestigation',
        message: 'Should enable mandatory investigation',
        severity: 'warning'
      });
    }

    if (!template.metadata.duplicateProtection) {
      warnings.push({
        field: 'metadata.duplicateProtection',
        message: 'Should enable duplicate protection',
        severity: 'warning'
      });
    }
  } else {
    warnings.push({
      field: 'metadata',
      message: 'Recommended: add metadata to track v3 compliance',
      severity: 'warning'
    });
  }

  const result: ValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings
  };

  logValidationStage('validate_template_complete', 'Finished task template validation', {
    isValid: result.isValid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length
  });

  return result;
}

/**
 * Format validation errors into a human-readable message
 */
export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.isValid) {
    lines.push('✅ Task template is valid (v3 compliant)');

    if (result.warnings.length > 0) {
      lines.push('');
      lines.push(`⚠️  ${result.warnings.length} warning(s):`);
      result.warnings.forEach(w => {
        lines.push(`  - ${w.field}: ${w.message}`);
      });
    }
  } else {
    lines.push(`❌ Task template validation failed (${result.errors.length} error(s))`);
    lines.push('');
    lines.push('Errors:');
    result.errors.forEach(e => {
      lines.push(`  - ${e.field}: ${e.message}`);
    });

    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      result.warnings.forEach(w => {
        lines.push(`  - ${w.field}: ${w.message}`);
      });
    }
  }

  return lines.join('\n');
}

/**
 * Check if a template is v3 compliant (has all required fields)
 */
export function isV3Template(template: unknown): template is TaskTemplateV3 {
  return Boolean(
    template &&
    typeof template === 'object' &&
    template.investigation &&
    Array.isArray(template.acceptanceCriteria) &&
    Array.isArray(template.preImplementationChecklist) &&
    Array.isArray(template.constraints) &&
    Array.isArray(template.doNotCreate) &&
    template.gitWorkflow
  );
}

export function shouldValidateAsV3Template(payload: unknown): payload is Partial<TaskTemplateV3> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<TaskTemplateV3> & {
    metadata?: { promptEngineeringVersion?: string };
  };

  if (candidate.metadata?.promptEngineeringVersion === 'v3') {
    return true;
  }

  // V3 templates always define an investigation block and do-not-create guardrails.
  const hasInvestigationBlock = typeof candidate.investigation === 'object' && candidate.investigation !== null;
  const hasDoNotCreateList = Array.isArray(candidate.doNotCreate) && candidate.doNotCreate.length > 0;

  if (hasInvestigationBlock || hasDoNotCreateList) {
    return true;
  }

  return false;
}
