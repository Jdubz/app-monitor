import { logger } from '../utils/logger.js';
import type { InteractiveSessionRecord } from './database.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { AgentPersonality } from './agentPersonalities.js';

/**
 * Interactive Session Orchestrator
 *
 * Lightweight wrapper around EphemeralWorkerService for interactive sessions.
 * Delegates container lifecycle to the worker service to avoid code duplication.
 */
export class InteractiveSessionOrchestrator {
  private readonly workerService: EphemeralWorkerService;
  private readonly sessionWorkers = new Map<string, string>(); // sessionId -> workerId

  constructor(
    workerService: EphemeralWorkerService,
  ) {
    this.workerService = workerService;
  }

  /**
   * Start an interactive session container
   *
   * Delegates to EphemeralWorkerService with a minimal task-like object
   * for interactive mode.
   */
  async start(session: InteractiveSessionRecord): Promise<string> {
    // Create a minimal agent for the interactive session
    const interactiveAgent: AgentPersonality = {
      id: `interactive-${session.modelProvider}`,
      name: `Interactive ${session.modelProvider}`,
      role: 'interactive-assistant',
      description: `Interactive ${session.modelProvider} session`,
      specialties: ['general-development'],
      expertise: {
        primary: ['interactive-assistance'],
        secondary: [],
        tools: [],
      },
      personality: {
        communicationStyle: 'collaborative',
        approach: 'pragmatic',
        focus: 'quality',
      },
      onboarding: {
        requiredReading: [],
        setupSteps: [],
        validationChecks: [],
      },
      taskPreferences: {
        preferredTypes: [],
        avoidedTypes: [],
        complexityRange: 'any',
      },
    };

    // Create a minimal task-like object for worker creation
    const interactiveTask = {
      id: session.id,
      type: 'interactive-session',
      description: `Interactive session for ${session.ownerEmail}`,
      status: 'active' as const,
      created_at: session.startedAt,
      agent_id: interactiveAgent.id,
      owner_email: session.ownerEmail,
      model_provider: session.modelProvider,
      model_name: session.modelName,
      // Additional fields required by EphemeralWorkerService.createWorker
      is_repair_bot: false,
      pr_number: null,
      followup_for_pr: null,
      original_task_id: null,
      prompt: '',
      priority: 'p2' as const,
      updated_at: session.startedAt,
      started_at: null,
      completed_at: null,
      error_message: null,
      output: null,
      retry_count: 0,
      max_retries: 0,
      chain_id: null,
      is_chained: false,
      parent_task_id: null,
      depends_on: null,
    };

    try {
      logger.info({
        category: 'system',
        action: 'starting_interactive_session',
        message: `Starting interactive session for ${session.ownerEmail}`,
        details: {
          sessionId: session.id,
          model: `${session.modelProvider}:${session.modelName}`,
        },
      });

      // Use ephemeral worker service to create container
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const worker = await this.workerService.createWorker(interactiveTask as any, interactiveAgent);
      
      // Track the worker for this session
      this.sessionWorkers.set(session.id, worker.id);

      logger.info({
        category: 'system',
        action: 'interactive_session_ready',
        message: `Interactive session ${session.id} is ready`,
        details: {
          containerId: worker.containerId,
          workerId: worker.id,
        },
      });

      return worker.containerId;
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'interactive_session_start_failed',
        message: 'Failed to start interactive session',
        error,
      });
      throw error;
    }
  }

  /**
   * Stop an interactive session container
   */
  async stop(containerId: string): Promise<void> {
    // Find the worker and session ID in a single pass
    let workerId: string | undefined;
    let sessionIdToDelete: string | undefined;
    
    for (const [sid, wid] of this.sessionWorkers.entries()) {
      const worker = this.workerService.getWorker(wid);
      if (worker?.containerId === containerId) {
        workerId = wid;
        sessionIdToDelete = sid;
        break;
      }
    }

    if (workerId && sessionIdToDelete) {
      await this.workerService.destroyWorker(workerId);
      // Remove from tracking
      this.sessionWorkers.delete(sessionIdToDelete);
    } else {
      logger.warn({
        category: 'system',
        action: 'interactive_worker_not_found',
        message: `No worker found for container ${containerId}`,
      });
    }
  }
}
