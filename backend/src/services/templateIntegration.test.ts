// @ts-nocheck
/**
 * Integration tests for Task Template System
 * Tests the complete template generation pipeline with real-world scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
import { AgentPersonality } from './agentPersonalities.js';
import { Task } from './taskQueue.sqlite.js';

describe('Template Integration Tests', () => {
  let templateManager: TaskPromptTemplateManager;

  beforeEach(() => {
    templateManager = new TaskPromptTemplateManager();
  });

  describe('Real-World Task Scenarios', () => {
    it('should generate complete template for backend feature task', () => {
      const backendAgent: any = {
        id: 'backend-specialist',
        name: 'Alex',
        role: 'Backend Specialist',
        description: 'Expert in backend development',
        specialties: ['API design', 'Database optimization'],
        expertise: { primary: ['Node.js', 'TypeScript'], secondary: ['APIs', 'Databases'], tools: ['npm', 'PostgreSQL'] },
        personality: { communicationStyle: 'technical' as const, approach: 'methodical' as const, focus: 'quality' as const },
                taskPreferences: { preferredTypes: ['backend', 'api', 'database'], avoidedTypes: ['ui', 'design'], complexityRange: 'any' as const },
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const backendTask: Task = {
        id: 'backend-feature-123',
        type: 'feature',
        title: 'Add user authentication endpoint',
        description: 'Implement OAuth2 authentication endpoint with JWT tokens',
        documentation: 'Review authentication architecture and security requirements',
        acceptance_criteria: [
          'OAuth2 endpoint implemented',
          'JWT token generation working',
          'Security tests passing',
          'API documentation updated'
        ],
        status: 'pending',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        files: ['src/auth/', 'src/middleware/', 'src/routes/auth.ts'],
        dependencies: ['task-456', 'task-789'],
        architecture_references: [
          'Authentication flow diagram',
          'Security requirements document'
        ],
        prerequisites: [
          'Review existing auth middleware',
          'Set up test environment',
          'Configure OAuth2 provider'
        ],
        context_boundaries: {
          mustNotChange: ['User model', 'Database schema'],
          mustNotAffect: ['Frontend components', 'Worker processes'],
          integrationPoints: ['User service', 'Token validation']
        },
        testing_requirements: [
          'Unit tests for auth logic',
          'Integration tests for endpoints',
          'Security penetration testing'
        ],
        documentation_requirements: [
          'API documentation update',
          'Authentication guide',
          'Security considerations'
        ],
        validation_steps: [
          'Test authentication flow',
          'Verify token generation',
          'Check security headers',
          'Validate error handling'
        ],
        rollback_plan: [
          'Revert auth endpoint changes',
          'Restore previous middleware',
          'Update API documentation'
        ],
        blockers: [
          'OAuth2 provider configuration pending',
          'Security review required'
        ],
        risks: [
          'Potential security vulnerabilities',
          'Performance impact on auth flow'
        ]
      };

      const context: TaskContext = {
        task: backendTask,
        agent: backendAgent as unknown as AgentPersonality,
        project: 'job-finder-BE',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Verify complete template structure
      expect(prompt).toContain('# 🎯 Task Assignment');
      expect(prompt).toContain('Alex (Backend Specialist)');
      expect(prompt).toContain('backend-feature-123');
      expect(prompt).toContain('Add user authentication endpoint');
      expect(prompt).toContain('Implement OAuth2 authentication endpoint');

      // Verify backend-specific architecture docs
      expect(prompt).toContain('[Backend Architecture](../docs/architecture/backend.md)');
      expect(prompt).toContain('[Database Schema](../docs/architecture/database-schema.md)');
      expect(prompt).toContain('[Firebase Functions Guide](../docs/deployment/FIREBASE_FUNCTIONS_V2_PERMISSIONS_GUIDE.md)');

      // Verify task details
      expect(prompt).toContain('src/auth/, src/middleware/, src/routes/auth.ts');
      expect(prompt).toContain('task-456, task-789');
      expect(prompt).toContain('- [ ] OAuth2 endpoint implemented');
      expect(prompt).toContain('- [ ] JWT token generation working');

      // Verify context boundaries
      expect(prompt).toContain('User model');
      expect(prompt).toContain('Database schema');
      expect(prompt).toContain('Frontend components');

      // Verify testing and documentation requirements
      expect(prompt).toContain('Unit tests for auth logic');
      expect(prompt).toContain('API documentation update');
      expect(prompt).toContain('Test authentication flow');

      // Verify warnings and blockers
      expect(prompt).toContain('OAuth2 provider configuration pending');
      expect(prompt).toContain('Potential security vulnerabilities');
    });

    it('should generate complete template for frontend feature task', () => {
      const frontendAgent: any = {
        id: 'frontend-specialist',
        name: 'Sam',
        role: 'Frontend Specialist',
        description: 'Expert in frontend development',
        specialties: ['UI design', 'User experience'],
        expertise: { primary: ['React', 'TypeScript'], secondary: ['UI/UX'], tools: ['npm'] },
        personality: { communicationStyle: 'collaborative' as const, approach: 'creative' as const, focus: 'innovation' as const },
        communicationStyle: 'Clear and visual',
        preferredTaskTypes: ['frontend', 'ui', 'ux'],
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const frontendTask: Task = {
        id: 'frontend-feature-456',
        type: 'feature',
        title: 'Implement user dashboard',
        description: 'Create responsive user dashboard with job search history and preferences',
        documentation: 'Review UI/UX guidelines and component library',
        acceptance_criteria: [
          'Dashboard layout implemented',
          'Job search history displayed',
          'User preferences editable',
          'Mobile responsive design'
        ],
        status: 'pending',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'frontend-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        files: ['src/components/Dashboard/', 'src/pages/UserDashboard.tsx'],
        dependencies: ['task-123'],
        architecture_references: [
          'UI/UX design system',
          'Component library documentation'
        ],
        prerequisites: [
          'Review design mockups',
          'Set up component library',
          'Configure routing'
        ],
        context_boundaries: {
          mustNotChange: ['Authentication flow', 'API endpoints'],
          mustNotAffect: ['Backend services', 'Database'],
          integrationPoints: ['User service', 'Job search API']
        },
        testing_requirements: [
          'Component unit tests',
          'Visual regression tests',
          'Accessibility testing'
        ],
        documentation_requirements: [
          'Component documentation',
          'User guide update',
          'Design system documentation'
        ],
        validation_steps: [
          'Test dashboard functionality',
          'Verify responsive design',
          'Check accessibility compliance',
          'Validate user interactions'
        ],
        rollback_plan: [
          'Revert dashboard components',
          'Restore previous routing',
          'Update user guide'
        ],
        blockers: [
          'Design mockups pending approval',
          'Component library version conflict'
        ],
        risks: [
          'Performance impact on large datasets',
          'Accessibility compliance issues'
        ]
      };

      const context: TaskContext = {
        task: frontendTask,
        project: 'job-finder-FE',
        agent: frontendAgent as unknown as AgentPersonality,
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Verify frontend-specific architecture docs
      expect(prompt).toContain('[Frontend Architecture](../docs/architecture/frontend.md)');
      expect(prompt).toContain('[Development Stack](../docs/development/DEVELOPMENT_STACK.md)');
      expect(prompt).toContain('[Frontend Deployment](../docs/deployment/FE_DEPLOYMENT_PLAN.md)');

      // Verify task details
      expect(prompt).toContain('Sam (Frontend Specialist)');
      expect(prompt).toContain('frontend-feature-456');
      expect(prompt).toContain('Implement user dashboard');
      expect(prompt).toContain('src/components/Dashboard/, src/pages/UserDashboard.tsx');

      // Verify frontend-specific requirements
      expect(prompt).toContain('Component unit tests');
      expect(prompt).toContain('Visual regression tests');
      expect(prompt).toContain('Accessibility testing');
      expect(prompt).toContain('Component documentation');
    });

    it('should generate complete template for worker task', () => {
      const workerAgent: any = {
        id: 'devops-specialist',
        name: 'Casey',
        role: 'DevOps Specialist',
        expertise: { primary: ['Docker', 'Python'], secondary: ['Infrastructure'], tools: ['npm'] },
        personality: { communicationStyle: 'formal' as const, approach: 'methodical' as const, focus: 'reliability' as const },
        communicationStyle: 'Technical and detailed',
        preferredTaskTypes: ['infrastructure', 'deployment', 'automation'],
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const workerTask: Task = {
        id: 'worker-task-789',
        type: 'feature',
        title: 'Optimize job scraping performance',
        description: 'Improve job scraping efficiency and add parallel processing',
        documentation: 'Review current scraping architecture and performance metrics',
        acceptance_criteria: [
          'Parallel processing implemented',
          'Performance improved by 50%',
          'Error handling enhanced',
          'Monitoring added'
        ],
        status: 'pending',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'devops-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        files: ['src/scrapers/', 'src/workers/', 'docker-compose.yml'],
        dependencies: ['task-123', 'task-456'],
        architecture_references: [
          'Scraping architecture diagram',
          'Performance benchmarks'
        ],
        prerequisites: [
          'Review current performance metrics',
          'Set up monitoring tools',
          'Configure parallel processing'
        ],
        context_boundaries: {
          mustNotChange: ['Database schema', 'API contracts'],
          mustNotAffect: ['Frontend application', 'User experience'],
          integrationPoints: ['Job database', 'Queue system']
        },
        testing_requirements: [
          'Performance tests',
          'Load testing',
          'Error handling tests'
        ],
        documentation_requirements: [
          'Performance documentation',
          'Deployment guide update',
          'Monitoring setup guide'
        ],
        validation_steps: [
          'Run performance benchmarks',
          'Test parallel processing',
          'Verify error handling',
          'Check monitoring metrics'
        ],
        rollback_plan: [
          'Revert to previous scraping logic',
          'Restore original performance',
          'Update monitoring configuration'
        ],
        blockers: [
          'Performance testing environment setup',
          'Monitoring tools configuration'
        ],
        risks: [
          'Resource usage increase',
          'Potential data consistency issues'
        ]
      };

      const context: TaskContext = {
        task: workerTask,
        project: 'job-finder-worker',
        agent: workerAgent as unknown as AgentPersonality,
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Verify worker-specific architecture docs
      expect(prompt).toContain('[Worker Architecture](../docs/architecture/worker.md)');
      expect(prompt).toContain('[Worker Docker Development](../docs/development/WORKER_DOCKER_DEV.md)');
      expect(prompt).toContain('[Worker Analysis](../docs/development/WORKFLOW_ANALYSIS_WORKER.md)');

      // Verify task details
      expect(prompt).toContain('Casey (DevOps Specialist)');
      expect(prompt).toContain('worker-task-789');
      expect(prompt).toContain('Optimize job scraping performance');
      expect(prompt).toContain('src/scrapers/, src/workers/, docker-compose.yml');

      // Verify worker-specific requirements
      expect(prompt).toContain('Performance tests');
      expect(prompt).toContain('Load testing');
      expect(prompt).toContain('Performance documentation');
    });
  });

  describe('Template Completeness', () => {
    it('should include all required sections for any task type', () => {
      const minimalTask: Task = {
        id: 'minimal-task',
        type: 'feature',
        title: 'Minimal Task',
        description: 'Minimal description',
        documentation: 'Minimal docs',
        acceptance_criteria: ['Minimal criteria'],
        status: 'pending',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
      };

      const minimalAgent: any = {
        id: 'backend-specialist',
        name: 'Alex',
        role: 'Backend Specialist',
        description: 'Expert in backend development',
        specialties: ['API design', 'Database optimization'],
        expertise: { primary: ['Node.js'], secondary: [], tools: ['npm'] },
        personality: { communicationStyle: 'technical' as const, approach: 'methodical' as const, focus: 'quality' as const },
        communicationStyle: 'Technical',
        preferredTaskTypes: ['backend'],
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const context: TaskContext = {
        task: minimalTask,
        project: 'job-finder-BE',
        agent: minimalAgent as unknown as AgentPersonality,
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);

      // Essential sections that must always be present
      const essentialSections = [
        '# 🎯 Task Assignment',
        '## Task Overview',
        '## 📋 Task Description',
        '## 📚 Required Reading',
        '## ✅ Acceptance Criteria',
        '## 🔧 Technical Context',
        '## 🔄 Development Workflow',
        '## ✅ Final Success Checklist'
      ];

      essentialSections.forEach(section => {
        expect(prompt).toContain(section);
      });
    });

    it('should handle all task types consistently', () => {
      const taskTypes = ['feature', 'bugfix', 'refactor', 'testing', 'documentation', 'cleanup'];
      
      taskTypes.forEach(taskType => {
        const task: Task = {
          id: `test-${taskType}`,
          type: taskType,
          title: `Test ${taskType} task`,
          description: `Test ${taskType} description`,
          documentation: `Test ${taskType} docs`,
          acceptance_criteria: [`Test ${taskType} criteria`],
          status: 'pending',
          priority: 1,
          created_at: Date.now(),
          assigned_agent: 'backend-specialist',
          can_retry: true,
          retry_count: 0,
          max_retries: 3,
          timeout_ms: null,
        };

        const agent: AgentPersonality = {
          id: 'backend-specialist',
          name: 'Alex',
          role: 'Backend Specialist',
          description: 'Expert in backend development',
          specialties: ['API design', 'Database optimization'],
          expertise: { primary: ['Node.js'], secondary: [], tools: ['npm'] },
          personality: { communicationStyle: 'technical' as const, approach: 'methodical' as const, focus: 'quality' as const },
          taskPreferences: { preferredTypes: ['backend'], avoidedTypes: [], complexityRange: 'any' as const },
          onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
        };

        const context: TaskContext = {
          task,
          agent,
          project: 'job-finder-BE',
          worktree: '[dynamic workspace provisioned per task]',
          environment: 'development'
        };

        const prompt = templateManager.generatePrompt(context);

        // All task types should generate complete templates
        expect(prompt).toContain('# 🎯 Task Assignment');
        expect(prompt).toContain(`**Type**: ${taskType}`);
        expect(prompt).toContain(`Test ${taskType} task`);
        expect(prompt).toContain(`Test ${taskType} description`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing optional fields gracefully', () => {
      const incompleteTask: Task = {
        id: 'incomplete-task',
        type: 'feature',
        title: 'Incomplete Task',
        description: 'Incomplete description',
        documentation: 'Incomplete docs',
        acceptance_criteria: ['Incomplete criteria'],
        status: 'pending',
        priority: 5,
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        // Provide default values for enhanced fields to avoid template placeholders
        plan_id: undefined,
        related_tasks: undefined,
        estimated_effort: undefined,
        success_metrics: undefined,
        required_skills: undefined,
        assumptions: undefined,
        alternatives: undefined,
        context_boundaries: undefined,
        validation_steps: undefined
      } as Task;

      const agent: AgentPersonality = {
        id: 'backend-specialist',
        name: 'Alex',
        role: 'Backend Specialist',
        description: 'Expert in backend development',
        specialties: ['API design', 'Database optimization'],
        expertise: { primary: ['Node.js'], secondary: [], tools: ['npm'] },
        personality: { communicationStyle: 'technical' as const, approach: 'methodical' as const, focus: 'quality' as const },
        taskPreferences: { preferredTypes: ['backend'], avoidedTypes: [], complexityRange: 'any' as const },
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const context: TaskContext = {
        task: incompleteTask,
        agent,
        worktree: '[dynamic workspace provisioned per task]',
        project: 'job-finder-BE',
        environment: 'development'
      };

      const prompt = templateManager.generatePrompt(context);
      const sanitizedPrompt = prompt.replace(/\/dev\/null/gi, '');

      // Should not contain undefined or null values (excluding intentional /dev/null usage)
      expect(prompt).not.toContain('undefined');
      expect(sanitizedPrompt).not.toMatch(/\bnull\b/i);
      expect(prompt).not.toContain('{{');
      expect(prompt).not.toContain('}}');

      // Should still generate a complete template
      expect(prompt).toContain('# 🎯 Task Assignment');
      expect(prompt).toContain('Incomplete Task');
    });

    it('should handle empty arrays gracefully', () => {
      const taskWithEmptyArrays: Task = {
        id: 'empty-arrays-task',
        type: 'feature',
        title: 'Empty Arrays Task',
        description: 'Task with empty arrays',
        documentation: 'Task docs',
        acceptance_criteria: [],
        status: 'pending',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'backend-specialist',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        files: [],
        dependencies: [],
      };

      const agent: AgentPersonality = {
        id: 'backend-specialist',
        name: 'Alex',
        role: 'Backend Specialist',
        description: 'Expert in backend development',
        specialties: ['API design', 'Database optimization'],
        expertise: { primary: ['Node.js'], secondary: [], tools: ['npm'] },
        personality: { communicationStyle: 'technical' as const, approach: 'methodical' as const, focus: 'quality' as const },
        taskPreferences: { preferredTypes: ['backend'], avoidedTypes: [], complexityRange: 'any' as const },
        onboarding: { requiredReading: [], setupSteps: [], validationChecks: [] }
      };

      const context: TaskContext = {
        task: taskWithEmptyArrays,
        agent,
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development',
        project: 'job-finder-BE',
      };

      const prompt = templateManager.generatePrompt(context);

      // Should handle empty arrays gracefully
      expect(prompt).toContain('Files will be determined during implementation');
      expect(prompt).toContain('None specified');
      expect(prompt).toContain('- [ ] Task completed as described');
    });
  });
});
