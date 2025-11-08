/**
 * Quality Improvement Task Generator
 *
 * Generates improvement tasks from quality observations. These tasks commit
 * to the same branch as the parent task, ensuring all quality improvements
 * are tracked in a single PR.
 *
 * Leverages existing:
 * - Task queue system (TaskQueueService)
 * - Template validation (TaskTemplateValidator)
 * - V3 template structure (TaskTemplateV3)
 */

import { logger } from '../utils/logger.js';
import type { Task, TaskQueueService } from './taskQueue.sqlite.js';
import type { ImprovementOpportunity, QualityObservation } from './qualityObservation.service.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ImprovementTaskContext {
  parentTask: Task;
  observation: QualityObservation;
  opportunity: ImprovementOpportunity;
  prNumber?: number;
  branch: string;
}

export interface GeneratedImprovementTask {
  task: Task;
  opportunity: ImprovementOpportunity;
  context: ImprovementTaskContext;
}

// ============================================================================
// Quality Improvement Task Generator
// ============================================================================

export class QualityImprovementTaskGenerator {
  constructor(
    private readonly taskQueue: TaskQueueService
  ) {}

  /**
   * Generate improvement tasks from quality observation
   * Returns array of generated tasks
   */
  async generateImprovementTasks(
    parentTask: Task,
    observation: QualityObservation
  ): Promise<GeneratedImprovementTask[]> {
    const generatedTasks: GeneratedImprovementTask[] = [];

    // Get branch context from parent task or observation
    const branch = observation.branch || parentTask.pr_branch || `task-${parentTask.id}`;
    const prNumber = observation.prNumber || parentTask.pr_number;

    logger.info({
      category: 'quality-improvement',
      action: 'generate_tasks_started',
      message: `Generating improvement tasks for ${parentTask.id}`,
      details: {
        parentTaskId: parentTask.id,
        opportunityCount: observation.improvementOpportunities.length,
        branch,
        prNumber
      }
    });

    // Generate task for each improvement opportunity
    for (const opportunity of observation.improvementOpportunities) {
      try {
        const context: ImprovementTaskContext = {
          parentTask,
          observation,
          opportunity,
          prNumber,
          branch
        };

        const task = await this.generateSingleImprovementTask(context);

        generatedTasks.push({
          task,
          opportunity,
          context
        });

        logger.info({
          category: 'quality-improvement',
          action: 'task_generated',
          message: `Generated ${opportunity.type} improvement task: ${task.id}`,
          details: {
            taskId: task.id,
            type: opportunity.type,
            priority: opportunity.priority,
            branch
          }
        });
      } catch (error) {
        logger.error({
          category: 'quality-improvement',
          action: 'task_generation_failed',
          message: `Failed to generate task for ${opportunity.type} improvement`,
          error,
          details: {
            parentTaskId: parentTask.id,
            opportunityType: opportunity.type
          }
        });
      }
    }

    logger.info({
      category: 'quality-improvement',
      action: 'generate_tasks_completed',
      message: `Generated ${generatedTasks.length} improvement tasks for ${parentTask.id}`,
      details: {
        parentTaskId: parentTask.id,
        tasksGenerated: generatedTasks.length,
        branch
      }
    });

    return generatedTasks;
  }

  /**
   * Generate a single improvement task from context
   */
  private async generateSingleImprovementTask(
    context: ImprovementTaskContext
  ): Promise<Task> {
    const { parentTask, opportunity, prNumber, branch } = context;

    // Create base task data
    const taskData: Partial<Task> = {
      type: 'quality-improvement',
      title: this.generateTaskTitle(opportunity, prNumber),
      description: this.generateTaskDescription(opportunity, parentTask),
      priority: this.mapPriorityToNumber(opportunity.priority),

      // Link to parent task and PR
      parent_initiative: `quality-improvement-for-${parentTask.id}`,
      related_tasks: [parentTask.id],
      pr_number: prNumber,
      pr_branch: branch,

      // Mark as improvement task
      is_repair_bot: true,
      original_task_id: parentTask.id,
      repair_stage: 'followup',

      // Acceptance criteria
      acceptance_criteria: this.generateAcceptanceCriteria(opportunity, parentTask),

      // Files to work on
      files: opportunity.affectedFiles || parentTask.files || [],

      // Effort estimation
      estimated_effort: {
        hours: opportunity.estimatedEffort / 60, // Convert minutes to hours
        complexity: opportunity.complexity,
        confidence: 'high'
      },

      // Testing requirements
      testing_requirements: this.generateTestingRequirements(opportunity),

      // Documentation requirements
      documentation_requirements: this.generateDocumentationRequirements(opportunity),

      // Context boundaries (preserve from parent)
      context_boundaries: parentTask.context_boundaries,

      // Notes about improvement
      notes: `Auto-generated improvement task for ${opportunity.type} issues in ${parentTask.id}.\n\nOriginal opportunity: ${opportunity.description}\n\nSuggested fix: ${opportunity.suggestedFix}`
    };

    // Create task in queue
    const task = this.taskQueue.createTask(taskData);

    return task;
  }

