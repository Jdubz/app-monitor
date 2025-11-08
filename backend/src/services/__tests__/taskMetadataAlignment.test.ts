import { describe, it, expect } from 'vitest';
import { TaskPromptTemplateManager } from '../taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from '../taskCreationGuidelines.js';
import {
  getTaskMetadataTemplateVariables,
  getCanonicalTaskMetadataKeys
} from '../taskMetadataFields.js';

describe('Task metadata alignment', () => {
  it('Template exposes every canonical metadata variable', () => {
    const templateManager = new TaskPromptTemplateManager();
    const templateVariables = templateManager.getTemplate().variables;
    const metadataVariables = getTaskMetadataTemplateVariables();

    metadataVariables.forEach((variable) => {
      expect(templateVariables).toContain(variable);
    });
  });

  it('Guidelines only reference canonical metadata fields', () => {
    const guidelinesManager = new TaskCreationGuidelinesManager();
    const canonicalFieldSet = new Set(getCanonicalTaskMetadataKeys());

    guidelinesManager.getAllGuidelines().forEach((guideline) => {
      [...guideline.requiredFields, ...guideline.optionalFields].forEach((field) => {
        expect(canonicalFieldSet.has(field)).toBe(true);
      });
    });
  });
});
