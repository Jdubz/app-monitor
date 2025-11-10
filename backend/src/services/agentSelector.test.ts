import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSelector, type AgentSelectionCriteria } from './agentSelector.js';

describe('AgentSelector', () => {
  let selector: AgentSelector;

  beforeEach(() => {
    selector = new AgentSelector();
  });

  describe('selectAgent', () => {
    describe('Manual Override', () => {
      it('should respect manual agent preference', () => {
        const criteria: AgentSelectionCriteria = {
          preferredAgent: 'codex',
          taskCategory: 'implementation' // Would normally select Claude
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('Manual override');
        expect(result.confidence).toBe(1.0);
      });
    });

    describe('Documentation Tasks', () => {
      it('should select Codex for documentation tasks', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'documentation',
          filePatterns: ['md'],
          complexity: 'simple'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('Documentation');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.fallbackAgent).toBe('claude');
      });

      it('should select Codex for only markdown files', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['md'],
          complexity: 'simple'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('markdown');
      });
    });

    describe('Analysis Tasks', () => {
      it('should select Codex for analysis tasks', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'analysis',
          complexity: 'medium'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('analysis');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should select Codex for review tasks', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'review',
          filePatterns: ['ts', 'js']
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('review');
      });

      it('should select Codex for planning tasks', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'planning',
          complexity: 'complex'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('planning');
      });
    });

    describe('Implementation Tasks', () => {
      it('should select Claude for implementation tasks', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['ts', 'tsx'],
          complexity: 'medium'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Code files');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should select Claude for TypeScript files', () => {
        const criteria: AgentSelectionCriteria = {
          filePatterns: ['ts'],
          taskCategory: 'implementation'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Code files');
      });

      it('should select Claude for JavaScript files', () => {
        const criteria: AgentSelectionCriteria = {
          filePatterns: ['js', 'jsx'],
          taskCategory: 'implementation'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
      });

      it('should select Claude for Python files', () => {
        const criteria: AgentSelectionCriteria = {
          filePatterns: ['py']
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Code files');
      });
    });

    describe('SQL/Database Tasks', () => {
      it('should select Claude for SQL implementation', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['sql']
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('SQL implementation');
      });

      it('should select Codex for SQL analysis', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'analysis',
          filePatterns: ['sql']
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('analysis');
      });
    });

    describe('Task Classification Integration', () => {
      it('should classify task from title and description', () => {
        const criteria: AgentSelectionCriteria = {
          taskTitle: 'Implement user authentication',
          taskDescription: 'Add JWT authentication to auth.ts and user.service.ts'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Code files');
      });

      it('should classify documentation task from title', () => {
        const criteria: AgentSelectionCriteria = {
          taskTitle: 'Update API documentation',
          taskDescription: 'Write comprehensive docs in README.md'
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
      });
    });

    describe('Fallback After Failure', () => {
      it('should try Codex after Claude fails', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['ts'],
          previousAttempts: [
            { agent: 'claude', result: 'failure', timestamp: Date.now() }
          ]
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('codex');
        expect(result.reasoning).toContain('Previous attempt');
        expect(result.reasoning).toContain('failed');
        expect(result.confidence).toBe(0.8);
      });

      it('should try Claude after Codex fails on code files', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['ts', 'js'],
          previousAttempts: [
            { agent: 'codex', result: 'failure', timestamp: Date.now() }
          ]
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Previous attempt');
      });

      it('should not change agent after success', () => {
        const criteria: AgentSelectionCriteria = {
          taskCategory: 'implementation',
          filePatterns: ['ts'],
          previousAttempts: [
            { agent: 'claude', result: 'success', timestamp: Date.now() }
          ]
        };

        const result = selector.selectAgent(criteria);

        // Should select based on rules, not previous attempt
        expect(result.agent).toBe('claude');
        expect(result.reasoning).not.toContain('Previous attempt');
      });
    });

    describe('Default Selection', () => {
      it('should default to Claude for unclear tasks', () => {
        const criteria: AgentSelectionCriteria = {
          // No clear indicators
        };

        const result = selector.selectAgent(criteria);

        expect(result.agent).toBe('claude');
        expect(result.reasoning).toContain('Default selection');
        expect(result.confidence).toBe(0.7);
      });
    });
  });

  describe('explainSelection', () => {
    it('should provide detailed explanation', () => {
      const criteria: AgentSelectionCriteria = {
        taskCategory: 'implementation',
        filePatterns: ['ts', 'tsx'],
        complexity: 'medium'
      };

      const explanation = selector.explainSelection(criteria);

      expect(explanation).toContain('Selected: claude');
      expect(explanation).toContain('Category: implementation');
      expect(explanation).toContain('Files: ts, tsx');
      expect(explanation).toContain('Complexity: medium');
      expect(explanation).toContain('Confidence:');
    });

    it('should explain manual override', () => {
      const criteria: AgentSelectionCriteria = {
        preferredAgent: 'codex',
        taskCategory: 'implementation'
      };

      const explanation = selector.explainSelection(criteria);

      expect(explanation).toContain('Selected: codex');
      expect(explanation).toContain('Manual override');
      expect(explanation).toContain('100%');
    });
  });

  describe('Static Methods', () => {
    it('should get Docker image for Claude', () => {
      const image = AgentSelector.getDockerImage('claude');
      expect(image).toBe('dev-bot-claude:latest');
    });

    it('should get Docker image for Codex', () => {
      const image = AgentSelector.getDockerImage('codex');
      expect(image).toBe('dev-bot-codex:latest');
    });

    it('should throw error for Copilot Docker image', () => {
      expect(() => AgentSelector.getDockerImage('copilot')).toThrow('GitHub delegation');
    });

    it('should validate agent types', () => {
      expect(AgentSelector.isValidAgentType('claude')).toBe(true);
      expect(AgentSelector.isValidAgentType('codex')).toBe(true);
      expect(AgentSelector.isValidAgentType('copilot')).toBe(true);
      expect(AgentSelector.isValidAgentType('invalid')).toBe(false);
    });

    it('should return supported types', () => {
      const types = AgentSelector.getSupportedTypes();
      expect(types).toEqual(['claude', 'codex', 'copilot']);
    });
  });
});