  /**
   * Generate task title for improvement opportunity
   */
  private generateTaskTitle(opportunity: ImprovementOpportunity, prNumber?: number): string {
    const prRef = prNumber ? ` (PR #${prNumber})` : '';

    switch (opportunity.type) {
      case 'coverage':
        return `Improve test coverage${prRef}`;
      case 'lint':
        return `Fix linting errors${prRef}`;
      case 'test':
        return `Fix failing tests${prRef}`;
      case 'docs':
        return `Update documentation${prRef}`;
      case 'criteria':
        return `Complete acceptance criteria${prRef}`;
      case 'scope':
        return `Fix scope violations${prRef}`;
      case 'typecheck':
        return `Fix TypeScript errors${prRef}`;
      case 'build':
        return `Fix build errors${prRef}`;
      default:
        return `Quality improvement${prRef}`;
    }
  }

  /**
   * Generate detailed task description
   */
  private generateTaskDescription(
    opportunity: ImprovementOpportunity,
    parentTask: Task
  ): string {
    return `## Quality Improvement Task

**Parent Task:** ${parentTask.title} (${parentTask.id})
**Improvement Type:** ${opportunity.type}
**Priority:** ${opportunity.priority}

### Issue Description
${opportunity.description}

### Suggested Approach
${opportunity.suggestedFix}

### Context
This is an automated quality improvement task generated from quality observations on the parent task.
All changes should be committed to the existing branch to maintain PR continuity.

### Constraints
- Work on the same branch as parent task
- Do NOT create a new PR
- Focus ONLY on the specific improvement described
- Do NOT introduce new features or refactoring beyond the scope
- Ensure all existing tests still pass

${opportunity.details ? `\n### Additional Details\n${JSON.stringify(opportunity.details, null, 2)}` : ''}`;
  }

  /**
   * Generate acceptance criteria for improvement task
   */
  private generateAcceptanceCriteria(
    opportunity: ImprovementOpportunity,
    _parentTask: Task
  ): string[] {
    const criteria: string[] = [];

    switch (opportunity.type) {
      case 'coverage':
        if (opportunity.details?.targetCoverage) {
          criteria.push(`Test coverage reaches ${opportunity.details.targetCoverage}%`);
        }
        criteria.push('All new tests pass');
        criteria.push('No existing tests broken');
        criteria.push('Coverage focused on critical paths');
        break;

      case 'lint':
        criteria.push('npm run lint passes with 0 errors');
        criteria.push('No linting warnings (or reduced from baseline)');
        criteria.push('Code remains functionally identical');
        criteria.push('No --no-verify flags used in commits');
        break;

      case 'test':
        criteria.push('All tests pass (npm test shows 0 failures)');
        criteria.push('Root cause of failures identified and fixed');
        criteria.push('No test files skipped or disabled');
        break;

      case 'docs':
        criteria.push('README.md updated if needed');
        criteria.push('JSDoc comments added for new/modified functions');
        criteria.push('No broken documentation links');
        criteria.push('Documentation reflects actual code behavior');
        break;

      case 'criteria':
        // Use original unmet criteria if available
        if (opportunity.details?.unmetCriteria && Array.isArray(opportunity.details.unmetCriteria)) {
          criteria.push(...opportunity.details.unmetCriteria);
        } else {
          criteria.push('Complete all originally specified acceptance criteria');
        }
        break;

      case 'scope':
        criteria.push('All scope violations resolved');
        criteria.push('No modifications to protected files');
        criteria.push('Changes comply with context boundaries');
        break;

      case 'typecheck':
        criteria.push('npx tsc --noEmit passes with 0 errors');
        criteria.push('All type errors resolved');
        criteria.push('No use of "any" type (unless absolutely necessary)');
        break;

      case 'build':
        criteria.push('npm run build completes successfully');
        criteria.push('No build errors or warnings');
        criteria.push('Build output is valid and deployable');
        break;

      default:
        criteria.push('Quality issue resolved');
        criteria.push('All existing tests pass');
    }

    // Common criteria for all improvement tasks
    criteria.push('Changes committed to existing branch (no new PR)');
    criteria.push('No new features added beyond the improvement scope');

    return criteria;
  }

