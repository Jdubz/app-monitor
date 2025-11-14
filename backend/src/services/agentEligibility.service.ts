/**
 * Agent Eligibility Service
 * 
 * Determines if a specific agent (like Gemini) is eligible to handle a task
 * based on risk score, context readiness, quota health, and policy overrides.
 * 
 * Design: docs/technicalDesigns/agent-selector-gemini-offload.md
 * Requirements per section 4.3:
 * 1. Task Risk Score - Block high-risk tasks (>= 5)
 * 2. Context Readiness - Ensure MinimalTaskPayload + context bundles exist
 * 3. Quota Health - >= 10% quota remaining (60 rpm, 1000 rpd for Gemini)
 * 4. Policy Overrides - Ops can block Gemini per project/branch
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { AgentType } from './agentSelector.js';

export interface AgentEligibilityService {
  isEligible(task: Task, agent: AgentType): Promise<boolean>;
  recordAgentUsage(agent: AgentType): void;
}

interface QuotaStats {
  requests_per_minute: number;
  requests_per_day: number;
  last_reset_minute: number;
  last_reset_day: number;
}

export class AgentEligibilityServiceImpl implements AgentEligibilityService {
  private quotaStats: Map<AgentType, QuotaStats> = new Map();
  private readonly GEMINI_RPM_LIMIT = 60;
  private readonly GEMINI_RPD_LIMIT = 1000;
  private readonly QUOTA_THRESHOLD = 0.10; // 10% minimum remaining

  constructor() {
    this.initializeQuotaTracking();
    logger.info({
      category: 'process',
      action: 'agent_eligibility_service_initialized',
      message: 'AgentEligibilityService initialized with quota tracking',
    });
  }

  private initializeQuotaTracking(): void {
    this.quotaStats.set('gemini', {
      requests_per_minute: 0,
      requests_per_day: 0,
      last_reset_minute: Date.now(),
      last_reset_day: Date.now()
    });
  }

  async isEligible(task: Task, agent: AgentType): Promise<boolean> {
    if (agent !== 'gemini') {
      // Only Gemini requires eligibility checks for now
      return true;
    }

    const riskScoreEligible = await this.isRiskScoreEligible(task);
    const contextReady = await this.isContextReady(task);
    const quotaHealthy = await this.isQuotaHealthy(agent);
    const policyOverrides = await this.hasPolicyOverrides(task, agent);

    const eligible = riskScoreEligible && contextReady && quotaHealthy && !policyOverrides;

    logger.info({
      category: 'process',
      action: 'agent_eligibility_check',
      message: `Gemini eligibility for task ${task.id}: ${eligible}`,
      details: {
        taskId: task.id,
        taskTitle: task.title,
        agent,
        eligible,
        checks: {
          riskScoreEligible,
          contextReady,
          quotaHealthy,
          policyOverrides,
        },
      },
    });

    return eligible;
  }

  /**
   * Design requirement 4.3.1: Task Risk Score
   * Block Gemini for high-risk tasks (>= 5)
   */
  private async isRiskScoreEligible(task: Task): Promise<boolean> {
    let riskScore = 0;

    // High risk: Backend service modifications
    if (task.title.toLowerCase().includes('backend') || 
        task.title.toLowerCase().includes('service') ||
        task.title.toLowerCase().includes('database') ||
        task.title.toLowerCase().includes('migration')) {
      riskScore += 5;
    }

    // High risk: PR pipeline or workflow changes
    if (task.title.toLowerCase().includes('pr workflow') ||
        task.title.toLowerCase().includes('pipeline') ||
        task.title.toLowerCase().includes('ci/cd')) {
      riskScore += 5;
    }

    // Medium risk: Complex refactoring
    if (task.title.toLowerCase().includes('refactor') ||
        task.title.toLowerCase().includes('restructure')) {
      riskScore += 3;
    }

    // Low risk: Frontend, docs, tests
    if (task.title.toLowerCase().includes('frontend') ||
        task.title.toLowerCase().includes('docs') ||
        task.title.toLowerCase().includes('test')) {
      riskScore = Math.max(0, riskScore - 2);
    }

    // Check for explicit risk_score property
    const explicitRisk = task.risk_score !== undefined && typeof task.risk_score === 'number'
      ? task.risk_score
      : riskScore;

    return explicitRisk < 5;
  }

  /**
   * Design requirement 4.3.2: Context Readiness
   * Ensure MinimalTaskPayload + context bundles exist
   */
  private async isContextReady(task: Task): Promise<boolean> {
    const hasBasicContext = !!(task.title && task.description);
    // TODO Phase 2: Check for actual context bundles
    return hasBasicContext;
  }

  /**
   * Design requirement 4.3.3: Quota Health
   * Gemini allowed only if >= 10% quota remains (60 rpm, 1000 rpd)
   */
  private async isQuotaHealthy(agent: AgentType): Promise<boolean> {
    if (agent !== 'gemini') {
      return true;
    }

    const stats = this.quotaStats.get(agent);
    if (!stats) {
      return true;
    }

    const now = Date.now();
    const minuteElapsed = now - stats.last_reset_minute > 60000;
    const dayElapsed = now - stats.last_reset_day > 86400000;

    if (minuteElapsed) {
      stats.requests_per_minute = 0;
      stats.last_reset_minute = now;
    }

    if (dayElapsed) {
      stats.requests_per_day = 0;
      stats.last_reset_day = now;
    }

    const rpmRemaining = this.GEMINI_RPM_LIMIT - stats.requests_per_minute;
    const rpdRemaining = this.GEMINI_RPD_LIMIT - stats.requests_per_day;

    const rpmHealthy = rpmRemaining >= (this.GEMINI_RPM_LIMIT * this.QUOTA_THRESHOLD);
    const rpdHealthy = rpdRemaining >= (this.GEMINI_RPD_LIMIT * this.QUOTA_THRESHOLD);

    return rpmHealthy && rpdHealthy;
  }

  /**
   * Design requirement 4.3.4: Policy Overrides
   * Ops can block Gemini per project/branch
   */
  private async hasPolicyOverrides(task: Task, _agent: AgentType): Promise<boolean> {
    if (task.metadata && typeof task.metadata === 'object') {
      const metadata = task.metadata;
      if (metadata.block_gemini === true) {
        return true;
      }
    }
    return false;
  }

  /**
   * Track agent usage for quota enforcement
   */
  recordAgentUsage(agent: AgentType): void {
    const stats = this.quotaStats.get(agent);
    if (stats) {
      stats.requests_per_minute++;
      stats.requests_per_day++;
    }
  }
}
