/**
 * Context Isolation Manager
 *
 * Manages fresh Claude sessions for each task to prevent context bloat
 * Implements Docker-based context isolation and session management
 */

import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ContextConfig {
  isolation: {
    enabled: boolean;
    dockerEnabled: boolean;
    freshSessionPerTask: boolean;
    contextCleanup: boolean;
    maxContextSize: number;
    maxContextAge: number;
  };
  docker: {
    enabled: boolean;
    imagePrefix: string;
    networkName: string;
    volumePrefix: string;
  };
  sessions: {
    maxConcurrentSessions: number;
    sessionTimeout: number;
    cleanupInterval: number;
  };
}

export interface TaskContext {
  taskId: string;
  workerName: string;
  contextDir: string;
  sessionId: string;
  createdAt: string;
  lastAccessed: string;
  files: string[];
  size: number;
  status: "active" | "completed" | "failed" | "cleaned";
}

export interface SessionInfo {
  sessionId: string;
  taskId: string;
  workerName: string;
  containerId: string;
  startTime: string;
  status: "running" | "completed" | "failed" | "timeout";
  contextSize: number;
}

export class ContextIsolationManager {
  private config: ContextConfig;
  private activeSessions: Map<string, SessionInfo> = new Map();
  private taskContexts: Map<string, TaskContext> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(configPath: string) {
    this.loadConfig(configPath);
    this.startCleanupTimer();
  }

