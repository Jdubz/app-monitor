/**
 * Automatic Failure Recovery System
 *
 * Self-healing bot system that automatically attempts to recover from task failures
 * through a two-stage process: cleanup bot + follow-up bot.
 *
 * Safety-first design with multiple guards to prevent dangerous operations.
 */

import { logger } from '../utils/logger.js';
import { Task } from '../types/task.js';
import { FailurePattern, detectFailurePattern } from './taskFailureGuards.js';
import { DevBotsManager } from './devBotsManager.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FailureContext {
  task: Task;
  failurePattern: FailurePattern | null;
  stderr: string;
  stdout: string;
  exitCode: number;
  uncommittedChanges?: string;
  artifacts: {
    logs: string[];
    patches: string[];
  };
}

export interface SafetyAnalysis {
  filesModified: number;
  linesChanged: number;
  criticalPaths: string[];
  destructiveOps: string[];
  externalDeps: boolean;
  isSafe: boolean;
  violations: string[];
}

export interface RecoveryAttempt {
  id: string;
  taskId: string;
  originalFailurePattern: string;
  cleanupBotTaskId?: string;
  followupBotTaskId?: string;
  status: 'running' | 'recovered' | 'failed' | 'abandoned';
  stage: 'evaluating' | 'cleanup' | 'followup' | 'complete';
  startedAt: number;
  completedAt?: number;
  totalDuration?: number;
  recoverySummary?: string;
}

export interface RecoveryResult {
  status: 'recovered' | 'not_recoverable' | 'hard_failed' | 'in_progress';
  reason?: string;
  cleanupPatch?: string;
  followupPatch?: string;
  totalDuration?: number;
  attemptId?: string;
}

// ============================================================================
// Safety Configuration
// ============================================================================

const CRITICAL_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'docker-compose.yml',
  'Dockerfile',
  '.env',
  '.env.production',
  '.env.local',
  'backend/src/server.ts',
  'backend/src/index.ts',
  '**/database/**',
  '**/migrations/**',
  '**/*.sql',
  '**/auth/**',
  '**/security/**'
];

const FORBIDDEN_PATTERNS = [
  /rm\s+-rf/,                     // Recursive delete
  /DROP\s+TABLE/i,                // Database drops
  /DELETE\s+FROM/i,               // Database deletes
  /TRUNCATE/i,                    // Database truncate
  /npm\s+uninstall/,              // Package removal
  /yarn\s+remove/,                // Package removal
  /git\s+reset\s+--hard/,         // Git hard reset
  /sudo\s+/,                      // Elevated privileges
  /chmod\s+777/,                  // Dangerous permissions
  /\.env.*=.*password/i,          // Credential changes
  /\.env.*=.*secret/i,            // Secret changes
  /\.env.*=.*key/i,               // API key changes
];

const SAFETY_LIMITS = {
  MAX_FILES_MODIFIED: 5,
  MAX_LINES_CHANGED: 100,
  MAX_RECOVERY_DURATION_MS: 10 * 60 * 1000, // 10 minutes
  MAX_CLEANUP_DURATION_MS: 5 * 60 * 1000,   // 5 minutes
  MAX_FOLLOWUP_DURATION_MS: 10 * 60 * 1000, // 10 minutes
};

// Failure categories eligible for auto-recovery
const RECOVERABLE_CATEGORIES = new Set([
  'cli_incompatibility',
  'resource_not_found',
  'syntax_error',
  'import_error',
]);

// Failure categories that need conditional assessment
const CONDITIONAL_CATEGORIES = new Set([
  'permission_denied',
  'configuration_error',
]);

// Failure categories that should never auto-recover
const NON_RECOVERABLE_CATEGORIES = new Set([
  'timeout',
  'oom',
  'system_error',
]);

// ============================================================================
// Safety Analyzer
// ============================================================================

