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
  doNotCreate?: string[];

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
    [key: string]: unknown;
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

/**
 * Validate a task template against v3 requirements
 */
export function validateTaskTemplate(template: Partial<TaskTemplateV3>): ValidationResult {
  logger.debug({
    category: 'utility',
    action: 'validate_template_entry',
    message: 'Starting task template validation',
    details: {
      hasType: !!template.type,
      hasTitle: !!template.title,
      hasInvestigation: !!template.investigation,
      hasGitWorkflow: !!template.gitWorkflow
    }
  });

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Core fields validation
  logger.debug({
    category: 'utility',
    action: 'validate_core_fields',
    message: 'Validating core fields (type, title, description)',
    details: { templateType: template.type }
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
  logger.debug({
    category: 'utility',
    action: 'validate_investigation',
    message: 'Validating investigation field and requirements',
    details: {
      hasInvestigation: !!template.investigation,
      investigationRequired: template.investigation?.required,
      stepsCount: template.investigation?.steps?.length || 0
    }
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
      // Check for investigation action verbs
      const hasReadStep = template.investigation.steps.some(s => s.toUpperCase().includes('READ'));
      const hasGrepStep = template.investigation.steps.some(s => s.toUpperCase().includes('GREP'));

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
    }

    if (!Array.isArray(template.investigation.mustNotDuplicate) || template.investigation.mustNotDuplicate.length === 0) {
      errors.push({
        field: 'investigation.mustNotDuplicate',
        message: 'Investigation must specify what the bot MUST NOT duplicate',
        severity: 'error'
      });
    }
  }

  // 3. Pre-implementation checklist validation
  logger.debug({
    category: 'utility',
    action: 'validate_checklist',
    message: 'Validating pre-implementation checklist',
    details: {
      checklistLength: template.preImplementationChecklist?.length || 0,
      isArray: Array.isArray(template.preImplementationChecklist)
    }
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
  logger.debug({
    category: 'utility',
    action: 'validate_acceptance_criteria',
    message: 'Validating acceptance criteria for scope control',
    details: {
      criteriaCount: template.acceptanceCriteria?.length || 0,
      isArray: Array.isArray(template.acceptanceCriteria)
    }
  });
  if (!Array.isArray(template.acceptanceCriteria) || template.acceptanceCriteria.length === 0) {
    errors.push({
      field: 'acceptanceCriteria',
      message: 'Acceptance criteria required for scope control',
      severity: 'error'
    });
  } else {
    // Check for "EXACTLY" language
    const hasExactly = template.acceptanceCriteria.some(c =>
      c.toUpperCase().includes('EXACTLY') ||
      c.toUpperCase().includes('NO MORE') ||
      c.toUpperCase().includes('DO NOT ADD')
    );

    if (!hasExactly) {
      warnings.push({
        field: 'acceptanceCriteria',
        message: 'Use "EXACTLY N items" language to prevent scope creep',
        severity: 'warning'
      });
    }
  }

  // 5. Constraints validation
  logger.debug({
    category: 'utility',
    action: 'validate_constraints',
    message: 'Validating constraints to prevent overengineering',
    details: {
      constraintsCount: template.constraints?.length || 0,
      isArray: Array.isArray(template.constraints)
    }
  });
  if (!Array.isArray(template.constraints) || template.constraints.length === 0) {
    errors.push({
      field: 'constraints',
      message: 'V3 templates MUST include explicit constraints to prevent overengineering',
      severity: 'error'
    });
  } else {
    const hasMustNot = template.constraints.some(c => c.toUpperCase().includes('MUST NOT'));
    if (!hasMustNot) {
      warnings.push({
        field: 'constraints',
        message: 'Constraints should include "MUST NOT" statements for clarity',
        severity: 'warning'
      });
    }
  }

  // 6. File scope validation
  logger.debug({
    category: 'utility',
    action: 'validate_file_scope',
    message: 'Validating file scope and creation restrictions',
    details: {
      filesCount: template.files?.length || 0,
      doNotCreateCount: template.doNotCreate?.length || 0,
      hasDoNotCreate: !!template.doNotCreate
    }
  });
  if (!Array.isArray(template.files) || template.files.length === 0) {
    errors.push({
      field: 'files',
      message: 'Files array required to scope work',
      severity: 'error'
    });
  }

  if (!Array.isArray(template.doNotCreate)) {
    warnings.push({
      field: 'doNotCreate',
      message: 'Recommended: specify files that MUST NOT be created to prevent duplication',
      severity: 'warning'
    });
  } else if (template.doNotCreate.length > 0) {
    // Validate format (should include explanations)
    const hasExplanations = template.doNotCreate.every(f => f.includes('(') && f.includes(')'));
    if (!hasExplanations) {
      warnings.push({
        field: 'doNotCreate',
        message: 'doNotCreate entries should include explanations in parentheses',
        severity: 'warning'
      });
    }
  }

  // 7. Git workflow validation
  logger.debug({
    category: 'utility',
    action: 'validate_git_workflow',
    message: 'Validating git workflow configuration',
    details: {
      hasGitWorkflow: !!template.gitWorkflow,
      required: template.gitWorkflow?.required,
      branch: template.gitWorkflow?.branch
    }
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
  logger.debug({
    category: 'utility',
    action: 'validate_metadata',
    message: 'Validating template metadata and v3 compliance flags',
    details: {
      hasMetadata: !!template.metadata,
      version: template.metadata?.promptEngineeringVersion,
      strictScopeEnforcement: template.metadata?.strictScopeEnforcement,
      mandatoryInvestigation: template.metadata?.mandatoryInvestigation
    }
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

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
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
export function isV3Template(template: any): template is TaskTemplateV3 {
  return Boolean(
    template &&
    typeof template === 'object' &&
    template.investigation &&
    Array.isArray(template.preImplementationChecklist) &&
    Array.isArray(template.constraints) &&
    template.gitWorkflow
  );
}
