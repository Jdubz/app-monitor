/**
 * Task Creation Template v3
 *
 * Enforces strict prompt engineering rules to prevent:
 * 1. Feature invention (scope creep)
 * 2. Code duplication (reimplementing existing functionality)
 * 3. Skipping investigation (not reviewing existing code)
 *
 * This template MUST be used for all bot tasks.
 */

export interface TaskInvestigation {
  /** Investigation is REQUIRED for all tasks */
  required: true;

  /** Explicit READ/GREP/CHECK commands the bot must execute BEFORE coding */
  steps: string[];

  /** Existing code/patterns the bot MUST locate and understand */
  mustFind: string[];

  /** Existing functionality the bot MUST NOT reimplement */
  mustNotDuplicate: string[];
}

export interface TaskConstraints {
  /** Actions the bot MUST perform (use specific action verbs) */
  must: string[];

  /** Actions the bot MUST NOT perform (prevents scope creep) */
  mustNot: string[];

  /** Exact counts/names for countable deliverables (prevents extras) */
  exactDeliverables?: {
    [key: string]: string[] | number;
  };
}

export interface TaskGitWorkflow {
  /** Git workflow is REQUIRED for all implementation tasks */
  required: true;

  /** Target branch (usually "staging") */
  branch: string;

  /** Exact commit message template */
  commitMessage: string;

  /** Files that MUST be included in commit */
  mustCommit: string[];

  /** Files that MUST NOT be committed (safety check) */
  mustNotCommit: string[];
}

export interface TaskTemplateV3 {
  // ============================================================================
  // BASIC INFO
  // ============================================================================

  type: 'feature' | 'bug' | 'refactor' | 'implementation' | 'test' | 'documentation';

  /** Clear, specific title with action verb (CREATE, MODIFY, EXTEND, etc.) */
  title: string;

  /** What to do and WHY (not just what) */
  description: string;

  // ============================================================================
  // MANDATORY INVESTIGATION (ALWAYS REQUIRED)
  // ============================================================================

  /**
   * INVESTIGATION IS MANDATORY FOR ALL TASKS
   * Bots MUST investigate existing code BEFORE implementing anything
   */
  investigation: TaskInvestigation;

  // ============================================================================
  // DOCUMENTATION & CONTEXT
  // ============================================================================

  /**
   * Exactly WHERE to look and WHAT existing code to extend/modify
   * Use specific line numbers and file paths
   *
   * Example: "READ backend/src/services/database.ts lines 150-200 for migration pattern.
   *           EXTEND existing tasks table, do NOT create new table."
   */
  documentation: string;

  // ============================================================================
  // STRICT ACCEPTANCE CRITERIA
  // ============================================================================

  /**
   * Use "EXACTLY" for countable items
   * List specific names, not just counts
   * Include negative criteria (what NOT to do)
   *
   * Example:
   * - "EXACTLY these 6 tables created: tasks, task_files, ..." (list all)
   * - "DO NOT create task_tags table"
   * - "MUST use existing errorMiddleware.ts"
   */
  acceptanceCriteria: string[];

  // ============================================================================
  // FILE SCOPE CONTROL (PREVENTS DUPLICATION)
  // ============================================================================

  /**
   * All files to READ/INVESTIGATE (may be more than modifyOnly)
   * Bots will read these to understand existing patterns
   */
  files: string[];

  /**
   * ONLY files that can be MODIFIED
   * Any file not in this list CANNOT be changed
   */
  modifyOnly: string[];

  /**
   * Files that MUST NOT be modified (safety net)
   * Explicitly protected files even if in files array
   */
  doNotModify: string[];

  /**
   * Files/patterns that MUST NOT be created (prevents duplication)
   * Include reason WHY each file should not be created
   *
   * Example:
   * - "backend/src/services/taskRepository.ts (use existing taskPersistence.ts instead)"
   * - "backend/src/utils/taskHelpers.ts (extend existing helpers.ts)"
   */
  doNotCreate: string[];

