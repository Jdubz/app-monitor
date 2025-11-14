/**
 * Agent Eligibility Service
 *
 * This service provides eligibility checks for agent selection,
 * ensuring that an agent is only selected if it meets all the
 * necessary criteria.
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';

import type { AgentType } from './agentSelector.js';

export interface AgentEligibilityService {
  isEligible(task: Task, agent: AgentType): Promise<boolean>;
}

export class AgentEligibilityServiceImpl implements AgentEligibilityService {
  constructor() {
    logger.info({
      category: 'process',
      action: 'agent_eligibility_service_initialized',
      message: 'AgentEligibilityService initialized',
    });
  }

  public async isEligible(task: Task, agent: AgentType): Promise<boolean> {
    if (agent === 'gemini') {
      return this.isGeminiEligible(task);
    }
    // For other agents, eligibility checks not yet implemented
    // Default to eligible for Claude and Codex
    if (agent === 'claude' || agent === 'codex') {
      return true;
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
      category: 'process',
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
    // Use type guard to safely check for risk_score property
    const riskScore = 'risk_score' in task && typeof (task as any).risk_score === 'number' ? (task as any).risk_score : 0;
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
