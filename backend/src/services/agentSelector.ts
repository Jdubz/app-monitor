/**
 * Intelligent Agent Selection Service
 * 
 * Replaces simple rotation (AgentTypeManager) with intelligent selection
 * based on task characteristics. Routes tasks to the best agent:
 * - Claude: Code implementation, file editing, refactoring
 * - Codex: Analysis, documentation, planning, review
 * - Copilot: Simple, low-risk polish tasks (future)
 * 
 * Part of Phase 0: Intelligent Agent Selection Strategy
 */

import { logger } from '../utils/logger.js';
import { TaskClassifier, type TaskCategory, type TaskComplexity } from './taskClassifier.js';

export type AgentType = 'claude' | 'codex' | 'copilot';

export interface AgentSelectionCriteria {
  taskCategory?: TaskCategory;
  filePatterns?: string[];
  complexity?: TaskComplexity;
  preferredAgent?: AgentType; // Manual override
  previousAttempts?: AgentAttempt[];
  taskTitle?: string;
  taskDescription?: string;
}

export interface AgentAttempt {
  agent: AgentType;
  result: 'success' | 'failure';
  timestamp: number;
}

export interface AgentSelection {
  agent: AgentType;
  reasoning: string;
  confidence: number; // 0-1 score
  fallbackAgent?: AgentType;
}

/**
 * Intelligent Agent Selector
 * Uses task classification to select the best agent for each task
 */
export class AgentSelector {
  private readonly classifier: TaskClassifier;

  constructor() {
    this.classifier = new TaskClassifier();

    logger.info({
      category: 'automation',
      action: 'agent_selector_initialized',
      message: 'Intelligent agent selector initialized (Phase 0.2)',
      details: {
        strategy: 'intelligent_classification',
        agents: ['claude', 'codex', 'copilot']
      }
    });
  }

  /**
   * Select the best agent for a task based on intelligent criteria
   */
  selectAgent(criteria: AgentSelectionCriteria): AgentSelection {
    // Manual override takes precedence
    if (criteria.preferredAgent) {
      return this.createSelection(
        criteria.preferredAgent,
        'Manual override: preferred agent specified',
        1.0
      );
    }

    // Classify task if not already classified
    let category = criteria.taskCategory;
    let filePatterns = criteria.filePatterns || [];
    let complexity = criteria.complexity;

    if (!category && (criteria.taskTitle || criteria.taskDescription)) {
      const classification = this.classifier.classifyTask({
        title: criteria.taskTitle || '',
        description: criteria.taskDescription
      });
      category = classification.category;
      filePatterns = classification.filePatterns;
      complexity = classification.complexity;
    }

    // Check if previous attempts should influence selection
    if (criteria.previousAttempts && criteria.previousAttempts.length > 0) {
      const lastAttempt = criteria.previousAttempts[criteria.previousAttempts.length - 1];
      if (lastAttempt.result === 'failure') {
        // Try different agent after failure
        const alternateAgent = this.getAlternateAgent(lastAttempt.agent, category, filePatterns);
        return this.createSelection(
          alternateAgent,
          `Previous attempt with ${lastAttempt.agent} failed, trying alternate agent`,
          0.8,
          lastAttempt.agent
        );
      }
    }

    // Apply intelligent selection rules
    const selection = this.applySelectionRules(category, filePatterns, complexity);

    logger.info({
      category: 'automation',
      action: 'agent_selected',
      message: selection.reasoning,
      details: {
        agent: selection.agent,
        category,
        filePatterns,
        complexity,
        confidence: selection.confidence
      }
    });

    return selection;
  }

  /**
   * Apply selection rules based on task characteristics
   */
  private applySelectionRules(
    category?: TaskCategory,
    filePatterns?: string[],
    _complexity?: TaskComplexity
  ): AgentSelection {
    const patterns = filePatterns || [];
    const taskCat = category; // Preserve for later checks

    // Rule 1: Documentation tasks → Codex
    if (category === 'documentation') {
      return this.createSelection(
        'codex',
        'Documentation task: Codex excels at writing documentation',
        0.9,
        'claude'
      );
    }

    // Rule 2: Analysis/Review/Planning → Codex
    if (category === 'analysis' || category === 'review' || category === 'planning') {
      return this.createSelection(
        'codex',
        `${category} task: Codex better at high-level analysis and review`,
        0.9,
        'claude'
      );
    }

    // Rule 3: Only markdown files → Codex
    if (patterns.length > 0) {
      const onlyMarkdown = patterns.every(p => p === 'md');
      if (onlyMarkdown) {
        return this.createSelection(
          'codex',
          'Only markdown files: Codex handles documentation well',
          0.85,
          'claude'
        );
      }
    }

    // Rule 4: Code files → Claude
    if (patterns.length > 0) {
      const codeExtensions = ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'java', 'cpp', 'c', 'rs'];
      const hasCodeFiles = patterns.some(p => codeExtensions.includes(p));
      
      if (hasCodeFiles) {
        return this.createSelection(
          'claude',
          'Code files detected: Claude excels at code editing and implementation',
          0.95,
          'codex'
        );
      }
    }