  // ============================================================================
  // EXPLICIT CONSTRAINTS (STRICT RULES)
  // ============================================================================

  /**
   * MUST and MUST NOT rules
   * Prevents scope creep and ensures existing patterns are followed
   */
  constraints: TaskConstraints;

  // ============================================================================
  // PRE-IMPLEMENTATION CHECKLIST
  // ============================================================================

  /**
   * Checklist bot must complete BEFORE writing any code
   * Bot will verify each item is complete
   */
  preImplementationChecklist: string[];

  // ============================================================================
  // GIT WORKFLOW (MANDATORY FOR IMPLEMENTATION)
  // ============================================================================

  /**
   * Git workflow is REQUIRED for all implementation tasks
   * Specifies exactly how to commit and what to include
   */
  gitWorkflow?: TaskGitWorkflow;

  // ============================================================================
  // METADATA
  // ============================================================================

  assignedAgent: 'backend-specialist' | 'frontend-specialist' | 'fullstack-specialist' | 'database-specialist';
  priority?: number;

  estimatedEffort?: {
    hours: number;
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';
    confidence: 'low' | 'medium' | 'high';
  };

  /**
   * Template version metadata
   * MUST always be v3 for new tasks
   */
  metadata: {
    promptEngineeringVersion: 'v3';
    strictScopeEnforcement: true;
    mandatoryInvestigation: true;
    duplicateProtection: true;
  };
}

// ============================================================================
// TEMPLATE VALIDATION
// ============================================================================

/**
 * Validates that a task follows v3 template requirements
 * Throws error if any required fields are missing or invalid
 */
export function validateTaskTemplate(task: Partial<TaskTemplateV3>): string[] {
  const errors: string[] = [];

  // Check metadata version
  if (task.metadata?.promptEngineeringVersion !== 'v3') {
    errors.push('Task must use promptEngineeringVersion: "v3"');
  }

  // MANDATORY: Investigation
  if (!task.investigation) {
    errors.push('REQUIRED: task.investigation field is mandatory for all tasks');
  } else {
    if (!task.investigation.required) {
      errors.push('task.investigation.required must be true');
    }
    if (!task.investigation.steps || task.investigation.steps.length === 0) {
      errors.push('task.investigation.steps must have at least one investigation step');
    }
    if (!task.investigation.mustFind || task.investigation.mustFind.length === 0) {
      errors.push('task.investigation.mustFind must specify existing code to locate');
    }
    if (!task.investigation.mustNotDuplicate) {
      errors.push('task.investigation.mustNotDuplicate must list functionality not to reimplement');
    }
  }

  // MANDATORY: Acceptance criteria must use "EXACTLY" for counts
  if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
    errors.push('acceptanceCriteria must have at least one criterion');
  } else {
    const hasCountableCriteria = task.acceptanceCriteria.some(
      c => /\d+\s+(table|file|function|class|component)/i.test(c)
    );
    const usesExactly = task.acceptanceCriteria.some(c => /^EXACTLY/i.test(c));

    if (hasCountableCriteria && !usesExactly) {
      errors.push('When specifying counts, use "EXACTLY X items: [list all items]" format');
    }
  }

  // MANDATORY: File scope control
  if (!task.files || task.files.length === 0) {
    errors.push('task.files must specify which files to read/investigate');
  }

  if (!task.modifyOnly || task.modifyOnly.length === 0) {
    errors.push('task.modifyOnly must specify which files can be changed');
  }

  if (!task.doNotCreate || task.doNotCreate.length === 0) {
    errors.push('task.doNotCreate must list common mistakes to prevent duplication');
  }

  // MANDATORY: Constraints
  if (!task.constraints) {
    errors.push('task.constraints is required (must/mustNot rules)');
  } else {
    if (!task.constraints.must || task.constraints.must.length === 0) {
      errors.push('task.constraints.must must have at least one MUST rule');
    }
    if (!task.constraints.mustNot || task.constraints.mustNot.length === 0) {
      errors.push('task.constraints.mustNot must have at least one MUST NOT rule');
    }
  }

  // MANDATORY: Pre-implementation checklist
  if (!task.preImplementationChecklist || task.preImplementationChecklist.length === 0) {
    errors.push('task.preImplementationChecklist is required');
  }

  // MANDATORY for implementation: Git workflow
  if (task.type === 'implementation' || task.type === 'feature' || task.type === 'bug') {
    if (!task.gitWorkflow) {
      errors.push('task.gitWorkflow is required for implementation/feature/bug tasks');
    } else if (!task.gitWorkflow.required) {
      errors.push('task.gitWorkflow.required must be true for implementation tasks');
    }
  }

  return errors;
}

