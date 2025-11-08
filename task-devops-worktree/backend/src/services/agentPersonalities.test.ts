/**
 * Agent Personalities Service Tests
 * 
 * Tests the AgentPersonalityManager for personality management, 
 * task assignment logic, and agent recommendations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentPersonalityManager, type AgentPersonality } from './agentPersonalities.js';

describe('AgentPersonalityManager', () => {
  let manager: AgentPersonalityManager;

  beforeEach(() => {
    manager = new AgentPersonalityManager();
  });

  describe('Initialization', () => {
    it('should initialize with default personalities', () => {
      // Given: Manager is created
      // When: Manager is initialized
      // Then: Default personalities are loaded
      const personalities = manager.getAllPersonalities();
      expect(personalities).toHaveLength(6); // backend, frontend, review, testing, devops, documentation
      
      // And: Each personality has required fields
      personalities.forEach(personality => {
        expect(personality.id).toBeDefined();
        expect(personality.name).toBeDefined();
        expect(personality.role).toBeDefined();
        expect(personality.description).toBeDefined();
        expect(personality.specialties).toBeDefined();
        expect(personality.expertise).toBeDefined();
        expect(personality.personality).toBeDefined();
        expect(personality.onboarding).toBeDefined();
        expect(personality.taskPreferences).toBeDefined();
      });
    });

    it('should initialize with task type mappings', () => {
      // Given: Manager is created
      // When: Manager is initialized
      // Then: Task type mappings are available
      const backendAgents = manager.getRecommendedAgents('implementation');
      const frontendAgents = manager.getRecommendedAgents('ui-development');
      
      expect(backendAgents).toContain('backend-specialist');
      expect(frontendAgents).toContain('frontend-specialist');
    });
  });

  describe('Personality Management', () => {
    it('should get personality by ID', () => {
      // Given: Manager with personalities
      // When: Getting specific personality
      const personality = manager.getPersonality('backend-specialist');
      
      // Then: Correct personality is returned
      expect(personality).toBeDefined();
      expect(personality?.id).toBe('backend-specialist');
      expect(personality?.name).toBe('Backend Specialist');
      expect(personality?.role).toBe('Backend Development & API Implementation');
    });

    it('should return undefined for non-existent personality', () => {
      // Given: Manager with personalities
      // When: Getting non-existent personality
      const personality = manager.getPersonality('non-existent');
      
      // Then: Undefined is returned
      expect(personality).toBeUndefined();
    });

    it('should get all personalities', () => {
      // Given: Manager with personalities
      // When: Getting all personalities
      const personalities = manager.getAllPersonalities();
      
      // Then: All personalities are returned
      expect(personalities).toHaveLength(6);
      expect(personalities.map(p => p.id)).toContain('backend-specialist');
      expect(personalities.map(p => p.id)).toContain('frontend-specialist');
      expect(personalities.map(p => p.id)).toContain('review-specialist');
      expect(personalities.map(p => p.id)).toContain('testing-specialist');
      expect(personalities.map(p => p.id)).toContain('devops-specialist');
      expect(personalities.map(p => p.id)).toContain('documentation-specialist');
    });

    it('should add new personality', () => {
      // Given: New personality data
      const newPersonality: AgentPersonality = {
        id: 'test-specialist',
        name: 'Test Specialist',
        role: 'Testing & Quality Assurance',
        description: 'Expert in testing and quality assurance',
        specialties: ['unit-testing', 'integration-testing', 'e2e-testing'],
        expertise: {
          primary: ['Jest', 'Cypress', 'Testing Library'],
          secondary: ['Selenium', 'Playwright', 'Mocha'],
          tools: ['VS Code', 'Chrome DevTools', 'Postman']
        },
        personality: {
          communicationStyle: 'technical',
          approach: 'methodical',
          focus: 'quality'
        },
        onboarding: {
          requiredReading: ['TESTING_GUIDELINES.md'],
          setupSteps: ['Install testing tools', 'Configure test environment'],
          validationChecks: ['Tests are comprehensive', 'Coverage meets standards']
        },
        taskPreferences: {
          preferredTypes: ['testing', 'quality-assurance'],
          avoidedTypes: ['ui-design', 'database-design'],
          complexityRange: 'any'
        }
      };

      // When: Adding new personality
      manager.addPersonality(newPersonality);

      // Then: Personality is added
      const retrieved = manager.getPersonality('test-specialist');
      expect(retrieved).toEqual(newPersonality);
    });

    it('should update existing personality', () => {
      // Given: Existing personality
      const updates = {
        name: 'Updated Backend Specialist',
        description: 'Updated description'
      };

      // When: Updating personality
      manager.updatePersonality('backend-specialist', updates);

      // Then: Personality is updated
      const updated = manager.getPersonality('backend-specialist');
      expect(updated?.name).toBe('Updated Backend Specialist');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.id).toBe('backend-specialist'); // ID should remain unchanged
    });

    it('should handle update of non-existent personality gracefully', () => {
      // Given: Non-existent personality ID
      const updates = { name: 'Updated Name' };

      // When: Updating non-existent personality
      // Then: No error is thrown
      expect(() => {
        manager.updatePersonality('non-existent', updates);
      }).not.toThrow();
    });
  });

  describe('Task Assignment Logic', () => {
    it('should get recommended agents for task type', () => {
      // Given: Task type
      const taskType = 'implementation';

      // When: Getting recommended agents
      const agents = manager.getRecommendedAgents(taskType);

      // Then: Correct agents are returned
      expect(agents).toContain('backend-specialist');
      expect(agents).toContain('frontend-specialist');
    });

    it('should get fallback agents for task type', () => {
      // Given: Task type
      const taskType = 'implementation';

      // When: Getting fallback agents
      const agents = manager.getFallbackAgents(taskType);

      // Then: Fallback agents are returned
      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should return empty array for unknown task type', () => {
      // Given: Unknown task type
      const taskType = 'unknown-task-type';

      // When: Getting recommended agents
      const agents = manager.getRecommendedAgents(taskType);

      // Then: Empty array is returned
      expect(agents).toEqual([]);
    });

    it('should find best agent based on requirements', () => {
      // Given: Task type and requirements
      const taskType = 'implementation';
      const requirements = ['Node.js', 'TypeScript', 'PostgreSQL'];

      // When: Finding best agent
      const bestAgent = manager.findBestAgent(taskType, requirements);

      // Then: Best matching agent is returned
      expect(bestAgent).toBe('backend-specialist');
    });

    it('should find fallback agent when recommended agents don\'t match', () => {
      // Given: Task type with specific requirements
      const taskType = 'implementation';
      const requirements = ['Python', 'Django', 'MongoDB']; // Not in backend specialist's primary skills

      // When: Finding best agent
      const bestAgent = manager.findBestAgent(taskType, requirements);

      // Then: Fallback agent is returned
      expect(bestAgent).toBeDefined();
      expect(bestAgent).not.toBeNull();
    });

    it('should return null when no agent matches requirements', () => {
      // Given: Task type with impossible requirements
      const taskType = 'implementation';
      const requirements = ['ImpossibleSkill1', 'ImpossibleSkill2'];

      // When: Finding best agent
      const bestAgent = manager.findBestAgent(taskType, requirements);

      // Then: Null is returned
      expect(bestAgent).toBeNull();
    });

    it('should handle empty requirements', () => {
      // Given: Task type with no specific requirements
      const taskType = 'implementation';
      const requirements: string[] = [];

      // When: Finding best agent
      const bestAgent = manager.findBestAgent(taskType, requirements);

      // Then: First recommended agent is returned
      expect(bestAgent).toBeDefined();
      expect(bestAgent).not.toBeNull();
    });
  });

  describe('Onboarding Instructions', () => {
    it('should get onboarding instructions for agent', () => {
      // Given: Agent ID
      const agentId = 'backend-specialist';

      // When: Getting onboarding instructions
      const instructions = manager.getOnboardingInstructions(agentId);

      // Then: Instructions are returned
      expect(instructions).not.toBeNull();
      if (!instructions) {
        throw new Error('Expected onboarding instructions for backend-specialist');
      }

      expect(instructions.requiredReading).toBeDefined();
      expect(instructions.setupSteps).toBeDefined();
      expect(instructions.validationChecks).toBeDefined();
      expect(Array.isArray(instructions.requiredReading)).toBe(true);
      expect(Array.isArray(instructions.setupSteps)).toBe(true);
      expect(Array.isArray(instructions.validationChecks)).toBe(true);
    });

    it('should return empty instructions for non-existent agent', () => {
      // Given: Non-existent agent ID
      const agentId = 'non-existent';

      // When: Getting onboarding instructions
      const instructions = manager.getOnboardingInstructions(agentId);

      // Then: Null is returned for non-existent agent
      expect(instructions).toBeNull();
    });
  });

  describe('Agent Preferences', () => {
    it('should get agent preferences', () => {
      // Given: Agent ID
      const agentId = 'backend-specialist';

      // When: Getting agent preferences
      const preferences = manager.getAgentPreferences(agentId);

      // Then: Preferences are returned
      expect(preferences).not.toBeNull();
      if (!preferences) {
        throw new Error('Expected preferences for backend-specialist');
      }

      expect(preferences.preferredTypes).toBeDefined();
      expect(preferences.avoidedTypes).toBeDefined();
      expect(preferences.complexityRange).toBeDefined();
      expect(Array.isArray(preferences.preferredTypes)).toBe(true);
      expect(Array.isArray(preferences.avoidedTypes)).toBe(true);
      expect(['simple', 'medium', 'complex', 'any']).toContain(preferences.complexityRange);
    });

    it('should return default preferences for non-existent agent', () => {
      // Given: Non-existent agent ID
      const agentId = 'non-existent';

      // When: Getting agent preferences
      const preferences = manager.getAgentPreferences(agentId);

      // Then: Null is returned for non-existent agent
      expect(preferences).toBeNull();
    });
  });

  describe('Personality Validation', () => {
    it('should validate personality structure', () => {
      // Given: Valid personality
      const personality = manager.getPersonality('backend-specialist');

      // Then: Personality has valid structure
      expect(personality).toBeDefined();
      expect(personality?.expertise.primary).toBeDefined();
      expect(personality?.expertise.secondary).toBeDefined();
      expect(personality?.expertise.tools).toBeDefined();
      expect(personality?.personality.communicationStyle).toBeDefined();
      expect(personality?.personality.approach).toBeDefined();
      expect(personality?.personality.focus).toBeDefined();
      expect(personality?.onboarding.requiredReading).toBeDefined();
      expect(personality?.onboarding.setupSteps).toBeDefined();
      expect(personality?.onboarding.validationChecks).toBeDefined();
      expect(personality?.taskPreferences.preferredTypes).toBeDefined();
      expect(personality?.taskPreferences.avoidedTypes).toBeDefined();
      expect(personality?.taskPreferences.complexityRange).toBeDefined();
    });

    it('should have valid communication styles', () => {
      // Given: All personalities
      const personalities = manager.getAllPersonalities();

      // Then: All have valid communication styles
      personalities.forEach(personality => {
        expect(['formal', 'casual', 'technical', 'collaborative']).toContain(
          personality.personality.communicationStyle
        );
      });
    });

    it('should have valid approaches', () => {
      // Given: All personalities
      const personalities = manager.getAllPersonalities();

      // Then: All have valid approaches
      personalities.forEach(personality => {
        expect(['methodical', 'creative', 'analytical', 'pragmatic']).toContain(
          personality.personality.approach
        );
      });
    });

    it('should have valid focus areas', () => {
      // Given: All personalities
      const personalities = manager.getAllPersonalities();

      // Then: All have valid focus areas
      personalities.forEach(personality => {
        expect(['quality', 'speed', 'innovation', 'reliability']).toContain(
          personality.personality.focus
        );
      });
    });

    it('should have valid complexity ranges', () => {
      // Given: All personalities
      const personalities = manager.getAllPersonalities();

      // Then: All have valid complexity ranges
      personalities.forEach(personality => {
        expect(['simple', 'medium', 'complex', 'any']).toContain(
          personality.taskPreferences.complexityRange
        );
      });
    });
  });

  describe('Task Type Mappings', () => {
    it('should have mappings for common task types', () => {
      // Given: Common task types
      const commonTaskTypes = [
        'implementation',
        'ui-development',
        'testing',
        'deployment',
        'documentation',
        'api-development',
        'review'
      ];

      // When: Checking mappings
      commonTaskTypes.forEach(taskType => {
        const recommended = manager.getRecommendedAgents(taskType);
        const fallback = manager.getFallbackAgents(taskType);

        // Then: Each task type has mappings
        expect(recommended.length + fallback.length).toBeGreaterThan(0);
      });
    });

    it('should have non-overlapping recommended and fallback agents', () => {
      // Given: Task type
      const taskType = 'implementation';

      // When: Getting recommended and fallback agents
      const recommended = manager.getRecommendedAgents(taskType);
      const fallback = manager.getFallbackAgents(taskType);

      // Then: No overlap between recommended and fallback
      const overlap = recommended.filter(agent => fallback.includes(agent));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty task type', () => {
      // Given: Empty task type
      const taskType = '';

      // When: Getting agents
      const recommended = manager.getRecommendedAgents(taskType);
      const fallback = manager.getFallbackAgents(taskType);

      // Then: Empty arrays are returned
      expect(recommended).toEqual([]);
      expect(fallback).toEqual([]);
    });

    it('should handle null/undefined requirements', () => {
      // Given: Task type
      const taskType = 'implementation';

      // When: Finding agent with null requirements
      // Then: Error is handled gracefully
      expect(() => {
        manager.findBestAgent(taskType, null as any);
      }).toThrow();
    });

    it('should handle duplicate personality IDs', () => {
      // Given: Personality with existing ID
      const duplicatePersonality: AgentPersonality = {
        id: 'backend-specialist', // Same as existing
        name: 'Duplicate Backend Specialist',
        role: 'Duplicate Role',
        description: 'Duplicate description',
        specialties: ['duplicate'],
        expertise: {
          primary: ['Duplicate'],
          secondary: ['Duplicate'],
          tools: ['Duplicate']
        },
        personality: {
          communicationStyle: 'technical',
          approach: 'methodical',
          focus: 'quality'
        },
        onboarding: {
          requiredReading: ['Duplicate'],
          setupSteps: ['Duplicate'],
          validationChecks: ['Duplicate']
        },
        taskPreferences: {
          preferredTypes: ['duplicate'],
          avoidedTypes: ['duplicate'],
          complexityRange: 'any'
        }
      };

      // When: Adding duplicate personality
      manager.addPersonality(duplicatePersonality);

      // Then: Original personality is replaced
      const retrieved = manager.getPersonality('backend-specialist');
      expect(retrieved?.name).toBe('Duplicate Backend Specialist');
    });
  });
});
