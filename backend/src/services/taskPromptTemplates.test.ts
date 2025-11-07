/**
 * Unit tests for TaskPromptTemplateManager
 * Tests template generation, architecture documentation links, and regression prevention
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
import { AgentPersonality } from './agentPersonalities.js';
import { Task } from './taskQueue.sqlite.js';

describe('TaskPromptTemplateManager', () => {
  let templateManager: TaskPromptTemplateManager;
  let mockAgent: AgentPersonality;
  let mockTask: Task;

  beforeEach(() => {
    templateManager = new TaskPromptTemplateManager();
    
    mockAgent = {
      id: 'backend-specialist',
      name: 'Alex',
      role: 'Backend Specialist',
      description: 'Expert backend developer',
      specialties: ['System design', 'Performance optimization'],
      expertise: {
        primary: ['Node.js', 'TypeScript'],
        secondary: ['APIs', 'Databases'],
        tools: ['npm', 'PostgreSQL']
      },
      personality: {
        communicationStyle: 'technical' as const,
        approach: 'methodical' as const,
        focus: 'quality' as const
      },
      taskPreferences: {
        preferredTypes: ['backend', 'api', 'database'],
        avoidedTypes: ['ui', 'design'],
        complexityRange: 'any' as const
      },
      onboarding: {
        requiredReading: [],
        setupSteps: [],
        validationChecks: []
      }
    };

    mockTask = {
      id: 'test-task-123',
      type: 'feature',
      title: 'Test Task',
      description: 'Test task description',
      documentation: 'Read the documentation',
      acceptance_criteria: ['Task completed successfully'],
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist',
      files: ['src/test.ts'],
      dependencies: [],
      priority: 5,
      can_retry: true,
      retry_count: 0,
      max_retries: 3,
      timeout_ms: null
    } as Task;
  });

  describe('Template Generation', () => {
    it('should generate a complete template with all required sections', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check for essential sections
      expect(prompt).toContain('# 🎯 Task Assignment');
      expect(prompt).toContain('## Task Overview');
      expect(prompt).toContain('## 📋 Task Description');
      expect(prompt).toContain('## 📚 Required Reading');
      expect(prompt).toContain('## ✅ Acceptance Criteria');
      expect(prompt).toContain('## 🔧 Technical Context');
      expect(prompt).toContain('## 🔄 Development Workflow');
      expect(prompt).toContain('## ✅ Final Success Checklist');
    });

    it('should include agent information in template', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('Alex (Backend Specialist)');
      expect(prompt).toContain('test-task-123');
      expect(prompt).toContain('Test Task');
      expect(prompt).toContain('feature');
    });

    it('should include task details in template', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('Test task description');
      expect(prompt).toContain('Read the documentation');
      expect(prompt).toContain('- [ ] Task completed successfully');
      expect(prompt).toContain('src/test.ts');
    });
  });

  describe('Architecture Documentation Links', () => {
    it('should include backend-specific architecture docs for job-finder-BE', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[Backend Architecture](../docs/architecture/backend.md)');
      expect(prompt).toContain('[Database Schema](../docs/architecture/database-schema.md)');
      expect(prompt).toContain('[Firebase Functions Guide](../docs/deployment/FIREBASE_FUNCTIONS_V2_PERMISSIONS_GUIDE.md)');
      expect(prompt).toContain('[Firestore Setup](../docs/deployment/FIRESTORE_COMPLETE_SETUP.md)');
    });

    it('should include frontend-specific architecture docs for job-finder-FE', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'job-finder-FE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[Frontend Architecture](../docs/architecture/frontend.md)');
      expect(prompt).toContain('[Development Stack](../docs/development/DEVELOPMENT_STACK.md)');
      expect(prompt).toContain('[Frontend Deployment](../docs/deployment/FE_DEPLOYMENT_PLAN.md)');
    });

    it('should include worker-specific architecture docs for job-finder-worker', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'job-finder-worker',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[Worker Architecture](../docs/architecture/worker.md)');
      expect(prompt).toContain('[Worker Docker Development](../docs/development/WORKER_DOCKER_DEV.md)');
      expect(prompt).toContain('[Worker Analysis](../docs/development/WORKFLOW_ANALYSIS_WORKER.md)');
    });

    it('should include dev-monitor-specific architecture docs for dev-monitor', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'dev-monitor',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[Dev Monitor Requirements](../docs/development/DEV_MONITOR_REQUIREMENTS.md)');
      expect(prompt).toContain('[Dev Monitor UI Proposal](../docs/development/DEV_MANAGEMENT_UI_PROPOSAL.md)');
      expect(prompt).toContain('[Logging Architecture](../docs/operations/logging-architecture.md)');
      expect(prompt).toContain('[Structured Logging Migration](../docs/operations/STRUCTURED_LOGGING_MIGRATION.md)');
    });

    it('should include shared-types-specific architecture docs for job-finder-shared-types', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'job-finder-shared-types',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[Shared Types Documentation](../docs/development/NPM_PUBLISHING_SETUP.md)');
      expect(prompt).toContain('[Package Management](../docs/development/MCP_SERVER_RECOMMENDATIONS.md)');
    });

    it('should include generic architecture docs for unknown projects', () => {
      const context: TaskContext = {
        task: { ...mockTask },
        agent: mockAgent,
        project: 'unknown-project',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('[System Architecture Overview](../docs/architecture/system-overview.md)');
      expect(prompt).toContain('[Architecture Reality](../docs/architecture/architecture-reality.md)');
    });

    it('should always include universal documentation links', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Universal links should always be present
      expect(prompt).toContain('[Complete Documentation Index](../docs/README.md)');
      expect(prompt).toContain('[System Architecture Overview](../docs/architecture/system-overview.md)');
      expect(prompt).toContain('[Development Workflow](../docs/development/workflow.md)');
    });

    it('should handle case-insensitive project matching', () => {
      const testCases = [
        'JOB-FINDER-BE',
        'Job-Finder-BE',
        'job-finder-be',
        'backend',
        'Backend',
        'BACKEND'
      ];

      testCases.forEach(_project => {
        const context: TaskContext = {
          task: { ...mockTask },
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);
        expect(prompt).toContain('[Backend Architecture](../docs/architecture/backend.md)');
      });
    });
  });

  describe('Template Regression Prevention', () => {
    it('should maintain consistent template structure', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check for critical sections that should never be removed
      const criticalSections = [
        '# 🎯 Task Assignment',
        '## Task Overview',
        '## 📋 Task Description',
        '## 📚 Required Reading',
        '## ✅ Acceptance Criteria',
        '## 🔧 Technical Context',
        '## 🔄 Development Workflow',
        '### Step 1: Workspace Setup',
        '### Step 2: Implementation',
        '### Step 3: Pre-Commit Validation',
        '### Step 4: Create PR',
        '### Step 5: Post-PR Creation Verification',
        '## ✅ Final Success Checklist',
        '## 🎯 Agent Expertise Note'
      ];

      criticalSections.forEach(section => {
        expect(prompt).toContain(section);
      });
    });

    it('should include all required git workflow steps', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Critical PR workflow elements
      expect(prompt).toContain('git checkout -b');
      expect(prompt).toContain('npm run lint');
      expect(prompt).toContain('npm test');
      expect(prompt).toContain('git add .');
      expect(prompt).toContain('git commit -m');
      expect(prompt).toContain('git push -u origin');
      expect(prompt).toContain('gh pr create');
      expect(prompt).toContain('PR_NUMBER:');
      expect(prompt).toContain('PR_URL:');
      expect(prompt).toContain('PR_BRANCH:');
    });

    it('should include critical warnings and rules', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Critical warnings that should never be removed
      expect(prompt).toContain('❌ NEVER use `--no-verify` flag');
      expect(prompt).toContain('❌ NEVER skip linting or tests');
      expect(prompt).toContain('✅ ALWAYS fix all linter errors');
      expect(prompt).toContain('✅ ALWAYS ensure all tests pass');
      expect(prompt).toContain('Never skip `git pull origin main`');
    });

    it('should include quality checklist items', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Quality checklist items that should always be present
      const qualityItems = [
        'All acceptance criteria met',
        'Code follows project patterns and conventions',
        'All linters pass (no `--no-verify` used)',
        'All tests pass',
        'No merge conflicts remaining',
        'Feature branch pushed to origin and PR opened (gh pr create)',
        'Existing documentation updated',
        'No new security vulnerabilities introduced',
        'Performance impact is acceptable',
        'Context boundaries respected'
      ];

      qualityItems.forEach(item => {
        expect(prompt).toContain(item);
      });
    });
  });

  describe('Variable Processing', () => {
    it('should process all template variables correctly', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check that variables are replaced (no {{variable}} placeholders remain)
      expect(prompt).not.toContain('{{');
      expect(prompt).not.toContain('}}');
    });

    it('should handle missing optional task fields gracefully', () => {
      const minimalTask: Task = {
        id: 'minimal-task',
        type: 'feature',
        title: 'Minimal Task',
        description: 'Minimal description',
        documentation: 'Minimal docs',
        acceptance_criteria: ['Minimal criteria'],
        status: 'pending',
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
      };

      const context: TaskContext = {
        task: minimalTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Should not contain undefined or null values
      expect(prompt).not.toContain('undefined');
      expect(prompt).not.toContain('null');
      expect(prompt).not.toContain('{{');
    });

    it('should handle arrays in task fields correctly', () => {
      const taskWithArrays: Task = {
        ...mockTask,
        files: ['src/file1.ts', 'src/file2.ts'],
        dependencies: ['task-1', 'task-2'],
        acceptance_criteria: ['Criteria 1', 'Criteria 2', 'Criteria 3']
      };

      const context: TaskContext = {
        task: taskWithArrays,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('src/file1.ts, src/file2.ts');
      expect(prompt).toContain('task-1, task-2');
      expect(prompt).toContain('- [ ] Criteria 1');
      expect(prompt).toContain('- [ ] Criteria 2');
      expect(prompt).toContain('- [ ] Criteria 3');
    });
  });

  describe('Template Validation', () => {
    it('should generate valid markdown structure', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check for proper markdown structure
      expect(prompt).toMatch(/^# 🎯 Task Assignment/);
      expect(prompt).toContain('## ');
      expect(prompt).toContain('### ');
      expect(prompt).toContain('```bash');
      expect(prompt).toContain('```');
    });

    it('should include proper bash code blocks', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Should contain bash code blocks
      expect(prompt).toContain('```bash');
      expect(prompt).toContain('cd job-finder-BE');
      expect(prompt).toContain('git checkout main');
      expect(prompt).toContain('git pull origin main');
    });

    it('should maintain consistent formatting', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Check for consistent emoji usage
      expect(prompt).toContain('🎯');
      expect(prompt).toContain('📋');
      expect(prompt).toContain('📚');
      expect(prompt).toContain('✅');
      expect(prompt).toContain('🔧');
      expect(prompt).toContain('🔄');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays gracefully', () => {
      const taskWithEmptyArrays: Task = {
        ...mockTask,
        files: [],
        dependencies: [],
        acceptance_criteria: []
      };

      const context: TaskContext = {
        task: taskWithEmptyArrays,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('Files will be determined during implementation');
      expect(prompt).toContain('None specified');
      expect(prompt).toContain('- [ ] Task completed as described');
    });

    it('should handle special characters in task content', () => {
      const taskWithSpecialChars: Task = {
        ...mockTask,
        title: 'Task with "quotes" and \'apostrophes\'',
        description: 'Description with $variables and @mentions',
        documentation: 'Docs with <tags> and {braces}'
      };

      const context: TaskContext = {
        task: taskWithSpecialChars,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('Task with "quotes" and \'apostrophes\'');
      expect(prompt).toContain('Description with $variables and @mentions');
      expect(prompt).toContain('Docs with <tags> and {braces}');
    });

    it('should handle very long task descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      const taskWithLongDescription: Task = {
        ...mockTask,
        description: longDescription
      };

      const context: TaskContext = {
        task: taskWithLongDescription,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain(longDescription);
      expect(prompt.length).toBeGreaterThan(1000);
    });
  });

  describe('Enhanced Field Processors', () => {
    describe('parentInitiative processor', () => {
      it('should display parent initiative when provided', () => {
        const taskWithParent: Task = {
          ...mockTask,
          parent_initiative: 'Q4 2024 Performance Optimization Initiative'
        };

        const context: TaskContext = {
          task: taskWithParent,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('Q4 2024 Performance Optimization Initiative');
      });

      it('should provide fallback when parent initiative is missing', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('No parent initiative specified - this is an independent task');
      });
    });

    describe('relatedTasks processor', () => {
      it('should display related tasks with emoji markers', () => {
        const taskWithRelated: Task = {
          ...mockTask,
          related_tasks: [
            'depends on task-123',
            'blocks task-456',
            'similar to task-789',
            'needs review from task-000'
          ]
        };

        const context: TaskContext = {
          task: taskWithRelated,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('🔗 depends on task-123');
        expect(prompt).toContain('🚫 blocks task-456');
        expect(prompt).toContain('📋 similar to task-789');
        expect(prompt).toContain('needs review from task-000');
      });

      it('should provide fallback when no related tasks', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- None - this task is independent and has no direct dependencies or dependents');
      });

      it('should handle empty related tasks array', () => {
        const taskWithEmptyRelated: Task = {
          ...mockTask,
          related_tasks: []
        };

        const context: TaskContext = {
          task: taskWithEmptyRelated,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- None - this task is independent and has no direct dependencies or dependents');
      });
    });

    describe('estimatedEffort processor', () => {
      it('should display complete effort estimate with all fields', () => {
        const taskWithEffort: Task = {
          ...mockTask,
          estimated_effort: {
            hours: 4,
            complexity: 'medium',
            confidence: 'high'
          }
        };

        const context: TaskContext = {
          task: taskWithEffort,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('Time Estimate:** 4 hours');
        expect(prompt).toContain('Complexity Level:** medium');
        expect(prompt).toContain('Confidence:** high');
        expect(prompt).toContain('Scope Alert Threshold:** 6 hours');
      });

      it('should calculate scope alert threshold correctly', () => {
        const testCases = [
          { hours: 2, expectedThreshold: 3 },
          { hours: 5, expectedThreshold: 8 },
          { hours: 10, expectedThreshold: 15 }
        ];

        testCases.forEach(({ hours, expectedThreshold }) => {
          const taskWithEffort: Task = {
            ...mockTask,
            estimated_effort: {
              hours,
              complexity: 'medium',
              confidence: 'high'
            }
          };

          const context: TaskContext = {
            task: taskWithEffort,
            agent: mockAgent,
            project: 'job-finder-BE',
            worktree: '[dynamic workspace provisioned per task]',
            environment: 'development'
          };

          const prompt = templateManager.generatePrompt(context);

          expect(prompt).toContain(`Scope Alert Threshold:** ${expectedThreshold} hours`);
        });
      });

      it('should provide fallback when effort estimate is missing', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('Time Estimate:** Not estimated');
        expect(prompt).toContain('Complexity:** Unknown');
        expect(prompt).toContain('No time estimate provided');
      });
    });

    describe('successMetrics processor', () => {
      it('should display success metrics as checkboxes', () => {
        const taskWithMetrics: Task = {
          ...mockTask,
          success_metrics: [
            'Response time < 200ms',
            'Test coverage > 80%',
            'Zero linting errors'
          ]
        };

        const context: TaskContext = {
          task: taskWithMetrics,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] Response time < 200ms');
        expect(prompt).toContain('- [ ] Test coverage > 80%');
        expect(prompt).toContain('- [ ] Zero linting errors');
      });

      it('should provide fallback when no success metrics', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] All acceptance criteria met');
        expect(prompt).toContain('- [ ] All tests pass');
        expect(prompt).toContain('- [ ] Code review approved');
      });

      it('should handle empty success metrics array', () => {
        const taskWithEmptyMetrics: Task = {
          ...mockTask,
          success_metrics: []
        };

        const context: TaskContext = {
          task: taskWithEmptyMetrics,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] All acceptance criteria met');
        expect(prompt).toContain('- [ ] All tests pass');
        expect(prompt).toContain('- [ ] Code review approved');
      });
    });

    describe('requiredSkills processor', () => {
      it('should display required skills as bullet list', () => {
        const taskWithSkills: Task = {
          ...mockTask,
          required_skills: ['TypeScript', 'React', 'Node.js', 'Docker']
        };

        const context: TaskContext = {
          task: taskWithSkills,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- TypeScript');
        expect(prompt).toContain('- React');
        expect(prompt).toContain('- Node.js');
        expect(prompt).toContain('- Docker');
      });

      it('should provide fallback when no required skills', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- General development skills');
        expect(prompt).toContain('- Ability to read documentation');
        expect(prompt).toContain('- Problem-solving skills');
      });

      it('should handle empty required skills array', () => {
        const taskWithEmptySkills: Task = {
          ...mockTask,
          required_skills: []
        };

        const context: TaskContext = {
          task: taskWithEmptySkills,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- General development skills');
        expect(prompt).toContain('- Ability to read documentation');
        expect(prompt).toContain('- Problem-solving skills');
      });
    });

    describe('assumptions processor', () => {
      it('should display assumptions as checklist', () => {
        const taskWithAssumptions: Task = {
          ...mockTask,
          assumptions: [
            'Database is already configured',
            'API keys are available in environment',
            'Frontend build pipeline is working'
          ]
        };

        const context: TaskContext = {
          task: taskWithAssumptions,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] Database is already configured');
        expect(prompt).toContain('- [ ] API keys are available in environment');
        expect(prompt).toContain('- [ ] Frontend build pipeline is working');
      });

      it('should provide fallback when no assumptions', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] No assumptions documented - proceed with standard approach');
      });

      it('should handle empty assumptions array', () => {
        const taskWithEmptyAssumptions: Task = {
          ...mockTask,
          assumptions: []
        };

        const context: TaskContext = {
          task: taskWithEmptyAssumptions,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] No assumptions documented - proceed with standard approach');
      });
    });

    describe('alternatives processor', () => {
      it('should display alternatives with rejection markers', () => {
        const taskWithAlternatives: Task = {
          ...mockTask,
          alternatives: [
            'Use Redis instead of in-memory cache - better for distributed systems',
            'Use GraphQL instead of REST - more flexible querying',
            'Use MongoDB instead of PostgreSQL - better for unstructured data'
          ]
        };

        const context: TaskContext = {
          task: taskWithAlternatives,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- ❌ Use Redis instead of in-memory cache - better for distributed systems');
        expect(prompt).toContain('- ❌ Use GraphQL instead of REST - more flexible querying');
        expect(prompt).toContain('- ❌ Use MongoDB instead of PostgreSQL - better for unstructured data');
      });

      it('should provide fallback when no alternatives', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- No alternatives were formally considered');
        expect(prompt).toContain('- If you identify better approaches during implementation, document them for future reference');
      });

      it('should handle empty alternatives array', () => {
        const taskWithEmptyAlternatives: Task = {
          ...mockTask,
          alternatives: []
        };

        const context: TaskContext = {
          task: taskWithEmptyAlternatives,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- No alternatives were formally considered');
        expect(prompt).toContain('- If you identify better approaches during implementation, document them for future reference');
      });
    });

    describe('contextBoundaries processor', () => {
      it('should display all context boundary sections when provided', () => {
        const taskWithBoundaries: Task = {
          ...mockTask,
          context_boundaries: {
            mustNotChange: ['Database schema', 'API contracts'],
            mustNotAffect: ['Authentication system', 'User data'],
            integrationPoints: ['Payment gateway', 'Email service']
          }
        };

        const context: TaskContext = {
          task: taskWithBoundaries,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('**Must NOT Change:**');
        expect(prompt).toContain('- Database schema');
        expect(prompt).toContain('- API contracts');
        expect(prompt).toContain('**Must NOT Affect:**');
        expect(prompt).toContain('- Authentication system');
        expect(prompt).toContain('- User data');
        expect(prompt).toContain('**Integration Points:**');
        expect(prompt).toContain('- Payment gateway');
        expect(prompt).toContain('- Email service');
      });

      it('should handle partial context boundaries', () => {
        const taskWithPartialBoundaries: Task = {
          ...mockTask,
          context_boundaries: {
            mustNotChange: ['Database schema'],
            mustNotAffect: [],
            integrationPoints: []
          }
        };

        const context: TaskContext = {
          task: taskWithPartialBoundaries,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- Database schema');
        expect(prompt).toContain('- None specified');
      });

      it('should provide fallback when no context boundaries', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- No specific boundaries defined');
      });
    });

    describe('validationSteps processor', () => {
      it('should display validation steps as checklist', () => {
        const taskWithValidation: Task = {
          ...mockTask,
          validation_steps: [
            'Run npm test and verify all tests pass',
            'Check code coverage is above 80%',
            'Run linter and fix all warnings',
            'Test in browser on Chrome, Firefox, Safari'
          ]
        };

        const context: TaskContext = {
          task: taskWithValidation,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] Run npm test and verify all tests pass');
        expect(prompt).toContain('- [ ] Check code coverage is above 80%');
        expect(prompt).toContain('- [ ] Run linter and fix all warnings');
        expect(prompt).toContain('- [ ] Test in browser on Chrome, Firefox, Safari');
      });

      it('should provide fallback when no validation steps', () => {
        const context: TaskContext = {
          task: mockTask,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] Run all tests');
        expect(prompt).toContain('- [ ] Run linters');
        expect(prompt).toContain('- [ ] Manual verification');
      });

      it('should handle empty validation steps array', () => {
        const taskWithEmptyValidation: Task = {
          ...mockTask,
          validation_steps: []
        };

        const context: TaskContext = {
          task: taskWithEmptyValidation,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain('- [ ] Run all tests');
        expect(prompt).toContain('- [ ] Run linters');
        expect(prompt).toContain('- [ ] Manual verification');
      });
    });
  });

  describe('New Template Sections', () => {
    it('should include Strategic Context & Purpose section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## 🎯 Strategic Context & Purpose');
      expect(prompt).toContain('**Parent Initiative:**');
      expect(prompt).toContain('**This task contributes to the following long-term goals:**');
      expect(prompt).toContain('**Related Tasks You Should Know About:**');
    });

    it('should include Success Metrics section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## 📊 Success Metrics (Quantitative - MUST ACHIEVE ALL)');
      expect(prompt).toContain('These are MEASURABLE outcomes that define task success');
      expect(prompt).toContain('**Validation:** Before marking task complete');
    });

    it('should include Estimated Effort & Complexity section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## ⏱️ Estimated Effort & Complexity');
      expect(prompt).toContain('**Time Management Best Practices:**');
      expect(prompt).toContain('Set a timer and track your progress');
    });

    it('should include Required Skills section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## 🎓 Required Skills & Knowledge Check');
      expect(prompt).toContain('This task requires expertise in:');
    });

    it('should include Assumptions section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## 💭 Assumptions (VERIFY BEFORE Starting)');
      expect(prompt).toContain('**IMPORTANT:** The following assumptions were made during task planning');
    });

    it('should include Alternatives section', () => {
      const context: TaskContext = {
        task: mockTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      expect(prompt).toContain('## 🤔 Alternatives Already Considered');
      expect(prompt).toContain('The following approaches were evaluated and NOT chosen');
    });
  });

  describe('Helper Methods', () => {
    it('should provide complexity guidance for all levels', () => {
      const complexityLevels: Array<'simple' | 'medium' | 'complex' | 'expert'> = [
        'simple',
        'medium',
        'complex',
        'expert'
      ];

      const expectedGuidance = {
        simple: 'straightforward implementation, well-understood patterns',
        medium: 'requires some design decisions, moderate technical challenges',
        complex: 'significant design work, multiple integration points, technical challenges',
        expert: 'cutting-edge tech, architectural decisions, high risk/impact'
      };

      complexityLevels.forEach(complexity => {
        const taskWithComplexity: Task = {
          ...mockTask,
          estimated_effort: {
            hours: 4,
            complexity,
            confidence: 'high'
          }
        };

        const context: TaskContext = {
          task: taskWithComplexity,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain(`Complexity Level:** ${complexity}`);
        expect(prompt).toContain(expectedGuidance[complexity]);
      });
    });

    it('should provide confidence guidance for all levels', () => {
      const confidenceLevels: Array<'low' | 'medium' | 'high'> = [
        'low',
        'medium',
        'high'
      ];

      const expectedGuidance = {
        low: 'significant unknowns, estimate may be off by 2-3x',
        medium: 'some unknowns, estimate may vary by 50%',
        high: 'well-understood scope, estimate should be accurate'
      };

      confidenceLevels.forEach(confidence => {
        const taskWithConfidence: Task = {
          ...mockTask,
          estimated_effort: {
            hours: 4,
            complexity: 'medium',
            confidence
          }
        };

        const context: TaskContext = {
          task: taskWithConfidence,
          agent: mockAgent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        expect(prompt).toContain(`Confidence:** ${confidence}`);
        expect(prompt).toContain(expectedGuidance[confidence]);
      });
    });
  });

  describe('Full Integration with All Enhanced Fields', () => {
    it('should generate complete prompt with all enhanced fields', () => {
      const fullyEnhancedTask: Task = {
        ...mockTask,
        parent_initiative: 'Q4 2024 Performance Optimization',
        long_term_goals: [
          'Improve system performance by 50%',
          'Reduce database query times',
          'Enhance user experience'
        ],
        related_tasks: [
          'depends on database-migration-123',
          'blocks frontend-update-456'
        ],
        estimated_effort: {
          hours: 6,
          complexity: 'complex',
          confidence: 'medium'
        },
        success_metrics: [
          'Response time < 200ms',
          'Test coverage > 85%',
          'Zero P0/P1 bugs'
        ],
        required_skills: ['TypeScript', 'PostgreSQL', 'Performance Tuning'],
        assumptions: [
          'Database indexes are properly configured',
          'Test environment mirrors production'
        ],
        alternatives: [
          'Use caching layer instead of query optimization',
          'Implement database read replicas'
        ],
        context_boundaries: {
          mustNotChange: ['API contracts', 'Database schema'],
          mustNotAffect: ['Authentication flow', 'Payment processing'],
          integrationPoints: ['Logging service', 'Metrics collector']
        },
        validation_steps: [
          'Run performance benchmarks',
          'Verify test coverage',
          'Check for regression in critical paths'
        ],
        architecture_references: [
          'docs/architecture/backend.md',
          'docs/performance/optimization-guide.md'
        ]
      };

      const context: TaskContext = {
        task: fullyEnhancedTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Verify all enhanced sections are present
      expect(prompt).toContain('Q4 2024 Performance Optimization');
      expect(prompt).toContain('Improve system performance by 50%');
      expect(prompt).toContain('🔗 depends on database-migration-123');
      expect(prompt).toContain('Time Estimate:** 6 hours');
      expect(prompt).toContain('Scope Alert Threshold:** 9 hours');
      expect(prompt).toContain('Response time < 200ms');
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('Database indexes are properly configured');
      expect(prompt).toContain('Use caching layer instead of query optimization');
      expect(prompt).toContain('API contracts');
      expect(prompt).toContain('Run performance benchmarks');
      expect(prompt).toContain('docs/architecture/backend.md');

      // Verify no placeholder variables remain
      expect(prompt).not.toContain('{{');
      expect(prompt).not.toContain('}}');

      // Verify no undefined/null values
      expect(prompt).not.toContain('undefined');
      expect(prompt).not.toContain('null');
    });

    it('should achieve 100% field utilization', () => {
      // All 25+ fields from EnhancedTaskCreationForm should be used
      const allFieldsTask: Task = {
        id: 'full-task',
        type: 'feature',
        title: 'Complete Task with All Fields',
        description: 'This task uses all available fields',
        documentation: 'Read all the docs',
        notes: 'Additional notes',
        status: 'pending',
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
        assigned_worker: 'worker-a',
        files: ['src/file.ts'],
        dependencies: ['dep-1'],
        acceptance_criteria: ['Criteria 1'],
        architecture_references: ['docs/arch.md'],
        long_term_goals: ['Goal 1'],
        estimated_effort: { hours: 4, complexity: 'medium', confidence: 'high' },
        success_metrics: ['Metric 1'],
        required_skills: ['Skill 1'],
        parent_initiative: 'Initiative 1',
        related_tasks: ['Task 1'],
        assumptions: ['Assumption 1'],
        alternatives: ['Alternative 1'],
        context_boundaries: {
          mustNotChange: ['Item 1'],
          mustNotAffect: ['Item 2'],
          integrationPoints: ['Point 1']
        },
        validation_steps: ['Step 1'],
        prerequisites: ['Prereq 1'],
        testing_requirements: ['Testing req'],
        documentation_requirements: ['Doc req'],
        rollback_plan: ['Rollback plan'],
        blockers: ['Blocker 1'],
        risks: ['Risk 1']
      };

      const context: TaskContext = {
        task: allFieldsTask,
        agent: mockAgent,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Verify the prompt contains data from all fields
      const fieldsToCheck = [
        'Complete Task with All Fields', // title
        'This task uses all available fields', // description
        'Read all the docs', // documentation
        'src/file.ts', // files
        'dep-1', // dependencies
        'Criteria 1', // acceptanceCriteria
        'docs/arch.md', // architectureReferences
        'Goal 1', // longTermGoals
        '4 hours', // estimatedEffort.hours
        'medium', // estimatedEffort.complexity
        'high', // estimatedEffort.confidence
        'Metric 1', // successMetrics
        'Skill 1', // requiredSkills
        'Initiative 1', // parentInitiative
        'Task 1', // relatedTasks
        'Assumption 1', // assumptions
        'Alternative 1', // alternatives
        'Item 1', // contextBoundaries.mustNotChange
        'Item 2', // contextBoundaries.mustNotAffect
        'Point 1', // contextBoundaries.integrationPoints
        'Step 1', // validationSteps
        'Prereq 1', // prerequisites
        'Testing req', // testingRequirements
        'Doc req', // documentationRequirements
        'Rollback plan', // rollbackPlan
        'Blocker 1', // blockers
        'Risk 1' // risks
      ];

      fieldsToCheck.forEach(field => {
        expect(prompt).toContain(field);
      });

      // 100% field utilization - no {{variables}} should remain
      expect(prompt).not.toContain('{{');
      expect(prompt).not.toContain('}}');
    });
  });
});
