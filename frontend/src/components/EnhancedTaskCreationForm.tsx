/**
 * Enhanced Task Creation Form Component
 *
 * Provides a comprehensive form for creating tasks with detailed guidelines,
 * validation, and examples
 */

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "../services/api";
import { createLogger } from '@/utils/logger';

const log = createLogger('EnhancedTaskCreationForm');

interface EnhancedTaskData {
  // Core fields (required)
  type: string;
  title: string;
  description: string;
  project: string;

  // Detailed specification (required)
  acceptanceCriteria: string[];
  architectureReferences: string[];
  longTermGoals: string[];
  estimatedEffort: {
    hours: number;
    complexity: "simple" | "medium" | "complex" | "expert";
    confidence: "low" | "medium" | "high";
  };

  // Context and boundaries (required)
  prerequisites: string[];
  contextBoundaries: {
    mustNotChange: string[];
    mustNotAffect: string[];
    integrationPoints: string[];
  };

  // Implementation details (required)
  files: string[];
  dependencies: string[];
  validationSteps: string[];
  rollbackPlan: string[];

  // Quality assurance (required)
  successMetrics: string[];
  testingRequirements: string[];
  documentationRequirements: string[];

  // Agent assignment (required)
  assignedAgent: string;
  requiredSkills: string[];

  // Workflow context (optional)
  parentInitiative?: string;
  relatedTasks: string[];
  blockers: string[];

