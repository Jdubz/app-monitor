// @ts-nocheck
/**
 * TaskPromptTemplates Context Bundle Tests
 * 
 * Tests context bundle integration in prompt generation
 */

import { describe, it, expect } from 'vitest';
import { TaskPromptTemplateManager, TaskContext } from '../taskPromptTemplates.js';
import type { Task } from '../devBotsManager.js';
import type { AgentPersonality } from '../agentPersonalities.js';

describe('TaskPromptTemplateManager - Context Bundle', () => {
  const manager = new TaskPromptTemplateManager();

  const mockAgent: AgentPersonality = {
    id: 'test-agent',
    name: 'Test Agent',
    role: 'Backend Specialist',
    systemPrompt: 'Test system prompt',
    temperature: 0.7,
    expertise: {
      primary: ['TypeScript', 'Node.js'],
      secondary: ['Testing', 'Docker'],
      tools: []
    },
    workingHours: { start: 9, end: 17, timezone: 'UTC' },
    maxConcurrentTasks: 3,
    preferredTaskTypes: ['implementation', 'fix']
  };

  describe('Context Bundle Variable', () => {
    it('should generate context bundle section with profiles', () => {
      const task: Partial<Task> = {
        id: 'test-task-1',
        type: 'implementation',
        title: 'Test Task',
        description: 'Test description',
        context_bundle_id: 'bundle-123',
        context_profiles: ['scope-control', 'dev-monitor', 'pr-workflow']
      };

      const context: TaskContext = {
        task: task as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = manager.generatePrompt(context);

      // Should include context bundle section
      expect(prompt).toContain('## 📦 Context Bundle');
      expect(prompt).toContain('curated context bundle');
      
      // Should list all profiles
      expect(prompt).toContain('Scope Control');
      expect(prompt).toContain('Dev Monitor');
      expect(prompt).toContain('Pr Workflow');
      
      // Should include file paths
      expect(prompt).toContain('/workspace/context/scope-control.md');
      expect(prompt).toContain('/workspace/context/dev-monitor.md');
      expect(prompt).toContain('/workspace/context/pr-workflow.md');
      
      // Should include purposes
      expect(prompt).toContain('Prevents scope creep');
      expect(prompt).toContain('Development best practices');
      expect(prompt).toContain('Git and PR workflow');
      
      // Should include guidance
      expect(prompt).toContain('When to Read');
      expect(prompt).toContain('How to Use Context Files');
      expect(prompt).toContain('READ-ONLY references');
    });

    it('should handle task with no context bundle', () => {
      const task: Partial<Task> = {
        id: 'test-task-2',
        type: 'implementation',
        title: 'Test Task',
        description: 'Test description'
      };

      const context: TaskContext = {
        task: task as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = manager.generatePrompt(context);

      // Should include fallback message
      expect(prompt).toContain('No context bundle available');
    });

    it('should handle task with bundle ID but no profiles', () => {
      const task: Partial<Task> = {
        id: 'test-task-3',
        type: 'implementation',
        title: 'Test Task',
        description: 'Test description',
        context_bundle_id: 'bundle-456',
        context_profiles: []
      };

      const context: TaskContext = {
        task: task as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = manager.generatePrompt(context);

      // Should include bundle ID and fallback
      expect(prompt).toContain('bundle-456');
      expect(prompt).toContain('Context files available at');
    });

    it('should place context bundle before required reading', () => {
      const task: Partial<Task> = {
        id: 'test-task-4',
        type: 'implementation',
        title: 'Test Task',
        description: 'Test description',
        documentation: 'Some documentation',
        context_bundle_id: 'bundle-789',
        context_profiles: ['scope-control']
      };

      const context: TaskContext = {
        task: task as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = manager.generatePrompt(context);

      const contextBundleIndex = prompt.indexOf('## 📦 Context Bundle');
      const requiredReadingIndex = prompt.indexOf('## 📚 Required Reading');

      // Context bundle should come before required reading
      expect(contextBundleIndex).toBeGreaterThan(-1);
      expect(requiredReadingIndex).toBeGreaterThan(-1);
      expect(contextBundleIndex).toBeLessThan(requiredReadingIndex);
    });

    it('should include correct profile purposes and guidance', () => {
      const task: Partial<Task> = {
        id: 'test-task-5',
        type: 'implementation',
        title: 'Test Task',
        description: 'Test description',
        context_bundle_id: 'bundle-999',
        context_profiles: ['failure-recovery', 'testing', 'security']
      };

      const context: TaskContext = {
        task: task as Task,
        agent: mockAgent,
        project: 'test-project',
        worktree: '/workspace',
        environment: 'development'
      };

      const prompt = manager.generatePrompt(context);

      // Check failure-recovery
      expect(prompt).toContain('Error handling and recovery patterns');
      expect(prompt).toContain('Read BEFORE implementing error handling');
      
      // Check testing
      expect(prompt).toContain('Testing strategies and requirements');
      expect(prompt).toContain('Read BEFORE writing tests');
      
      // Check security
      expect(prompt).toContain('Security best practices and constraints');
      expect(prompt).toContain('Read BEFORE handling auth');
    });
  });
});
