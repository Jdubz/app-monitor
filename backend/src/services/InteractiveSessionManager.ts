/**
 * Interactive Session Manager
 *
 * Consolidated service managing interactive session lifecycle.
 * Merges functionality from:
 * - interactiveSession.service.ts (database CRUD, idle tracking)
 * - interactiveSessionOrchestrator.ts (container lifecycle)
 * - interactiveSessionCoordinator.service.ts (coordination logic)
 * - interactiveTerminal.service.ts (simplified terminal management)
 *
 * Responsibilities:
 * - Session CRUD operations (database persistence)
 * - Container lifecycle management via EphemeralWorkerService
 * - Session state tracking and idle timeout monitoring
 * - Activity recording and context updates
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { WORKER_IDLE_TIMEOUT_MS, IDLE_CHECK_INTERVAL_MS } from '../constants/timeouts.js';
import { logger } from '../utils/logger.js';

import {
  getDatabase,
  InteractiveSessionRecord,
  InteractiveSessionStatus,
  NewInteractiveSession,
  InteractiveSessionUpdate,
} from './database.js';

import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { AgentPersonality } from './agentPersonalities.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AllowedInteractiveModel {
  provider: string;
  name: string;
  displayName?: string;
  description?: string;
  default?: boolean;
}

export interface StartInteractiveSessionOptions {
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  metadata?: Record<string, unknown>;
  contextSnapshot?: unknown;
}

export interface InteractiveSessionManagerOptions {
  idleTimeoutMs?: number;
  allowedModels?: AllowedInteractiveModel[];
  workerService: EphemeralWorkerService;
}

export type ActivityKind = 'user' | 'agent';

const DEFAULT_ALLOWED_MODELS: AllowedInteractiveModel[] = [
  {
    provider: 'codex',
    name: 'gpt-5.1-codex',
    displayName: 'Codex GPT-5.1',
    default: true,
  },
  {
    provider: 'claude',
    name: 'claude-3-5-sonnet',
    displayName: 'Claude 3.5 Sonnet',
  },
];

// ============================================================================
// Interactive Session Manager
// ============================================================================

export class InteractiveSessionManager extends EventEmitter {
  private readonly idleTimeoutMs: number;
  private readonly allowedModels: AllowedInteractiveModel[];
  private readonly workerService: EphemeralWorkerService;
  private readonly sessionWorkers = new Map<string, string>(); // sessionId -> workerId
  private idleWatchdogInterval?: NodeJS.Timeout;
  private onIdleTimeoutCallback?: (sessionId: string, idleDuration: number) => void;

  constructor(options: InteractiveSessionManagerOptions) {
    super();
    this.idleTimeoutMs = options.idleTimeoutMs ?? WORKER_IDLE_TIMEOUT_MS;
    this.allowedModels =
      options.allowedModels && options.allowedModels.length > 0
        ? options.allowedModels
        : DEFAULT_ALLOWED_MODELS;
    this.workerService = options.workerService;
  }

  // ==========================================================================
  // Session Query Methods
  // ==========================================================================

  /**
   * Get currently active session
   */
  getActiveSession(): InteractiveSessionRecord | null {
    return getDatabase().getActiveInteractiveSession();
  }

  /**
   * Get session by ID
   */
  getSessionById(id: string): InteractiveSessionRecord | null {
    return getDatabase().getInteractiveSessionById(id);
  }

  /**
   * List recent sessions
   */
  listRecentSessions(limit = 20): InteractiveSessionRecord[] {
    return getDatabase().listRecentInteractiveSessions(limit);
  }

  // ==========================================================================
  // Session Lifecycle Methods
  // ==========================================================================

  /**
   * Launch new interactive session
   * Coordinates session creation, container start, and stream attachment
   */
  async launchSession(options: StartInteractiveSessionOptions): Promise<InteractiveSessionRecord> {
    // Create session record in database
    const session = this.startSession(options);

    try {
      // Start container via worker service
      const containerId = await this.startContainer(session);

      logger.info({
        category: 'interactive_terminal',
        action: 'container_started',
        message: 'Interactive session container started, updating status to running',
        details: { sessionId: session.id, containerId },
      });

      // Update session with container ID
      this.setStatus(session.id, 'running', { containerId });

      logger.info({
        category: 'interactive_terminal',
        action: 'status_updated_to_running',
        message: 'Session status updated to running - should emit sessionUpdated event',
        details: { sessionId: session.id, containerId },
      });

      // Note: Terminal streaming is now handled by SocketIOTerminalHandler
      // via event listeners wired in server.ts (sessionStarted → startSession)

      // Return updated session record
      const updated = this.getSessionById(session.id);
      if (!updated) {
        throw new Error('Interactive session missing after launch');
      }

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Interactive session launch failed';
      this.endSession(session.id, message, 'error');
      // Note: Terminal streaming cleanup is handled by SocketIOTerminalHandler
      // via event listeners wired in server.ts (sessionEnded → stopSession)
      throw error;
    }
  }

  /**
   * Start a new session (database record creation)
   */
  private startSession(options: StartInteractiveSessionOptions): InteractiveSessionRecord {
    const db = getDatabase();
    const existing = db.getActiveInteractiveSession();
    if (existing) {
      throw new Error('An interactive session is already active');
    }

    this.validateModel(options.modelProvider, options.modelName);

    const now = new Date().toISOString();
    const sessionId = `interactive-${randomUUID()}`;

    const payload: NewInteractiveSession = {
      id: sessionId,
      ownerEmail: options.ownerEmail,
      modelProvider: options.modelProvider,
      modelName: options.modelName,
      status: 'starting',
      startedAt: now,
      lastUserActivityAt: now,
      lastAgentActivityAt: now,
      metadata: options.metadata,
      contextSnapshot: options.contextSnapshot,
    };

    db.createInteractiveSession(payload);
    const record = db.getInteractiveSessionById(sessionId);
    if (!record) {
      throw new Error('Failed to create interactive session');
    }

    this.emit('sessionStarted', record);
    return record;
  }

  /**
   * Start container for interactive session
   * Delegates to EphemeralWorkerService with minimal task-like object
   */
  private async startContainer(session: InteractiveSessionRecord): Promise<string> {
    // Create minimal agent for interactive session
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

    // Create minimal task-like object for worker creation
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
      pr_number: null,
      followup_for_pr: null,
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
   * End interactive session
   * Coordinates container stop, stream detach, and session cleanup
   */
  async endSession(sessionId: string, reason?: string, status: InteractiveSessionStatus = 'ended'): Promise<void> {
    const session = this.getSessionById(sessionId);

    // Stop container if exists
    if (session?.containerId) {
      await this.stopContainer(session.containerId);
    }

    // Note: Terminal streaming cleanup is handled by SocketIOTerminalHandler
    // via event listeners wired in server.ts (sessionEnded → stopSession)

    // Update database
    getDatabase().updateInteractiveSession(sessionId, {
      status,
      endedAt: new Date().toISOString(),
      terminationReason: reason ?? null,
    });

    const record = this.getSessionById(sessionId);
    if (record) {
      this.emit('sessionEnded', record);
    }
  }

  /**
   * Stop container for interactive session
   */
  private async stopContainer(containerId: string): Promise<void> {
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

  // ==========================================================================
  // Session Updates
  // ==========================================================================

  /**
   * Update session status
   */
  setStatus(
    sessionId: string,
    status: InteractiveSessionStatus,
    updates: Partial<InteractiveSessionUpdate> = {},
  ): void {
    getDatabase().updateInteractiveSession(sessionId, {
      status,
      ...updates,
    });
    const record = this.getSessionById(sessionId);
    if (record) {
      logger.info({
        category: 'interactive_terminal',
        action: 'emit_session_updated',
        message: 'Emitting sessionUpdated event',
        details: {
          sessionId: record.id,
          status: record.status,
          containerId: record.containerId,
        },
      });
      this.emit('sessionUpdated', record);
    } else {
      logger.warn({
        category: 'interactive_terminal',
        action: 'session_not_found_after_update',
        message: 'Session not found after database update - cannot emit event',
        details: { sessionId, status, updates },
      });
    }
  }

  /**
   * Record activity (user or agent)
   */
  recordActivity(sessionId: string, kind: ActivityKind): void {
    const timestamp = new Date().toISOString();
    if (kind === 'user') {
      getDatabase().updateInteractiveSession(sessionId, { lastUserActivityAt: timestamp });
    } else {
      getDatabase().updateInteractiveSession(sessionId, { lastAgentActivityAt: timestamp });
    }
  }

  /**
   * Update session context
   */
  updateContext(sessionId: string, contextSnapshot?: unknown, metadata?: Record<string, unknown>): void {
    getDatabase().updateInteractiveSession(sessionId, {
      contextSnapshot,
      metadata,
    });
  }

  // ==========================================================================
  // Note: Input/output is now handled directly by SocketIOTerminalHandler
  // via Socket.IO events (terminal:input, terminal:signal)
  // No REST API endpoints needed for these operations
  // ==========================================================================

  // ==========================================================================
  // Configuration & Utilities
  // ==========================================================================

  /**
   * Get idle timeout in milliseconds
   */
  getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  /**
   * Get allowed interactive models
   */
  getAllowedModels(): AllowedInteractiveModel[] {
    return [...this.allowedModels];
  }

  /**
   * Get the last activity timestamp for a session
   * Returns the most recent of: startedAt, lastUserActivityAt, lastAgentActivityAt
   */
  getLastActivity(session: InteractiveSessionRecord): number | null {
    const timestamps = [
      session.startedAt,
      session.lastUserActivityAt,
      session.lastAgentActivityAt
    ]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => Number.isFinite(value)) as number[];

    if (!timestamps.length) {
      return null;
    }

    return Math.max(...timestamps);
  }

  /**
   * Validate model is in allowed list
   */
  private validateModel(provider: string, name: string): void {
    const match = this.allowedModels.some(
      (model) => model.provider === provider && (model.name === name || model.name === '*'),
    );
    if (!match) {
      const allowed = this.allowedModels.map((m) => `${m.provider}:${m.name}`).join(', ');
      throw new Error(`Model ${provider}:${name} is not allowed. Allowed models: ${allowed}`);
    }
  }

  // ==========================================================================
  // Idle Timeout Watchdog
  // ==========================================================================

  /**
   * Start idle timeout watchdog
   * Monitors active sessions and calls the callback when idle timeout is reached
   */
  startIdleWatchdog(onIdleTimeout: (sessionId: string, idleDuration: number) => void): void {
    this.onIdleTimeoutCallback = onIdleTimeout;

    if (this.idleWatchdogInterval) {
      clearInterval(this.idleWatchdogInterval);
    }

    this.idleWatchdogInterval = setInterval(() => {
      const session = this.getActiveSession();
      if (!session) {
        return;
      }

      const lastActivity = this.getLastActivity(session);
      if (!lastActivity) {
        return;
      }

      const idleDuration = Date.now() - lastActivity;
      if (idleDuration >= this.idleTimeoutMs) {
        // Call the callback to handle timeout
        if (this.onIdleTimeoutCallback) {
          this.onIdleTimeoutCallback(session.id, idleDuration);
        }
        // Emit event for monitoring
        this.emit('idleTimeout', { sessionId: session.id, idleDuration });
      }
    }, IDLE_CHECK_INTERVAL_MS);
  }

  /**
   * Stop idle timeout watchdog
   */
  stopIdleWatchdog(): void {
    if (this.idleWatchdogInterval) {
      clearInterval(this.idleWatchdogInterval);
      this.idleWatchdogInterval = undefined;
    }
    this.onIdleTimeoutCallback = undefined;
  }
}
