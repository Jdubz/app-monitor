/**
 * AdminBotService - Manages Codex CLI sessions for admin bot chat
 *
 * This service spawns and manages Codex CLI processes that are pre-configured
 * to connect to the App Monitor MCP server. Each chat session gets its own
 * Codex instance with admin-level MCP tool access.
 *
 * Architecture:
 * - Spawns: `codex exec` (non-interactive mode) with custom config pointing to MCP server
 * - Communication: Each message spawns a new codex exec process
 * - Streaming: Emits output events for SSE routes to consume
 * - Lifecycle: One session at a time, processes spawn per message
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
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
  private configTemplatePath: string;
  private runtimeConfigPath: string;
  private mcpStartPath: string;
  private databasePath: string;

  constructor() {
    super();
    // Determine repo root based on where we're running from
    // In production: backend/dist/services/AdminBotService.js -> go up 3 levels
    // In development: backend/src/services/AdminBotService.ts -> go up 3 levels
    // Result: /opt/app-monitor or /path/to/app-monitor
    this.repoRoot = path.resolve(__dirname, '../../..');
    this.configTemplatePath = path.join(this.repoRoot, 'backend/config/codex-admin-bot.toml');
    this.runtimeConfigPath = path.join(this.repoRoot, 'backend/data/codex-admin-bot-runtime.toml');

    // MCP start script path (use src in dev, dist in production)
    const isDist = __dirname.includes('/dist/');
    this.mcpStartPath = isDist
      ? path.join(this.repoRoot, 'backend/dist/mcp/start.js')
      : path.join(this.repoRoot, 'backend/src/mcp/start.ts');

    // Database path
    this.databasePath = process.env.DATABASE_PATH || path.join(this.repoRoot, 'backend/data/app-monitor.db');

    logger.info({
      category: 'admin_bot_chat',
      action: 'service_initialized',
      message: 'AdminBotService initialized',
      details: {
        __dirname,
        isDist,
        repoRoot: this.repoRoot,
        configTemplatePath: this.configTemplatePath,
        runtimeConfigPath: this.runtimeConfigPath,
        mcpStartPath: this.mcpStartPath,
        databasePath: this.databasePath
      }
    });
  }

  /**
   * Generate runtime config with absolute paths
   */
  private generateRuntimeConfig(): void {
    try {
      // Read template
      const template = fs.readFileSync(this.configTemplatePath, 'utf-8');

      // Replace placeholders with absolute paths
      const runtimeConfig = template
        .replace('{{MCP_START_PATH}}', this.mcpStartPath)
        .replace('{{DATABASE_PATH}}', this.databasePath);

      // Ensure data directory exists
      const dataDir = path.dirname(this.runtimeConfigPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Write runtime config
      fs.writeFileSync(this.runtimeConfigPath, runtimeConfig, 'utf-8');

      logger.debug({
        category: 'admin_bot_chat',
        action: 'runtime_config_generated',
        message: 'Generated runtime Codex config with absolute paths',
        details: {
          templatePath: this.configTemplatePath,
          runtimePath: this.runtimeConfigPath,
          mcpStartPath: this.mcpStartPath,
          databasePath: this.databasePath
        }
      });
    } catch (error) {
      logger.error({
        category: 'admin_bot_chat',
        action: 'runtime_config_generation_failed',
        message: 'Failed to generate runtime Codex config',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Start a new admin bot session with Codex CLI
   *
   * Spawns Codex CLI with pre-configured MCP server connection.
   * Only one session can run at a time.
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

    try {
      // Generate runtime config with absolute paths
      this.generateRuntimeConfig();

      // Create session without spawning a process
      // Each message will spawn its own codex exec process
      this.session = {
        id: sessionId,
        process: null,
        status: 'running',
        messages: [],
        startedAt: new Date()
      };

      logger.info({
        category: 'admin_bot_chat',
        action: 'session_started',
        message: 'Admin bot session started successfully',
        details: { sessionId }
      });

      return sessionId;

    } catch (error) {
      logger.error({
        category: 'admin_bot_chat',
        action: 'session_start_error',
        message: 'Failed to start admin bot session',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Send a message to the admin bot
   *
   * Spawns a new codex exec process for each message and streams the response.
   * This approach avoids TTY requirements of interactive mode.
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

    // Working directory for codex - use ~/Development to access all projects
    const codexWorkingDir = process.env.ADMIN_BOT_WORKING_DIR
      || (process.env.HOME ? `${process.env.HOME}/Development` : this.repoRoot);

    logger.debug({
      category: 'admin_bot_chat',
      action: 'message_sending',
      message: 'Spawning codex exec for message',
      details: {
        sessionId: this.session.id,
        messageLength: message.length,
        workingDir: codexWorkingDir
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

    // Spawn codex exec for this message
    // Add common NVM paths to PATH to find codex CLI
    const nvmPaths = [
      '/home/jdubz/.nvm/versions/node/v20.19.5/bin',
      '/home/jdubz/.nvm/versions/node/v20.18.1/bin',
      process.env.HOME ? `${process.env.HOME}/.nvm/versions/node/v20.19.5/bin` : '',
      process.env.HOME ? `${process.env.HOME}/.nvm/versions/node/v20.18.1/bin` : '',
    ].filter(Boolean).join(':');
    const enhancedPath = nvmPaths + ':' + (process.env.PATH || '');

    const codexProcess = spawn('codex', [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--cd', codexWorkingDir,
      message
    ], {
      cwd: codexWorkingDir,
      env: {
        ...process.env,
        PATH: enhancedPath,
        CODEX_CONFIG_PATH: this.runtimeConfigPath,
        APP_MONITOR_ROOT: this.repoRoot,
        APP_MONITOR_MCP_USER_ROLE: 'admin',
        DATABASE_PATH: this.databasePath
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Store current process for potential cancellation
    this.session.process = codexProcess;

    // Stream stdout to SSE
    codexProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      logger.debug({
        category: 'admin_bot_chat',
        action: 'stdout',
        message: 'Received stdout from codex exec',
        details: { sessionId: this.session?.id, output: output.substring(0, 200) }
      });
      this.emit('output', output);
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
    // This clears SSE route event handlers
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
   *
   * @returns Current session or null if no active session
   */
  getSession(): AdminBotSession | null {
    return this.session;
  }

  /**
   * Check if a session is currently running
   *
   * @returns True if session is running
   */
  isSessionRunning(): boolean {
    return this.session?.status === 'running';
  }
}
