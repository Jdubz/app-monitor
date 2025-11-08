import { describe, it, expect } from 'vitest';
import {
  validateTaskTemplate,
  formatValidationErrors,
  isV3Template,
  shouldValidateAsV3Template,
  type TaskTemplateV3
} from './taskTemplateValidator.js';

const baseTemplate: TaskTemplateV3 = {
  type: 'implementation',
  title: 'Base Task',
  description: 'Base template for validator unit tests',
  investigation: {
    required: true,
    steps: [
      'READ backend/src/services/example.ts to understand current behavior',
      'GREP for exampleFunction across backend/src',
      'CHECK docs/dev-bots/TASK_PROMPT_TEMPLATE.md for requirements',
      'VERIFY there is no duplicate implementation before coding'
    ],
    mustFind: ['Existing example implementation'],
    mustNotDuplicate: ['Shared helper utilities']
  },
  preImplementationChecklist: [
    '[ ] Read example.ts',
    '[ ] Grep for exampleFunction',
    '[ ] Verify no duplicates exist'
  ],
  acceptanceCriteria: [
    'EXACTLY one code path updated',
    'DO NOT add any additional behavior'
  ],
  constraints: [
    'MUST follow existing code patterns',
    'MUST NOT create new files'
  ],
  files: ['backend/src/services/example.ts'],
  doNotCreate: ['backend/src/services/exampleHelper.ts (extend existing service)'],
  gitWorkflow: { required: true, branch: 'main', commitMessage: 'test 🤖' }
};

const buildTemplate = (overrides: Partial<TaskTemplateV3> = {}): Partial<TaskTemplateV3> => ({
  ...baseTemplate,
  ...overrides
});

 ...
