/**
 * @deprecated This file is deprecated as of Phase 0.3 (2025-11-10)
 * Replaced by: AgentSelector (intelligent selection) + TaskClassifier
 * 
 * AgentTypeManager provided simple rotation/random selection.
 * The new system uses intelligent task-based selection with:
 * - TaskClassifier: Categorizes tasks by type, complexity, file patterns
 * - AgentSelector: Chooses optimal agent based on task characteristics
 * 
 * Migration path: Use AgentSelector instead
 * This file kept for reference only. Will be removed in future cleanup.
 * 
 * ============================================================================
 * OLD DOCUMENTATION (for reference):
 * ============================================================================
 * Centralized Agent Type Management
 * Consolidates agent type selection and rotation logic that was previously
 * duplicated across devBotsManager.ts and taskExecution.service.ts
 */

import { logger } from '../utils/logger.js';

export type AgentType = 'claude' | 'codex';
export type AgentRotationStrategy = 'alternate' | 'random' | 'claude-only' | 'codex-only';

export interface AgentTypeConfig {
  strategy?: AgentRotationStrategy;
  defaultType?: AgentType;
}

/**
 * Manages agent type selection and rotation
 * Single source of truth for agent type logic
 */
export class AgentTypeManager {
  private lastAgentType: AgentType;
  private readonly strategy: AgentRotationStrategy;

  constructor(config: AgentTypeConfig = {}) {
    this.strategy = config.strategy ?? 'alternate';
    this.lastAgentType = config.defaultType ?? 'claude';

    logger.info({
      category: 'system',
      action: 'agent_type_manager_initialized',
      message: `Agent type manager initialized with strategy: ${this.strategy}`,
      details: {
        strategy: this.strategy,
        defaultType: this.lastAgentType
      }
    });
  }

  /**
   * Choose the next agent type based on the configured strategy
   */
  chooseAgentType(): AgentType {
    let chosenType: AgentType;

    switch (this.strategy) {
      case 'claude-only':
        chosenType = 'claude';
        break;

      case 'codex-only':
        chosenType = 'codex';
        break;

      case 'random':
        chosenType = Math.random() < 0.5 ? 'claude' : 'codex';
        break;

      case 'alternate':
      default:
        // Alternate between claude and codex
        chosenType = this.lastAgentType === 'claude' ? 'codex' : 'claude';
        break;
    }

    this.lastAgentType = chosenType;

    logger.debug({
      category: 'system',
      action: 'agent_type_chosen',
      message: `Selected agent type: ${chosenType}`,
      details: {
        strategy: this.strategy,
        chosenType
      }
    });

    return chosenType;
  }

  /**
   * Get the current strategy
   */
  getStrategy(): AgentRotationStrategy {
    return this.strategy;
  }

  /**
   * Get the last chosen agent type
   */
  getLastAgentType(): AgentType {
    return this.lastAgentType;
  }

  /**
   * Validate if an agent type is supported
   */
  static isValidAgentType(type: string): type is AgentType {
    return type === 'claude' || type === 'codex';
  }

  /**
   * Get all supported agent types
   */
  static getSupportedTypes(): AgentType[] {
    return ['claude', 'codex'];
  }

  /**
   * Get Docker image name for an agent type
   */
  static getDockerImage(agentType: AgentType): string {
    switch (agentType) {
      case 'claude':
        return 'dev-bot-claude:latest';
      case 'codex':
        return 'dev-bot-codex:latest';
      default:
        // Fallback to claude
        return 'dev-bot-claude:latest';
    }
  }
}
