import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { DevBotsDatabase, getDatabase, TokenUsage } from './database.js';

/**
 * Token budget configuration per provider
 */
export interface TokenBudget {
  provider: string;
  dailyLimit: number; // Daily token limit
  costPerMillionInput: number; // Cost per 1M input tokens
  costPerMillionOutput: number; // Cost per 1M output tokens
  warningThreshold: number; // Percentage (0-100) at which to warn
}

/**
 * Token usage summary with cost estimates
 */
export interface TokenUsageSummary {
  provider: string;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  requestCount: number;
  estimatedCost: number;
  budgetLimit: number;
  percentUsed: number;
  warningTriggered: boolean;
  limitExceeded: boolean;
}

/**
 * Service for tracking and managing token usage across AI providers
 *
 * Features:
 * - Track token usage per provider/model
 * - Enforce daily budget limits
 * - Generate cost estimates
 * - Emit warnings and stop signals
 * - Provide usage statistics
 */
export interface TokenTrackingOptions {
  database?: DevBotsDatabase;
  budgets?: TokenBudget[];
}

export class TokenTrackingService extends EventEmitter {
  private budgets: Map<string, TokenBudget> = new Map();
  private db: DevBotsDatabase;

  constructor(options: TokenTrackingOptions = {}) {
    super();
    this.db = options.database ?? getDatabase();
    this.initializeDefaultBudgets();

    if (options.budgets) {
      for (const budget of options.budgets) {
        this.setBudget(budget);
      }
    }
  }

  /**
   * Initialize default budgets for known providers
   */
  private initializeDefaultBudgets(): void {
    // Claude API pricing (as of Oct 2025)
    this.setBudget({
      provider: 'claude',
      dailyLimit: 1000000, // 1M tokens per day
      costPerMillionInput: 3.00, // $3 per 1M input tokens (Sonnet)
      costPerMillionOutput: 15.00, // $15 per 1M output tokens
      warningThreshold: 80 // Warn at 80%
    });

    // OpenAI Codex pricing (estimated)
    this.setBudget({
      provider: 'codex',
      dailyLimit: 500000, // 500K tokens per day
      costPerMillionInput: 10.00, // $10 per 1M tokens (estimated)
      costPerMillionOutput: 30.00, // $30 per 1M tokens (estimated)
      warningThreshold: 80
    });

    // OpenAI GPT-4 pricing
    this.setBudget({
      provider: 'openai',
      dailyLimit: 500000, // 500K tokens per day
      costPerMillionInput: 10.00, // $10 per 1M input tokens
      costPerMillionOutput: 30.00, // $30 per 1M output tokens
      warningThreshold: 80
    });

    logger.info({
      category: 'token-tracking',
      action: 'default_budgets_initialized',
      message: 'Default token budgets initialized',
    });
  }

  /**
   * Set or update budget for a provider
   */
  setBudget(budget: TokenBudget): void {
    this.budgets.set(budget.provider, budget);
    logger.info({
      category: 'token-tracking',
      action: 'budget_updated',
      message: `Budget set for provider ${budget.provider}`,
      details: {
        provider: budget.provider,
        dailyLimit: budget.dailyLimit,
        warningThreshold: budget.warningThreshold
      }
    });
  }

  /**
   * Get budget configuration for a provider
   */
  getBudget(provider: string): TokenBudget | undefined {
    return this.budgets.get(provider);
  }

  /**
   * Record token usage for a task
   */
  recordUsage(usage: TokenUsage): void {
    // Calculate cost estimate if not provided
    if (!usage.costEstimate) {
      usage.costEstimate = this.calculateCost(
        usage.provider,
        usage.inputTokens,
        usage.outputTokens
      );
    }

    // Record in database
    this.db.recordTokenUsage(usage);

    logger.debug({
      category: 'token-tracking',
      action: 'usage_recorded',
      message: `Token usage recorded for task ${usage.taskId}`,
      details: {
        provider: usage.provider,
        model: usage.model,
        taskId: usage.taskId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.costEstimate
      }
    });

    // Check if budget exceeded or warning threshold reached
    this.checkBudgetStatus(usage.provider);
  }

