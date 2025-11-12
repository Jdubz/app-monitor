/**
 * Info Query Service
 *
 * Handles all simple getter/query operations for system information.
 * Aggregates information from various managers and services.
 */

import type { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import type { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';

export class InfoQueryService {
  constructor(
    private agentManager: AgentPersonalityManager,
    private templateManager: TaskPromptTemplateManager,
    private guidelinesManager: TaskCreationGuidelinesManager,
    private ephemeralWorkerService: EphemeralWorkerService,
    private maxWorkers: number
  ) {}

  /**
   * Get all agent personalities
   */
  public getAgentPersonalities(): AgentPersonality[] {
    return this.agentManager.getAllPersonalities();
  }

  /**
   * Get task templates (returns universal template for API compatibility)
   */
  public getTaskTemplates(): Record<string, unknown>[] {
    // Return the single universal template as an array for API compatibility
    return [this.templateManager.getTemplate() as unknown as Record<string, unknown>];
  }

  /**
   * Get task guidelines for specific type or all guidelines
   */
  public getTaskGuidelines(taskType?: string): unknown {
    if (taskType) {
      return this.guidelinesManager.getGuidelines(taskType);
    }
    return this.guidelinesManager.getAllGuidelines();
  }

  /**
   * Get example task for specific type
   */
  public getTaskExample(taskType: string): unknown {
    return this.guidelinesManager.getExampleTask(taskType);
  }

  /**
   * Get task checklist for specific type
   */
  public getTaskChecklist(taskType: string): string[] {
    return this.guidelinesManager.generateTaskChecklist(taskType);
  }

  /**
   * Validate task data against guidelines
   */
  public validateTaskData(taskData: Record<string, unknown>, taskType: string): unknown {
    return this.guidelinesManager.validateTaskData(taskData, taskType);
  }

  /**
   * Get valid projects from guidelines
   */
  public getValidProjects(): string[] {
    return this.guidelinesManager.getValidProjects();
  }

  /**
   * Get valid agents from guidelines
   */
  public getValidAgents(): string[] {
    return this.guidelinesManager.getValidAgents();
  }

  /**
   * Get current worker count
   */
  public getWorkerCount(): number {
    return this.ephemeralWorkerService.getActiveWorkers().length;
  }

  /**
   * Get maximum allowed workers
   */
  public getMaxWorkers(): number {
    return this.maxWorkers;
  }
}