    // Rule 5: SQL files
    if (patterns.includes('sql')) {
      // SQL analysis goes to Codex, SQL implementation to Claude
      // Use the preserved category to avoid type narrowing issues
      if (taskCat === 'analysis') {
        return this.createSelection(
          'codex',
          'SQL analysis task: Codex better for database analysis',
          0.8,
          'claude'
        );
      }
      return this.createSelection(
        'claude',
        'SQL implementation: Claude handles database changes well',
        0.85,
        'codex'
      );
    }

    // Rule 6: Implementation tasks → Claude
    if (category === 'implementation') {
      return this.createSelection(
        'claude',
        'Implementation task: Claude excels at code implementation',
        0.9,
        'codex'
      );
    }

    // Final fallback: Claude (best for general implementation)
    return this.createSelection(
      'claude',
      'Default selection: Claude is strong general-purpose agent',
      0.7,
      'codex'
    );
  }

  /**
   * Get alternate agent after a failure
   */
  private getAlternateAgent(
    failedAgent: AgentType,
    category?: TaskCategory,
    filePatterns?: string[]
  ): AgentType {
    const codeExtensions = ['ts', 'js', 'tsx', 'jsx', 'py', 'go'];
    const hasCodeFiles = filePatterns?.some(p => codeExtensions.includes(p));

    // Handle each agent type
    switch (failedAgent) {
      case 'claude':
        // If Claude failed, try Codex
        return 'codex';
      
      case 'codex':
        // If Codex failed on code files, try Claude
        if (hasCodeFiles) {
          return 'claude';
        }
        // Otherwise, fall back to Claude anyway
        return 'claude';
      
      case 'copilot':
        // If Copilot failed, escalate to Claude
        return 'claude';
      
      default:
        // Fallback
        return 'claude';
    }
  }

  /**
   * Create a selection result
   */
  private createSelection(
    agent: AgentType,
    reasoning: string,
    confidence: number,
    fallbackAgent?: AgentType
  ): AgentSelection {
    return {
      agent,
      reasoning,
      confidence,
      fallbackAgent
    };
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
      case 'copilot':
        // Copilot uses GitHub delegation, no Docker image
        throw new Error('Copilot agent does not use Docker (GitHub delegation)');
      default:
        // Fallback to claude
        return 'dev-bot-claude:latest';
    }
  }

  /**
   * Validate if an agent type is supported
   */
  static isValidAgentType(type: string): type is AgentType {
    return type === 'claude' || type === 'codex' || type === 'copilot';
  }

  /**
   * Get all supported agent types
   */
  static getSupportedTypes(): AgentType[] {
    return ['claude', 'codex', 'copilot'];
  }

  /**
   * Explain why a specific agent was selected (for debugging/logging)
   */
  explainSelection(criteria: AgentSelectionCriteria): string {
    const selection = this.selectAgent(criteria);
    const parts: string[] = [];

    parts.push(`Selected: ${selection.agent}`);
    parts.push(`Reason: ${selection.reasoning}`);
    parts.push(`Confidence: ${(selection.confidence * 100).toFixed(0)}%`);

    if (selection.fallbackAgent) {
      parts.push(`Fallback: ${selection.fallbackAgent}`);
    }

    if (criteria.taskCategory) {
      parts.push(`Category: ${criteria.taskCategory}`);
    }

    if (criteria.filePatterns && criteria.filePatterns.length > 0) {
      parts.push(`Files: ${criteria.filePatterns.join(', ')}`);
    }

    if (criteria.complexity) {
      parts.push(`Complexity: ${criteria.complexity}`);
    }

    return parts.join(' | ');
  }
}
