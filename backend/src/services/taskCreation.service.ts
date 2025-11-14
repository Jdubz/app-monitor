import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { TaskQueueService, Task } from './taskQueue.sqlite.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { EnhancedTaskData } from './taskMetadataFields.js';
import { ContextBundleGenerator } from './context/index.js';
import { ContextRecipeSelector } from './context/contextRecipeSelector.js';
import type { ContextBundle } from '../types/contextBundle.js';
import type { RecipeTaskType } from '../types/contextRecipe.js';

export interface TaskCreationResult {
  task: Task;
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  };
  contextBundle?: ContextBundle;
}

export interface SimpleTaskData {
  type: string;
  title: string;
  description?: string;
  documentation?: string;
  acceptanceCriteria?: string | string[];
  files?: string[];
  dependencies?: string[];
  project?: string;
  assignedAgent?: string;
  notes?: string;
  priority?: number;
  metadata?: {
    isRepairBot?: boolean;
    repairStage?: 'cleanup' | 'followup';
    originalTaskId?: string;
    cleanupTaskId?: string;
    originalFailurePattern?: string;
    countsTowardsConcurrencyLimit?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Service responsible for task creation, validation, and normalization
 * Extracted from DevBotsManager to reduce complexity
 * 
 * Now includes context bundle generation:
 * - Generates context bundles from YAML recipes
 * - Caches bundles using git hash-based keys
 * - Stores bundle metadata in task record
 */
export class TaskCreationService {
  private contextGenerator: ContextBundleGenerator;

  constructor(
    private taskQueue: TaskQueueService,
    private guidelinesManager: TaskCreationGuidelinesManager,
    contextGenerator?: ContextBundleGenerator  // Optional for DI/testing
  ) {
    // Initialize context generator with sensible defaults
    // Uses default ContextCache and ContextRecipeLoader from GeneratorOptions
    this.contextGenerator = contextGenerator || new ContextBundleGenerator();
  }

  /**
   * Create a new task with validation and deduplication
   * Now includes context bundle generation
   */
  async createTask(taskData: EnhancedTaskData | SimpleTaskData): Promise<TaskCreationResult> {
    // Normalize task data
    const normalizedData = this.normalizeTaskData(taskData);

    // Check for duplicates
    await this.checkDuplicates(normalizedData);

    // Validate task
    const validation = this.validateTask(normalizedData);

    // Generate context bundle (optional - graceful failure)
    let contextBundle: ContextBundle | undefined;
    
    try {
      const taskType = this.mapToRecipeTaskType(normalizedData.type);
      
      // Use intelligent recipe selector
      const selectedProfiles = ContextRecipeSelector.getProfilesToInclude({
        taskType,
        targetFiles: normalizedData.files || [],
        manualProfiles: normalizedData.metadata?.contextProfiles as string[] | undefined,
        includeOptional: false // Only include required + recommended
      });

      logger.debug({
        category: 'context',
        action: 'recipe_selection',
        message: `Selected ${selectedProfiles.length} recipes for task`,
        details: {
          taskType,
          targetFiles: normalizedData.files || [],
          selectedProfiles,
          selectionExplanation: ContextRecipeSelector.explainSelection({
            taskType,
            targetFiles: normalizedData.files || []
          })
        }
      });

      const contextResult = await this.contextGenerator.generateBundle({
        taskType,
        targetFiles: normalizedData.files || [],
        profiles: selectedProfiles, // Use intelligent selection
        force: false
      });

      if (contextResult.success && contextResult.bundle) {
        contextBundle = contextResult.bundle;
        
        logger.info({
          category: 'context',
          action: 'bundle_generated',
          message: `Generated context bundle for task: ${normalizedData.title}`,
          details: {
            bundleId: contextBundle.id,
            profiles: contextBundle.metadata.profiles,
            sizeBytes: contextBundle.metadata.totalBytes,
            cached: contextResult.cached || false,
            intelligentSelection: true
          }
        });
      } else if (contextResult.warnings && contextResult.warnings.length > 0) {
        logger.warn({
          category: 'context',
          action: 'bundle_generation_warnings',
          message: 'Context bundle generation completed with warnings',
          details: { warnings: contextResult.warnings }
        });
      }
    } catch (error) {
      // Context generation failure should NOT block task creation
      logger.warn({
        category: 'context',
        action: 'bundle_generation_failed',
        message: `Failed to generate context bundle for task: ${normalizedData.title}`,
        error,
        details: {
          taskType: normalizedData.type,
          files: normalizedData.files,
          note: 'Task will proceed without context bundle'
        }
      });
    }

    // Create task in queue (with context bundle metadata if available)
    const task = this.createTaskInQueue(taskData, normalizedData, validation, contextBundle);

    logger.info({
      category: 'process',
      action: 'task_added',
      message: `Task added: ${task.id} - ${normalizedData.title} (Agent: ${normalizedData.assignedAgent || 'auto-assign'})`,
      details: {
        hasContext: !!contextBundle,
        contextProfiles: contextBundle?.metadata.profiles
      }
    });

    return { task, validation, contextBundle };
  }

  /**
   * Normalize task data to EnhancedTaskData format
   */
  private normalizeTaskData(taskData: EnhancedTaskData | SimpleTaskData): EnhancedTaskData {
    return {
      type: taskData.type,
      title: taskData.title,
      description: ('description' in taskData && taskData.description) || '',
      documentation: ('documentation' in taskData && taskData.documentation) || '',
      notes: ('notes' in taskData && taskData.notes) || '',
      project: ('project' in taskData && taskData.project) || 'dev-monitor',
      assignedAgent: ('assignedAgent' in taskData && taskData.assignedAgent) || 'backend-specialist',
      files: ('files' in taskData && taskData.files) || [],
      dependencies: ('dependencies' in taskData && taskData.dependencies) || [],
      acceptanceCriteria: this.normalizeAcceptanceCriteria(taskData),
      architectureReferences: ('architectureReferences' in taskData && taskData.architectureReferences) || [],
      longTermGoals: ('longTermGoals' in taskData && taskData.longTermGoals) || [],
      estimatedEffort: ('estimatedEffort' in taskData && taskData.estimatedEffort) || {
        hours: 1,
        complexity: 'simple' as const,
        confidence: 'medium' as const
      },
      prerequisites: ('prerequisites' in taskData && taskData.prerequisites) || [],
      contextBoundaries: ('contextBoundaries' in taskData && taskData.contextBoundaries) || {
        mustNotChange: [],
        mustNotAffect: [],
        integrationPoints: []
      },
      validationSteps: ('validationSteps' in taskData && taskData.validationSteps) || [],
      rollbackPlan: ('rollbackPlan' in taskData && taskData.rollbackPlan) || [],
      successMetrics: ('successMetrics' in taskData && taskData.successMetrics) || [],
      testingRequirements: ('testingRequirements' in taskData && taskData.testingRequirements) || [],
      documentationRequirements: ('documentationRequirements' in taskData && taskData.documentationRequirements) || [],
      requiredSkills: ('requiredSkills' in taskData && taskData.requiredSkills) || [],
      relatedTasks: ('relatedTasks' in taskData && taskData.relatedTasks) || [],
      blockers: ('blockers' in taskData && taskData.blockers) || [],
      assumptions: ('assumptions' in taskData && taskData.assumptions) || [],
      risks: ('risks' in taskData && taskData.risks) || [],
      alternatives: ('alternatives' in taskData && taskData.alternatives) || [],
      ...(('parentInitiative' in taskData && taskData.parentInitiative) && {
        parentInitiative: taskData.parentInitiative
      })
    };
  }

  /**
   * Normalize acceptance criteria to array format
   */
  private normalizeAcceptanceCriteria(taskData: EnhancedTaskData | SimpleTaskData): string[] {
    if ('acceptanceCriteria' in taskData) {
      if (Array.isArray(taskData.acceptanceCriteria)) {
        return taskData.acceptanceCriteria;
      }
      if (typeof taskData.acceptanceCriteria === 'string') {
        return [taskData.acceptanceCriteria];
      }
    }
    return [];
  }

  /**
   * Check for duplicate task submissions
   */
  private async checkDuplicates(normalizedData: EnhancedTaskData): Promise<void> {
    const fingerprint = this.calculateTaskFingerprint(normalizedData);
    const duplicateTask = await this.taskQueue.checkDuplicateTask(fingerprint);

    if (duplicateTask) {
      logger.warn({
        category: 'process',
        action: 'duplicate_task_detected',
        message: `Duplicate task detected: "${normalizedData.title}" matches existing task ${duplicateTask.id} (${duplicateTask.status})`
      });
      throw new Error(
        `Duplicate task detected. Task "${duplicateTask.title}" (${duplicateTask.id}) is already ${duplicateTask.status}. Wait for it to complete or modify your task to be unique.`
      );
    }
  }

  /**
   * Calculate task fingerprint for deduplication
   * Uses title, files, and acceptance criteria to detect duplicate tasks
   */
  calculateTaskFingerprint(taskData: EnhancedTaskData): string {
    const fingerprintData = {
      title: taskData.title.toLowerCase().trim(),
      files: taskData.files?.sort() || [],
      acceptanceCriteria: taskData.acceptanceCriteria?.slice(0, 3) || []
    };
    const fingerprintString = JSON.stringify(fingerprintData);
    return crypto.createHash('md5').update(fingerprintString).digest('hex');
  }

  /**
   * Validate task data against guidelines
   */
  private validateTask(normalizedData: EnhancedTaskData) {
    const validation = this.guidelinesManager.validateTaskData(normalizedData, normalizedData.type);

    if (!validation.isValid) {
      logger.warn({
        category: 'process',
        action: 'task_validation_failed',
        message: `Task validation failed: ${validation.errors.join(', ')}`
      });
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings and suggestions
    if (validation.warnings.length > 0) {
      logger.warn({
        category: 'process',
        action: 'task_validation_warnings',
        message: `Task validation warnings: ${validation.warnings.join(', ')}`
      });
    }
    if (validation.suggestions.length > 0) {
      logger.info({
        category: 'process',
        action: 'task_validation_suggestions',
        message: `Task validation suggestions: ${validation.suggestions.join(', ')}`
      });
    }

    return validation;
  }

  /**
   * Create task in queue (with optional context bundle metadata)
   */
  private createTaskInQueue(
    originalData: EnhancedTaskData | SimpleTaskData,
    normalizedData: EnhancedTaskData,
    _validation: { isValid: boolean; errors: string[]; warnings: string[]; suggestions: string[] },
    contextBundle?: ContextBundle
  ): Task {
    const fingerprint = this.calculateTaskFingerprint(normalizedData);

    // Determine risk level from files or complexity
    const riskLevel = this.determineRiskLevel(normalizedData);

    const sqliteTask = this.taskQueue.createTask({
      type: normalizedData.type,
      title: normalizedData.title,
      description: normalizedData.description,
      documentation: normalizedData.documentation,
      notes: normalizedData.notes,
      assigned_agent: normalizedData.assignedAgent,
      priority: ('priority' in originalData && originalData.priority !== undefined)
        ? originalData.priority
        : 5,
      estimated_hours: normalizedData.estimatedEffort?.hours,
      complexity: normalizedData.estimatedEffort?.complexity,
      files: normalizedData.files,
      acceptance_criteria: normalizedData.acceptanceCriteria,
      architecture_references: normalizedData.architectureReferences,
      validation_steps: normalizedData.validationSteps,
      success_metrics: normalizedData.successMetrics,
      fingerprint,
      // Recovery metadata fields
      is_repair_bot: ('metadata' in originalData && originalData.metadata?.isRepairBot) || false,
      original_task_id: ('metadata' in originalData && originalData.metadata?.originalTaskId) || undefined,
      repair_stage: ('metadata' in originalData && originalData.metadata?.repairStage) || undefined,
      // Context bundle fields (migration 020)
      context_bundle_id: contextBundle?.id,
      context_cache_key: contextBundle?.cacheKey,
      context_profiles: contextBundle?.metadata.profiles,
      risk_level: riskLevel
    });

    return sqliteTask;
  }

  /**
   * Map task type to recipe task type
   */
  private mapToRecipeTaskType(taskType: string): RecipeTaskType {
    const typeMap: Record<string, RecipeTaskType> = {
      'implementation': 'implementation',
      'fix': 'fix',
      'bugfix': 'fix',
      'review': 'review',
      'deployment': 'deployment',
      'pr-follow-up': 'pr-follow-up',
      'analysis': 'analysis'
    };

    return (typeMap[taskType.toLowerCase()] || 'implementation') as RecipeTaskType;
  }

  /**
   * Determine risk level based on files and complexity
   */
  private determineRiskLevel(taskData: EnhancedTaskData): 'minimal' | 'low' | 'medium' | 'high' {
    const files = taskData.files || [];
    const complexity = taskData.estimatedEffort?.complexity || 'simple';

    // Minimal risk: Documentation only
    if (files.length > 0 && files.every(f => f.includes('docs/') || f.endsWith('.md'))) {
      return 'minimal';
    }

    // High risk: Docker, migrations, production scripts
    if (files.some(f => 
      f.includes('docker') || 
      f.includes('migration') || 
      f.includes('deploy') ||
      f.includes('production')
    )) {
      return 'high';
    }

    // Medium risk: Core services, authentication, database
    if (files.some(f => 
      f.includes('backend/src/services') || 
      f.includes('auth') ||
      f.includes('database')
    )) {
      return complexity === 'expert' || complexity === 'complex' ? 'high' : 'medium';
    }

    // Low risk: Frontend, tests, documentation
    if (files.some(f => 
      f.includes('frontend/') || 
      f.includes('test') ||
      f.includes('docs/')
    )) {
      return complexity === 'complex' ? 'medium' : 'low';
    }

    // Default based on complexity
    const riskMap = {
      'simple': 'low' as const,
      'medium': 'medium' as const,
      'complex': 'medium' as const,
      'expert': 'high' as const
    };

    return riskMap[complexity] || 'low';
  }
}
