/**
 * Phase 1: Planning Validator
 * 
 * Validates planning phase artifacts to determine if:
 * - Task is obsolete (cancel task)
 * - Task needs realignment (update prompt and retry planning)
 * - Planning is complete (proceed to implementation)
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "obsolete": false,
 *   "obsolete_reason": "string (if obsolete)",
 *   "task_realigned": false,
 *   "realignment_details": "string (if realigned)",
 *   "dependencies": ["string[]"],
 *   "architecture_notes": "string",
 *   "estimated_complexity": "low" | "medium" | "high"
 * }
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
  PlanningArtifacts 
} from './types.js';

export class Phase1PlanningValidator implements PhaseValidator {
  readonly phaseIndex = 1;
  readonly phaseName = 'Planning';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const planning = artifacts.planning;

    // Check if planning artifacts exist
    if (!planning) {
      return {
        passed: false,
        errors: ['No planning artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof planning !== 'object' || planning === null || Array.isArray(planning)) {
      return {
        passed: false,
        errors: ['Planning artifacts are not a valid JSON object'],
        details: { planning },
      };
    }

    // Case 1: Task marked obsolete
    if (planning.obsolete === true) {
      logger.info({
        category: 'phase',
        action: 'task_obsolete',
        message: `Task ${task.id} marked obsolete by planning phase`,
        details: {
          taskId: task.id,
          reason: planning.obsolete_reason,
        },
      });

      return {
        passed: true,
        taskObsolete: true,
        details: {
          obsolete_reason: planning.obsolete_reason,
        },
        artifacts: planning,
      };
    }

    // Case 2: Task needs realignment
    if (planning.task_realigned === true) {
      logger.info({
        category: 'phase',
        action: 'task_realigned',
        message: `Task ${task.id} needs realignment`,
        details: {
          taskId: task.id,
          realignment_details: planning.realignment_details,
        },
      });

      return {
        passed: true,
        taskRealigned: true,
        details: {
          realignment_details: planning.realignment_details,
        },
        artifacts: planning,
      };
    }

    // Case 3: Planning complete - validate required fields
    const errors: string[] = [];

    if (!planning.architecture_notes) {
      errors.push('Missing architecture_notes in planning output');
    }

    if (!planning.estimated_complexity || 
        !['low', 'medium', 'high'].includes(planning.estimated_complexity)) {
      errors.push('Missing or invalid estimated_complexity (must be low, medium, or high)');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { planning },
      };
    }

    // Planning passed validation
    logger.info({
      category: 'phase',
      action: 'planning_validated',
      message: `Task ${task.id} planning phase complete`,
      details: {
        taskId: task.id,
        complexity: planning.estimated_complexity,
        dependencies: planning.dependencies?.length ?? 0,
      },
    });

    return {
      passed: true,
      artifacts: planning,
      details: {
        complexity: planning.estimated_complexity,
        dependencies: planning.dependencies,
        architecture_notes: planning.architecture_notes,
      },
    };
  }
}
