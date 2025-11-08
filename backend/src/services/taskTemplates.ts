/**
 * Task Template Library (v3)
 *
 * Pre-built task templates for common patterns that enforce v3 compliance.
 * Each template includes mandatory investigation, strict scope control, and duplicate prevention.
 *
 * @see docs/plans/BOT_PROMPT_ENGINEERING_V3.md
 */

import type { TaskTemplateV3 } from './taskTemplateValidator.js';

export interface MigrationTemplateParams {
  title: string;
  description: string;
  schemaFile: string;
  tableName: string;
  columns: string[];
  existingMigrationFile: string;
  typeFile?: string;
}

export interface ExtensionTemplateParams {
  title: string;
  description: string;
  baseFile: string;
  newFunctionality: string;
  existingFunctions: string[];
  doNotDuplicate: string[];
}

export interface BugfixTemplateParams {
  title: string;
  description: string;
  errorMessage: string;
  affectedFiles: string[];
  rootCause: string;
  relatedTests?: string[];
}

export interface RefactorTemplateParams {
  title: string;
  description: string;
  targetFiles: string[];
  pattern: string;
  replacement: string;
  testFiles: string[];
}

/**
 * Create a database migration task template
 *
 * Use this for: Adding tables, columns, indexes, or modifying schema
 */
export function createMigrationTaskTemplate(params: MigrationTemplateParams): TaskTemplateV3 {
  const {
    title,
    description,
    schemaFile,
    tableName,
    columns,
    existingMigrationFile,
    typeFile
  } = params;

  return {
    type: 'migration',
    title,
    description,

    investigation: {
      required: true,
      steps: [
        `READ ${existingMigrationFile} to understand current migration pattern`,
        `READ ${schemaFile} to see ${tableName} table structure`,
        `GREP for '${tableName}' in backend/src to find all references`,
        typeFile ? `CHECK ${typeFile} for existing type definitions` : 'CHECK for related type definitions',
        `VERIFY no duplicate migration files exist`,
        `VERIFY no duplicate columns exist in ${tableName} table`
      ],
      mustFind: [
        `Current ${tableName} table schema`,
        'Existing migration pattern',
        'Type definitions for table'
      ],
      mustNotDuplicate: [
        'Migration runner logic',
        'Database connection code',
        'Schema validation functions'
      ]
    },

    preImplementationChecklist: [
      `[ ] Read ${existingMigrationFile} to understand migration pattern`,
      `[ ] Read ${schemaFile} to see current ${tableName} schema`,
      typeFile ? `[ ] Check ${typeFile} for type definitions` : '[ ] Check for type definitions',
      `[ ] Grep for '${tableName}' to find all table references`,
      `[ ] Verify no duplicate columns: ${columns.join(', ')}`,
      `[ ] Confirm migration pattern to follow`,
      `[ ] Review tests to understand current behavior`
    ],

    acceptanceCriteria: [
      `EXACTLY ${columns.length} column(s) added to ${tableName} table: ${columns.join(', ')}`,
      `Columns added via ALTER TABLE statement in new migration file`,
      `MUST NOT create new tables (extend existing ${tableName} only)`,
      `MUST NOT create duplicate columns`,
      `Migration follows EXACT pattern from ${existingMigrationFile}`,
      typeFile ? `Type interface updated in ${typeFile}` : 'Type interface updated',
      `All existing tests pass`,
      `DO NOT add features beyond specified columns`
    ],

    constraints: [
      `MUST use existing migration pattern from ${existingMigrationFile}`,
      `MUST NOT create any new tables`,
      `MUST NOT modify any test files`,
      `MUST NOT add features beyond ${columns.length} column(s)`,
      `MUST NOT refactor existing code`,
      `MUST use existing TypeScript types and interfaces`,
      `MUST NOT add indexes, triggers, or constraints unless specified`
    ],

    files: [
      schemaFile,
      existingMigrationFile,
      ...(typeFile ? [typeFile] : [])
    ],

    modifyOnly: [
      schemaFile,
      ...(typeFile ? [typeFile] : [])
    ],

    doNotModify: [
      existingMigrationFile,
      'backend/src/services/database.test.ts',
      'backend/src/types/taskSchema.test.ts'
    ],

    doNotCreate: [
      `backend/migrations/${tableName}_new.sql (extend existing table, don't recreate)`,
      `backend/src/types/${tableName}Types.ts (add to existing type file)`,
      `backend/src/services/${tableName}Repository.ts (use existing persistence layer)`
    ],

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `feat: add ${columns.join(', ')} to ${tableName} table\n\nExtends existing ${tableName} table with specified columns.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`
    },

    assignedAgent: 'backend-specialist',
    priority: 7,

    estimatedEffort: {
      hours: 0.5,
      complexity: 'simple',
      confidence: 'high'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true,
      templateType: 'migration'
    }
  };
}

