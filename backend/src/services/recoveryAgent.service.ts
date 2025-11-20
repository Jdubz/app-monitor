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

      // Recovery agent failed to execute - block task immediately
      return {
        success: false,
        category: 'chain_blocked',
        shouldRetry: false,
        contextUpdated: false,
        isSystemBlocked: false,
        diagnosis: `Recovery agent execution failed: ${error instanceof Error ? error.message : String(error)}. Manual intervention required.`,
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
    logger.info({
      category: 'recovery',
      action: 'recovery_execute',
      message: `Executing recovery agent in container ${containerId}`,
      details: { taskId: task.id, containerId, errors: validationResult.errors },
    });

    // Build recovery prompt with validation failure context
    const recoveryPrompt = this.buildRecoveryPrompt(task, validationResult);

    try {
      // Import Docker API to execute command in running container
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      const container = docker.getContainer(containerId);

      // Create script that writes prompt to temp file and executes agent
      // Using claude CLI as recovery agent (can be configured per task/agent)
      // Use base64 encoding to avoid heredoc injection vulnerabilities
      const promptBase64 = Buffer.from(recoveryPrompt).toString('base64');
      // Escape single quotes for safe shell interpolation
      const promptBase64Escaped = promptBase64.replace(/'/g, "'\\''");
      const recoveryScript = `
        # Write recovery prompt to secure in-memory temp file
        # Use base64 to prevent command injection via heredoc
        echo '${promptBase64Escaped}' | base64 -d > /dev/shm/recovery-prompt.txt

        # Execute recovery agent (claude CLI) with prompt
        # Output structured JSON response to artifacts
        mkdir -p /workspace/.artifacts
        claude --no-stream < /dev/shm/recovery-prompt.txt > /workspace/.artifacts/recovery.json 2>&1

        # Cleanup recovery prompt file
        rm -f /dev/shm/recovery-prompt.txt

        # Print the response for capture
        cat /workspace/.artifacts/recovery.json
      `;

      // Execute recovery script in container
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', recoveryScript],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace'
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      // Capture output
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
      });

      // Wait for execution to complete
      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      // Parse recovery response from agent output
      const response = this.parseRecoveryResponse(output);

      logger.info({
        category: 'recovery',
        action: 'recovery_complete',
        message: `Recovery agent completed: ${response.category}`,
        details: {
          taskId: task.id,
          category: response.category,
          diagnosis: response.diagnosis
        },
      });

      return response;

    } catch (error) {
      logger.error({
        category: 'recovery',
        action: 'recovery_execution_error',
        message: `Failed to execute recovery agent: ${error instanceof Error ? error.message : String(error)}`,
        details: { taskId: task.id, containerId, error },
      });

      // Return chain_blocked on execution error
      return {
        category: 'chain_blocked',
        diagnosis: `Recovery agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
        recovery_action: 'Failed to execute',
        success: false,
        blocking_reason: 'Recovery agent could not be executed',
      };
    }
  }

  /**
   * Build recovery prompt with validation failure context.
   */
  private buildRecoveryPrompt(task: Task, validation: ValidationResult): string {
    const errors = validation.errors || [];
    const phase = task.phase_name;

    return `You are a recovery agent diagnosing a validation failure for task: ${task.title}

PHASE: ${phase} (Attempt ${task.phase_attempts})

VALIDATION ERRORS:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

TASK CONTEXT:
- Task ID: ${task.id}
- Type: ${task.type}
- Description: ${task.description || task.prompt?.substring(0, 200) || 'N/A'}

Your job is to analyze the validation failure and categorize the appropriate recovery action.

OUTPUT FORMAT (JSON):
{
  "category": "retry" | "context_update" | "chain_blocked" | "system_blocked",
  "diagnosis": "Clear explanation of what went wrong",
  "recovery_action": "What action should be taken",
  "success": boolean,
  "suggested_action": {
    "prompt_update": "optional - updated task prompt if context needs updating",
    "phase_override": optional_number,
    "context_additions": ["optional", "additional context"]
  },
  "blocking_reason": "optional - reason if blocked"
}

CATEGORY GUIDELINES:
- "retry": Transient error, safe to retry same phase (network, timeout, etc)
- "context_update": Task needs more context/clarification, update prompt and retry
- "chain_blocked": Task-specific issue, needs human intervention for this task only
- "system_blocked": System-wide issue (API down, credentials invalid), pause ALL tasks

Analyze the errors above and provide your diagnosis as JSON only.`;
  }

  /**
   * Parse recovery agent response from output.
   * Handles both structured JSON and unstructured text.
   */
  private parseRecoveryResponse(output: string): RecoveryResponse {
    try {
      // Try to extract JSON from output
      // Agent may wrap it in markdown code blocks or include extra text
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        // No JSON found - treat as generic diagnosis
        return {
          category: 'retry',
          diagnosis: output.substring(0, 500),
          recovery_action: 'No structured response - defaulting to retry',
          success: true,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.category || !parsed.diagnosis) {
        throw new Error('Missing required fields: category, diagnosis');
      }

      // Validate category
      const validCategories: RecoveryCategory[] = ['retry', 'context_update', 'chain_blocked', 'system_blocked'];
      if (!validCategories.includes(parsed.category)) {
        throw new Error(`Invalid category: ${parsed.category}`);
      }

      return parsed as RecoveryResponse;

    } catch (parseError) {
      logger.warn({
        category: 'recovery',
        action: 'parse_recovery_failed',
        message: `Failed to parse recovery response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        details: { output: output.substring(0, 200), parseError },
      });

      // Fallback to retry with raw output as diagnosis
      return {
        category: 'retry',
        diagnosis: `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw output: ${output.substring(0, 200)}`,
        recovery_action: 'Failed to parse - defaulting to retry',
        success: false,
      };
    }
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