export class SafetyAnalyzer {
  /**
   * Analyze changes from a git diff patch for safety
   */
  analyzeChanges(patch: string): SafetyAnalysis {
    const filesModified = this.countFiles(patch);
    const linesChanged = this.countLines(patch);
    const criticalPaths = this.findCriticalPaths(patch);
    const destructiveOps = this.detectDestructiveOps(patch);
    const externalDeps = this.detectNewDependencies(patch);

    const violations: string[] = [];

    if (filesModified > SAFETY_LIMITS.MAX_FILES_MODIFIED) {
      violations.push(`Too many files modified: ${filesModified} > ${SAFETY_LIMITS.MAX_FILES_MODIFIED}`);
    }

    if (linesChanged > SAFETY_LIMITS.MAX_LINES_CHANGED) {
      violations.push(`Too many lines changed: ${linesChanged} > ${SAFETY_LIMITS.MAX_LINES_CHANGED}`);
    }

    if (criticalPaths.length > 0) {
      violations.push(`Critical paths modified: ${criticalPaths.join(', ')}`);
    }

    if (destructiveOps.length > 0) {
      violations.push(`Destructive operations detected: ${destructiveOps.join(', ')}`);
    }

    if (externalDeps) {
      violations.push('New external dependencies added');
    }

    const isSafe = violations.length === 0;

    return {
      filesModified,
      linesChanged,
      criticalPaths,
      destructiveOps,
      externalDeps,
      isSafe,
      violations
    };
  }

  private countFiles(patch: string): number {
    const matches = patch.match(/^diff --git/gm);
    return matches ? matches.length : 0;
  }

  private countLines(patch: string): number {
    const lines = patch.split('\n');
    let changed = 0;
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        changed++;
      }
      if (line.startsWith('-') && !line.startsWith('---')) {
        changed++;
      }
    }
    return changed;
  }

  private findCriticalPaths(patch: string): string[] {
    const critical: string[] = [];
    const lines = patch.split('\n');

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.+?) b\//);
        if (match) {
          const filepath = match[1];
          if (this.isCriticalPath(filepath)) {
            critical.push(filepath);
          }
        }
      }
    }

    return critical;
  }

  private isCriticalPath(filepath: string): boolean {
    return CRITICAL_FILES.some(pattern => {
      if (pattern.includes('**')) {
        // Glob pattern matching
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*'));
        return regex.test(filepath);
      }
      return filepath.includes(pattern) || filepath.endsWith(pattern);
    });
  }

  private detectDestructiveOps(patch: string): string[] {
    const destructive: string[] = [];

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(patch)) {
        destructive.push(pattern.source);
      }
    }

    return destructive;
  }

  private detectNewDependencies(patch: string): boolean {
    // Check if package.json dependencies section is modified
    const lines = patch.split('\n');
    let inPackageJson = false;
    let inDependencies = false;

    for (const line of lines) {
      if (line.startsWith('diff --git') && line.includes('package.json')) {
        inPackageJson = true;
      }

      if (inPackageJson) {
        if (line.includes('"dependencies"') || line.includes('"devDependencies"')) {
          inDependencies = true;
        }

        if (inDependencies && (line.startsWith('+') && !line.startsWith('+++'))) {
          // New dependency line added
          return true;
        }
      }
    }

    return false;
  }
}

// ============================================================================
// Failure Recovery Orchestrator
// ============================================================================

export class FailureRecoveryOrchestrator {
  private devBotsManager: DevBotsManager;
  private safetyAnalyzer: SafetyAnalyzer;
  private recoveryAttempts: Map<string, RecoveryAttempt>;

  constructor(devBotsManager: DevBotsManager) {
    this.devBotsManager = devBotsManager;
    this.safetyAnalyzer = new SafetyAnalyzer();
    this.recoveryAttempts = new Map();
  }