  // Additional context (optional)
  assumptions: string[];
  risks: string[];
  alternatives: string[];
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

interface TaskGuidelines {
  id: string;
  name: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  validationRules: any[];
  examples: any[];
  bestPractices: string[];
}

interface EnhancedTaskCreationFormProps {
  onTaskCreated?: (task: any) => void;
  onCancel?: () => void;
}

const classes = {
  container: "mx-auto mb-12 max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8",
  header:
    "flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between",
  headerTitle: "text-2xl font-semibold tracking-tight",
  headerActions: "flex flex-wrap gap-3",
  content: "grid items-start gap-6 lg:grid-cols-[320px_1fr]",
  sidebar:
    "sticky top-6 space-y-6 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm",
  sidebarHeading:
    "text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground",
  sidebarList: "list-disc space-y-1 pl-4 text-sm text-muted-foreground",
  mainForm: "space-y-6 rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm",
  navigation: "flex flex-wrap gap-2 overflow-x-auto border-b border-border/60 pb-4",
  validation: "space-y-4 rounded-xl border border-border/60 bg-background/80 p-4",
  validationList: "list-disc space-y-1 pl-4 text-sm text-muted-foreground",
  form: "space-y-10",
  section: "space-y-6",
  sectionTitle: "text-lg font-semibold tracking-tight border-b border-border/60 pb-3",
  formRow: "grid gap-4 md:grid-cols-2",
  formGroup: "flex flex-col gap-2",
  label: "text-sm font-medium text-foreground",
  select:
    "h-10 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  textarea:
    "min-h-[140px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  arrayField:
    "flex flex-col gap-2 rounded-lg border border-border/60 bg-background/70 p-3 sm:flex-row sm:items-center sm:gap-3",
  arrayInput: "flex-1",
  formActions: "flex flex-wrap items-center justify-end gap-3 border-t border-border/60 pt-4",
  error:
    "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground",
};

const navButtonClass = (active: boolean) =>
  cn(
    "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted/70",
    active &&
      "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  );

const validationBlockClass = {
  error: "space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4",
  warning: "space-y-2 rounded-lg border border-amber-400/40 bg-amber-100/10 p-4",
  suggestion: "space-y-2 rounded-lg border border-sky-400/40 bg-sky-100/10 p-4",
  title: "text-sm font-semibold",
};

type StringArrayFieldMap = {
  [K in keyof EnhancedTaskData as EnhancedTaskData[K] extends string[] ? K : never]: EnhancedTaskData[K];
};
type StringArrayKey = keyof StringArrayFieldMap;
type StringArrayFieldValue<K extends StringArrayKey = StringArrayKey> = StringArrayFieldMap[K];

type ContextBoundaryKey = keyof EnhancedTaskData["contextBoundaries"];

export const EnhancedTaskCreationForm: React.FC<EnhancedTaskCreationFormProps> = ({
  onTaskCreated,
  onCancel,
}) => {
  const [taskData, setTaskData] = useState<EnhancedTaskData>({
    type: "implementation",
    title: "",
    description: "",
    project: "app-monitor",
    acceptanceCriteria: [""],
    architectureReferences: [""],
    longTermGoals: [""],
    estimatedEffort: {
      hours: 4,
      complexity: "medium",
      confidence: "medium",
    },
    prerequisites: [""],
    contextBoundaries: {
      mustNotChange: [""],
      mustNotAffect: [""],
      integrationPoints: [""],
    },
    files: [""],
    dependencies: [""],
    validationSteps: [""],
    rollbackPlan: [""],
    successMetrics: [""],
    testingRequirements: [""],
    documentationRequirements: [""],
    assignedAgent: "backend-specialist",
    requiredSkills: [""],
    relatedTasks: [""],
    blockers: [""],
    assumptions: [""],
    risks: [""],
    alternatives: [""],
  });

  const [guidelines, setGuidelines] = useState<TaskGuidelines | null>(null);
  const [example, setExample] = useState<any>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("basic");

  useEffect(() => {
    loadGuidelinesAndExample();
  }, [taskData.type]);

  useEffect(() => {
    validateTaskData();
  }, [taskData]);

  const loadGuidelinesAndExample = async () => {
    try {
      const [guidelinesRes, exampleRes, checklistRes] = await Promise.all([
        api.get(`/dev-bots/guidelines/${taskData.type}`),
        api.get(`/dev-bots/examples/${taskData.type}`),
        api.get(`/dev-bots/checklist/${taskData.type}`),
      ]);

      setGuidelines((guidelinesRes as any).data.guidelines);
      setExample((exampleRes as any).data.example);
      setChecklist((checklistRes as any).data.checklist);
    } catch (err: unknown) {
      log.error('Failed to load guidelines', { error: err });
    }
  };

  const validateTaskData = async () => {
    try {
      const response = await api.post("/dev-bots/validate", {
        taskData,
        taskType: taskData.type,
      });
      setValidation((response as any).data.validation);
    } catch (err: unknown) {
      log.error('Failed to validate task data', { error: err });
    }
  };

  const handleArrayFieldChange = <K extends StringArrayKey>(
    field: K,
    index: number,
    value: string,
  ) => {
    const current = taskData[field] as StringArrayFieldValue<K>;
    const updated = [...current];
    updated[index] = value;
    setTaskData({ ...taskData, [field]: updated });
  };

  const addArrayField = <K extends StringArrayKey>(field: K) => {
    const current = taskData[field] as StringArrayFieldValue<K>;
    const updated = [...current, ""];
    setTaskData({ ...taskData, [field]: updated });
  };

  const removeArrayField = <K extends StringArrayKey>(field: K, index: number) => {
    const current = taskData[field] as StringArrayFieldValue<K>;
    const updated = current.filter((_, i) => i !== index);
    setTaskData({ ...taskData, [field]: updated.length ? updated : [""] });
  };

  const handleContextBoundaryChange = (
    field: ContextBoundaryKey,
    index: number,
    value: string,
  ) => {
    const updated = {
      ...taskData.contextBoundaries,
      [field]: taskData.contextBoundaries[field].map((existing, i) =>
        i === index ? value : existing,
      ),
    };
    setTaskData({ ...taskData, contextBoundaries: updated });
  };

  const addContextBoundary = (field: ContextBoundaryKey) => {
    const updated = {
      ...taskData.contextBoundaries,
      [field]: [...taskData.contextBoundaries[field], ""],
    };
    setTaskData({ ...taskData, contextBoundaries: updated });
  };

  const removeContextBoundary = (field: ContextBoundaryKey, index: number) => {
    const filtered = taskData.contextBoundaries[field].filter((_, i) => i !== index);
    const updated = {
      ...taskData.contextBoundaries,
      [field]: filtered.length ? filtered : [""],
    };
    setTaskData({ ...taskData, contextBoundaries: updated });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validation?.isValid) {
      setError("Please fix validation errors before submitting");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cleanedTaskData = {
        ...taskData,
        acceptanceCriteria: taskData.acceptanceCriteria.filter((item) => item.trim()),
        architectureReferences: taskData.architectureReferences.filter((item) => item.trim()),
        longTermGoals: taskData.longTermGoals.filter((item) => item.trim()),
        prerequisites: taskData.prerequisites.filter((item) => item.trim()),
        files: taskData.files.filter((item) => item.trim()),
        dependencies: taskData.dependencies.filter((item) => item.trim()),
        validationSteps: taskData.validationSteps.filter((item) => item.trim()),
        rollbackPlan: taskData.rollbackPlan.filter((item) => item.trim()),
        successMetrics: taskData.successMetrics.filter((item) => item.trim()),
        testingRequirements: taskData.testingRequirements.filter((item) => item.trim()),
        documentationRequirements: taskData.documentationRequirements.filter((item) => item.trim()),
        requiredSkills: taskData.requiredSkills.filter((item) => item.trim()),
        relatedTasks: taskData.relatedTasks.filter((item) => item.trim()),
        blockers: taskData.blockers.filter((item) => item.trim()),
        assumptions: taskData.assumptions.filter((item) => item.trim()),
        risks: taskData.risks.filter((item) => item.trim()),
        alternatives: taskData.alternatives.filter((item) => item.trim()),
        contextBoundaries: {
          mustNotChange: taskData.contextBoundaries.mustNotChange.filter((item) => item.trim()),
          mustNotAffect: taskData.contextBoundaries.mustNotAffect.filter((item) => item.trim()),
          integrationPoints: taskData.contextBoundaries.integrationPoints.filter((item) => item.trim()),
        },
      };

      const response = await api.post("/dev-bots/tasks", cleanedTaskData);

      if (onTaskCreated) {
        onTaskCreated((response as any).data.task);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    if (example?.example) {
      setTaskData((prev) => ({
        ...prev,
        ...example.example,
      }));
    }
  };

  const sections = [
    { id: "basic", label: "Basic Info", icon: "📝" },
    { id: "specification", label: "Specification", icon: "🎯" },
    { id: "context", label: "Context", icon: "🌐" },
    { id: "implementation", label: "Implementation", icon: "⚙️" },
    { id: "quality", label: "Quality", icon: "✅" },
    { id: "workflow", label: "Workflow", icon: "🔄" },
    { id: "additional", label: "Additional", icon: "📋" },
  ];

  const renderArrayField = <K extends StringArrayKey>(
    field: K,
    {
      label,
      placeholder,
      addLabel,
      required = false,
    }: { label: string; placeholder: string; addLabel: string; required?: boolean },
  ) => (
    <div className={classes.formGroup}>
      <label className={classes.label}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <div className="space-y-2">
        {(taskData[field] as StringArrayFieldValue<K>).map((value, index) => (
          <div key={`${field}-${index}`} className={classes.arrayField}>
            <Input
              value={value}
              onChange={(event) => handleArrayFieldChange(field, index, event.target.value)}
              placeholder={placeholder}
              className={classes.arrayInput}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeArrayField(field, index)}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addArrayField(field)}
          className="gap-1"
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );

  const renderContextBoundaryField = (
    field: ContextBoundaryKey,
    {
      label,
      placeholder,
      addLabel,
    }: { label: string; placeholder: string; addLabel: string },
  ) => (
    <div className={classes.formGroup}>
      <label className={classes.label}>{label}</label>
      <div className="space-y-2">
        {taskData.contextBoundaries[field].map((value, index) => (
          <div key={`${field}-${index}`} className={classes.arrayField}>
            <Input
              value={value}
              onChange={(event) => handleContextBoundaryChange(field, index, event.target.value)}
              placeholder={placeholder}
              className={classes.arrayInput}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeContextBoundary(field, index)}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addContextBoundary(field)}
          className="gap-1"
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={classes.container}>
      <div className={classes.header}>
        <div>
          <h2 className={classes.headerTitle}>Create Enhanced Task</h2>
          <p className="text-sm text-muted-foreground">
            Provide the full specification so dev-bots can execute with confidence.
          </p>
        </div>
        <div className={classes.headerActions}>
          {example && (
            <Button type="button" variant="outline" onClick={loadExample} className="gap-2">
              <span aria-hidden="true">📋</span>
              Load Example
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className={classes.content}>
        <aside className={classes.sidebar}>
          {guidelines && (
            <section className="space-y-4">
              <div className="space-y-2">
                <h3 className={classes.sidebarHeading}>Guidelines</h3>
                <p className="text-sm leading-6 text-muted-foreground">{guidelines.description}</p>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                  Required Fields
                </h4>
                <ul className={classes.sidebarList}>
                  {guidelines.requiredFields.map((field, index) => (
                    <li key={`required-${index}`}>{field}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                  Best Practices
                </h4>
                <ul className={classes.sidebarList}>
                  {guidelines.bestPractices.map((practice, index) => (
                    <li key={`practice-${index}`}>{practice}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {checklist.length > 0 && (
            <section className="space-y-3">
              <h3 className={classes.sidebarHeading}>Task Checklist</h3>
              <ul className={classes.sidebarList}>
                {checklist.map((item, index) => (
                  <li key={`checklist-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <div className={classes.mainForm}>
          <nav className={classes.navigation}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={navButtonClass(activeSection === section.id)}
                onClick={() => setActiveSection(section.id)}
              >
                <span aria-hidden="true">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </nav>

          {validation && (
            <div className={classes.validation}>
              {validation.errors.length > 0 && (
                <div className={validationBlockClass.error}>
                  <h4 className={validationBlockClass.title}>❌ Errors</h4>
                  <ul className={classes.validationList}>
                    {validation.errors.map((item, index) => (
                      <li key={`error-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className={validationBlockClass.warning}>
                  <h4 className={validationBlockClass.title}>⚠️ Warnings</h4>
                  <ul className={classes.validationList}>
                    {validation.warnings.map((item, index) => (
                      <li key={`warning-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.suggestions.length > 0 && (
                <div className={validationBlockClass.suggestion}>
                  <h4 className={validationBlockClass.title}>💡 Suggestions</h4>
                  <ul className={classes.validationList}>
                    {validation.suggestions.map((item, index) => (
                      <li key={`suggestion-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className={classes.form}>
            {activeSection === "basic" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Basic Information</h3>

                <div className={classes.formRow}>
                  <div className={classes.formGroup}>
                    <Label className={classes.label} htmlFor="task-type">
                      Task Type *
                    </Label>
                    <Select
                      value={taskData.type}
                      onValueChange={(value) => setTaskData({ ...taskData, type: value })}
                    >
                      <SelectTrigger id="task-type" className={classes.select}>
                        <SelectValue placeholder="Select task type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="implementation">Implementation</SelectItem>
                        <SelectItem value="api-development">API Development</SelectItem>
                        <SelectItem value="ui-development">UI Development</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="testing">Testing</SelectItem>
                        <SelectItem value="documentation">Documentation</SelectItem>
                        <SelectItem value="deployment">Deployment</SelectItem>
                        <SelectItem value="debugging">Debugging</SelectItem>
                        <SelectItem value="cleanup">Cleanup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={classes.formGroup}>
                    <Label className={classes.label} htmlFor="assigned-agent">
                      Assigned Agent *
                    </Label>
                    <Select
                      value={taskData.assignedAgent}
                      onValueChange={(value) => setTaskData({ ...taskData, assignedAgent: value })}
                    >
                      <SelectTrigger id="assigned-agent" className={classes.select}>
                        <SelectValue placeholder="Select assigned agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backend-specialist">
                          Backend Specialist (Alex)
                        </SelectItem>
                        <SelectItem value="frontend-specialist">
                          Frontend Specialist (Sam)
                        </SelectItem>
                        <SelectItem value="review-specialist">
                          Code Review Specialist (Casey)
                        </SelectItem>
                        <SelectItem value="testing-specialist">
                          Testing Specialist (Taylor)
                        </SelectItem>
                        <SelectItem value="devops-specialist">
                          DevOps Specialist (Jordan)
                        </SelectItem>
                        <SelectItem value="documentation-specialist">
                          Documentation Specialist (Morgan)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={classes.formGroup}>
                    <Label className={classes.label} htmlFor="project-select">
                      Project *
                    </Label>
                    <Select
                      value={taskData.project}
                      onValueChange={(value) => setTaskData({ ...taskData, project: value })}
                    >
                      <SelectTrigger id="project-select" className={classes.select}>
                        <SelectValue placeholder="Select target project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="app-monitor">app-monitor</SelectItem>
                        <SelectItem value="dev-bots">dev-bots</SelectItem>
                        <SelectItem value="job-finder-FE">job-finder-FE</SelectItem>
                        <SelectItem value="job-finder-BE">job-finder-BE</SelectItem>
                        <SelectItem value="job-finder-shared-types">
                          job-finder-shared-types
                        </SelectItem>
                        <SelectItem value="job-finder-worker">job-finder-worker</SelectItem>
                        <SelectItem value="docs">docs</SelectItem>
                        <SelectItem value="infrastructure">infrastructure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className={classes.formGroup}>
                  <Label className={classes.label} htmlFor="task-title">
                    Title *
                  </Label>
                  <Input
                    id="task-title"
                    value={taskData.title}
                    onChange={(event) => setTaskData({ ...taskData, title: event.target.value })}
                    placeholder="Specific, descriptive task title"
                    required
                  />
                </div>

                <div className={classes.formGroup}>
                  <Label className={classes.label} htmlFor="task-description">
                    Description *
                  </Label>
                  <Textarea
                    id="task-description"
                    value={taskData.description}
                    onChange={(event) => setTaskData({ ...taskData, description: event.target.value })}
                    placeholder={
                      "Describe the task in detail. Include:\n- What needs to be implemented/changed\n- Why this change is needed\n- Expected behavior and outcomes\n- Any specific requirements or constraints\n- Context and background information"
                    }
                    className={classes.textarea}
                    rows={6}
                    required
                  />
                </div>
              </section>
            )}

            {activeSection === "specification" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Detailed Specification</h3>

                {renderArrayField("acceptanceCriteria", {
                  label: "Acceptance Criteria *",
                  placeholder: "Specific, testable acceptance criteria",
                  addLabel: "Add Criteria",
                  required: true,
                })}

                {renderArrayField("architectureReferences", {
                  label: "Architecture References *",
                  placeholder: "Path to architecture documentation",
                  addLabel: "Add Reference",
                  required: true,
                })}

                {renderArrayField("longTermGoals", {
                  label: "Long-term Goals",
                  placeholder: "How this task contributes to larger initiatives",
                  addLabel: "Add Goal",
                })}

                <div className={classes.formRow}>
                  <div className={classes.formGroup}>
                    <label className={classes.label}>Estimated Hours *</label>
                    <Input
                      type="number"
                      min={1}
                      max={40}
                      value={taskData.estimatedEffort.hours}
                      onChange={(event) =>
                        setTaskData({
                          ...taskData,
                          estimatedEffort: {
                            ...taskData.estimatedEffort,
                            hours: Number(event.target.value) || 0,
                          },
                        })
                      }
                      placeholder="Enter estimated hours"
                      required
                    />
                  </div>

                  <div className={classes.formGroup}>
                    <Label className={classes.label} htmlFor="task-complexity">
                      Complexity *
                    </Label>
                    <Select
                      value={taskData.estimatedEffort.complexity}
                      onValueChange={(value) =>
                        setTaskData({
                          ...taskData,
                          estimatedEffort: {
                            ...taskData.estimatedEffort,
                            complexity: value as EnhancedTaskData["estimatedEffort"]["complexity"],
                          },
                        })
                      }
                    >
                      <SelectTrigger id="task-complexity" className={classes.select}>
                        <SelectValue placeholder="Select complexity level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="complex">Complex</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className={classes.formGroup}>
                    <Label className={classes.label} htmlFor="task-confidence">
                      Confidence *
                    </Label>
                    <Select
                      value={taskData.estimatedEffort.confidence}
                      onValueChange={(value) =>
                        setTaskData({
                          ...taskData,
                          estimatedEffort: {
                            ...taskData.estimatedEffort,
                            confidence: value as EnhancedTaskData["estimatedEffort"]["confidence"],
                          },
                        })
                      }
                    >
                      <SelectTrigger id="task-confidence" className={classes.select}>
                        <SelectValue placeholder="Select confidence level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            )}

            {activeSection === "implementation" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Implementation Details</h3>

                {renderArrayField("files", {
                  label: "Files to Modify (Optional)",
                  placeholder: "Path to file to be modified",
                  addLabel: "Add File",
                })}

                {renderArrayField("dependencies", {
                  label: "Dependencies (Optional)",
                  placeholder: "Task or system dependencies",
                  addLabel: "Add Dependency",
                })}

                {renderArrayField("validationSteps", {
                  label: "Validation Steps *",
                  placeholder: "How to verify the task is completed correctly",
                  addLabel: "Add Step",
                  required: true,
                })}

                {renderArrayField("rollbackPlan", {
                  label: "Rollback Plan",
                  placeholder: "Steps to undo changes if something goes wrong",
                  addLabel: "Add Plan",
                })}
              </section>
            )}

            {activeSection === "quality" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Quality Assurance</h3>

                {renderArrayField("successMetrics", {
                  label: "Success Metrics *",
                  placeholder: "Measurable success criteria",
                  addLabel: "Add Metric",
                  required: true,
                })}

                {renderArrayField("testingRequirements", {
                  label: "Testing Requirements *",
                  placeholder: "Testing requirements and expectations",
                  addLabel: "Add Requirement",
                  required: true,
                })}

                {renderArrayField("documentationRequirements", {
                  label: "Documentation Requirements *",
                  placeholder: "Documentation that needs to be updated",
                  addLabel: "Add Requirement",
                  required: true,
                })}
              </section>
            )}

            {activeSection === "context" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Context and Boundaries</h3>

                {renderArrayField("prerequisites", {
                  label: "Prerequisites",
                  placeholder: "Required knowledge, setup, or dependencies",
                  addLabel: "Add Prerequisite",
                })}

                {renderContextBoundaryField("mustNotChange", {
                  label: "Must Not Change",
                  placeholder: "What must not be changed",
                  addLabel: "Add Boundary",
                })}

                {renderContextBoundaryField("mustNotAffect", {
                  label: "Must Not Affect",
                  placeholder: "What must not be affected",
                  addLabel: "Add Boundary",
                })}

                {renderContextBoundaryField("integrationPoints", {
                  label: "Integration Points",
                  placeholder: "How this connects to other systems",
                  addLabel: "Add Point",
                })}
              </section>
            )}

            {activeSection === "workflow" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Workflow Context</h3>

                <div className={classes.formGroup}>
                  <label className={classes.label}>Parent Initiative</label>
                  <Input
                    value={taskData.parentInitiative ?? ""}
                    onChange={(event) => setTaskData({ ...taskData, parentInitiative: event.target.value })}
                    placeholder="Larger project or initiative this task belongs to"
                  />
                </div>

                {renderArrayField("relatedTasks", {
                  label: "Related Tasks",
                  placeholder: "Related task IDs or descriptions",
                  addLabel: "Add Task",
                })}

                {renderArrayField("blockers", {
                  label: "Blockers",
                  placeholder: "Issues that might block this task",
                  addLabel: "Add Blocker",
                })}

                {renderArrayField("requiredSkills", {
                  label: "Required Skills",
                  placeholder: "Skills required to complete this task",
                  addLabel: "Add Skill",
                })}
              </section>
            )}

            {activeSection === "additional" && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Additional Context</h3>

                {renderArrayField("assumptions", {
                  label: "Assumptions",
                  placeholder: "Assumptions made about the task",
                  addLabel: "Add Assumption",
                })}

                {renderArrayField("risks", {
                  label: "Risks",
                  placeholder: "Potential risks and mitigation strategies",
                  addLabel: "Add Risk",
                })}

                {renderArrayField("alternatives", {
                  label: "Alternatives",
                  placeholder: "Alternative approaches considered",
                  addLabel: "Add Alternative",
                })}
              </section>
            )}

            {error && <div className={classes.error}>{error}</div>}

            <div className={classes.formActions}>
              <Button type="submit" disabled={loading || !validation?.isValid}>
                {loading ? "Creating..." : "Create Enhanced Task"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