  /**
   * Generate testing requirements for improvement task
   */
  private generateTestingRequirements(opportunity: ImprovementOpportunity): string[] {
    const requirements: string[] = [];

    if (opportunity.type === 'coverage' || opportunity.type === 'test') {
      requirements.push('Run full test suite before and after changes');
      requirements.push('Verify coverage metrics improved');
      requirements.push('Test both happy path and edge cases');
    }

    if (opportunity.type === 'lint' || opportunity.type === 'typecheck') {
      requirements.push('Run linting/typecheck before committing');
      requirements.push('Verify no functional changes introduced');
      requirements.push('Run existing tests to ensure no breakage');
    }

    if (opportunity.automatable) {
      requirements.push('Verify auto-fix did not introduce issues');
    }

    return requirements;
  }

  /**
   * Generate documentation requirements
   */
  private generateDocumentationRequirements(opportunity: ImprovementOpportunity): string[] {
    const requirements: string[] = [];

    if (opportunity.type === 'docs') {
      requirements.push('Update all affected documentation files');
      requirements.push('Ensure examples are accurate');
      requirements.push('Check for broken links');
    }

    // All improvement tasks should update notes
    requirements.push('Update task notes with what was changed');

    return requirements;
  }

  /**
   * Map improvement priority to task priority number
   */
  private mapPriorityToNumber(priority: ImprovementOpportunity['priority']): number {
    switch (priority) {
      case 'critical': return 9; // Highest priority
      case 'high': return 7;
      case 'medium': return 5;
      case 'low': return 3;
      default: return 5;
    }
  }

  /**
   * Check if we should generate improvement tasks
   * (avoid infinite loops, respect limits)
   */
  shouldGenerateImprovements(
    parentTask: Task,
    observation: QualityObservation
  ): boolean {
    // Don't generate improvements for improvement tasks (avoid recursion)
    if (parentTask.is_repair_bot) {
      logger.debug({
        category: 'quality-improvement',
        action: 'skip_generation',
        message: 'Skipping improvement generation for repair bot task',
        details: { taskId: parentTask.id }
      });
      return false;
    }

    // Don't generate if no opportunities
    if (!observation.improvementOpportunities || observation.improvementOpportunities.length === 0) {
      logger.debug({
        category: 'quality-improvement',
        action: 'skip_generation',
        message: 'No improvement opportunities identified',
        details: { taskId: parentTask.id }
      });
      return false;
    }

    // Limit to 5 improvement tasks per parent (prevent queue overflow)
    if (observation.improvementOpportunities.length > 5) {
      logger.warn({
        category: 'quality-improvement',
        action: 'limiting_improvements',
        message: `Limiting to 5 improvement tasks (${observation.improvementOpportunities.length} opportunities found)`,
        details: { taskId: parentTask.id }
      });
    }

    // Check if parent already has too many followup tasks
    const existingFollowups = this.taskQueue.getRepairBotsForTask(parentTask.id);

    if (existingFollowups.length >= 5) {
      logger.warn({
        category: 'quality-improvement',
        action: 'skip_generation',
        message: 'Parent task already has maximum followup tasks',
        details: {
          taskId: parentTask.id,
          existingFollowups: existingFollowups.length
        }
      });
      return false;
    }

    return true;
  }

  /**
   * Get limited set of opportunities (top 5 by priority)
   */
  getLimitedOpportunities(opportunities: ImprovementOpportunity[]): ImprovementOpportunity[] {
    // Already sorted by priority in QualityObservationService
    return opportunities.slice(0, 5);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let qualityImprovementTaskGeneratorInstance: QualityImprovementTaskGenerator | null = null;

/**
 * Get the singleton quality improvement task generator
 */
export function getQualityImprovementTaskGenerator(
  taskQueue: TaskQueueService
): QualityImprovementTaskGenerator {
  if (!qualityImprovementTaskGeneratorInstance) {
    qualityImprovementTaskGeneratorInstance = new QualityImprovementTaskGenerator(taskQueue);
  }
  return qualityImprovementTaskGeneratorInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetQualityImprovementTaskGenerator(): void {
  qualityImprovementTaskGeneratorInstance = null;
}
