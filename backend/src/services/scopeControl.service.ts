/**
 * Scope Control Service
 *
 * Extracted from DevBotsManager to handle scope creep detection,
 * context isolation, violation chain prevention, and cleanup scheduling.
 *
 * This service ensures tasks stay focused and don't snowball into
 * uncontrolled refactoring or feature creep.
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import { MS_PER_HOUR, MS_PER_DAY } from '../constants/timeouts.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ScopeViolation {
  type: string;
  severity: string;
}

export interface CleanContext {
  allowedFiles: string[];
  maxComplexity: string;
  forbiddenPatterns: string[];
  scope: string;
}

export interface ViolationChainEntry {
  taskId: string;
  violations: ScopeViolation[];
  timestamp: number;
}

// ============================================================================
// Scope Creep Detector
// ============================================================================

export class ScopeCreepDetector {
  detectCreepPatterns(task: Task, output: string): ScopeViolation[] {
    const patterns = {
      fileCreation: /(?:created|new file|mkdir|touch|writeFile|fs\.write)/gi,
      overEngineering: /(?:complex|sophisticated|advanced|enterprise|scalable)/gi,
      scopeExpansion: /(?:also|additionally|furthermore|moreover|while we're at it)/gi,
      unnecessaryComplexity: /(?:design pattern|architecture|framework|library|dependency)/gi,
      featureCreep: /(?:feature|enhancement|improvement|optimization|refactoring)/gi
    };

    const violations: ScopeViolation[] = [];
    Object.entries(patterns).forEach(([type, regex]) => {
      if (regex.test(output)) {
        violations.push({ type, severity: this.getSeverity(type, output) });
      }
    });

    return violations;
  }

  private getSeverity(type: string, _output: string): string {
    const severityMap: Record<string, string> = {
      'fileCreation': 'HIGH',
      'overEngineering': 'MEDIUM',
      'scopeExpansion': 'HIGH',
      'unnecessaryComplexity': 'MEDIUM',
      'featureCreep': 'LOW'
    };
    return severityMap[type] || 'LOW';
  }
}

// ============================================================================
// Context Isolation
// ============================================================================

export class ContextIsolation {
  private cleanContexts = new Map<string, CleanContext>();
  private contaminatedContexts = new Set<string>();

  isolateContaminatedContext(taskId: string, _violations: ScopeViolation[]): void {
    this.contaminatedContexts.add(taskId);
    const cleanContext = this.createCleanContext(taskId);
    this.cleanContexts.set(taskId, cleanContext);
    logger.info({
      category: 'process',
      action: 'context_isolation_isolated_contaminated_context',
      message: `[CONTEXT_ISOLATION] Isolated contaminated context for task ${taskId}`
    });
  }

  private createCleanContext(_taskId: string): CleanContext {
    return {
      allowedFiles: ['existing-files-only'],
      maxComplexity: 'simple',
      forbiddenPatterns: ['create', 'new', 'complex', 'sophisticated'],
      scope: 'minimal'
    };
  }

  getBaselineContext(): CleanContext {
    return {
      allowedFiles: ['existing-files-only'],
      maxComplexity: 'simple',
      forbiddenPatterns: ['create', 'new', 'complex', 'sophisticated'],
      scope: 'minimal'
    };
  }
}

// ============================================================================
// Snowball Prevention
// ============================================================================

export class SnowballPrevention {
  private violationChain = new Map<string, ViolationChainEntry[]>();

  detectViolationChain(taskId: string, violations: ScopeViolation[]): void {
    const chain = this.violationChain.get(taskId) || [];
    chain.push({
      taskId,
      violations,
      timestamp: Date.now()
    });

    this.violationChain.set(taskId, chain);

    if (chain.length >= 3) {
      this.triggerChainBreaker(taskId, chain);
    }
  }

  private triggerChainBreaker(taskId: string, chain: ViolationChainEntry[]): void {
    logger.warn({
      category: 'process',
      action: 'chain_breaker_detected_violation_chain',
      message: `[CHAIN_BREAKER] Detected violation chain of ${chain.length} tasks - triggering emergency recovery`
    });
    // Emergency recovery will be handled by the main manager
  }
}

// ============================================================================
// Periodic Cleanup Scheduler
// ============================================================================

export class PeriodicCleanupScheduler {
  private schedules = {
    linting: { interval: 6 * MS_PER_HOUR, lastRun: Date.now() },
    deduplication: { interval: 12 * MS_PER_HOUR, lastRun: Date.now() },
    documentation: { interval: 24 * MS_PER_HOUR, lastRun: Date.now() },
    testing: { interval: 48 * MS_PER_HOUR, lastRun: Date.now() },
    deepCleanup: { interval: 7 * MS_PER_DAY, lastRun: Date.now() }
  };

  checkSchedules(): string[] {
    const now = Date.now();
    const dueTasks: string[] = [];

    Object.entries(this.schedules).forEach(([type, schedule]) => {
      if (now - schedule.lastRun >= schedule.interval) {
        dueTasks.push(type);
        schedule.lastRun = now;
      }
    });

    return dueTasks;
  }

  createCleanupTask(type: string, taskIdCounter: number): Task {
    const cleanupTasks: Record<string, {
      description: string;
      scope: {
        type: string;
        boundaries: {
          maxChanges: number;
          forbiddenActions: string[];
          maxNewLines: number;
        };
        validation: {
          forbiddenPatterns: string[];
          allowedPatterns: string[];
        };
      };
    }> = {
      linting: {
        description: 'PERIODIC CLEANUP: Run linting and fix code style issues. Focus on existing files only.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 5, forbiddenActions: ['create-new-files'], maxNewLines: 20 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['fix', 'format', 'style'] }
        }
      },
      deduplication: {
        description: 'PERIODIC CLEANUP: Remove duplicate code and consolidate similar functions.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 3, forbiddenActions: ['create-new-files'], maxNewLines: 15 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['remove', 'consolidate', 'merge'] }
        }
      },
      documentation: {
        description: 'PERIODIC CLEANUP: Update and standardize documentation. Fix outdated comments.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 8, forbiddenActions: ['create-new-files'], maxNewLines: 30 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['update', 'fix', 'standardize'] }
        }
      },
      testing: {
        description: 'PERIODIC CLEANUP: Run tests and fix failing tests. Improve test coverage.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 10, forbiddenActions: ['create-new-files'], maxNewLines: 50 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['fix', 'improve', 'test'] }
        }
      },
      deepCleanup: {
        description: 'PERIODIC CLEANUP: Deep codebase cleanup. Remove unused code, optimize imports.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 15, forbiddenActions: ['create-new-files'], maxNewLines: 100 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['remove', 'optimize', 'clean'] }
        }
      }
    };

    const task = cleanupTasks[type];
    return {
      id: `task-${taskIdCounter}-${Date.now()}`,
      type: 'cleanup',
      title: task.description.substring(0, 100),
      description: task.description,
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist',
      priority: 5,
      can_retry: true,
      retry_count: 0,
      max_retries: 3,
      timeout_ms: null
    } as Task;
  }
}

// ============================================================================
// Unified Scope Control Service
// ============================================================================

/**
 * ScopeControlService
 *
 * Coordinates all scope control mechanisms:
 * - Detects scope creep patterns in task output
 * - Isolates contaminated contexts
 * - Prevents snowball effects from violation chains
 * - Schedules periodic cleanup tasks
 */