  /**
   * Calculate cost for token usage
   */
  private calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
    const budget = this.budgets.get(provider);
    if (!budget) {
      logger.warn({
        category: 'token-tracking',
        action: 'budget_missing',
        message: `No budget configured for provider ${provider}; cost estimation unavailable`
      });
      return 0;
    }

    const inputCost = (inputTokens / 1_000_000) * budget.costPerMillionInput;
    const outputCost = (outputTokens / 1_000_000) * budget.costPerMillionOutput;

    return inputCost + outputCost;
  }

  /**
   * Check budget status and emit warnings/stops
   */
  private checkBudgetStatus(provider: string): void {
    const summary = this.getDailySummary(provider);

    // Emit warning if threshold reached
    if (summary.warningTriggered && !summary.limitExceeded) {
      this.emit('budget_warning', summary);
      logger.warn({
        category: 'token-tracking',
        action: 'budget_threshold_warning',
        message: `Budget warning triggered for provider ${provider}`,
        details: {
          percentUsed: summary.percentUsed,
          threshold: this.budgets.get(provider)?.warningThreshold
        }
      });
    }

    // Emit stop signal if limit exceeded
    if (summary.limitExceeded) {
      this.emit('budget_exceeded', summary);
      logger.error({
        category: 'token-tracking',
        action: 'budget_exceeded',
        message: `Budget exceeded for provider ${provider}`,
        details: {
          totalTokens: summary.totalTokens,
          limit: summary.budgetLimit
        }
      });
    }
  }

  /**
   * Get daily usage summary for a provider
   */
  getDailySummary(provider: string): TokenUsageSummary {
    const budget = this.budgets.get(provider);
    const stats = this.db.getDailyTokenUsage(provider);

    const totalInput = stats.total_input || 0;
    const totalOutput = stats.total_output || 0;
    const totalTokens = totalInput + totalOutput;
    const budgetLimit = budget?.dailyLimit || 0;
    const percentUsed = budgetLimit > 0 ? (totalTokens / budgetLimit) * 100 : 0;
    const warningThreshold = budget?.warningThreshold || 80;

    // Calculate estimated cost
    const estimatedCost = budget
      ? this.calculateCost(provider, totalInput, totalOutput)
      : 0;

    return {
      provider,
      totalInput,
      totalOutput,
      totalTokens,
      requestCount: stats.request_count || 0,
      estimatedCost,
      budgetLimit,
      percentUsed,
      warningTriggered: percentUsed >= warningThreshold,
      limitExceeded: totalTokens >= budgetLimit
    };
  }

  /**
   * Get usage summary for all providers
   */
  getAllSummaries(): TokenUsageSummary[] {
    const summaries: TokenUsageSummary[] = [];

    for (const [provider] of this.budgets) {
      summaries.push(this.getDailySummary(provider));
    }

    return summaries;
  }

  /**
   * Check if a provider can be used (budget not exceeded)
   */
  canUseProvider(provider: string): boolean {
    const summary = this.getDailySummary(provider);
    return !summary.limitExceeded;
  }

  /**
   * Get remaining tokens for a provider today
   */
  getRemainingTokens(provider: string): number {
    const summary = this.getDailySummary(provider);
    return Math.max(0, summary.budgetLimit - summary.totalTokens);
  }

  /**
   * Reset daily tracking (called at midnight or manually)
   * Note: This doesn't delete data, just for checking purposes
   */
  resetDailyTracking(): void {
    // Daily tracking is handled by database queries filtering by date
    // This method is for any in-memory resets if needed
    logger.info({
      category: 'token-tracking',
      action: 'daily_tracking_reset',
      message: 'Daily token tracking statistics reset'
    });
    this.emit('daily_reset');
  }
}

// Singleton instance
let tokenTrackingInstance: TokenTrackingService | null = null;

/**
 * Get the singleton token tracking service instance
 */
export function getTokenTrackingService(options: TokenTrackingOptions = {}): TokenTrackingService {
  if (!tokenTrackingInstance) {
    tokenTrackingInstance = new TokenTrackingService(options);
  }
  return tokenTrackingInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTokenTrackingService(): void {
  tokenTrackingInstance = null;
}
