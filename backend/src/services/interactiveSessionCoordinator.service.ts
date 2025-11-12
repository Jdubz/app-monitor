import type { InteractiveSessionService, StartInteractiveSessionOptions, ActivityKind, AllowedInteractiveModel } from './interactiveSession.service.js';
import type { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import type { InteractiveSessionStreamManager } from './interactiveSessionStreamManager.js';
import type { InteractiveSessionRecord } from './database.js';

/**
 * Service responsible for coordinating interactive session operations
 * Handles coordination between session service, orchestrator, and stream manager
 */
export class InteractiveSessionCoordinator {
  constructor(
    private interactiveSessionService: InteractiveSessionService,
    private interactiveSessionOrchestrator: InteractiveSessionOrchestrator,
    private interactiveSessionStreamManager: InteractiveSessionStreamManager
  ) {}

  /**
   * Get active interactive session
   */
  getActiveSession(): InteractiveSessionRecord | null {
    return this.interactiveSessionService.getActiveSession();
  }

  /**
   * Get interactive session by ID
   */
  getSession(sessionId: string): InteractiveSessionRecord | null {
    return this.interactiveSessionService.getSessionById(sessionId);
  }

  /**
   * List recent interactive sessions
   */
  listSessions(limit = 20): InteractiveSessionRecord[] {
    return this.interactiveSessionService.listRecentSessions(limit);
  }

  /**
   * Launch new interactive session
   * Coordinates session creation, container start, and stream attachment
   */
  async launchSession(options: StartInteractiveSessionOptions): Promise<InteractiveSessionRecord> {
    const session = this.interactiveSessionService.startSession(options);
    try {
      const containerId = await this.interactiveSessionOrchestrator.start(session);
      this.interactiveSessionService.setStatus(session.id, 'running', { containerId });
      await this.interactiveSessionStreamManager.attach(session.id, containerId);
      const updated = this.interactiveSessionService.getSessionById(session.id);
      if (!updated) {
        throw new Error('Interactive session missing after launch');
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Interactive session launch failed';
      this.interactiveSessionService.endSession(session.id, message, 'error');
      await this.interactiveSessionStreamManager.detach(session.id).catch(() => {
        /* noop */
      });
      throw error;
    }
  }

  /**
   * End interactive session
   * Coordinates container stop, stream detach, and session cleanup
   */
  async endSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.interactiveSessionService.getSessionById(sessionId);
    if (session?.containerId) {
      await this.interactiveSessionOrchestrator.stop(session.containerId);
    }
    await this.interactiveSessionStreamManager.detach(sessionId);
    this.interactiveSessionService.endSession(sessionId, reason);
  }

  /**
   * Send input to interactive session
   * Records user activity
   */
  sendInput(sessionId: string, payload: string): void {
    this.interactiveSessionStreamManager.sendInput(sessionId, payload);
    this.interactiveSessionService.recordActivity(sessionId, 'user');
  }

  /**
   * Send signal to interactive session
   * Records user activity
   */
  sendSignal(sessionId: string, signal: 'interrupt' | 'terminate' = 'interrupt'): void {
    this.interactiveSessionStreamManager.sendSignal(sessionId, signal);
    this.interactiveSessionService.recordActivity(sessionId, 'user');
  }

  /**
   * Record interactive activity
   */
  recordActivity(sessionId: string, kind: ActivityKind): void {
    this.interactiveSessionService.recordActivity(sessionId, kind);
  }

  /**
   * Update interactive context
   */
  updateContext(
    sessionId: string,
    contextSnapshot?: unknown,
    metadata?: Record<string, unknown>
  ): void {
    this.interactiveSessionService.updateContext(sessionId, contextSnapshot, metadata);
  }

  /**
   * Get idle timeout in milliseconds
   */
  getIdleTimeoutMs(): number {
    return this.interactiveSessionService.getIdleTimeoutMs();
  }

  /**
   * Get allowed interactive models
   */
  getAllowedModels(): AllowedInteractiveModel[] {
    return this.interactiveSessionService.getAllowedModels();
  }
}
