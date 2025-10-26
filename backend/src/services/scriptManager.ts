import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { scripts, ScriptConfig } from '../config.js';

export interface ScriptExecution {
  id: string;
  scriptId: string;
  config: ScriptConfig;
  pid?: number;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  output: string[];
}

export class ScriptManager extends EventEmitter {
  private executions: Map<string, ScriptExecution> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private executionCounter = 0;

  constructor() {
    super();
  }

  /**
   * Execute a script by ID (DEPRECATED - blocks until completion)
   * @deprecated Use startScript() for non-blocking execution
   */
  async executeScript(scriptId: string): Promise<ScriptExecution> {
    const config = scripts[scriptId];
    if (!config) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    const executionId = `${scriptId}-${++this.executionCounter}-${Date.now()}`;

    const execution: ScriptExecution = {
      id: executionId,
      scriptId,
      config,
      status: 'running',
      startTime: new Date(),
      output: [],
    };

    this.executions.set(executionId, execution);

    try {
      await this._runScript(executionId, execution);
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
      this.emit('script:failed', execution);
      return execution;
    }
  }

  /**
   * Start a script asynchronously (returns immediately with execution ID)
   * Use Socket.IO events to monitor progress:
   * - script:started
   * - script:output
   * - script:completed
   * - script:failed
   */
  startScript(scriptId: string): ScriptExecution {
    const config = scripts[scriptId];
    if (!config) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    const executionId = `${scriptId}-${++this.executionCounter}-${Date.now()}`;

    const execution: ScriptExecution = {
      id: executionId,
      scriptId,
      config,
      status: 'running',
      startTime: new Date(),
      output: [],
    };

    this.executions.set(executionId, execution);

    // Run script asynchronously (don't await - fire and forget)
    this._runScript(executionId, execution).catch((_error) => {
      // Error already handled in _runScript via events
      // This catch prevents unhandled promise rejection
    });

    return execution;
  }

  /**
   * Run the actual script process
   */
  private async _runScript(executionId: string, execution: ScriptExecution): Promise<void> {
    const { config } = execution;

    return new Promise((resolve, reject) => {
      const child = spawn(config.command, config.args, {
        cwd: config.cwd,
        env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for clean output
        shell: true,
      });

      if (!child.pid) {
        reject(new Error('Failed to spawn process'));
        return;
      }

      execution.pid = child.pid;
      this.processes.set(executionId, child);

      this.emit('script:started', execution);

      // Capture stdout
      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          execution.output.push(line);
          this.emit('script:output', {
            executionId,
            scriptId: execution.scriptId,
            line,
          });
        });
      });

      // Capture stderr
      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          execution.output.push(`[ERROR] ${line}`);
          this.emit('script:output', {
            executionId,
            scriptId: execution.scriptId,
            line: `[ERROR] ${line}`,
          });
        });
      });

      // Handle process exit
      child.on('exit', (code, _signal) => {
        execution.exitCode = code ?? undefined;
        execution.endTime = new Date();
        execution.status = code === 0 ? 'completed' : 'failed';

        this.processes.delete(executionId);

        if (code === 0) {
          execution.output.push(`\n✓ Script completed successfully`);
          this.emit('script:completed', execution);
        } else {
          execution.output.push(`\n✗ Script failed with exit code ${code}`);
          this.emit('script:failed', execution);
        }

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script exited with code ${code}`));
        }
      });

      // Handle process errors
      child.on('error', (error: Error) => {
        execution.status = 'failed';
        execution.endTime = new Date();
        execution.output.push(`[ERROR] ${error.message}`);
        this.emit('script:failed', execution);
        reject(error);
      });
    });
  }

  /**
   * Get all script configurations
   */
  getScripts(): ScriptConfig[] {
    return Object.values(scripts);
  }

  /**
   * Get all executions
   */
  getExecutions(): ScriptExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Get a specific execution by ID
   */
  getExecution(executionId: string): ScriptExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Kill a running script
   */
  killScript(executionId: string): boolean {
    const process = this.processes.get(executionId);
    const execution = this.executions.get(executionId);

    if (!process || !execution) {
      return false;
    }

    try {
      process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.processes.has(executionId)) {
          process.kill('SIGKILL');
        }
      }, 5000);

      execution.output.push('\n⚠ Script killed by user');
      this.emit('script:killed', execution);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    // Only clear completed/failed executions, not running ones
    for (const [id, execution] of this.executions.entries()) {
      if (execution.status !== 'running') {
        this.executions.delete(id);
      }
    }
  }
}
