/**
 * Recovery Agent Service
 * 
 * Executes recovery agent when phase validation fails.
 * Recovery agent analyzes the failure and attempts automatic recovery.
 * 
 * Recovery Categories:
 * - retry: Simple retry (e.g., network timeout, transient error)
 * - context_update: Update task context and retry
 * - chain_blocked: Task-specific block, needs human intervention (task only)
 * - system_blocked: System-wide issue, pause ALL tasks globally
 * 
 * Recovery Response Structure (from agent):
 * {
 *   "category": "retry" | "context_update" | "chain_blocked" | "system_blocked",
 *   "diagnosis": "Detailed explanation of failure",
 *   "recovery_action": "What was attempted",
 *   "success": boolean,
 *   "suggested_action"?: {
 *     "prompt_update"?: "Updated task prompt",
 *     "phase_override"?: 2,  // Jump to specific phase
 *     "context_additions"?: ["Additional context..."]
 *   },
 *   "blocking_reason"?: string  // For blocked categories
 * }
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { ValidationResult } from './phaseValidation/types.js';

export type RecoveryCategory = 'retry' | 'context_update' | 'chain_blocked' | 'system_blocked';

export interface SuggestedAction {
  prompt_update?: string;
  phase_override?: number;
  context_additions?: string[];
}

export interface RecoveryResponse {
  category: RecoveryCategory;
  diagnosis: string;
  recovery_action: string;
  success: boolean;
  suggested_action?: SuggestedAction;
  blocking_reason?: string;
}

export interface RecoveryResult {
  success: boolean;
  category: RecoveryCategory;
  shouldRetry: boolean;
  contextUpdated: boolean;
  isSystemBlocked: boolean;
  diagnosis: string;
  suggestedAction?: SuggestedAction;
}

export class RecoveryAgentService {
  private readonly maxRecoveryAttempts = 4;

  /**
   * Execute recovery agent to diagnose and fix validation failure.
   * 
   * @param task - Task that failed validation
   * @param containerId - Docker container ID (still running)
   * @param validationResult - Validation failure details
   * @param recoveryAttempt - Current recovery attempt number (1-indexed)
   * @returns Recovery result with diagnosis and action
   */
  async executeRecovery(
    task: Task,
    containerId: string,
    validationResult: ValidationResult,
    recoveryAttempt: number = 1
  ): Promise<RecoveryResult> {
    logger.info({
      category: 'recovery',
      action: 'recovery_start',
      message: `Starting recovery for task ${task.id}, attempt ${recoveryAttempt}`,
      details: {
        taskId: task.id,
        containerId,
        phaseIndex: task.phase_index,
        phaseName: task.phase_name,
        recoveryAttempt,
        validationErrors: validationResult.errors,
      },
    });

    // Check recovery attempt limit
    if (recoveryAttempt > this.maxRecoveryAttempts) {
      logger.warn({
        category: 'recovery',
        action: 'recovery_limit_reached',
        message: `Max recovery attempts (${this.maxRecoveryAttempts}) reached for task ${task.id}`,
        details: { taskId: task.id, recoveryAttempt },
      });

      return {
        success: false,
        category: 'chain_blocked',
        shouldRetry: false,
        contextUpdated: false,
        isSystemBlocked: false,
        diagnosis: `Recovery failed after ${this.maxRecoveryAttempts} attempts. Manual intervention required.`,
      };
    }

    // Programmatic failure diagnosis (before calling recovery agent)
    const programmaticDiagnosis = this.diagnoseProgrammatically(validationResult);
    if (programmaticDiagnosis) {
      logger.info({
        category: 'recovery',
        action: 'programmatic_diagnosis',
        message: `Programmatic diagnosis: ${programmaticDiagnosis.category}`,
        details: {
          taskId: task.id,
          category: programmaticDiagnosis.category,
          diagnosis: programmaticDiagnosis.diagnosis,
        },
      });

      return programmaticDiagnosis;
    }

    // Execute recovery agent in container
    try {
      const recoveryResponse = await this.executeRecoveryAgent(
        containerId,
        task,
        validationResult
      );

      const result = this.processRecoveryResponse(recoveryResponse);

      logger.info({
        category: 'recovery',
        action: 'recovery_complete',
        message: `Recovery ${result.success ? 'succeeded' : 'failed'} for task ${task.id}`,
        details: {
          taskId: task.id,
          category: result.category,
          shouldRetry: result.shouldRetry,
          contextUpdated: result.contextUpdated,
        },
      });

      return result;

    } catch (error) {
      logger.error({
        category: 'recovery',
        action: 'recovery_error',
        message: `Recovery execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { taskId: task.id, containerId, error },
      });

      return {
        success: false,
        category: 'chain_blocked',
        shouldRetry: false,
        contextUpdated: false,
        isSystemBlocked: false,
        diagnosis: `Recovery agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Programmatically diagnose common failure patterns.
   * Returns recovery result if pattern detected, null otherwise.
   */
  private diagnoseProgrammatically(validation: ValidationResult): RecoveryResult | null {
    const errors = validation.errors || [];
    const errorText = errors.join(' ').toLowerCase();

    // Network/timeout errors - simple retry
    if (errorText.includes('timeout') || 
        errorText.includes('network') || 
        errorText.includes('econnrefused') ||
        errorText.includes('enotfound')) {
      return {
        success: true,
        category: 'retry',
        shouldRetry: true,
        contextUpdated: false,
        isSystemBlocked: false,
        diagnosis: 'Network or timeout error detected. Retrying...',
      };
    }

    // Rate limiting - simple retry with backoff
    if (errorText.includes('rate limit') || errorText.includes('429')) {
      return {
        success: true,
        category: 'retry',
        shouldRetry: true,
        contextUpdated: false,
        isSystemBlocked: false,
        diagnosis: 'Rate limit detected. Retrying with backoff...',
      };
    }

    // Missing artifacts - critical error, needs agent diagnosis
    if (errorText.includes('no') && errorText.includes('artifacts')) {
      return null; // Let recovery agent handle this
    }

    // No programmatic diagnosis available
    return null;
  }

  /**
   * Execute recovery agent in the container.
   * Uses multi-agent injection to run recovery without restarting container.
   */
  private async executeRecoveryAgent(
    containerId: string,
    task: Task,
    validationResult: ValidationResult
  ): Promise<RecoveryResponse> {
    // TODO: Implement actual recovery agent execution
    // This will be implemented in Day 10 (Multi-Agent Container Support)
    // For now, return a placeholder response

    logger.warn({
      category: 'recovery',
      action: 'recovery_stub',
      message: 'Recovery agent execution not yet implemented - using stub',
      details: { taskId: task.id, containerId },
    });

    // Stub response - always suggests retry
    return {
      category: 'retry',
      diagnosis: `Validation failed with ${validationResult.errors?.length || 0} errors. Stub recovery suggests retry.`,
      recovery_action: 'No action taken (stub implementation)',
      success: true,
    };
  }

  /**
   * Process recovery agent response and determine next action.
   */
  private processRecoveryResponse(response: RecoveryResponse): RecoveryResult {
    switch (response.category) {
      case 'retry':
        return {
          success: response.success,
          category: 'retry',
          shouldRetry: true,
          contextUpdated: false,
          isSystemBlocked: false,
          diagnosis: response.diagnosis,
          suggestedAction: response.suggested_action,
        };

      case 'context_update':
        return {
          success: response.success,
          category: 'context_update',
          shouldRetry: true,
          contextUpdated: true,
          isSystemBlocked: false,
          diagnosis: response.diagnosis,
          suggestedAction: response.suggested_action,
        };

      case 'chain_blocked':
        return {
          success: false,
          category: 'chain_blocked',
          shouldRetry: false,
          contextUpdated: false,
          isSystemBlocked: false,
          diagnosis: response.blocking_reason || response.diagnosis,
          suggestedAction: response.suggested_action,
        };

      case 'system_blocked':
        logger.error({
          category: 'recovery',
          action: 'system_blocked',
          message: 'CRITICAL: System-level block detected - all tasks should be paused',
          details: {
            diagnosis: response.diagnosis,
            blockingReason: response.blocking_reason,
          },
        });

        return {
          success: false,
          category: 'system_blocked',
          shouldRetry: false,
          contextUpdated: false,
          isSystemBlocked: true,
          diagnosis: response.blocking_reason || response.diagnosis,
          suggestedAction: response.suggested_action,
        };

      default:
        logger.warn({
          category: 'recovery',
          action: 'unknown_category',
          message: `Unknown recovery category: ${response.category}`,
          details: { category: response.category },
        });

        return {
          success: false,
          category: 'chain_blocked',
          shouldRetry: false,
          contextUpdated: false,
          isSystemBlocked: false,
          diagnosis: `Unknown recovery category: ${response.category}`,
        };
    }
  }

  /**
   * Check if recovery should be attempted for this validation result.
   */
  shouldAttemptRecovery(validationResult: ValidationResult): boolean {
    // Don't attempt recovery if validation passed
    if (validationResult.passed) {
      return false;
    }

    // Don't attempt recovery if no errors
    if (!validationResult.errors || validationResult.errors.length === 0) {
      return false;
    }

    // Attempt recovery for any validation failure with errors
    return true;
  }
}

// Singleton instance
let recoveryServiceInstance: RecoveryAgentService | null = null;

export function getRecoveryService(): RecoveryAgentService {
  if (!recoveryServiceInstance) {
    recoveryServiceInstance = new RecoveryAgentService();
  }
  return recoveryServiceInstance;
}
