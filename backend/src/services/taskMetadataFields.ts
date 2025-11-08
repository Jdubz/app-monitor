import type { Task } from './taskQueue.sqlite.js';

export interface EstimatedEffort {
  hours: number;
  complexity: 'simple' | 'medium' | 'complex' | 'expert';
  confidence: 'low' | 'medium' | 'high';
}

export interface TaskContextBoundaries {
  mustNotChange: string[];
  mustNotAffect: string[];
  integrationPoints: string[];
}

export interface EnhancedTaskData {
  type: string;
  title: string;
  description: string;
  project: string;
  documentation?: string;
  notes?: string;
  files: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  architectureReferences: string[];
  validationSteps: string[];
  successMetrics: string[];
  prerequisites: string[];
  contextBoundaries: TaskContextBoundaries;
  longTermGoals: string[];
  estimatedEffort: EstimatedEffort;
  testingRequirements: string[];
  documentationRequirements: string[];
  rollbackPlan: string[];
  blockers: string[];
  risks: string[];
  requiredSkills: string[];
  parentInitiative?: string;
  relatedTasks: string[];
  assumptions: string[];
  alternatives: string[];
  assignedAgent: string;
}

type TaskMetadataFieldDefinitionSeed = {
  key: string;
  label: string;
  description: string;
  queueField?: keyof Task;
  guidelineField?: keyof EnhancedTaskData;
  templateVariables: readonly string[];
};

const TASK_METADATA_FIELD_DEFINITIONS = [
  {
    key: 'type',
    label: 'Task Type',
    description: 'High-level classification such as implementation, review, or testing.',
    queueField: 'type',
    guidelineField: 'type',
    templateVariables: ['task.type']
  },
  {
    key: 'title',
    label: 'Task Title',
    description: 'Concise summary of the requested work.',
    queueField: 'title',
    guidelineField: 'title',
    templateVariables: ['task.title']
  },
  {
    key: 'description',
    label: 'Task Description',
    description: 'Detailed explanation of the scope and intent.',
    queueField: 'description',
    guidelineField: 'description',
    templateVariables: ['task.description']
  },
  {
    key: 'project',
    label: 'Repository / Project',
    description: 'Repository where the work must be delivered.',
    guidelineField: 'project',
    templateVariables: ['repository']
  },
  {
    key: 'assignedAgent',
    label: 'Assigned Agent',
    description: 'Agent persona that will execute the work.',
    queueField: 'assigned_agent',
    guidelineField: 'assignedAgent',
    templateVariables: ['agent.name', 'agent.role', 'agent.id', 'agent.expertise']
  },
  {
    key: 'documentation',
    label: 'Documentation References',
    description: 'Documentation that must be reviewed before starting.',
    queueField: 'documentation',
    guidelineField: 'documentation',
    templateVariables: ['task.documentation']
  },
  {
    key: 'notes',
    label: 'Additional Notes',
    description: 'Extra context, coordination notes, or reminders.',
    queueField: 'notes',
    guidelineField: 'notes',
    templateVariables: ['task.notes']
  },
  {
    key: 'files',
    label: 'Files',
    description: 'Explicit files that will be touched.',
    queueField: 'files',
    guidelineField: 'files',
    templateVariables: ['task.files']
  },
  {
    key: 'dependencies',
    label: 'Dependencies',
    description: 'Prerequisite tasks or components that must exist first.',
    queueField: 'dependencies',
    guidelineField: 'dependencies',
    templateVariables: ['task.dependencies']
  },
  {
    key: 'acceptanceCriteria',
    label: 'Acceptance Criteria',
    description: 'Explicit statements that define task completion.',
    queueField: 'acceptance_criteria',
    guidelineField: 'acceptanceCriteria',
    templateVariables: ['task.acceptance_criteriaList', 'task.acceptance_criteria']
  },
  {
    key: 'architectureReferences',
    label: 'Architecture References',
    description: 'Architecture docs that guide the implementation.',
    queueField: 'architecture_references',
    guidelineField: 'architectureReferences',
    templateVariables: ['task.architecture_references']
  },
  {
    key: 'validationSteps',
    label: 'Validation Steps',
    description: 'Checklist to validate the change before completion.',
    queueField: 'validation_steps',
    guidelineField: 'validationSteps',
    templateVariables: ['task.validation_steps']
  },
  {
    key: 'successMetrics',
    label: 'Success Metrics',
    description: 'Quantifiable signals that the outcome is acceptable.',
    queueField: 'success_metrics',
    guidelineField: 'successMetrics',
    templateVariables: ['task.success_metrics']
  },
  {
    key: 'prerequisites',
    label: 'Prerequisites',
    description: 'Setup steps or environmental assumptions required before work.',
    queueField: 'prerequisites',
    guidelineField: 'prerequisites',
    templateVariables: ['task.prerequisites']
  },
  {
    key: 'contextBoundaries',
    label: 'Context Boundaries',
    description: 'Constraints describing what must not change or be impacted.',
    queueField: 'context_boundaries',
    guidelineField: 'contextBoundaries',
    templateVariables: ['task.contextBoundaries']
  },
  {
    key: 'longTermGoals',
    label: 'Long-Term Goals',
    description: 'Strategic initiatives supported by this task.',
    queueField: 'long_term_goals',
    guidelineField: 'longTermGoals',
    templateVariables: ['task.longTermGoals']
  },
  {
    key: 'estimatedEffort',
    label: 'Estimated Effort',
    description: 'Hours, complexity, and confidence for the work.',
    queueField: 'estimated_effort',
    guidelineField: 'estimatedEffort',
    templateVariables: ['task.estimatedEffort']
  },
  {
    key: 'testingRequirements',
    label: 'Testing Requirements',
    description: 'Specific tests that must be added or updated.',
    queueField: 'testing_requirements',
    guidelineField: 'testingRequirements',
    templateVariables: ['task.testingRequirements']
  },
  {
    key: 'documentationRequirements',
    label: 'Documentation Requirements',
    description: 'Documentation updates required before completion.',
    queueField: 'documentation_requirements',
    guidelineField: 'documentationRequirements',
    templateVariables: ['task.documentationRequirements']
  },
  {
    key: 'rollbackPlan',
    label: 'Rollback Plan',
    description: 'Steps to revert the change safely.',
    queueField: 'rollback_plan',
    guidelineField: 'rollbackPlan',
    templateVariables: ['task.rollbackPlan']
  },
  {
    key: 'blockers',
    label: 'Blockers',
    description: 'Known risks that could block delivery.',
    queueField: 'blockers',
    guidelineField: 'blockers',
    templateVariables: ['task.blockers']
  },
  {
    key: 'risks',
    label: 'Risks',
    description: 'Potential issues and mitigation strategies.',
    queueField: 'risks',
    guidelineField: 'risks',
    templateVariables: ['task.risks']
  },
  {
    key: 'requiredSkills',
    label: 'Required Skills',
    description: 'Capabilities that the assigned agent must have.',
    queueField: 'required_skills',
    guidelineField: 'requiredSkills',
    templateVariables: ['task.requiredSkills']
  },
  {
    key: 'parentInitiative',
    label: 'Parent Initiative',
    description: 'Program, epic, or initiative that the task rolls into.',
    queueField: 'parent_initiative',
    guidelineField: 'parentInitiative',
    templateVariables: ['task.parentInitiative']
  },
  {
    key: 'relatedTasks',
    label: 'Related Tasks',
    description: 'Sibling tasks that this work blocks or depends on.',
    queueField: 'related_tasks',
    guidelineField: 'relatedTasks',
    templateVariables: ['task.relatedTasks']
  },
  {
    key: 'assumptions',
    label: 'Assumptions',
    description: 'Documented assumptions that must hold true.',
    queueField: 'assumptions',
    guidelineField: 'assumptions',
    templateVariables: ['task.assumptions']
  },
  {
    key: 'alternatives',
    label: 'Alternatives Considered',
    description: 'Options that were evaluated and rejected.',
    queueField: 'alternatives',
    guidelineField: 'alternatives',
    templateVariables: ['task.alternatives']
  }
] as const satisfies readonly TaskMetadataFieldDefinitionSeed[];