export class ScopeControlService {
  private scopeCreepDetector: ScopeCreepDetector;
  private contextIsolation: ContextIsolation;
  private snowballPrevention: SnowballPrevention;
  private cleanupScheduler: PeriodicCleanupScheduler;

  constructor() {
    this.scopeCreepDetector = new ScopeCreepDetector();
    this.contextIsolation = new ContextIsolation();
    this.snowballPrevention = new SnowballPrevention();
    this.cleanupScheduler = new PeriodicCleanupScheduler();
  }

  /**
   * Check task output for scope violations
   */
  checkScopeViolations(task: Task, output: string): ScopeViolation[] {
    return this.scopeCreepDetector.detectCreepPatterns(task, output);
  }

  /**
   * Isolate a task's context if contaminated
   */
  isolateContext(taskId: string, violations: ScopeViolation[]): void {
    this.contextIsolation.isolateContaminatedContext(taskId, violations);
  }

  /**
   * Get baseline clean context
   */
  getBaselineContext(): CleanContext {
    return this.contextIsolation.getBaselineContext();
  }

  /**
   * Track violation chain and trigger breaker if needed
   */
  trackViolationChain(taskId: string, violations: ScopeViolation[]): void {
    this.snowballPrevention.detectViolationChain(taskId, violations);
  }

  /**
   * Check which cleanup tasks are due
   */
  checkCleanupSchedules(): string[] {
    return this.cleanupScheduler.checkSchedules();
  }

  /**
   * Create a cleanup task for the given type
   */
  createCleanupTask(type: string, taskIdCounter: number): Task {
    return this.cleanupScheduler.createCleanupTask(type, taskIdCounter);
  }
}