// ============================================================================
// COMMON TASK TEMPLATES (PRE-FILLED WITH CONSTRAINTS)
// ============================================================================

/**
 * Template for implementing a database migration
 * Pre-filled with common constraints to prevent issues
 */
export function createMigrationTaskTemplate(
  migrationName: string,
  tables: string[],
  modifyFile: string
): TaskTemplateV3 {
  return {
    type: 'implementation',
    title: `IMPLEMENT SQLite migration ${migrationName}`,
    description: `Add migration ${migrationName} that creates EXACTLY ${tables.length} tables as specified. DO NOT add any additional tables.`,

    investigation: {
      required: true,
      steps: [
        'READ backend/src/services/database.ts to understand migration pattern',
        'READ existing migrations in backend/migrations/ to follow same structure',
        'CHECK for any existing tables that might conflict',
        'VERIFY no duplicate table definitions exist'
      ],
      mustFind: [
        'Existing migration pattern in database.ts',
        'Migration file structure and format',
        'Database initialization logic'
      ],
      mustNotDuplicate: [
        'Migration runner logic',
        'Database connection code',
        'Existing table definitions'
      ]
    },

    documentation: `READ backend/src/services/database.ts to understand migration pattern. Follow EXACT same structure as existing migrations. Create migration file in backend/migrations/ directory.`,

    acceptanceCriteria: [
      `EXACTLY these ${tables.length} tables created (no more, no less):`,
      ...tables.map(t => `- ${t}`),
      `DO NOT add any tables not listed above`,
      `Migration ${migrationName} registered in database.ts runMigrations() method`,
      'Migration follows exact pattern from existing migrations',
      'No TypeScript compilation errors',
      'Migration runs successfully on fresh database'
    ],

    files: [
      'backend/src/services/database.ts',
      'backend/migrations/*.sql'
    ],

    modifyOnly: [
      modifyFile
    ],

    doNotModify: [
      'backend/src/services/database.test.ts',
      'backend/src/types/schema.ts'
    ],

    doNotCreate: [
      'backend/migrations/*_duplicate.sql (check if similar migration exists)',
      'backend/src/services/migrationRunner.ts (use existing database.ts)',
      'backend/src/types/migrationTypes.ts (use existing types)'
    ],

    constraints: {
      must: [
        'Use existing migration pattern from database.ts',
        `Create EXACTLY ${tables.length} tables listed in acceptance criteria`,
        'Follow SQL formatting from existing migrations',
        'Include proper indexes and constraints',
        'Add migration to runMigrations() method in database.ts'
      ],
      mustNot: [
        'Create any tables not explicitly listed',
        'Modify existing migrations',
        'Change database connection logic',
        'Add "nice to have" features',
        'Refactor existing migration code'
      ],
      exactDeliverables: {
        'tables': tables,
        'modified_files': [modifyFile]
      }
    },

    preImplementationChecklist: [
      '[ ] Read database.ts to understand migration system',
      '[ ] Read existing migration files to see structure',
      '[ ] Verify listed tables don\'t already exist',
      '[ ] Confirm table names match specification exactly',
      '[ ] Check for any conflicting migrations'
    ],

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `feat: add SQLite migration ${migrationName}\n\nImplements ${tables.length} tables for task queue.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
      mustCommit: [
        modifyFile,
        `backend/migrations/${migrationName}.sql`
      ],
      mustNotCommit: [
        'backend/src/services/database.test.ts',
        'package-lock.json',
        '.env'
      ]
    },

    assignedAgent: 'backend-specialist',
    priority: 8,

    estimatedEffort: {
      hours: 1.5,
      complexity: 'moderate',
      confidence: 'high'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true
    }
  };
}

/**
 * Template for extending existing functionality
 * Emphasizes investigation and prevents duplication
 */
export function createExtensionTaskTemplate(
  feature: string,
  existingFile: string,
  relatedFiles: string[]
): TaskTemplateV3 {
  return {
    type: 'implementation',
    title: `EXTEND ${existingFile} to support ${feature}`,
    description: `Add ${feature} support to existing ${existingFile}. MUST build on existing code, DO NOT create new implementation.`,

    investigation: {
      required: true,
      steps: [
        `READ ${existingFile} to understand current implementation`,
        ...relatedFiles.map(f => `READ ${f} to understand related functionality`),
        `GREP for '${feature}' to check if feature already exists`,
        'CHECK for similar functionality that can be reused',
        'VERIFY no duplicate implementations exist'
      ],
      mustFind: [
        'Current implementation pattern in target file',
        'Existing functions/classes to extend',
        'Related utility functions to reuse',
        'Test patterns to follow'
      ],
      mustNotDuplicate: [
        'Existing validation logic',
        'Error handling patterns',
        'Database query functions',
        'Helper utilities'
      ]
    },

    documentation: `READ ${existingFile} to understand current implementation. EXTEND existing functions, do NOT create parallel implementation. REUSE existing patterns and utilities.`,

    acceptanceCriteria: [
      `${feature} functionality added to ${existingFile}`,
      'MUST use existing code patterns from the file',
      'MUST reuse existing utility functions',
      'DO NOT create new files',
      'DO NOT duplicate existing functionality',
      'All existing tests still pass'
    ],

    files: [
      existingFile,
      ...relatedFiles
    ],

    modifyOnly: [
      existingFile
    ],

    doNotModify: relatedFiles,

    doNotCreate: [
      `${existingFile.replace('.ts', 'Helper.ts')} (extend existing file instead)`,
      `${existingFile.replace('.ts', 'Utils.ts')} (use existing utility files)`,
      'Any new service files (extend existing services)'
    ],

    constraints: {
      must: [
        'Extend existing code in the target file',
        'Follow exact same patterns as existing code',
        'Reuse existing utility functions',
        'Maintain consistent code style',
        'Add tests following existing test patterns'
      ],
      mustNot: [
        'Create any new files',
        'Duplicate existing functionality',
        'Refactor existing code unless required',
        'Change existing function signatures',
        'Add dependencies not already in project'
      ]
    },

    preImplementationChecklist: [
      `[ ] Read ${existingFile} thoroughly`,
      `[ ] Identify existing functions to extend`,
      `[ ] Check if ${feature} already exists`,
      '[ ] List utility functions to reuse',
      '[ ] Verify no duplication will occur'
    ],

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `feat: add ${feature} support to ${existingFile}\n\nExtends existing implementation.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
      mustCommit: [existingFile],
      mustNotCommit: [
        'package-lock.json',
        '.env',
        'dist/*'
      ]
    },

    assignedAgent: 'backend-specialist',
    priority: 7,

    estimatedEffort: {
      hours: 1,
      complexity: 'simple',
      confidence: 'high'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true
    }
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  validateTaskTemplate,
  createMigrationTaskTemplate,
  createExtensionTaskTemplate
};
