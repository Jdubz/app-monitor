import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type Docker from 'dockerode';

import { logger } from '../utils/logger.js';

export type InteractiveStreamMessageKind = 'stdout' | 'stderr' | 'system' | 'status';
export type InteractiveStreamMessageLevel = 'info' | 'warning' | 'error';

export interface InteractiveStreamMessage {
  id: string;
  sessionId: string;
  kind: InteractiveStreamMessageKind;
  text: string;
  timestamp: string;
  level?: InteractiveStreamMessageLevel;
}

export interface InteractiveSessionStreamOptions {
  backlogLimit?: number;
  shellCommand?: string[];
}

interface ActiveStreamContext {
  sessionId: string;
  containerId: string;
  exec?: Docker.Exec;
  stream?: NodeJS.ReadWriteStream;
  backlog: InteractiveStreamMessage[];
  ready: boolean;
}

export interface PtySize {
  rows: number;
  cols: number;
}

export class InteractiveSessionStreamManager extends EventEmitter {
  private readonly docker: Docker;
  private readonly options: Required<InteractiveSessionStreamOptions>;
  private active?: ActiveStreamContext;

  constructor(docker: Docker, options: InteractiveSessionStreamOptions = {}) {
    super();
    this.docker = docker;
    this.options = {
      backlogLimit: options.backlogLimit ?? 200,
      shellCommand: options.shellCommand ?? ['/bin/bash'],
    };
  }

  getActiveSessionId(): string | undefined {
    return this.active?.sessionId;
  }

  getBacklog(sessionId: string): InteractiveStreamMessage[] {
    if (!this.active || this.active.sessionId !== sessionId) {
      return [];
    }
    return [...this.active.backlog];
  }

  async attach(sessionId: string, containerId: string): Promise<void> {
    if (this.active && this.active.sessionId === sessionId) {
      if (this.active.ready) {
        return;
      }
    } else {
      await this.detach(this.active?.sessionId);
      this.active = {
        sessionId,
        containerId,
        backlog: [],
        ready: false,
      };
    }

    await this.initializeStream();
  }

  async detach(sessionId?: string | null): Promise<void> {
    if (!this.active) {
      return;
    }
    if (sessionId && this.active.sessionId !== sessionId) {
      return;
    }

    const context = this.active;
    this.active = undefined;

    if (context.stream) {
      context.stream.removeAllListeners();
      try {
        context.stream.end();
      } catch (error) {
        logger.warn({
          category: 'system',
          action: 'stream_end_failed',
          message: `Failed to end interactive stream for ${context.sessionId}`,
          error,
        });
      }
    }
  }

  sendInput(sessionId: string, chunk: string | Buffer): void {
    const context = this.assertActive(sessionId);
    context.stream?.write(chunk);
  }

  sendSignal(sessionId: string, signal: 'interrupt' | 'terminate' = 'interrupt'): void {
    const context = this.assertActive(sessionId);
    if (!context.stream) {
      return;
    }
    const payload = signal === 'interrupt' ? '\u0003' : '\u0004';
    context.stream.write(payload);
    this.pushSystemMessage(
      context,
      signal === 'interrupt' ? 'Sent SIGINT to session' : 'Sent EOF to session',
      'warning',
    );
  }

  async resizePty(sessionId: string, size: PtySize): Promise<void> {
    const context = this.assertActive(sessionId);
    if (!context.exec) {
      return;
    }
    try {
      await context.exec.resize({
        h: size.rows,
        w: size.cols,
      });
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'pty_resize_failed',
        message: `Failed to resize PTY for session ${sessionId}`,
        error,
      });
    }
  }

  private async initializeStream(): Promise<void> {
    if (!this.active) {
      return;
    }
    if (this.active.stream) {
      this.active.ready = true;
      return;
    }

    try {
      const container = this.docker.getContainer(this.active.containerId);
      const exec = await container.exec({
        Cmd: this.options.shellCommand,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        WorkingDir: '/workspace',
        Env: ['TERM=xterm-256color'],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
      });

      this.active.exec = exec;
      this.active.stream = stream;
      this.active.ready = true;

      stream.on('data', (chunk: Buffer) => {
        this.handleChunk(chunk.toString('utf8'));
      });

      stream.on('error', (error: Error) => {
        if (!this.active) {
          return;
        }
        logger.error({
          category: 'system',
          action: 'stream_error',
          message: `Interactive stream error for session ${this.active.sessionId}`,
          error,
        });
        this.emit('error', {
          sessionId: this.active.sessionId,
          error,
        });
      });

      stream.on('close', () => {
        if (!this.active) {
          return;
        }
        this.emit('closed', {
          sessionId: this.active.sessionId,
          reason: 'stream_closed',
        });
        this.detach(this.active.sessionId).catch(() => {
          /* ignore */
        });
      });

      this.emit('ready', { sessionId: this.active.sessionId });
      this.pushSystemMessage(this.active, 'Interactive stream ready', 'info');
    } catch (error) {
      if (!this.active) {
        return;
      }
      logger.error({
        category: 'system',
        action: 'stream_init_failed',
        message: `Failed to attach interactive stream for session ${this.active.sessionId}`,
        error,
      });
      this.emit('error', {
        sessionId: this.active.sessionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  private handleChunk(text: string): void {
    if (!text || !this.active) {
      return;
    }
    const normalized = text.replace(/\r?\n/g, '\n');
    this.pushMessage(this.active, {
      id: randomUUID(),
      sessionId: this.active.sessionId,
      kind: 'stdout',
      text: normalized,
      timestamp: new Date().toISOString(),
    });
  }

  private pushSystemMessage(
    context: ActiveStreamContext,
    text: string,
    level: InteractiveStreamMessageLevel,
  ): void {
    this.pushMessage(context, {
      id: randomUUID(),
      sessionId: context.sessionId,
      kind: 'system',
      text,
      level,
      timestamp: new Date().toISOString(),
    });
  }

  private pushMessage(context: ActiveStreamContext, message: InteractiveStreamMessage): void {
    context.backlog.push(message);
    if (context.backlog.length > this.options.backlogLimit) {
      context.backlog.shift();
    }
    this.emit('message', message);
  }

  private assertActive(sessionId: string): ActiveStreamContext {
    if (!this.active || this.active.sessionId !== sessionId) {
      throw new Error('Interactive session stream is not attached');
    }
    return this.active;
  }
}

