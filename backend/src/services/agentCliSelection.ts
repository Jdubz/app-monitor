import { logger } from '../utils/logger.js';
import type { AgentSelector, AgentSelectionCriteria, AgentAttempt } from './agentSelector.js';
import type { Task } from './taskQueue.sqlite.js';

export type AgentSelectionContext = 'assignment' | 'recovery';

interface SelectionOptions {
  context?: AgentSelectionContext;
}

function parseFilePatterns(task: Task): string[] | undefined {
  if (!task.file_patterns) return undefined;

  try {
    return JSON.parse(task.file_patterns);
  } catch (error) {
    logger.warn({
      category: 'automation',
      action: 'json_parse_error',
      message: 'Failed to parse file_patterns, using undefined',
      details: {
        taskId: task.id,
        filePatterns: task.file_patterns,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return undefined;
  }
}

function buildSelectionCriteria(task: Task): {
  criteria: AgentSelectionCriteria;
  previousAttempts: AgentAttempt[];
} {
  const filePatterns = parseFilePatterns(task);
  const previousAttempts: AgentAttempt[] = [];

  if (task.retry_count > 0 && task.agent_type) {
    previousAttempts.push({
      agent: task.agent_type as AgentAttempt['agent'],
      result: 'failure',
      timestamp: Date.now(),
    });
  }

  const criteria: AgentSelectionCriteria = {
    taskCategory: task.task_category,
    filePatterns,
    complexity: task.estimated_complexity,
    preferredAgent: task.preferred_agent as AgentAttempt['agent'] | undefined,
    previousAttempts,
    taskTitle: task.title,
    taskDescription: task.description,
  };

  return { criteria, previousAttempts };
}

export async function selectAgentCliTypeForTask(
  agentSelector: AgentSelector,
  task: Task,
  options: SelectionOptions = {},
): Promise<'claude' | 'codex' | 'gemini'> {
  const { criteria } = buildSelectionCriteria(task);
  const selection = await agentSelector.selectAgent(criteria, task);

  const fallbackAgent =
    selection.agent === 'copilot'
      ? (selection.fallbackAgent || 'claude')
      : selection.agent;

  const chosenAgent = (fallbackAgent as 'claude' | 'codex' | 'gemini');

  logger.info({
    category: 'automation',
    action:
      options.context === 'recovery'
        ? 'recovery_agent_cli_selected'
        : 'intelligent_agent_cli_selected',
    message: `Selected ${chosenAgent} CLI for task ${task.id}`,
    details: {
      taskId: task.id,
      agentCli: chosenAgent,
      reasoning: selection.reasoning,
      confidence: selection.confidence,
      category: task.task_category,
      filePatterns: criteria.filePatterns,
      complexity: task.estimated_complexity,
      retryCount: task.retry_count,
      context: options.context || 'assignment',
    },
  });

  return chosenAgent;
}
