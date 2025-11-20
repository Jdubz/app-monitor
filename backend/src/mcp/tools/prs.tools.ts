import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import Database from 'better-sqlite3';
import { withAuth } from '../middleware/auth.js';
import { createJsonResponse, createErrorResponse, createSuccessResponse, withErrorHandling } from '../utils/response.js';
import type { McpServices } from '../server.js';
import { getPRConditionStateService } from '../../services/prConditionState.service.js';

const prTriggerInputSchema = {
  pr_number: z.number().int().positive(),
  force: z.boolean().optional(),
} satisfies ZodRawShape;

const prBlockingIssuesInputSchema = {
  pr_number: z.number().int().positive(),
} satisfies ZodRawShape;

type PrTriggerParams = z.objectOutputType<typeof prTriggerInputSchema, ZodTypeAny>;
type PrBlockingIssuesParams = z.objectOutputType<typeof prBlockingIssuesInputSchema, ZodTypeAny>;

const STATUS_MAP: Record<string, string> = {
  met: 'pass',
  unmet: 'fail',
  not_ready: 'pending',
};

const BLOCKING_GATES = new Set([
  'branch_updated',
  'no_conflicts',
  'ci_checks_passing',
  'required_approvals',
  'task_verification',
  'final_validation_passed',
  'no_wip_commits',
  'comments_resolved',
  'no_merge_conflicts',
  'no_change_requests',
  'copilot_review_completed',
]);

export function registerPrsTools(
  server: McpServer,
  _db: Database.Database,
  services: McpServices,
) {
  const taskQueue = services.devBotsManager.getTaskQueue();
  const prConditionState = getPRConditionStateService(taskQueue);

  server.registerTool(
    'pr_trigger_evaluation',
    {
      title: 'Trigger PR Evaluation',
      description: 'Manually triggers a PR gate evaluation.',
      inputSchema: prTriggerInputSchema,
    },
    withAuth('pr_trigger_evaluation', withErrorHandling(async (params: PrTriggerParams) => {
      const eventType = params.force ? 'manual_restart' : 'pull_request_opened';
      await prConditionState.evaluateConditions(params.pr_number, eventType);
      return createSuccessResponse(`Gate evaluation triggered for PR #${params.pr_number}`);
    })),
  );

  server.registerTool(
    'pr_get_blocking_issues',
    {
      title: 'Get Blocking Issues for PR',
      description: 'Retrieves the latest gate evaluation and blocking issues.',
      inputSchema: prBlockingIssuesInputSchema,
    },
    withAuth('pr_get_blocking_issues', withErrorHandling(async (params: PrBlockingIssuesParams) => {
      const state = await prConditionState.getState(params.pr_number);
      if (!state) {
        return createErrorResponse(`PR #${params.pr_number} not found`);
      }

      const gateEntries = state.conditions ? Object.entries(state.conditions) : [];
      const gates = gateEntries.map(([name, condition]) => {
        const cond = condition as {
          status?: string;
          blocking_issues?: Array<{ type: string; severity?: string }>;
          last_checked?: number;
        };
        const blockingIssues = cond.blocking_issues ?? [];
        return {
          name,
          status: STATUS_MAP[cond.status ?? 'not_ready'] ?? cond.status ?? 'unknown',
          blocking: name !== 'copilot_review' && BLOCKING_GATES.has(name),
          blockingIssues,
          lastChecked: cond.last_checked ?? null,
        };
      });

      const blocking = gates.filter((gate) => gate.blocking && gate.blockingIssues.length > 0);

      return createJsonResponse({
        pr: params.pr_number,
        merge_eligible: state.merge_eligible ?? false,
        last_evaluated: state.last_evaluated ?? null,
        blocking,
        gates,
      });
    })),
  );
}
