#!/usr/bin/env python3
import re

# Read file
with open('src/services/devBotsManager.ts', 'r') as f:
    lines = f.readlines()

# Field mappings
jsdoc = {
    '  id: string;': '  /** @type {string} Unique identifier for the task */\n  id: string;\n',
    '  type: string;': '  /** @type {string} Type of task (e.g., implementation, bug fix, refactoring) */\n  type: string;\n',
    '  title: string;': '  /** @type {string} Specific task title */\n  title: string;\n',
    '  description?: string;': '  /** @type {string} Task description providing context and requirements */\n  description?: string;\n',
    '  documentation?: string;': '  /** @type {string} Documentation the worker should read before starting */\n  documentation?: string;\n',
    '  notes?: string;': '  /** @type {string} Optional additional notes or context */\n  notes?: string;\n',
    '  status: TaskStatus;': '  /** @type {TaskStatus} Current status of the task */\n  status: TaskStatus;\n',
    '  createdAt: string;': '  /** @type {string} ISO timestamp when the task was created */\n  createdAt: string;\n',
    '  assignedWorker?: string;': '  /** @type {string} ID of the worker assigned to this task */\n  assignedWorker?: string;\n',
    '  assignedAgent: string;': '  /** @type {string} Assigned agent personality (required) */\n  assignedAgent: string;\n',
    '  assignedAt?: string;': '  /** @type {string} ISO timestamp when the task was assigned */\n  assignedAt?: string;\n',
    '  completedAt?: string;': '  /** @type {string} ISO timestamp when the task was completed */\n  completedAt?: string;\n',
    '  output?: string;': '  /** @type {string} Task execution output or results */\n  output?: string;\n',
    '  error?: string;': '  /** @type {string} Error message if task failed */\n  error?: string;\n',
    '  exitCode?: number;': '  /** @type {number} Exit code from task execution */\n  exitCode?: number;\n',
    '  prompt?: string;': '  /** @type {string} Generated prompt for the task */\n  prompt?: string;\n',
    '  files?: string[];': '  /** @type {string[]} Files to be modified by this task */\n  files?: string[];\n',
    '  dependencies?: string[];': '  /** @type {string[]} Task dependencies (other task IDs) */\n  dependencies?: string[];\n',
    '  project?: string;': '  /** @type {string} Target project for this task */\n  project?: string;\n',
    '  qualityValidation?: QualityValidationResult;': '  /** @type {QualityValidationResult} Quality gate validation results */\n  qualityValidation?: QualityValidationResult;\n',
    '  retryCount?: number;': '  /** @type {number} Number of retry attempts made */\n  retryCount?: number;\n',
    '  maxRetries?: number;': '  /** @type {number} Maximum number of retries allowed */\n  maxRetries?: number;\n',
    '  retryDelay?: number;': '  /** @type {number} Delay in milliseconds before retry */\n  retryDelay?: number;\n',
    '  retryReason?: string;': '  /** @type {string} Reason for the retry */\n  retryReason?: string;\n',
    '  retryHistory?: RetryAttempt[];': '  /** @type {RetryAttempt[]} History of retry attempts */\n  retryHistory?: RetryAttempt[];\n',
    '  canRetry?: boolean;': '  /** @type {boolean} Whether this task can be retried */\n  canRetry?: boolean;\n',
    "  retryStrategy?: 'immediate' | 'exponential' | 'linear' | 'manual';": "  /** @type {'immediate' | 'exponential' | 'linear' | 'manual'} Retry strategy */\n  retryStrategy?: 'immediate' | 'exponential' | 'linear' | 'manual';\n",
    '  acceptanceCriteria?: string[];': '  /** @type {string[]} Explicit acceptance criteria */\n  acceptanceCriteria?: string[];\n',
    '  architectureReferences?: string[];': '  /** @type {string[]} Architecture documentation references */\n  architectureReferences?: string[];\n',
    '  longTermGoals?: string[];': '  /** @type {string[]} Connection to larger initiatives */\n  longTermGoals?: string[];\n',
    '  estimatedEffort?: {': '  /** @type {object} Effort estimation for task completion */\n  estimatedEffort?: {\n',
    '  prerequisites?: string[];': '  /** @type {string[]} Required knowledge or setup before starting */\n  prerequisites?: string[];\n',
    '  contextBoundaries?: {': '  /** @type {object} Boundaries defining what must not be changed */\n  contextBoundaries?: {\n',
    '  validationSteps?: string[];': '  /** @type {string[]} Steps to verify task completion */\n  validationSteps?: string[];\n',
    '  rollbackPlan?: string[];': '  /** @type {string[]} Actions to take if things go wrong */\n  rollbackPlan?: string[];\n',
    '  successMetrics?: string[];': '  /** @type {string[]} Measurable outcomes defining success */\n  successMetrics?: string[];\n',
    '  testingRequirements?: string[];': '  /** @type {string[]} Testing requirements for this task */\n  testingRequirements?: string[];\n',
    '  documentationRequirements?: string[];': '  /** @type {string[]} Documentation requirements for this task */\n  documentationRequirements?: string[];\n',
    '  requiredSkills?: string[];': '  /** @type {string[]} Required agent skills */\n  requiredSkills?: string[];\n',
    '  parentInitiative?: string;': '  /** @type {string} Parent initiative or project */\n  parentInitiative?: string;\n',
    '  relatedTasks?: string[];': '  /** @type {string[]} Related task IDs */\n  relatedTasks?: string[];\n',
    '  blockers?: string[];': '  /** @type {string[]} Blocking issues */\n  blockers?: string[];\n',
    '  assumptions?: string[];': '  /** @type {string[]} Documented assumptions */\n  assumptions?: string[];\n',
    '  risks?: string[];': '  /** @type {string[]} Identified risks */\n  risks?: string[];\n',
    '  alternatives?: string[];': '  /** @type {string[]} Alternative approaches considered */\n  alternatives?: string[];\n',
    '  scope?: {': '  /** @type {object} Scope constraints for task execution */\n  scope?: {\n',
    '  isEmergency?: boolean;': '  /** @type {boolean} Whether this is an emergency task */\n  isEmergency?: boolean;\n',
    '  chainId?: string;': '  /** @type {string} Chain ID for task sequencing */\n  chainId?: string;\n',
}

# Process
result = []
in_task = False
for i, line in enumerate(lines):
    # Start of Task interface
    if 'export interface Task {' in line:
        in_task = True
        result.append(line)
        continue

    # End of Task interface (closing brace at column 0)
    if in_task and line.strip() == '}':
        in_task = False
        result.append(line)
        continue

    # Inside Task interface - add JSDoc if missing
    if in_task:
        # Remove inline comments
        clean_line = line.split('//')[0].rstrip() + '\n' if '//' in line else line

        # Check if we need to add JSDoc
        if clean_line.rstrip() in jsdoc and (i == 0 or '/**' not in lines[i-1]):
            result.append(jsdoc[clean_line.rstrip()] if clean_line.rstrip() in jsdoc else clean_line)
        else:
            result.append(line)
    else:
        result.append(line)

# Write
with open('src/services/devBotsManager.ts', 'w') as f:
    f.writelines(result)

print("SUCCESS: JSDoc comments added to all Task interface fields")