/**
 * Create an extension/feature task template
 *
 * Use this for: Adding new functionality to existing files
 */
export function createExtensionTaskTemplate(params: ExtensionTemplateParams): TaskTemplateV3 {
  const {
    title,
    description,
    baseFile,
    newFunctionality,
    existingFunctions,
    doNotDuplicate
  } = params;

  return {
    type: 'extension',
    title,
    description,

    investigation: {
      required: true,
      steps: [
        `READ ${baseFile} to understand existing implementation`,
        `GREP for similar functionality across codebase`,
        `CHECK for utility functions that can be reused`,
        `VERIFY no duplicate implementations of ${newFunctionality}`,
        `CHECK existing patterns to follow`,
        `REVIEW related tests to understand current behavior`
      ],
      mustFind: existingFunctions,
      mustNotDuplicate: doNotDuplicate
    },

    preImplementationChecklist: [
      `[ ] Read ${baseFile} to understand structure`,
      `[ ] Search codebase for similar ${newFunctionality}`,
      `[ ] Identify existing utility functions to reuse`,
      `[ ] Verify no duplicate implementations exist`,
      `[ ] Check if requested feature already exists`,
      `[ ] Review tests for current behavior`,
      `[ ] Document existing code to extend`
    ],

    acceptanceCriteria: [
      `EXACTLY the ${newFunctionality} functionality added`,
      `Functionality added to existing ${baseFile} (MUST NOT create new files)`,
      `Follows existing code patterns in ${baseFile}`,
      `Reuses existing utility functions where possible`,
      `MUST NOT create duplicate implementations`,
      `All existing tests pass`,
      `DO NOT add features beyond ${newFunctionality}`
    ],

    constraints: [
      `MUST extend existing ${baseFile}`,
      `MUST NOT create new files`,
      `MUST reuse existing utility functions`,
      `MUST follow existing code patterns`,
      `MUST NOT duplicate ${doNotDuplicate.join(', ')}`,
      `MUST NOT add features beyond ${newFunctionality}`,
      `MUST NOT refactor existing code unless required`
    ],

    files: [
      baseFile,
      `${baseFile.replace(/\.ts$/, '.test.ts')}`
    ],

    modifyOnly: [baseFile],

    doNotModify: [
      ...existingFunctions.map(f => `Existing ${f} function (extend, don't modify)`)
    ],

    doNotCreate: doNotDuplicate.map(item =>
      `${item} (extend existing code instead)`
    ),

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `feat: add ${newFunctionality} to ${baseFile}\n\nExtends existing functionality without duplication.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`
    },

    assignedAgent: 'general-purpose',
    priority: 5,

    estimatedEffort: {
      hours: 1,
      complexity: 'moderate',
      confidence: 'medium'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true,
      templateType: 'extension'
    }
  };
}

/**
 * Create a bugfix task template
 *
 * Use this for: Fixing errors, crashes, or incorrect behavior
 */
export function createBugfixTaskTemplate(params: BugfixTemplateParams): TaskTemplateV3 {
  const {
    title,
    description,
    errorMessage,
    affectedFiles,
    rootCause,
    relatedTests
  } = params;

  return {
    type: 'bugfix',
    title,
    description: `${description}\n\nError: ${errorMessage}\n\nRoot Cause: ${rootCause}`,

    investigation: {
      required: true,
      steps: [
        ...affectedFiles.map(f => `READ ${f} to understand current implementation`),
        `GREP for error pattern: "${errorMessage}"`,
        `CHECK for similar error handling in codebase`,
        `VERIFY root cause: ${rootCause}`,
        `CHECK related code that might be affected`,
        ...(relatedTests ? relatedTests.map(t => `REVIEW ${t} for reproduction steps`) : [])
      ],
      mustFind: [
        'Source of error',
        'Root cause location',
        'Related error handling patterns'
      ],
      mustNotDuplicate: [
        'Error handling logic',
        'Validation functions',
        'Logging code'
      ]
    },

    preImplementationChecklist: [
      ...affectedFiles.map(f => `[ ] Read ${f} to find error source`),
      `[ ] Reproduce error: "${errorMessage}"`,
      `[ ] Confirm root cause: ${rootCause}`,
      `[ ] Check for similar fixes in codebase`,
      `[ ] Identify all affected code paths`,
      ...(relatedTests ? [`[ ] Review tests: ${relatedTests.join(', ')}`] : []),
      `[ ] Plan minimal fix without side effects`
    ],

    acceptanceCriteria: [
      `Error "${errorMessage}" is fixed`,
      `Root cause "${rootCause}" is addressed`,
      `EXACTLY the bugfix implemented (MUST NOT add features)`,
      `Minimal changes made (< 20 lines)`,
      `All existing tests pass`,
      `MUST NOT introduce new bugs`,
      ...(relatedTests ? [`Tests ${relatedTests.join(', ')} now pass`] : []),
      `DO NOT refactor beyond the fix`
    ],

    constraints: [
      `MUST fix ONLY the reported bug`,
      `MUST make minimal changes`,
      `MUST NOT add new features`,
      `MUST NOT refactor unrelated code`,
      `MUST NOT modify test files unless fixing test bug`,
      `MUST keep changes under 20 lines if possible`,
      `MUST reuse existing error handling patterns`
    ],

    files: affectedFiles,

    modifyOnly: affectedFiles,

    doNotModify: [
      ...(relatedTests || []).map(t => `${t} (unless fixing test bug)`),
      'Unrelated code paths'
    ],

    doNotCreate: [
      'New error handling utilities (use existing)',
      'New validation functions (extend existing)',
      'New logging functions (use existing logger)'
    ],

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `fix: ${title.toLowerCase()}\n\nFixes: ${errorMessage}\nRoot cause: ${rootCause}\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`
    },

    assignedAgent: 'general-purpose',
    priority: 8,

    estimatedEffort: {
      hours: 0.5,
      complexity: 'simple',
      confidence: 'high'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true,
      templateType: 'bugfix'
    }
  };
}

