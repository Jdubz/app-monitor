/**
 * Interactive Terminal Service - V0
 *
 * Simplified, database-backed interactive terminal service that:
 * - Persists all session state to SQLite (deployment-safe)
 * - Reuses EphemeralWorkerService for container management
 * - Supports session recovery after server restarts
 * - Provides simple API: start(), stop(), reset(), sendInput(), sendInterrupt()
 *
 * Key Design Principles:
 * - Database as Source of Truth: All state persisted to survive blue-green deployments
 * - Reuse Battle-Tested Infrastructure: Leverages existing EphemeralWorkerService
 * - Graceful Shutdown: Handles server_migration events properly
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import type { DevBotsDatabase, InteractiveSessionRecord, NewInteractiveSession } from './database.js';
import type Docker from 'dockerode';
import { DevBotContainerPresets } from './devbot/DevBotContainerBuilder.js';

export interface InteractiveTerminalServiceOptions {
  database: DevBotsDatabase;
  docker: Docker;
}

export interface StartSessionOptions {
  ownerEmail: string;
}

export interface SessionStartResult {
  sessionId: string;
  containerId: string;
  session: InteractiveSessionRecord;
}

/**
 * Interactive Terminal Service
 *
 * Manages interactive terminal sessions with database persistence.
 * All session state is stored in SQLite to survive server restarts.
 */
export class InteractiveTerminalService extends EventEmitter {
  private database: DevBotsDatabase;
  private docker: Docker;

