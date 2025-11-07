#!/usr/bin/env python3
"""Add JSDoc comments to ALL Task interface fields"""

file_path = '/workspace/backend/src/services/devBotsManager.ts'

# Mapping of each line pattern to its JSDoc comment
replacements = [
    # Basic fields
    ('  id: string;', '  /** @type {string} Unique identifier for the task */\n  id: string;'),
    ('  type: string;', '  /** @type {string} Type of task (e.g., implementation, bugfix, refactor) */\n  type: string;'),
    ('  title: string; // Specific task title', '  /** @type {string} Specific task title */\n  title: string;'),
    ('  description?: string; // Task description', '  /** @type {string} Detailed task description */\n  description?: string;'),
    ('  documentation?: string; // What the worker should read before starting', '  /** @type {string} Documentation the worker should read before starting */\n  documentation?: string;'),
    ('  notes?: string; // Optional: additional notes or context', '  /** @type {string} Additional notes or context */\n  notes?: string;'),
    ("  status: 'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'retrying';", "  /** @type {'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'retrying'} Current task status */\n  status: 'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'retrying';"),
    ('  createdAt: string;', '  /** @type {string} ISO timestamp when task was created */\n  createdAt: string;'),
    ('  assignedWorker?: string;', '  /** @type {string} ID of the worker assigned to this task */\n  assignedWorker?: string;'),
    ('  assignedAgent: string; // Assigned agent personality (required)', '  /** @type {string} Assigned agent personality (required) */\n  assignedAgent: string;'),
    ('  assignedAt?: string;', '  /** @type {string} ISO timestamp when task was assigned */\n  assignedAt?: string;'),
    ('  completedAt?: string;', '  /** @type {string} ISO timestamp when task was completed */\n  completedAt?: string;'),
    ('  output?: string;', '  /** @type {string} Task execution output or result */\n  output?: string;'),
    ('  error?: string;', '  /** @type {string} Error message if task failed */\n  error?: string;'),
    ('  exitCode?: number;', '  /** @type {number} Exit code from task execution */\n  exitCode?: number;'),
    ('  prompt?: string; // Generated prompt for the task', '  /** @type {string} Generated prompt for the task */\n  prompt?: string;'),
    ('  files?: string[]; // Files to be modified', '  /** @type {string[]} Files to be modified by this task */\n  files?: string[];'),
    ('  dependencies?: string[]; // Task dependencies', '  /** @type {string[]} Task dependencies (IDs of prerequisite tasks) */\n  dependencies?: string[];'),
    ('  project?: string; // Target project', '  /** @type {string} Target project for this task */\n  project?: string;'),
    ('  qualityValidation?: QualityValidationResult; // Quality gate validation results', '  /** @type {QualityValidationResult} Quality gate validation results */\n  qualityValidation?: QualityValidationResult;'),

    # Retry fields
    ('  retryCount?: number; // Number of retry attempts made', '  /** @type {number} Number of retry attempts made */\n  retryCount?: number;'),
    ('  maxRetries?: number; // Maximum number of retries allowed', '  /** @type {number} Maximum number of retries allowed */\n  maxRetries?: number;'),
    ('  retryDelay?: number; // Delay in milliseconds before retry', '  /** @type {number} Delay in milliseconds before retry */\n  retryDelay?: number;'),
    ('  retryReason?: string; // Reason for the retry', '  /** @type {string} Reason for the retry */\n  retryReason?: string;'),
    ('  retryHistory?: RetryAttempt[]; // History of retry attempts', '  /** @type {RetryAttempt[]} History of retry attempts */\n  retryHistory?: RetryAttempt[];'),
    ('  canRetry?: boolean; // Whether this task can be retried', '  /** @type {boolean} Whether this task can be retried */\n  canRetry?: boolean;'),
    ("  retryStrategy?: 'immediate' | 'exponential' | 'linear' | 'manual'; // Retry strategy", "  /** @type {'immediate' | 'exponential' | 'linear' | 'manual'} Retry strategy */\n  retryStrategy?: 'immediate' | 'exponential' | 'linear' | 'manual';"),

    # Enhanced specification fields
    ('  acceptanceCriteria?: string[]; // Explicit acceptance criteria (array of criteria)', '  /** @type {string[]} Explicit acceptance criteria (array of criteria) */\n  acceptanceCriteria?: string[];'),
    ('  architectureReferences?: string[]; // New: architecture documentation references', '  /** @type {string[]} Architecture documentation references */\n  architectureReferences?: string[];'),
    ('  longTermGoals?: string[]; // New: connection to larger initiatives', '  /** @type {string[]} Connection to larger initiatives */\n  longTermGoals?: string[];'),
    ('  estimatedEffort?: { // New: effort estimation', '  /** @type {object} Effort estimation details */\n  estimatedEffort?: {'),
    ('  prerequisites?: string[]; // New: required knowledge/setup', '  /** @type {string[]} Required knowledge or setup before starting */\n  prerequisites?: string[];'),
    ('  contextBoundaries?: { // New: what not to change', '  /** @type {object} Context boundaries defining what not to change */\n  contextBoundaries?: {'),
    ('  validationSteps?: string[]; // New: how to verify completion', '  /** @type {string[]} Steps to verify task completion */\n  validationSteps?: string[];'),
    ('  rollbackPlan?: string[]; // New: what to do if things go wrong', '  /** @type {string[]} What to do if things go wrong */\n  rollbackPlan?: string[];'),
    ('  successMetrics?: string[]; // New: measurable outcomes', '  /** @type {string[]} Measurable outcomes defining success */\n  successMetrics?: string[];'),
    ('  testingRequirements?: string[]; // New: testing requirements', '  /** @type {string[]} Testing requirements for this task */\n  testingRequirements?: string[];'),
    ('  documentationRequirements?: string[]; // New: documentation requirements', '  /** @type {string[]} Documentation requirements for this task */\n  documentationRequirements?: string[];'),
    ('  requiredSkills?: string[]; // New: required agent skills', '  /** @type {string[]} Required agent skills and expertise */\n  requiredSkills?: string[];'),
    ('  parentInitiative?: string; // New: parent initiative or project', '  /** @type {string} Parent initiative or project ID */\n  parentInitiative?: string;'),
    ('  relatedTasks?: string[]; // New: related task IDs', '  /** @type {string[]} Related task IDs */\n  relatedTasks?: string[];'),
    ('  blockers?: string[]; // New: blocking issues', '  /** @type {string[]} Blocking issues preventing task completion */\n  blockers?: string[];'),
    ('  assumptions?: string[]; // New: documented assumptions', '  /** @type {string[]} Documented assumptions for this task */\n  assumptions?: string[];'),
    ('  risks?: string[]; // New: identified risks', '  /** @type {string[]} Identified risks associated with this task */\n  risks?: string[];'),
    ('  alternatives?: string[]; // New: alternative approaches', '  /** @type {string[]} Alternative approaches considered */\n  alternatives?: string[];'),

    # Scope object
    ('  scope?: {', '  /** @type {object} Scope definition and constraints */\n  scope?: {'),
    ('  isEmergency?: boolean;', '  /** @type {boolean} Whether this is an emergency task */\n  isEmergency?: boolean;'),
    ('  chainId?: string;', '  /** @type {string} Chain ID for grouped tasks */\n  chainId?: string;'),
]

# Read file
with open(file_path, 'r') as f:
    content = f.read()

# Apply all replacements
for old, new in replacements:
    content = content.replace(old, new)

# Write back
with open(file_path, 'w') as f:
    f.write(content)

print('JSDoc comments added successfully to all Task interface fields!')
