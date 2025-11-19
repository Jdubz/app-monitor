/**
 * Agent Assignment Tests
 * 
 * Tests to prevent regression of agent assignments and ensure
 * only valid agent IDs are used in the system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentPersonalityManager } from './agentPersonalities.js';

describe('Agent Assignment System', () => {
  let agentManager: AgentPersonalityManager;

  beforeEach(() => {
    agentManager = new AgentPersonalityManager();
  });

  describe('Valid Agent IDs', () => {
    it('should have all required agent personalities', () => {
      const validAgents = [
        'backend-specialist',
        'frontend-specialist', 
        'review-specialist',
        'testing-specialist',
        'devops-specialist',
        'documentation-specialist'
      ];

      validAgents.forEach(agentId => {
        const agent = agentManager.getPersonality(agentId);
        expect(agent).toBeDefined();
        expect(agent?.id).toBe(agentId);
      });
    });

    it('should reject invalid agent names', () => {
      const invalidAgents = [
        'Alex',
        'Sam', 
        'Casey',
        'Taylor',
        'Jordan',
        'Morgan',
        'invalid-agent',
        'unknown-specialist'
      ];

      invalidAgents.forEach(agentName => {
        const agent = agentManager.getPersonality(agentName);
        expect(agent).toBeUndefined();
      });
    });

    it('should validate agent assignments', () => {
      const validAgents = [
        'backend-specialist',
        'frontend-specialist', 
        'review-specialist',
        'testing-specialist',
        'devops-specialist',
        'documentation-specialist'
      ];

      validAgents.forEach(agentId => {
        const agent = agentManager.getPersonality(agentId);
        expect(agent).toBeDefined();
        expect(agent?.id).toBe(agentId);
        expect(agent?.name).not.toContain('(');
        expect(agent?.name).not.toContain(')');
      });
    });
  });

  describe('Agent Name Format', () => {
    it('should have clean agent names without human names', () => {
      const expectedNames: Record<string, string> = {
        'backend-specialist': 'Backend Specialist',
        'frontend-specialist': 'Frontend Specialist',
        'review-specialist': 'Code Review Specialist',
        'testing-specialist': 'Testing Specialist',
        'devops-specialist': 'DevOps Specialist',
        'documentation-specialist': 'Documentation Specialist'
      };

      Object.entries(expectedNames).forEach(([agentId, expectedName]) => {
        const agent = agentManager.getPersonality(agentId);
        expect(agent?.name).toBe(expectedName);
      });
    });

    it('should not contain human names in agent names', () => {
      const humanNames = ['Alex', 'Sam', 'Casey', 'Taylor', 'Jordan', 'Morgan'];
      
      const agents = [
        'backend-specialist',
        'frontend-specialist', 
        'review-specialist',
        'testing-specialist',
        'devops-specialist',
        'documentation-specialist'
      ];

      agents.forEach(agentId => {
        const agent = agentManager.getPersonality(agentId);
        humanNames.forEach(humanName => {
          expect(agent?.name).not.toContain(humanName);
        });
      });
    });
  });

  describe('Task Type Mapping', () => {
    it('should map task types to valid agents', () => {
      const taskTypes = [
        'implementation',
        'review',
        'testing',
        'documentation',
        'api-development',
        'ui-development'
      ];

      taskTypes.forEach((taskType: string) => {
        const recommendedAgents = agentManager.getRecommendedAgents(taskType);
        expect(recommendedAgents).toBeDefined();
        expect(recommendedAgents.length).toBeGreaterThan(0);

        // All recommended agents should be valid
        recommendedAgents.forEach((agentId: string) => {
          const agent = agentManager.getPersonality(agentId);
          expect(agent).toBeDefined();
        });
      });
    });
  });

  describe('Agent Assignment Validation', () => {
    it('should validate agent assignments for tasks', () => {
      const testTasks = [
        { id: 'task-1', type: 'testing', assignedAgent: 'testing-specialist' },
        { id: 'task-2', type: 'implementation', assignedAgent: 'backend-specialist' },
        { id: 'task-3', type: 'review', assignedAgent: 'review-specialist' }
      ];

      testTasks.forEach(task => {
        const agent = agentManager.getPersonality(task.assignedAgent);
        expect(agent).toBeDefined();
        expect(agent?.id).toBe(task.assignedAgent);
      });
    });

    it('should reject tasks with invalid agent assignments', () => {
      const invalidTasks = [
        { id: 'task-1', type: 'testing', assignedAgent: 'Alex' },
        { id: 'task-2', type: 'implementation', assignedAgent: 'Sam' },
        { id: 'task-3', type: 'review', assignedAgent: 'Casey' }
      ];

      invalidTasks.forEach(task => {
        const agent = agentManager.getPersonality(task.assignedAgent);
        expect(agent).toBeUndefined();
      });
    });
  });

  describe('Agent Specialization', () => {
    it('should have correct specializations for each agent', () => {
      const agentSpecializations = {
        'backend-specialist': ['api-development', 'database-design', 'system-architecture'],
        'frontend-specialist': ['ui-development', 'responsive-design', 'user-experience'],
        'review-specialist': ['code-review', 'security-analysis', 'quality-assurance'],
        'testing-specialist': ['test-automation', 'unit-testing', 'integration-testing'],
        'devops-specialist': ['infrastructure-as-code', 'deployment-automation', 'monitoring'],
        'documentation-specialist': ['technical-writing', 'api-documentation', 'user-guides']
      };

      Object.entries(agentSpecializations).forEach(([agentId, expectedSpecialties]) => {
        const agent = agentManager.getPersonality(agentId);
        expect(agent).toBeDefined();
        expect(agent?.specialties).toEqual(expect.arrayContaining(expectedSpecialties));
      });
    });
  });
});
