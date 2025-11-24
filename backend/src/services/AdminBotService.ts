/**
 * AdminBotService - Manages Codex CLI sessions for admin bot chat
 *
 * This service spawns and manages Codex CLI processes that connect to the
 * App Monitor MCP server (configured in ~/.codex/config.toml).
 *
 * Architecture:
 * - Uses `codex exec` for first message (creates thread)
 * - Uses `codex exec resume` for subsequent messages (continues thread)
 * - MCP servers: app-monitor-dev (dev) or app-monitor-prod (production)
 * - Streaming: Emits output events for SSE routes to consume
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AdminBotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AdminBotSession {
  id: string;
  codexThreadId: string | null;  // Codex thread ID for resuming sessions
  process: ChildProcess | null;
  status: 'idle' | 'running' | 'error';
  messages: AdminBotMessage[];
  startedAt: Date;
}

export interface AdminBotServiceEvents {
  output: (data: string) => void;
  error: (error: string) => void;
  exit: (code: number | null) => void;
}

// Type-safe EventEmitter - interface/class merging pattern
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface AdminBotService {
  on<U extends keyof AdminBotServiceEvents>(
    event: U,
    listener: AdminBotServiceEvents[U]
  ): this;
  emit<U extends keyof AdminBotServiceEvents>(
    event: U,
    ...args: Parameters<AdminBotServiceEvents[U]>
  ): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AdminBotService extends EventEmitter {
  private session: AdminBotSession | null = null;
  private repoRoot: string;
  private codexWorkingDir: string;

  constructor() {
    super();
    // Determine repo root based on where we're running from
    this.repoRoot = path.resolve(__dirname, '../../..');

    // Working directory for codex - use ~/Development to access all projects
    this.codexWorkingDir = process.env.ADMIN_BOT_WORKING_DIR
      || (process.env.HOME ? `${process.env.HOME}/Development` : this.repoRoot);

    logger.info({
      category: 'admin_bot_chat',
      action: 'service_initialized',
      message: 'AdminBotService initialized',
      details: {
        repoRoot: this.repoRoot,
        codexWorkingDir: this.codexWorkingDir
      }
    });
  }

  /**
   * Get enhanced PATH for finding codex CLI
   *
   * When running as a systemd service, PATH is minimal and doesn't include NVM.
   * This method adds NVM paths to find codex, which is installed via npm.
   *
   * Priority:
   * 1. NVM_BIN_PATH env var (explicit configuration)
   * 2. Dynamic NVM paths based on $HOME (portable)
   * 3. Existing PATH
   */
  private getEnhancedPath(): string {
    const additionalPaths: string[] = [];

    // Check for explicit NVM bin path configuration
    if (process.env.NVM_BIN_PATH) {
      additionalPaths.push(process.env.NVM_BIN_PATH);
    }

    // Add common NVM paths dynamically based on HOME
    // This handles cases where NVM_BIN_PATH isn't set but NVM is installed
    if (process.env.HOME) {
      additionalPaths.push(
        `${process.env.HOME}/.nvm/versions/node/v20.19.5/bin`,
        `${process.env.HOME}/.nvm/versions/node/v20.18.1/bin`
      );
    }

    const nvmPaths = additionalPaths.filter(Boolean).join(':');
    return nvmPaths + ':' + (process.env.PATH || '');
  }

  /**
   * Build arguments for a new codex exec call (not resume)
   */
  private buildNewExecArgs(prompt: string): string[] {
    return [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--cd', this.codexWorkingDir,
      '--json',
      prompt
    ];
  }

  /**
   * Build arguments for resuming an existing codex thread
   */
  private buildResumeArgs(threadId: string, prompt: string): string[] {
    // Note: exec resume has limited flags compared to exec
    // Session config (sandbox bypass, json mode) persists from initial exec
    // Use -c to pass config overrides including skip_git_repo_check
    return [
      'exec',
      'resume',
      '-c', 'skip_git_repo_check=true',
      threadId,
      prompt
    ];
  }

  /**
   * Spawn a codex exec process with the given arguments
   */
  private spawnCodexExec(args: string[]): ChildProcess {
    const enhancedPath = this.getEnhancedPath();

    logger.debug({
      category: 'admin_bot_chat',
      action: 'spawning_codex',
      message: 'Spawning codex exec',
      details: { args, workingDir: this.codexWorkingDir }
    });

    return spawn('codex', args, {
      cwd: this.codexWorkingDir,
      env: {
        ...process.env,
        PATH: enhancedPath,
        // MCP server uses these env vars
        APP_MONITOR_MCP_USER_ROLE: 'admin',
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  /**
   * Setup event handlers for a codex process
   */
  private setupProcessHandlers(codexProcess: ChildProcess): void {
    // Stream stdout to SSE and parse thread_id from JSON
    codexProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      logger.debug({
        category: 'admin_bot_chat',
        action: 'stdout',
        message: 'Received stdout from codex exec',
        details: { sessionId: this.session?.id, output: output.substring(0, 200) }
      });

      // Parse JSON lines to extract thread_id and format output
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // Capture thread_id from first message
          if (json.type === 'thread.started' && json.thread_id && this.session) {
            this.session.codexThreadId = json.thread_id;
            logger.info({
              category: 'admin_bot_chat',
              action: 'thread_captured',
              message: 'Captured codex thread ID for session resumption',
              details: { sessionId: this.session.id, codexThreadId: json.thread_id }
            });
          }

          // Format output based on JSON type
          if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
            // Main agent response
            this.emit('output', json.item.text + '\n');
          } else if (json.type === 'item.completed' && json.item?.type === 'reasoning') {
            // Reasoning/thinking output
            this.emit('error', json.item.text + '\n');  // stderr shows as status
          } else if (json.type === 'item.completed' && json.item?.type === 'mcp_tool_call') {
            // MCP tool call result
            const result = json.item.result?.content?.[0]?.text || json.item.error?.message || 'Tool called';
            this.emit('error', `[MCP: ${json.item.tool}] ${result}\n`);
          } else if (json.type === 'turn.completed') {
            // Turn completed - show token usage
            const usage = json.usage;
            if (usage) {
              this.emit('error', `\n[Tokens: ${usage.input_tokens} in, ${usage.output_tokens} out]\n`);
            }
          }
        } catch {
          // Not JSON or parse error - emit raw output
          if (line.trim()) {
            this.emit('output', line + '\n');
          }
        }
      }
    });

    // Stream stderr as errors
    codexProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      logger.warn({
        category: 'admin_bot_chat',
        action: 'stderr',
        message: 'Received stderr from codex exec',
        details: { sessionId: this.session?.id, error: error.substring(0, 200) }
      });
      this.emit('error', error);
    });

    // Handle process completion
    codexProcess.on('exit', (code: number | null) => {
      logger.info({
        category: 'admin_bot_chat',
        action: 'exec_complete',
        message: 'codex exec completed',
        details: { sessionId: this.session?.id, exitCode: code }
      });

      // Clear current process reference
      if (this.session?.process === codexProcess) {
        this.session.process = null;
      }

      this.emit('exit', code);
    });

    codexProcess.on('error', (error: Error) => {
      logger.error({
        category: 'admin_bot_chat',
        action: 'exec_error',
        message: 'codex exec process error',
        error: error.message,
        details: { sessionId: this.session?.id }
      });

      if (this.session) {
        this.session.status = 'error';
      }

      this.emit('error', error.message);
    });
  }

  /**
   * Start a new admin bot session with Codex CLI
   *
   * Immediately launches codex with an initial greeting to establish the thread.
   * This gives the user visual feedback that the session has started.
   *
   * @returns Session ID
   * @throws Error if session already running
   */
  async startSession(): Promise<string> {
    if (this.session?.status === 'running') {
      throw new Error('Session already running. Stop current session before starting a new one.');
    }

    const sessionId = randomUUID();

    logger.info({
      category: 'admin_bot_chat',
      action: 'session_starting',
      message: 'Starting new admin bot session',
      details: { sessionId }
    });

    // Create session
    this.session = {
      id: sessionId,
      codexThreadId: null,
      process: null,
      status: 'running',
      messages: [],
      startedAt: new Date()
    };

    // Launch codex with an initial greeting message to establish the thread
    // This gives immediate feedback that the session is active
    const initialPrompt = 'You are the App Monitor admin bot. Briefly introduce yourself and list the MCP tools available to you. Keep the response concise.';

    const codexProcess = this.spawnCodexExec(this.buildNewExecArgs(initialPrompt));
    this.session.process = codexProcess;
    this.setupProcessHandlers(codexProcess);

    logger.info({
      category: 'admin_bot_chat',
      action: 'session_started',
      message: 'Admin bot session started with initial greeting',
      details: { sessionId, pid: codexProcess.pid }
    });

    return sessionId;
  }

  /**
   * Send a message to the admin bot
   *
   * If this is the first user message (after initial greeting), it resumes the thread.
   * Uses `codex exec resume` with the captured thread ID.
   *
   * @param message - User message to send
   * @throws Error if no active session or execution fails
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.session) {
      throw new Error('No active session. Start a session before sending messages.');
    }

    if (this.session.status !== 'running') {
      throw new Error(`Session is ${this.session.status}. Cannot send messages.`);
    }

    logger.debug({
      category: 'admin_bot_chat',
      action: 'message_sending',
      message: 'Sending message to codex',
      details: {
        sessionId: this.session.id,
        messageLength: message.length,
        hasThreadId: !!this.session.codexThreadId
      }
    });

    // Add user message to history
    const userMessage: AdminBotMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.session.messages.push(userMessage);

    // Build command args - always resume since startSession creates the thread
    let codexArgs: string[];

    if (this.session.codexThreadId) {
      codexArgs = this.buildResumeArgs(this.session.codexThreadId, message);
    } else {
      // Fallback: No thread ID yet (shouldn't happen normally)
      // This could occur if startSession's initial message failed
      logger.warn({
        category: 'admin_bot_chat',
        action: 'no_thread_id',
        message: 'No thread ID available, starting new thread',
        details: { sessionId: this.session.id }
      });
      codexArgs = this.buildNewExecArgs(message);
    }

    logger.info({
      category: 'admin_bot_chat',
      action: 'spawning_codex',
      message: this.session.codexThreadId ? 'Resuming codex thread' : 'Starting new codex thread',
      details: {
        sessionId: this.session.id,
        codexThreadId: this.session.codexThreadId
      }
    });

    const codexProcess = this.spawnCodexExec(codexArgs);
    this.session.process = codexProcess;
    this.setupProcessHandlers(codexProcess);

    logger.debug({
      category: 'admin_bot_chat',
      action: 'message_sent',
      message: 'codex exec spawned successfully',
      details: { sessionId: this.session.id, messageId: userMessage.id, pid: codexProcess.pid }
    });
  }

  /**
   * Stop the current session
   *
   * Gracefully terminates any running Codex process and cleans up.
   */
  async stopSession(): Promise<void> {
    if (!this.session) {
      logger.warn({
        category: 'admin_bot_chat',
        action: 'stop_session_no_session',
        message: 'No active session to stop'
      });
      return;
    }

    const sessionId = this.session.id;
    const process = this.session.process;

    logger.info({
      category: 'admin_bot_chat',
      action: 'session_stopping',
      message: 'Stopping admin bot session',
      details: { sessionId, hasProcess: !!process }
    });

    // Kill any running process
    if (process) {
      // Remove all event listeners from the process to prevent memory leaks
      process.stdout?.removeAllListeners();
      process.stderr?.removeAllListeners();
      process.removeAllListeners();

      // Send SIGTERM for graceful shutdown
      process.kill('SIGTERM');

      // Wait a bit, then force kill if still running
      setTimeout(() => {
        if (!process.killed) {
          logger.warn({
            category: 'admin_bot_chat',
            action: 'session_force_kill',
            message: 'Force killing Codex process',
            details: { sessionId }
          });
          process.kill('SIGKILL');
        }
      }, 5000);
    }

    // Clear session reference
    this.session = null;

    // Remove all EventEmitter listeners from this service
    this.removeAllListeners();

    logger.info({
      category: 'admin_bot_chat',
      action: 'session_stopped',
      message: 'Codex CLI session stopped and cleaned up',
      details: { sessionId }
    });
  }

  /**
   * Get current session information
   */
  getSession(): AdminBotSession | null {
    return this.session;
  }

  /**
   * Check if a session is currently running
   */
  isSessionRunning(): boolean {
    return this.session?.status === 'running';
  }
}