  /**
   * Attempt automatic recovery for a failed task
   */
  async attemptRecovery(context: FailureContext): Promise<RecoveryResult> {
    logger.info({
      category: 'recovery',
      action: 'evaluating_recovery',
      message: `Evaluating recovery for failed task: ${context.task.id}`,
      details: {
        taskId: context.task.id,
        failurePattern: context.failurePattern?.name,
        category: context.failurePattern?.category
      }
    });

    // Check if recovery is appropriate
    const eligibility = this.checkRecoveryEligibility(context);
    if (!eligibility.eligible) {
      logger.info({
        category: 'recovery',
        action: 'recovery_not_eligible',
        message: `Recovery not eligible: ${eligibility.reason}`,
        details: { taskId: context.task.id, reason: eligibility.reason }
      });

      return {
        status: 'not_recoverable',
        reason: eligibility.reason
      };
    }

    // Check if already attempted recovery for this task
    if (this.hasAttemptedRecovery(context.task.id)) {
      logger.warn({
        category: 'recovery',
        action: 'recovery_already_attempted',
        message: 'Recovery already attempted for this task',
        details: { taskId: context.task.id }
      });

      return {
        status: 'not_recoverable',
        reason: 'Recovery already attempted once for this task'
      };
    }

    // Create recovery attempt record
    const attempt = this.createRecoveryAttempt(context);

    try {
      // Stage 1: Cleanup Bot
      logger.info({
        category: 'recovery',
        action: 'starting_cleanup_bot',
        message: 'Starting cleanup bot (Stage 1)',
        details: { attemptId: attempt.id, taskId: context.task.id }
      });

      attempt.stage = 'cleanup';
      const cleanupResult = await this.runCleanupBot(context, attempt);

      if (cleanupResult.status === 'failed') {
        return this.handleCleanupFailure(attempt, cleanupResult);
      }

      // Analyze cleanup bot changes for safety
      const safetyAnalysis = this.safetyAnalyzer.analyzeChanges(cleanupResult.patch || '');
      logger.info({
        category: 'recovery',
        action: 'cleanup_safety_analysis',
        message: 'Cleanup bot safety analysis complete',
        details: {
          attemptId: attempt.id,
          ...safetyAnalysis
        }
      });

      if (!safetyAnalysis.isSafe) {
        logger.error({
          category: 'recovery',
          action: 'cleanup_unsafe',
          message: 'Cleanup bot changes unsafe, aborting recovery',
          details: {
            attemptId: attempt.id,
            violations: safetyAnalysis.violations
          }
        });

        attempt.status = 'failed';
        attempt.recoverySummary = `Cleanup bot changes unsafe: ${safetyAnalysis.violations.join(', ')}`;
        return {
          status: 'hard_failed',
          reason: `Unsafe changes: ${safetyAnalysis.violations.join(', ')}`
        };
      }

      // Stage 2: Follow-up Bot
      logger.info({
        category: 'recovery',
        action: 'starting_followup_bot',
        message: 'Starting follow-up bot (Stage 2)',
        details: { attemptId: attempt.id, taskId: context.task.id }
      });

      attempt.stage = 'followup';
      const followupResult = await this.runFollowupBot(context, cleanupResult, attempt);

      if (followupResult.status === 'failed') {
        return this.handleFollowupFailure(attempt, cleanupResult, followupResult);
      }

      // Success!
      attempt.status = 'recovered';
      attempt.stage = 'complete';
      attempt.completedAt = Date.now();
      attempt.totalDuration = attempt.completedAt - attempt.startedAt;

      logger.info({
        category: 'recovery',
        action: 'recovery_succeeded',
        message: `Task recovered successfully: ${context.task.id}`,
        details: {
          attemptId: attempt.id,
          taskId: context.task.id,
          totalDuration: attempt.totalDuration,
          cleanupBotTaskId: attempt.cleanupBotTaskId,
          followupBotTaskId: attempt.followupBotTaskId
        }
      });

      return {
        status: 'recovered',
        cleanupPatch: cleanupResult.patch,
        followupPatch: followupResult.patch,
        totalDuration: attempt.totalDuration,
        attemptId: attempt.id
      };

    } catch (error) {
      logger.error({
        category: 'recovery',
        action: 'recovery_error',
        message: 'Error during recovery attempt',
        details: {
          attemptId: attempt.id,
          taskId: context.task.id,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      attempt.status = 'failed';
      attempt.recoverySummary = `Error: ${error instanceof Error ? error.message : String(error)}`;

      return {
        status: 'hard_failed',
        reason: `Recovery error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if this task/failure is eligible for automatic recovery
   */
  private checkRecoveryEligibility(context: FailureContext): { eligible: boolean; reason?: string } {
    // Must have a detected failure pattern
    if (!context.failurePattern) {
      return {
        eligible: false,
        reason: 'No failure pattern detected'
      };
    }

    const category = context.failurePattern.category;

    // Check if category is explicitly non-recoverable
    if (NON_RECOVERABLE_CATEGORIES.has(category)) {
      return {
        eligible: false,
        reason: `Failure category '${category}' is not eligible for auto-recovery`
      };
    }

    // Recoverable categories are eligible
    if (RECOVERABLE_CATEGORIES.has(category)) {
      return { eligible: true };
    }

    // Conditional categories need additional checks
    if (CONDITIONAL_CATEGORIES.has(category)) {
      // For now, allow conditional recovery
      // In future, add more sophisticated checks
      logger.info({
        category: 'recovery',
        action: 'conditional_recovery_allowed',
        message: `Allowing conditional recovery for category: ${category}`,
        details: { taskId: context.task.id, category }
      });
      return { eligible: true };
    }

    // Unknown category - be conservative
    return {
      eligible: false,
      reason: `Unknown failure category: ${category}`
    };
  }

  /**
   * Check if we've already attempted recovery for this task
   */
  private hasAttemptedRecovery(taskId: string): boolean {
    for (const attempt of this.recoveryAttempts.values()) {
      if (attempt.taskId === taskId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a new recovery attempt record
   */
  private createRecoveryAttempt(context: FailureContext): RecoveryAttempt {
    const attempt: RecoveryAttempt = {
      id: `recovery-${context.task.id}-${Date.now()}`,
      taskId: context.task.id,
      originalFailurePattern: context.failurePattern?.name || 'unknown',
      status: 'running',
      stage: 'evaluating',
      startedAt: Date.now()
    };

    this.recoveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  /**
   * Run the cleanup bot to analyze and fix the failure
   *
   * IMPORTANT: Cleanup bot:
   * - Counts towards max concurrent bot limit
   * - Jumps to front of queue (high priority)
   * - Must complete before follow-up bot launches
   */
  private async runCleanupBot(
    context: FailureContext,
    attempt: RecoveryAttempt
  ): Promise<{ status: 'success' | 'failed'; patch?: string; taskId?: string; failurePattern?: FailurePattern }> {
    const cleanupPrompt = this.buildCleanupBotPrompt(context);

    // Create cleanup bot task with HIGH PRIORITY
    const cleanupTask = await this.devBotsManager.addTask({
      type: 'bugfix',
      title: `[CLEANUP BOT] Fix ${context.failurePattern?.name || 'failure'} in task: ${context.task.title}`,
      description: cleanupPrompt,
      acceptanceCriteria: [
        'Analyze the failure and identify root cause',
        'Apply minimal fix to resolve the failure',
        'Changes must be within safety limits (max 5 files, 100 lines)',
        'No modifications to critical files or dependencies',
        'Generate clean patch with fix'
      ],
      project: context.task.project,
      assignedAgent: context.task.assignedAgent,
      notes: `Cleanup bot for failed task: ${context.task.id}`,
      priority: 100, // HIGH PRIORITY - jumps queue
      metadata: {
        recoveryAttemptId: attempt.id,
        originalTaskId: context.task.id,
        isCleanupBot: true,
        countsTowardsConcurrencyLimit: true // Explicitly count towards max concurrent
      }
    });

    attempt.cleanupBotTaskId = cleanupTask.task.id;

    // Wait for cleanup bot to complete BEFORE launching follow-up
    // This ensures serial execution
    logger.info({
      category: 'recovery',
      action: 'waiting_for_cleanup',
      message: 'Waiting for cleanup bot to complete before launching follow-up',
      details: {
        attemptId: attempt.id,
        cleanupBotTaskId: cleanupTask.task.id,
        maxWaitTime: SAFETY_LIMITS.MAX_CLEANUP_DURATION_MS
      }
    });

    const cleanupResult = await this.waitForTaskCompletion(
      cleanupTask.task.id,
      SAFETY_LIMITS.MAX_CLEANUP_DURATION_MS
    );

    // CRITICAL: Only return result if cleanup succeeded
    // If cleanup failed, do NOT launch follow-up bot
    if (cleanupResult.status !== 'success') {
      logger.warn({
        category: 'recovery',
        action: 'cleanup_failed_skip_followup',
        message: 'Cleanup bot failed, skipping follow-up bot launch',
        details: {
          attemptId: attempt.id,
          cleanupBotTaskId: cleanupTask.task.id
        }
      });
    }

    return cleanupResult;
  }

  /**
   * Run the follow-up bot to complete the original task
   *
   * IMPORTANT: Follow-up bot:
   * - Only launches if cleanup bot succeeded
   * - Counts towards max concurrent bot limit
   * - Jumps to front of queue (high priority)
   * - Executes serially after cleanup completes
   */
  private async runFollowupBot(
    context: FailureContext,
    cleanupResult: { patch?: string; taskId?: string },
    attempt: RecoveryAttempt
  ): Promise<{ status: 'success' | 'failed'; patch?: string; taskId?: string; failurePattern?: FailurePattern }> {
    const followupPrompt = this.buildFollowupBotPrompt(context, cleanupResult);

    // Create follow-up bot task with HIGH PRIORITY
    const followupTask = await this.devBotsManager.addTask({
      type: context.task.type,
      title: `[FOLLOWUP BOT] Complete task after cleanup: ${context.task.title}`,
      description: followupPrompt,
      acceptanceCriteria: context.task.acceptanceCriteria,
      project: context.task.project,
      assignedAgent: context.task.assignedAgent,
      files: context.task.files,
      notes: `Follow-up bot for task ${context.task.id} after cleanup ${cleanupResult.taskId}`,
      priority: 100, // HIGH PRIORITY - jumps queue
      metadata: {
        recoveryAttemptId: attempt.id,
        originalTaskId: context.task.id,
        cleanupBotTaskId: cleanupResult.taskId,
        isFollowupBot: true,
        countsTowardsConcurrencyLimit: true // Explicitly count towards max concurrent
      }
    });

    attempt.followupBotTaskId = followupTask.task.id;

    logger.info({
      category: 'recovery',
      action: 'followup_bot_launched',
      message: 'Follow-up bot launched after cleanup success',
      details: {
        attemptId: attempt.id,
        followupBotTaskId: followupTask.task.id,
        cleanupBotTaskId: cleanupResult.taskId
      }
    });

    // Wait for follow-up bot to complete (with timeout)
    const followupResult = await this.waitForTaskCompletion(
      followupTask.task.id,
      SAFETY_LIMITS.MAX_FOLLOWUP_DURATION_MS
    );

    return followupResult;
  }

  /**
   * Build the cleanup bot prompt
   */
  private buildCleanupBotPrompt(context: FailureContext): string {
    return `# CLEANUP BOT - Failure Recovery Stage 1

You are a specialized cleanup bot designed to analyze and fix bot task failures.

## Your Mission
1. Analyze the failure context below
2. Identify the root cause
3. Determine if it's safe to auto-fix
4. Apply MINIMAL changes to resolve the failure
5. Generate a clean patch

## Failure Context

**Original Task:**
${context.task.title}

${context.task.description}

**Failure Category:** ${context.failurePattern?.category || 'unknown'}
**Failure Pattern:** ${context.failurePattern?.name || 'unknown'}
**Exit Code:** ${context.exitCode}

**Error Output:**
\`\`\`
${context.stderr.slice(0, 2000)}
${context.stderr.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`

${context.stdout ? `**Standard Output:**
\`\`\`
${context.stdout.slice(0, 1000)}
${context.stdout.length > 1000 ? '\n... (truncated)' : ''}
\`\`\`
` : ''}

${context.uncommittedChanges ? `**Uncommitted Changes:**
\`\`\`diff
${context.uncommittedChanges.slice(0, 2000)}
${context.uncommittedChanges.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`
` : ''}

**Suggested Fix:** ${context.failurePattern?.suggestedFix || 'Analyze error and determine fix'}

## Safety Constraints

❌ DO NOT:
- Make changes to package.json or dependencies
- Modify critical system files (database, configs, Dockerfiles)
- Perform destructive operations (rm -rf, DROP TABLE, etc.)
- Change more than 5 files
- Add more than 100 lines of code
- Modify authentication or security code

✅ DO:
- Fix syntax errors
- Add missing imports
- Correct CLI argument usage
- Fix file paths
- Add minimal configuration
- Keep changes focused and minimal

## Output Format

Analyze the failure and respond with:

1. **Root Cause Analysis** (2-3 sentences)
2. **Safety Assessment** (Safe/Unsafe for auto-recovery, explain why)
3. **Proposed Fix** (Minimal changes needed)
4. **Expected Outcome** (What should work after fix)

If safe, apply the minimal fix and commit with message:
"fix: cleanup bot - [brief description]"

If unsafe, explain why manual review is required.
`;
  }

  /**
   * Build the follow-up bot prompt
   */
  private buildFollowupBotPrompt(
    context: FailureContext,
    cleanupResult: { patch?: string; taskId?: string }
  ): string {
    return `# FOLLOW-UP BOT - Failure Recovery Stage 2

You are a specialized follow-up bot that completes work after cleanup.

## Your Mission
1. Review the cleanup bot's fix
2. Verify it addressed the failure
3. Complete the original task goal
4. Ensure all acceptance criteria met

## Context

**Original Task:**
${context.task.title}

${context.task.description}

**Acceptance Criteria:**
${context.task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

**Cleanup Bot Task ID:** ${cleanupResult.taskId}

${cleanupResult.patch ? `**Cleanup Bot Changes:**
\`\`\`diff
${cleanupResult.patch.slice(0, 2000)}
${cleanupResult.patch.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`
` : ''}

## Your Tasks

1. **Validate Cleanup**
   - Does the cleanup fix address the original failure?
   - Are the changes appropriate and minimal?
   - Any issues introduced?

2. **Complete Original Goal**
   - Review acceptance criteria
   - Identify remaining work
   - Complete the implementation

3. **Quality Check**
   - All acceptance criteria met?
   - Code follows project standards?
   - Tests passing?

## Safety Constraints

Same constraints as cleanup bot:
- Max 5 files modified (total with cleanup)
- Max 100 lines changed (total with cleanup)
- No critical file modifications
- No destructive operations

## Output Format

1. **Cleanup Review** (Is the fix good? Any issues?)
2. **Remaining Work** (What's left to complete original task?)
3. **Implementation Plan** (Steps to complete)
4. **Completion Status** (Done/Needs more work/Blocked)

Complete the work and commit with message:
"feat: follow-up bot - [brief description]"
`;
  }

  /**
   * Wait for a task to complete with timeout
   */
  private async waitForTaskCompletion(
    taskId: string,
    timeoutMs: number
  ): Promise<{ status: 'success' | 'failed'; patch?: string; taskId?: string; failurePattern?: FailurePattern }> {
    const startTime = Date.now();
    const pollInterval = 5000; // Poll every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      // Query task status from database
      const task = this.devBotsManager.getTaskQueue().getTask(taskId);

      if (!task) {
        logger.error({
          category: 'recovery',
          action: 'task_not_found',
          message: `Task ${taskId} not found in queue`,
          details: { taskId }
        });
        return {
          status: 'failed',
          taskId
        };
      }

      if (task.status === 'completed') {
        logger.info({
          category: 'recovery',
          action: 'repair_bot_completed',
          message: `Repair bot task ${taskId} completed successfully`,
          details: { taskId, repairStage: task.repair_stage }
        });

        return {
          status: 'success',
          patch: task.output || '',
          taskId
        };
      }

      if (task.status === 'failed') {
        logger.warn({
          category: 'recovery',
          action: 'repair_bot_failed',
          message: `Repair bot task ${taskId} failed`,
          details: { taskId, error: task.error, repairStage: task.repair_stage }
        });

        // Try to detect failure pattern from error
        const failurePattern = task.error ? detectFailurePattern(task.error, '', 1) : undefined;

        return {
          status: 'failed',
          taskId,
          failurePattern
        };
      }

      // Task still running or pending, wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    logger.error({
      category: 'recovery',
      action: 'repair_bot_timeout',
      message: `Repair bot task ${taskId} timed out after ${timeoutMs}ms`,
      details: { taskId, timeoutMs }
    });

    return {
      status: 'failed',
      taskId
    };
  }

  /**
   * Handle cleanup bot failure
   */
  private handleCleanupFailure(
    attempt: RecoveryAttempt,
    _cleanupResult: { failurePattern?: FailurePattern }
  ): RecoveryResult {
    attempt.status = 'failed';
    attempt.recoverySummary = 'Cleanup bot failed';

    logger.error({
      category: 'recovery',
      action: 'cleanup_bot_failed',
      message: 'Cleanup bot failed, aborting recovery',
      details: {
        attemptId: attempt.id,
        cleanupBotTaskId: attempt.cleanupBotTaskId
      }
    });

    return {
      status: 'hard_failed',
      reason: 'Cleanup bot failed to fix the issue'
    };
  }

  /**
   * Handle follow-up bot failure
   */
  private handleFollowupFailure(
    attempt: RecoveryAttempt,
    cleanupResult: { failurePattern?: FailurePattern },
    followupResult: { failurePattern?: FailurePattern }
  ): RecoveryResult {
    // Check if same failure pattern in both cleanup and followup
    if (
      followupResult.failurePattern &&
      cleanupResult.failurePattern &&
      followupResult.failurePattern.name === cleanupResult.failurePattern.name
    ) {
      attempt.status = 'failed';
      attempt.recoverySummary = 'Same failure in cleanup and follow-up bots';

      logger.error({
        category: 'recovery',
        action: 'same_failure_pattern_detected',
        message: 'Follow-up bot encountered same failure, hard failing',
        details: {
          attemptId: attempt.id,
          failurePattern: followupResult.failurePattern.name
        }
      });

      return {
        status: 'hard_failed',
        reason: 'Follow-up bot encountered same failure as cleanup bot'
      };
    }

    attempt.status = 'failed';
    attempt.recoverySummary = 'Follow-up bot failed';

    logger.error({
      category: 'recovery',
      action: 'followup_bot_failed',
      message: 'Follow-up bot failed, marking for manual review',
      details: {
        attemptId: attempt.id,
        followupBotTaskId: attempt.followupBotTaskId
      }
    });

    return {
      status: 'hard_failed',
      reason: 'Follow-up bot failed to complete the task'
    };
  }
}