  constructor(options: InteractiveTerminalServiceOptions) {
    super();
    this.database = options.database;
    this.docker = options.docker;

    // DEBUG: Check if database has required methods
    console.log('[InteractiveTerminalService] Database methods:', {
      hasCreateInteractiveSession: typeof this.database.createInteractiveSession,
      hasGetInteractiveSessionById: typeof this.database.getInteractiveSessionById,
      hasUpdateInteractiveSession: typeof this.database.updateInteractiveSession,
      hasListRecentInteractiveSessions: typeof this.database.listRecentInteractiveSessions,
      hasGetActiveInteractiveSession: typeof this.database.getActiveInteractiveSession,
      databaseConstructorName: this.database.constructor.name,
      allMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.database))
    });
  }

  /**
   * Create a new container for a session
   * Extracted helper to avoid code duplication
   */
  private async createSessionContainer(sessionId: string, ownerEmail: string): Promise<Docker.Container> {
    const container = await DevBotContainerPresets
      .interactiveSession(sessionId, ownerEmail)
      .command(['/bin/bash']) // Interactive shell
      .env('TERM', 'xterm-256color')
      .env('INTERACTIVE_MODE', 'true')
      .passthroughEnv(['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'])
      .create(this.docker);

    await container.start();
    return container;
  }

  /**
   * Start a new interactive terminal session
   * Creates a database record and spawns a container
   */
  async startSession(options: StartSessionOptions): Promise<SessionStartResult> {
    const sessionId = randomUUID();

    logger.info({
      category: 'interactive_terminal',
      action: 'session_start_requested',
      message: 'Starting interactive terminal session',
      details: { sessionId, ownerEmail: options.ownerEmail }
    });

    // Create database record first (deployment-safe)
    const newSession: NewInteractiveSession = {
      id: sessionId,
      ownerEmail: options.ownerEmail,
      modelProvider: 'none', // V0: No model selection
      modelName: 'terminal', // V0: Just a terminal
      status: 'starting',
      startedAt: new Date().toISOString(),
    };

    this.database.createInteractiveSession(newSession);

    try {
      // Create and start container
      const container = await this.createSessionContainer(sessionId, options.ownerEmail);
      const containerId = container.id;

      // Update database with container ID
      this.database.updateInteractiveSession(sessionId, {
        containerId,
        status: 'running',
      });

      const session = this.database.getInteractiveSessionById(sessionId);
      if (!session) {
        throw new Error(`Session not found after creation: ${sessionId}`);
      }

      logger.info({
        category: 'interactive_terminal',
        action: 'session_started',
        message: 'Interactive terminal session started successfully',
        details: { sessionId, containerId }
      });

      this.emit('session:started', { sessionId, containerId });

      return {
        sessionId,
        containerId,
        session,
      };
    } catch (error) {
      // Update database to reflect error
      this.database.updateInteractiveSession(sessionId, {
        status: 'error',
        terminationReason: error instanceof Error ? error.message : 'Unknown error',
        endedAt: new Date().toISOString(),
      });

      logger.error({
        category: 'interactive_terminal',
        action: 'session_start_failed',
        message: 'Failed to start interactive terminal session',
        details: { sessionId },
        error
      });

      throw error;
    }
  }

  /**
   * Stop an interactive terminal session
   * Terminates the container and marks session as ended in database
   */
  async stopSession(sessionId: string, reason = 'User requested'): Promise<void> {
    const session = this.database.getInteractiveSessionById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    logger.info({
      category: 'interactive_terminal',
      action: 'session_stop_requested',
      message: 'Stopping interactive terminal session',
      details: { sessionId, reason }
    });

    // Update status to terminating
    this.database.updateInteractiveSession(sessionId, {
      status: 'terminating',
    });

    try {
      // Stop container if it exists
      if (session.containerId) {
        const container = this.docker.getContainer(session.containerId);
        try {
          await container.stop({ t: 10 }); // 10 second graceful stop
          await container.remove();
        } catch (error) {
          // Container might already be stopped/removed
          logger.warn({
            category: 'interactive_terminal',
            action: 'container_cleanup_partial_failure',
            message: 'Container stop/remove had issues (might already be gone)',
            details: { containerId: session.containerId },
            error
          });
        }
      }

      // Mark as ended in database
      this.database.updateInteractiveSession(sessionId, {
        status: 'ended',
        endedAt: new Date().toISOString(),
        terminationReason: reason,
      });

      logger.info({
        category: 'interactive_terminal',
        action: 'session_stopped',
        message: 'Interactive terminal session stopped',
        details: { sessionId }
      });

      this.emit('session:stopped', { sessionId, reason });
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'session_stop_failed',
        message: 'Failed to stop interactive terminal session',
        details: { sessionId },
        error
      });

      // Mark as ended with error reason (consistent with success path)
      this.database.updateInteractiveSession(sessionId, {
        status: 'ended',
        endedAt: new Date().toISOString(),
        terminationReason: `Stop failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      throw error;
    }
  }

  /**
   * Reset an interactive terminal session
   * Stops the existing container and starts a fresh one with the same session ID
   */
  async resetSession(sessionId: string): Promise<SessionStartResult> {
    const session = this.database.getInteractiveSessionById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    logger.info({
      category: 'interactive_terminal',
      action: 'session_reset_requested',
      message: 'Resetting interactive terminal session',
      details: { sessionId }
    });

    // Stop existing container
    if (session.containerId) {
      try {
        const container = this.docker.getContainer(session.containerId);
        await container.stop({ t: 10 });
        await container.remove();
      } catch (error) {
        logger.warn({
          category: 'interactive_terminal',
          action: 'reset_container_cleanup_failed',
          message: 'Failed to cleanup old container during reset',
          details: { sessionId, containerId: session.containerId },
          error
        });
      }
    }

    // Update to starting status
    this.database.updateInteractiveSession(sessionId, {
      status: 'starting',
      containerId: null,
      endedAt: null,
      terminationReason: null,
    });

    try {
      // Create and start new container
      const container = await this.createSessionContainer(sessionId, session.ownerEmail);
      const containerId = container.id;

      // Update database
      this.database.updateInteractiveSession(sessionId, {
        containerId,
        status: 'running',
      });

      const updatedSession = this.database.getInteractiveSessionById(sessionId);
      if (!updatedSession) {
        throw new Error(`Session not found after reset: ${sessionId}`);
      }

      logger.info({
        category: 'interactive_terminal',
        action: 'session_reset',
        message: 'Interactive terminal session reset successfully',
        details: { sessionId, newContainerId: containerId }
      });

      this.emit('session:reset', { sessionId, containerId });

      return {
        sessionId,
        containerId,
        session: updatedSession,
      };
    } catch (error) {
      this.database.updateInteractiveSession(sessionId, {
        status: 'error',
        terminationReason: `Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        endedAt: new Date().toISOString(),
      });

      logger.error({
        category: 'interactive_terminal',
        action: 'session_reset_failed',
        message: 'Failed to reset interactive terminal session',
        details: { sessionId },
        error
      });

      throw error;
    }
  }

  /**
   * Mark session as disconnected (WebSocket closed but container still running)
   * Used during graceful shutdowns / blue-green deployments
   */
  async markDisconnected(sessionId: string): Promise<void> {
    const session = this.database.getInteractiveSessionById(sessionId);

    if (!session) {
      return; // Session doesn't exist, nothing to do
    }

    if (session.status === 'running') {
      this.database.updateInteractiveSession(sessionId, {
        status: 'disconnected',
      });

      logger.info({
        category: 'interactive_terminal',
        action: 'session_disconnected',
        message: 'Session marked as disconnected (container still running)',
        details: { sessionId }
      });

      this.emit('session:disconnected', { sessionId });
    }
  }

  /**
   * Reconnect to a disconnected session
   * Called when frontend reconnects after server restart
   */
  async reconnectSession(sessionId: string): Promise<InteractiveSessionRecord> {
    const session = this.database.getInteractiveSessionById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'disconnected' && session.status !== 'running') {
      throw new Error(`Cannot reconnect session with status: ${session.status}`);
    }

    // Verify container still exists
    if (session.containerId) {
      try {
        const container = this.docker.getContainer(session.containerId);
        const inspect = await container.inspect();

        if (!inspect.State.Running) {
          throw new Error('Container is not running');
        }

        // Update to running status
        this.database.updateInteractiveSession(sessionId, {
          status: 'running',
        });

        logger.info({
          category: 'interactive_terminal',
          action: 'session_reconnected',
          message: 'Successfully reconnected to session',
          details: { sessionId }
        });

        this.emit('session:reconnected', { sessionId });

        return this.database.getInteractiveSessionById(sessionId)!;
      } catch (error) {
        // Container is gone, mark session as ended
        this.database.updateInteractiveSession(sessionId, {
          status: 'error',
          endedAt: new Date().toISOString(),
          terminationReason: 'Container no longer exists',
        });

        logger.warn({
          category: 'interactive_terminal',
          action: 'session_reconnect_failed',
          message: 'Cannot reconnect - container no longer exists',
          details: { sessionId },
          error
        });

        throw new Error('Session container no longer exists');
      }
    } else {
      throw new Error('Session has no container ID');
    }
  }

  /**
   * Recover disconnected sessions on service startup
   * Checks for sessions marked as 'disconnected' and verifies container status
   */
  async recoverDisconnectedSessions(): Promise<void> {
    logger.info({
      category: 'interactive_terminal',
      action: 'recovery_started',
      message: 'Recovering disconnected sessions after restart'
    });

    const allSessions = this.database.listRecentInteractiveSessions(100);
    const disconnectedSessions = allSessions.filter(s => s.status === 'disconnected');

    logger.info({
      category: 'interactive_terminal',
      action: 'recovery_sessions_found',
      message: `Found ${disconnectedSessions.length} disconnected sessions`,
      details: { count: disconnectedSessions.length }
    });

    for (const session of disconnectedSessions) {
      try {
        if (session.containerId) {
          const container = this.docker.getContainer(session.containerId);
          const inspect = await container.inspect();

          if (inspect.State.Running) {
            // Container still running - session is recoverable
            logger.info({
              category: 'interactive_terminal',
              action: 'session_recoverable',
              message: 'Session container still running - ready for reconnection',
              details: { sessionId: session.id, containerId: session.containerId }
            });
            // Keep status as 'disconnected' - frontend will reconnect
          } else {
            // Container stopped - mark session as ended
            this.database.updateInteractiveSession(session.id, {
              status: 'ended',
              endedAt: new Date().toISOString(),
              terminationReason: 'Container stopped during server restart',
            });

            logger.info({
              category: 'interactive_terminal',
              action: 'session_ended_on_recovery',
              message: 'Container not running - marking session as ended',
              details: { sessionId: session.id }
            });
          }
        } else {
          // No container ID - mark as error
          this.database.updateInteractiveSession(session.id, {
            status: 'error',
            endedAt: new Date().toISOString(),
            terminationReason: 'No container ID found',
          });
        }
      } catch (error) {
        // Container doesn't exist - mark session as ended
        this.database.updateInteractiveSession(session.id, {
          status: 'ended',
          endedAt: new Date().toISOString(),
          terminationReason: 'Container not found after server restart',
        });

        logger.warn({
          category: 'interactive_terminal',
          action: 'session_container_not_found',
          message: 'Container not found during recovery',
          details: { sessionId: session.id },
          error
        });
      }
    }

    logger.info({
      category: 'interactive_terminal',
      action: 'recovery_completed',
      message: 'Session recovery completed'
    });
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): InteractiveSessionRecord | null {
    return this.database.getInteractiveSessionById(sessionId);
  }

  /**
   * Get active session (for single-session mode)
   */
  getActiveSession(): InteractiveSessionRecord | null {
    return this.database.getActiveInteractiveSession();
  }

  /**
   * List recent sessions
   */
  listSessions(limit = 20): InteractiveSessionRecord[] {
    return this.database.listRecentInteractiveSessions(limit);
  }

  /**
   * Record user activity
   */
  recordActivity(sessionId: string): void {
    this.database.updateInteractiveSession(sessionId, {
      lastUserActivityAt: new Date().toISOString(),
    });
  }

}