  private loadConfig(configPath: string): void {
    try {
      const configData = fs.readFileSync(configPath, "utf8");
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error("Failed to load context config:", error);
      this.config = this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): ContextConfig {
    return {
      isolation: {
        enabled: true,
        dockerEnabled: true,
        freshSessionPerTask: true,
        contextCleanup: true,
        maxContextSize: 100 * 1024 * 1024, // 100MB
        maxContextAge: 24 * 60 * 60 * 1000, // 24 hours
      },
      docker: {
        enabled: true,
        imagePrefix: "claude-worker",
        networkName: "claude-workers",
        volumePrefix: "claude-worker",
      },
      sessions: {
        maxConcurrentSessions: 10,
        sessionTimeout: 1800000, // 30 minutes
        cleanupInterval: 300000, // 5 minutes
      },
    };
  }

  /**
   * Create isolated context for task
   */
  public async createIsolatedContext(
    taskId: string,
    workerName: string,
    files: string[],
    description: string,
  ): Promise<TaskContext> {
    if (!this.config.isolation.enabled) {
      throw new Error("Context isolation is disabled");
    }

    // Check concurrent session limit
    if (
      this.activeSessions.size >= this.config.sessions.maxConcurrentSessions
    ) {
      throw new Error("Maximum concurrent sessions reached");
    }

    const sessionId = `session_${taskId}_${Date.now()}`;
    const contextDir = path.join(__dirname, "../contexts", sessionId);

    // Create context directory
    await fs.promises.mkdir(contextDir, { recursive: true });

    // Copy only necessary files to context
    const contextFiles: string[] = [];
    for (const file of files) {
      if (fs.existsSync(file)) {
        const filename = path.basename(file);
        const destPath = path.join(contextDir, filename);
        await fs.promises.copyFile(file, destPath);
        contextFiles.push(destPath);
      }
    }

    // Create context summary
    const contextSummary = {
      taskId,
      workerName,
      description,
      files: contextFiles,
      createdAt: new Date().toISOString(),
      sessionId,
    };

    await fs.promises.writeFile(
      path.join(contextDir, "context-summary.json"),
      JSON.stringify(contextSummary, null, 2),
    );

    // Create task context
    const taskContext: TaskContext = {
      taskId,
      workerName,
      contextDir,
      sessionId,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      files: contextFiles,
      size: await this.calculateContextSize(contextDir),
      status: "active",
    };

    this.taskContexts.set(taskId, taskContext);

    console.log(`Created isolated context for task ${taskId} in ${contextDir}`);
    return taskContext;
  }

  /**
   * Execute task with isolated context
   */
  public async executeWithIsolatedContext(
    taskId: string,
    workerName: string,
    prompt: string,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const taskContext = this.taskContexts.get(taskId);
    if (!taskContext) {
      throw new Error(`Task context not found for task ${taskId}`);
    }

    const sessionId = taskContext.sessionId;
    const containerName = `claude-worker-${workerName}-${taskId}`;

    try {
      // Create session info
      const sessionInfo: SessionInfo = {
        sessionId,
        taskId,
        workerName,
        containerId: "",
        startTime: new Date().toISOString(),
        status: "running",
        contextSize: taskContext.size,
      };

      this.activeSessions.set(sessionId, sessionInfo);

      if (this.config.docker.enabled) {
        return await this.executeWithDocker(taskContext, prompt, containerName);
      } else {
        return await this.executeWithLocalContext(taskContext, prompt);
      }
    } catch (error) {
      console.error(`Failed to execute task ${taskId}:`, error);
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      // Clean up session
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Execute with Docker isolation
   */
  private async executeWithDocker(
    taskContext: TaskContext,
    prompt: string,
    containerName: string,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const { taskId, contextDir } = taskContext;

    try {
      // Build Docker command
      const dockerCmd = [
        "docker run --rm",
        `--name ${containerName}`,
        `--network ${this.config.docker.networkName}`,
        `-v ${contextDir}:/app/context:ro`,
        `-v ${path.join(__dirname, "../results")}:/app/results:rw`,
        `-v ${path.join(__dirname, "../logs")}:/app/logs:rw`,
        `-e WORKER_NAME=${workerName}`,
        `-e TASK_ID=${taskId}`,
        `-e CLAUDE_API_KEY=${process.env.CLAUDE_API_KEY}`,
        `-e CONTEXT_ISOLATION=true`,
        `-e FRESH_SESSION=true`,
        `${this.config.docker.imagePrefix}-${workerName}`,
        "/app/context-isolated-worker.sh",
        workerName,
        taskId,
      ].join(" ");

      console.log(`Executing Docker command: ${dockerCmd}`);

      // Execute Docker container
      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: this.config.sessions.sessionTimeout,
      });

      // Parse output
      const output = stdout.toString();
      const error = stderr.toString();

      return {
        success: !error,
        output,
        error: error || undefined,
      };
    } catch (error) {
      console.error(`Docker execution failed for task ${taskId}:`, error);
      return {
        success: false,
        output: "",
        error:
          error instanceof Error ? error.message : "Docker execution failed",
      };
    }
  }

  /**
   * Execute with local context
   */
  private async executeWithLocalContext(
    taskContext: TaskContext,
    prompt: string,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const { taskId, contextDir } = taskContext;

    try {
      // Prepare fresh prompt with context
      const freshPrompt = `You are starting a fresh Claude session for task: ${taskId}

Task Description: ${prompt}

Context Files Available:
${fs.readdirSync(contextDir).join("\n")}

Instructions:
- This is a completely fresh session with no previous context
- Focus only on the current task
- Use only the files provided in this context
- Complete the task without referencing any previous work
- Provide a summary of what was accomplished

Execute the task now.`;

      // Execute Claude with fresh context
      const outputFile = path.join(
        __dirname,
        "../results",
        `task-${taskId}-${Date.now()}.json`,
      );
      const logFile = path.join(
        __dirname,
        "../logs",
        `task-${taskId}-${new Date().toISOString().split("T")[0]}.log`,
      );

      const claudeCmd = [
        "claude",
        `-p "${freshPrompt}"`,
        '--allowedTools "Bash,Read,Write,Edit,Search,Git"',
        `--working-directory "${contextDir}"`,
        "--output-format json",
        "--permission-mode acceptEdits",
        `--output-file "${outputFile}"`,
        `--log-file "${logFile}"`,
        "--no-context",
        "--fresh-session",
      ].join(" ");

      console.log(`Executing Claude command: ${claudeCmd}`);

      const { stdout, stderr } = await execAsync(claudeCmd, {
        timeout: this.config.sessions.sessionTimeout,
        cwd: contextDir,
      });

      return {
        success: !stderr,
        output: stdout.toString(),
        error: stderr || undefined,
      };
    } catch (error) {
      console.error(`Local execution failed for task ${taskId}:`, error);
      return {
        success: false,
        output: "",
        error:
          error instanceof Error ? error.message : "Local execution failed",
      };
    }
  }

  /**
   * Calculate context size
   */
  private async calculateContextSize(contextDir: string): Promise<number> {
    let totalSize = 0;

    const files = await fs.promises.readdir(contextDir, {
      withFileTypes: true,
    });

    for (const file of files) {
      const filePath = path.join(contextDir, file.name);
      if (file.isDirectory()) {
        totalSize += await this.calculateContextSize(filePath);
      } else {
        const stats = await fs.promises.stat(filePath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  /**
   * Clean up context
   */
  public async cleanupContext(taskId: string): Promise<void> {
    const taskContext = this.taskContexts.get(taskId);
    if (!taskContext) {
      return;
    }

    try {
      // Remove context directory
      await fs.promises.rm(taskContext.contextDir, {
        recursive: true,
        force: true,
      });

      // Update context status
      taskContext.status = "cleaned";
      taskContext.lastAccessed = new Date().toISOString();

      console.log(`Cleaned up context for task ${taskId}`);
    } catch (error) {
      console.error(`Failed to cleanup context for task ${taskId}:`, error);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (!this.config.isolation.contextCleanup) {
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      await this.performCleanup();
    }, this.config.sessions.cleanupInterval);
  }

  /**
   * Perform cleanup
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = this.config.isolation.maxContextAge;
    const maxSize = this.config.isolation.maxContextSize;

    for (const [taskId, context] of this.taskContexts) {
      const contextAge = now - new Date(context.createdAt).getTime();
      const shouldCleanup =
        contextAge > maxAge ||
        context.size > maxSize ||
        context.status === "completed" ||
        context.status === "failed";

      if (shouldCleanup) {
        await this.cleanupContext(taskId);
        this.taskContexts.delete(taskId);
      }
    }

    // Clean up old sessions
    for (const [sessionId, session] of this.activeSessions) {
      const sessionAge = now - new Date(session.startTime).getTime();
      if (sessionAge > this.config.sessions.sessionTimeout) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  /**
   * Get context statistics
   */
  public getContextStats(): {
    totalContexts: number;
    activeContexts: number;
    totalSize: number;
    activeSessions: number;
    averageContextSize: number;
  } {
    const contexts = Array.from(this.taskContexts.values());
    const activeContexts = contexts.filter((c) => c.status === "active").length;
    const totalSize = contexts.reduce((sum, c) => sum + c.size, 0);
    const averageContextSize =
      contexts.length > 0 ? totalSize / contexts.length : 0;

    return {
      totalContexts: contexts.length,
      activeContexts,
      totalSize,
      activeSessions: this.activeSessions.size,
      averageContextSize,
    };
  }

  /**
   * Stop cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
