/**
 * Agent Eligibility Service
 *
 * This service provides eligibility checks for agent selection,
 * ensuring that an agent is only selected if it meets all the
 * necessary criteria.
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';

export interface AgentEligibilityService {
  isEligible(task: Task, agent: 'gemini'): Promise<boolean>;
}

export class AgentEligibilityServiceImpl implements AgentEligibilityService {
  constructor() {
    logger.info({
      category: 'services',
      action: 'agent_eligibility_service_initialized',
      message: 'AgentEligibilityService initialized',
    });
  }

  public async isEligible(task: Task, agent: 'gemini'): Promise<boolean> {
    if (agent === 'gemini') {
      return this.isGeminiEligible(task);
    }
    return false;
  }

  private async isGeminiEligible(task: Task): Promise<boolean> {
    const [riskScoreEligible, contextReady, quotaHealthy, policyOverrides] = await Promise.all([
      this.isRiskScoreEligible(task),
      this.isContextReady(task),
      this.isQuotaHealthy('gemini'),
      this.hasPolicyOverrides(task, 'gemini'),
    ]);

    const eligible = riskScoreEligible && contextReady && quotaHealthy && !policyOverrides;

    logger.info({
      category: 'services',
      action: 'is_gemini_eligible',
      message: `Gemini eligibility for task ${task.id}: ${eligible}`,
      details: {
        taskId: task.id,
        riskScoreEligible,
        contextReady,
        quotaHealthy,
        policyOverrides,
      },
    });

    return eligible;
  }

  private async isRiskScoreEligible(task: Task): Promise<boolean> {
    // TODO: Implement actual risk score calculation
    const riskScore = (task as Task & { risk_score: number }).risk_score || 0;
    return riskScore <= 5;
  }

  private async isContextReady(_task: Task): Promise<boolean> {
    // TODO: Implement actual context readiness check
    return true;
  }

  private async isQuotaHealthy(_agent: 'gemini'): Promise<boolean> {
    // TODO: Implement actual quota health check
    return true;
  }

  private async hasPolicyOverrides(_task: Task, _agent: 'gemini'): Promise<boolean> {
    // TODO: Implement actual policy override check
    return false;
  }
}