export type TaskMetadataFieldDefinition = (typeof TASK_METADATA_FIELD_DEFINITIONS)[number];
export type TaskMetadataFieldKey = TaskMetadataFieldDefinition['key'];

const TASK_METADATA_FIELD_LOOKUP: Record<TaskMetadataFieldKey, TaskMetadataFieldDefinition> =
  TASK_METADATA_FIELD_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key as TaskMetadataFieldKey] = definition as TaskMetadataFieldDefinition;
    return acc;
  }, {} as Record<TaskMetadataFieldKey, TaskMetadataFieldDefinition>);

const TASK_METADATA_TEMPLATE_VARIABLES = Array.from(
  new Set(TASK_METADATA_FIELD_DEFINITIONS.flatMap((definition) => definition.templateVariables))
);

export function getTaskMetadataFieldDefinitions(): readonly TaskMetadataFieldDefinition[] {
  return TASK_METADATA_FIELD_DEFINITIONS;
}

export function getTaskMetadataTemplateVariables(): readonly string[] {
  return TASK_METADATA_TEMPLATE_VARIABLES;
}

export function getCanonicalTaskMetadataKeys(): readonly TaskMetadataFieldKey[] {
  return TASK_METADATA_FIELD_DEFINITIONS.map((definition) => definition.key as TaskMetadataFieldKey);
}

export function ensureTaskMetadataFieldKeys<const T extends readonly TaskMetadataFieldKey[]>(fields: T): T {
  fields.forEach((field) => {
    if (!TASK_METADATA_FIELD_LOOKUP[field]) {
      throw new Error(`Invalid task metadata field: ${field}`);
    }
  });
  return fields;
}
