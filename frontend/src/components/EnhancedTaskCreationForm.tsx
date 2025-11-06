/**
 * Enhanced Task Creation Form Component
 * 
 * Provides a comprehensive form for creating tasks with detailed guidelines,
 * validation, and examples
 */

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import styles from './EnhancedTaskCreationForm.module.css';

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
    complexity: 'simple' | 'medium' | 'complex' | 'expert';
    confidence: 'low' | 'medium' | 'high';
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

export const EnhancedTaskCreationForm: React.FC<EnhancedTaskCreationFormProps> = ({
  onTaskCreated,
  onCancel
}) => {
  const [taskData, setTaskData] = useState<EnhancedTaskData>({
    type: 'implementation',
    title: '',
    description: '',
    project: 'app-monitor',
    acceptanceCriteria: [''],
    architectureReferences: [''],
    longTermGoals: [''],
    estimatedEffort: {
      hours: 4,
      complexity: 'medium',
      confidence: 'medium'
    },
    prerequisites: [''],
    contextBoundaries: {
      mustNotChange: [''],
      mustNotAffect: [''],
      integrationPoints: ['']
    },
    files: [''],
    dependencies: [''],
    validationSteps: [''],
    rollbackPlan: [''],
    successMetrics: [''],
    testingRequirements: [''],
    documentationRequirements: [''],
    assignedAgent: 'backend-specialist',
    requiredSkills: [''],
    relatedTasks: [''],
    blockers: [''],
    assumptions: [''],
    risks: [''],
    alternatives: ['']
  });

  const [guidelines, setGuidelines] = useState<TaskGuidelines | null>(null);
  const [example, setExample] = useState<any>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('basic');

  // Load guidelines and example when task type changes
  useEffect(() => {
    loadGuidelinesAndExample();
  }, [taskData.type]);

  // Validate task data when it changes
  useEffect(() => {
    validateTaskData();
  }, [taskData]);

  const loadGuidelinesAndExample = async () => {
    try {
      const [guidelinesRes, exampleRes, checklistRes] = await Promise.all([
        api.get(`/dev-bots/guidelines/${taskData.type}`),
        api.get(`/dev-bots/examples/${taskData.type}`),
        api.get(`/dev-bots/checklist/${taskData.type}`)
      ]);

      setGuidelines((guidelinesRes as any).data.guidelines);
      setExample((exampleRes as any).data.example);
      setChecklist((checklistRes as any).data.checklist);
    } catch (err: any) {
      console.error('Failed to load guidelines:', err);
    }
  };

  const validateTaskData = async () => {
    try {
      const response = await api.post('/dev-bots/validate', {
        taskData,
        taskType: taskData.type
      });
      setValidation((response as any).data.validation);
    } catch (err: any) {
      console.error('Failed to validate task data:', err);
    }
  };

  const handleArrayFieldChange = (field: string, index: number, value: string) => {
    const newArray = [...(taskData[field as keyof EnhancedTaskData] as string[])];
    newArray[index] = value;
    setTaskData({ ...taskData, [field]: newArray });
  };

  const addArrayField = (field: string) => {
    const newArray = [...(taskData[field as keyof EnhancedTaskData] as string[]), ''];
    setTaskData({ ...taskData, [field]: newArray });
  };

  const removeArrayField = (field: string, index: number) => {
    const newArray = (taskData[field as keyof EnhancedTaskData] as string[]).filter((_, i) => i !== index);
    setTaskData({ ...taskData, [field]: newArray });
  };

  const handleContextBoundaryChange = (boundary: string, index: number, value: string) => {
    const newBoundaries = { ...taskData.contextBoundaries };
    newBoundaries[boundary as keyof typeof newBoundaries] = [
      ...newBoundaries[boundary as keyof typeof newBoundaries]
    ];
    newBoundaries[boundary as keyof typeof newBoundaries][index] = value;
    setTaskData({ ...taskData, contextBoundaries: newBoundaries });
  };

  const addContextBoundary = (boundary: string) => {
    const newBoundaries = { ...taskData.contextBoundaries };
    newBoundaries[boundary as keyof typeof newBoundaries] = [
      ...newBoundaries[boundary as keyof typeof newBoundaries],
      ''
    ];
    setTaskData({ ...taskData, contextBoundaries: newBoundaries });
  };

  const removeContextBoundary = (boundary: string, index: number) => {
    const newBoundaries = { ...taskData.contextBoundaries };
    newBoundaries[boundary as keyof typeof newBoundaries] = newBoundaries[boundary as keyof typeof newBoundaries].filter((_, i) => i !== index);
    setTaskData({ ...taskData, contextBoundaries: newBoundaries });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validation?.isValid) {
      setError('Please fix validation errors before submitting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Clean up empty strings from arrays
      const cleanedTaskData = {
        ...taskData,
        acceptanceCriteria: taskData.acceptanceCriteria.filter(c => c.trim()),
        architectureReferences: taskData.architectureReferences.filter(r => r.trim()),
        longTermGoals: taskData.longTermGoals.filter(g => g.trim()),
        prerequisites: taskData.prerequisites.filter(p => p.trim()),
        files: taskData.files.filter(f => f.trim()),
        dependencies: taskData.dependencies.filter(d => d.trim()),
        validationSteps: taskData.validationSteps.filter(v => v.trim()),
        rollbackPlan: taskData.rollbackPlan.filter(r => r.trim()),
        successMetrics: taskData.successMetrics.filter(m => m.trim()),
        testingRequirements: taskData.testingRequirements.filter(t => t.trim()),
        documentationRequirements: taskData.documentationRequirements.filter(d => d.trim()),
        requiredSkills: taskData.requiredSkills.filter(s => s.trim()),
        relatedTasks: taskData.relatedTasks.filter(t => t.trim()),
        blockers: taskData.blockers.filter(b => b.trim()),
        assumptions: taskData.assumptions.filter(a => a.trim()),
        risks: taskData.risks.filter(r => r.trim()),
        alternatives: taskData.alternatives.filter(a => a.trim()),
        contextBoundaries: {
          mustNotChange: taskData.contextBoundaries.mustNotChange.filter(c => c.trim()),
          mustNotAffect: taskData.contextBoundaries.mustNotAffect.filter(a => a.trim()),
          integrationPoints: taskData.contextBoundaries.integrationPoints.filter(i => i.trim())
        }
      };

      const response = await api.post('/dev-bots/tasks/enhanced', cleanedTaskData);

      if (onTaskCreated) {
        onTaskCreated((response as any).data.task);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    if (example?.example) {
      setTaskData(prev => ({
        ...prev,
        ...example.example
      }));
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', icon: '📝' },
    { id: 'specification', label: 'Specification', icon: '🎯' },
    { id: 'context', label: 'Context', icon: '🌐' },
    { id: 'implementation', label: 'Implementation', icon: '⚙️' },
    { id: 'quality', label: 'Quality', icon: '✅' },
    { id: 'workflow', label: 'Workflow', icon: '🔄' },
    { id: 'additional', label: 'Additional', icon: '📋' }
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Create Enhanced Task</h2>
        <div className={styles.headerActions}>
          {example && (
            <button
              type="button"
              onClick={loadExample}
              className={styles.exampleBtn}
            >
              📋 Load Example
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {/* Guidelines and Checklist */}
        <div className={styles.sidebar}>
          {guidelines && (
            <div className={styles.guidelines}>
              <h3>Guidelines</h3>
              <p>{guidelines.description}</p>
              
              <h4>Required Fields</h4>
              <ul>
                {guidelines.requiredFields.map((field, index) => (
                  <li key={index}>{field}</li>
                ))}
              </ul>
              
              <h4>Best Practices</h4>
              <ul>
                {guidelines.bestPractices.map((practice, index) => (
                  <li key={index}>{practice}</li>
                ))}
              </ul>
            </div>
          )}

          {checklist.length > 0 && (
            <div className={styles.checklist}>
              <h3>Task Checklist</h3>
              <ul>
                {checklist.map((item, index) => (
                  <li key={index} className={styles.checklistItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Main Form */}
        <div className={styles.mainForm}>
          {/* Navigation */}
          <div className={styles.navigation}>
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={`${styles.navBtn} ${activeSection === section.id ? styles.active : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon} {section.label}
              </button>
            ))}
          </div>

          {/* Validation Results */}
          {validation && (
            <div className={styles.validation}>
              {validation.errors.length > 0 && (
                <div className={styles.errors}>
                  <h4>❌ Errors</h4>
                  <ul>
                    {validation.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {validation.warnings.length > 0 && (
                <div className={styles.warnings}>
                  <h4>⚠️ Warnings</h4>
                  <ul>
                    {validation.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {validation.suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <h4>💡 Suggestions</h4>
                  <ul>
                    {validation.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Basic Info Section */}
            {activeSection === 'basic' && (
              <div className={styles.section}>
                <h3>Basic Information</h3>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Task Type *</label>
                    <select
                      value={taskData.type}
                      onChange={(e) => setTaskData({ ...taskData, type: e.target.value })}
                      className={styles.formInput}
                      title="Select task type"
                    >
                      <option value="implementation">Implementation</option>
                      <option value="api-development">API Development</option>
                      <option value="ui-development">UI Development</option>
                      <option value="review">Review</option>
                      <option value="testing">Testing</option>
                      <option value="documentation">Documentation</option>
                      <option value="deployment">Deployment</option>
                      <option value="debugging">Debugging</option>
                      <option value="cleanup">Cleanup</option>
                    </select>
                  </div>
                  
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Assigned Agent *</label>
                    <select
                      value={taskData.assignedAgent}
                      onChange={(e) => setTaskData({ ...taskData, assignedAgent: e.target.value })}
                      className={styles.formInput}
                      title="Select assigned agent"
                      required
                    >
                      <option value="backend-specialist">Backend Specialist (Alex)</option>
                      <option value="frontend-specialist">Frontend Specialist (Sam)</option>
                      <option value="review-specialist">Code Review Specialist (Casey)</option>
                      <option value="testing-specialist">Testing Specialist (Taylor)</option>
                      <option value="devops-specialist">DevOps Specialist (Jordan)</option>
                      <option value="documentation-specialist">Documentation Specialist (Morgan)</option>
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Project *</label>
                    <select
                      value={taskData.project}
                      onChange={(e) => setTaskData({ ...taskData, project: e.target.value })}
                      className={styles.formInput}
                      title="Select target project"
                      required
                    >
                      <option value="app-monitor">app-monitor</option>
                      <option value="dev-bots">dev-bots</option>
                      <option value="job-finder-FE">job-finder-FE</option>
                      <option value="job-finder-BE">job-finder-BE</option>
                      <option value="job-finder-shared-types">job-finder-shared-types</option>
                      <option value="job-finder-worker">job-finder-worker</option>
                      <option value="docs">docs</option>
                      <option value="scripts">scripts</option>
                      <option value="infrastructure">infrastructure</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Title *</label>
                  <input
                    type="text"
                    value={taskData.title}
                    onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                    placeholder="Specific, descriptive task title"
                    className={styles.formInput}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Description *</label>
                  <textarea
                    value={taskData.description}
                    onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
                    placeholder="Describe the task in detail. Include:
- What needs to be implemented/changed
- Why this change is needed  
- Expected behavior and outcomes
- Any specific requirements or constraints
- Context and background information"
                    className={styles.formTextarea}
                    rows={6}
                    required
                  />
                </div>

              </div>
            )}

            {/* Specification Section */}
            {activeSection === 'specification' && (
              <div className={styles.section}>
                <h3>Detailed Specification</h3>
                
                <div className={styles.formGroup}>
                  <label>Acceptance Criteria *</label>
                  {taskData.acceptanceCriteria.map((criteria, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={criteria}
                        onChange={(e) => handleArrayFieldChange('acceptanceCriteria', index, e.target.value)}
                        placeholder="Specific, testable acceptance criteria"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('acceptanceCriteria', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('acceptanceCriteria')}
                    className={styles.addBtn}
                  >
                    + Add Criteria
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Architecture References *</label>
                  {taskData.architectureReferences.map((ref, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={ref}
                        onChange={(e) => handleArrayFieldChange('architectureReferences', index, e.target.value)}
                        placeholder="Path to architecture documentation"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('architectureReferences', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('architectureReferences')}
                    className={styles.addBtn}
                  >
                    + Add Reference
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Long-term Goals</label>
                  {taskData.longTermGoals.map((goal, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={goal}
                        onChange={(e) => handleArrayFieldChange('longTermGoals', index, e.target.value)}
                        placeholder="How this task contributes to larger initiatives"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('longTermGoals', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('longTermGoals')}
                    className={styles.addBtn}
                  >
                    + Add Goal
                  </button>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Estimated Hours *</label>
                    <input
                      type="number"
                      value={taskData.estimatedEffort.hours}
                      onChange={(e) => setTaskData({
                        ...taskData,
                        estimatedEffort: { ...taskData.estimatedEffort, hours: parseInt(e.target.value) || 0 }
                      })}
                      min="1"
                      max="40"
                      className={styles.formInput}
                      title="Enter estimated hours"
                      placeholder="Enter hours"
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Complexity *</label>
                    <select
                      value={taskData.estimatedEffort.complexity}
                      onChange={(e) => setTaskData({
                        ...taskData,
                        estimatedEffort: { ...taskData.estimatedEffort, complexity: e.target.value as any }
                      })}
                      className={styles.formInput}
                      title="Select complexity level"
                    >
                      <option value="simple">Simple</option>
                      <option value="medium">Medium</option>
                      <option value="complex">Complex</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Confidence *</label>
                    <select
                      value={taskData.estimatedEffort.confidence}
                      onChange={(e) => setTaskData({
                        ...taskData,
                        estimatedEffort: { ...taskData.estimatedEffort, confidence: e.target.value as any }
                      })}
                      className={styles.formInput}
                      title="Select confidence level"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Implementation Section */}
            {activeSection === 'implementation' && (
              <div className={styles.section}>
                <h3>Implementation Details</h3>
                
                <div className={styles.formGroup}>
                  <label>Files to Modify (Optional)</label>
                  {taskData.files.map((file, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={file}
                        onChange={(e) => handleArrayFieldChange('files', index, e.target.value)}
                        placeholder="Path to file to be modified"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('files', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('files')}
                    className={styles.addBtn}
                  >
                    + Add File
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Dependencies (Optional)</label>
                  {taskData.dependencies.map((dep, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={dep}
                        onChange={(e) => handleArrayFieldChange('dependencies', index, e.target.value)}
                        placeholder="Task or system dependencies"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('dependencies', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('dependencies')}
                    className={styles.addBtn}
                  >
                    + Add Dependency
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Validation Steps *</label>
                  {taskData.validationSteps.map((step, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => handleArrayFieldChange('validationSteps', index, e.target.value)}
                        placeholder="How to verify the task is completed correctly"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('validationSteps', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('validationSteps')}
                    className={styles.addBtn}
                  >
                    + Add Step
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Rollback Plan</label>
                  {taskData.rollbackPlan.map((plan, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={plan}
                        onChange={(e) => handleArrayFieldChange('rollbackPlan', index, e.target.value)}
                        placeholder="Steps to undo changes if something goes wrong"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('rollbackPlan', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('rollbackPlan')}
                    className={styles.addBtn}
                  >
                    + Add Plan
                  </button>
                </div>
              </div>
            )}

            {/* Quality Section */}
            {activeSection === 'quality' && (
              <div className={styles.section}>
                <h3>Quality Assurance</h3>
                
                <div className={styles.formGroup}>
                  <label>Success Metrics *</label>
                  {taskData.successMetrics.map((metric, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={metric}
                        onChange={(e) => handleArrayFieldChange('successMetrics', index, e.target.value)}
                        placeholder="Measurable success criteria"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('successMetrics', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('successMetrics')}
                    className={styles.addBtn}
                  >
                    + Add Metric
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Testing Requirements *</label>
                  {taskData.testingRequirements.map((req, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={req}
                        onChange={(e) => handleArrayFieldChange('testingRequirements', index, e.target.value)}
                        placeholder="Testing requirements and expectations"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('testingRequirements', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('testingRequirements')}
                    className={styles.addBtn}
                  >
                    + Add Requirement
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Documentation Requirements *</label>
                  {taskData.documentationRequirements.map((req, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={req}
                        onChange={(e) => handleArrayFieldChange('documentationRequirements', index, e.target.value)}
                        placeholder="Documentation that needs to be updated"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('documentationRequirements', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('documentationRequirements')}
                    className={styles.addBtn}
                  >
                    + Add Requirement
                  </button>
                </div>
              </div>
            )}

            {/* Context Section */}
            {activeSection === 'context' && (
              <div className={styles.section}>
                <h3>Context and Boundaries</h3>
                
                <div className={styles.formGroup}>
                  <label>Prerequisites</label>
                  {taskData.prerequisites.map((prereq, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={prereq}
                        onChange={(e) => handleArrayFieldChange('prerequisites', index, e.target.value)}
                        placeholder="Required knowledge, setup, or dependencies"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('prerequisites', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('prerequisites')}
                    className={styles.addBtn}
                  >
                    + Add Prerequisite
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Must Not Change</label>
                  {taskData.contextBoundaries.mustNotChange.map((boundary, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={boundary}
                        onChange={(e) => handleContextBoundaryChange('mustNotChange', index, e.target.value)}
                        placeholder="What must not be changed"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeContextBoundary('mustNotChange', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addContextBoundary('mustNotChange')}
                    className={styles.addBtn}
                  >
                    + Add Boundary
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Must Not Affect</label>
                  {taskData.contextBoundaries.mustNotAffect.map((boundary, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={boundary}
                        onChange={(e) => handleContextBoundaryChange('mustNotAffect', index, e.target.value)}
                        placeholder="What must not be affected"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeContextBoundary('mustNotAffect', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addContextBoundary('mustNotAffect')}
                    className={styles.addBtn}
                  >
                    + Add Boundary
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Integration Points</label>
                  {taskData.contextBoundaries.integrationPoints.map((point, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={point}
                        onChange={(e) => handleContextBoundaryChange('integrationPoints', index, e.target.value)}
                        placeholder="How this connects to other systems"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeContextBoundary('integrationPoints', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addContextBoundary('integrationPoints')}
                    className={styles.addBtn}
                  >
                    + Add Point
                  </button>
                </div>
              </div>
            )}

            {/* Workflow Section */}
            {activeSection === 'workflow' && (
              <div className={styles.section}>
                <h3>Workflow Context</h3>
                
                <div className={styles.formGroup}>
                  <label>Parent Initiative</label>
                  <input
                    type="text"
                    value={taskData.parentInitiative || ''}
                    onChange={(e) => setTaskData({ ...taskData, parentInitiative: e.target.value })}
                    placeholder="Larger project or initiative this task belongs to"
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Related Tasks</label>
                  {taskData.relatedTasks.map((task, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={task}
                        onChange={(e) => handleArrayFieldChange('relatedTasks', index, e.target.value)}
                        placeholder="Related task IDs or descriptions"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('relatedTasks', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('relatedTasks')}
                    className={styles.addBtn}
                  >
                    + Add Task
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Blockers</label>
                  {taskData.blockers.map((blocker, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={blocker}
                        onChange={(e) => handleArrayFieldChange('blockers', index, e.target.value)}
                        placeholder="Issues that might block this task"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('blockers', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('blockers')}
                    className={styles.addBtn}
                  >
                    + Add Blocker
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Required Skills</label>
                  {taskData.requiredSkills.map((skill, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={skill}
                        onChange={(e) => handleArrayFieldChange('requiredSkills', index, e.target.value)}
                        placeholder="Skills required to complete this task"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('requiredSkills', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('requiredSkills')}
                    className={styles.addBtn}
                  >
                    + Add Skill
                  </button>
                </div>
              </div>
            )}

            {/* Additional Section */}
            {activeSection === 'additional' && (
              <div className={styles.section}>
                <h3>Additional Context</h3>
                
                <div className={styles.formGroup}>
                  <label>Assumptions</label>
                  {taskData.assumptions.map((assumption, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={assumption}
                        onChange={(e) => handleArrayFieldChange('assumptions', index, e.target.value)}
                        placeholder="Assumptions made about the task"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('assumptions', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('assumptions')}
                    className={styles.addBtn}
                  >
                    + Add Assumption
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Risks</label>
                  {taskData.risks.map((risk, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={risk}
                        onChange={(e) => handleArrayFieldChange('risks', index, e.target.value)}
                        placeholder="Potential risks and mitigation strategies"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('risks', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('risks')}
                    className={styles.addBtn}
                  >
                    + Add Risk
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label>Alternatives</label>
                  {taskData.alternatives.map((alternative, index) => (
                    <div key={index} className={styles.arrayField}>
                      <input
                        type="text"
                        value={alternative}
                        onChange={(e) => handleArrayFieldChange('alternatives', index, e.target.value)}
                        placeholder="Alternative approaches considered"
                        className={styles.formInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeArrayField('alternatives', index)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addArrayField('alternatives')}
                    className={styles.addBtn}
                  >
                    + Add Alternative
                  </button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className={styles.formActions}>
              <button
                type="submit"
                disabled={loading || !validation?.isValid}
                className={styles.submitBtn}
              >
                {loading ? 'Creating...' : 'Create Enhanced Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