/**
 * Create a refactor task template
 *
 * Use this for: Improving code structure without changing behavior
 */
export function createRefactorTaskTemplate(params: RefactorTemplateParams): TaskTemplateV3 {
  const {
    title,
    description,
    targetFiles,
    pattern,
    replacement,
    testFiles
  } = params;

  return {
    type: 'refactor',
    title,
    description: `${description}\n\nPattern: ${pattern}\nReplacement: ${replacement}`,

    investigation: {
      required: true,
      steps: [
        ...targetFiles.map(f => `READ ${f} to understand current implementation`),
        `GREP for pattern "${pattern}" across codebase`,
        `CHECK for other occurrences of this pattern`,
        `VERIFY behavior will not change`,
        ...testFiles.map(t => `REVIEW ${t} to understand expected behavior`),
        `CHECK all affected code paths`
      ],
      mustFind: [
        `All occurrences of pattern: ${pattern}`,
        'Current behavior to preserve',
        'Related test coverage'
      ],
      mustNotDuplicate: [
        'Testing logic',
        'Validation functions',
        'Utility functions'
      ]
    },

    preImplementationChecklist: [
      ...targetFiles.map(f => `[ ] Read ${f} completely`),
      `[ ] Find all occurrences of "${pattern}"`,
      `[ ] Verify behavior will not change`,
      ...testFiles.map(t => `[ ] Review ${t} for expected behavior`),
      `[ ] Plan refactoring steps`,
      `[ ] Confirm tests will catch regressions`,
      `[ ] Document behavior to preserve`
    ],

    acceptanceCriteria: [
      `Pattern "${pattern}" replaced with "${replacement}"`,
      `Behavior EXACTLY the same (no functional changes)`,
      `ALL existing tests pass without modification`,
      `ONLY specified pattern refactored (MUST NOT expand scope)`,
      `Code structure improved`,
      `MUST NOT add new functionality`,
      `Documentation updated if needed`
    ],

    constraints: [
      `MUST preserve existing behavior 100%`,
      `MUST NOT change functionality`,
      `MUST NOT modify tests (they verify behavior preservation)`,
      `MUST refactor ONLY specified pattern`,
      `MUST NOT add new features`,
      `MUST keep refactoring focused and minimal`,
      `MUST verify all tests pass before and after`
    ],

    files: [
      ...targetFiles,
      ...testFiles
    ],

    modifyOnly: targetFiles,

    doNotModify: [
      ...testFiles.map(t => `${t} (tests verify behavior)`),
      'Unrelated code paths'
    ],

    doNotCreate: [
      'New utility functions (use existing)',
      'New test files (use existing tests)',
      'New helper functions (refactor existing instead)'
    ],

    gitWorkflow: {
      required: true,
      branch: 'staging',
      commitMessage: `refactor: ${title.toLowerCase()}\n\nReplaces "${pattern}" with "${replacement}" without behavior changes.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>`
    },

    assignedAgent: 'general-purpose',
    priority: 4,

    estimatedEffort: {
      hours: 1.5,
      complexity: 'moderate',
      confidence: 'medium'
    },

    metadata: {
      promptEngineeringVersion: 'v3',
      strictScopeEnforcement: true,
      mandatoryInvestigation: true,
      duplicateProtection: true,
      templateType: 'refactor'
    }
  };
}
