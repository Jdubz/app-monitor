/**
 * Dev-Bot Test Simulator
 * 
 * Provides a controllable dev-bot instance for E2E testing.
 * Simulates real dev-bot behavior with configurable failures, delays, and phase progression.
 */

import { EventEmitter } from 'events';

export interface SimulatorConfig {
  /** Docker image to use for bot */
  image?: string;
  /** Mount workspace to container */
  mountWorkspace?: boolean;
  /** Inject failure at specific phase */
  failAtPhase?: number;
  /** Type of failure to inject */
  failureType?: 'compilation_error' | 'test_failure' | 'timeout' | 'validation_error';
  /** Hang (infinite loop) at specific phase */
  hangAtPhase?: number;
  /** Timeout for hung phases (ms) */
  timeout?: number;
  /** Crash bot at specific phase */
  crashAtPhase?: number;
}

export interface BotInstance {
  id: string;
  containerId?: string;
  status: 'idle' | 'running' | 'crashed' | 'stopped';
  currentTaskId?: string;
  currentPhase?: number;
  workspaceId: string;
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  finalPhase: number;
  prUrl?: string;
  error?: string;
}

export interface PhaseAttempt {
  phase: number;
  attempt: number;
  success: boolean;
  error?: string;
}

/**
 * Dev-Bot Simulator for E2E testing
 * 
 * Usage:
 * ```typescript
 * const bot = await startDevBotSimulator();
 * await bot.executeTask('task-123');
 * await bot.waitForCompletion({ timeout: 60000 });
 * ```
 */
export class DevBotSimulator extends EventEmitter {
  private config: SimulatorConfig;
  private instance: BotInstance;
  private apiBaseUrl: string;
  private phaseHistory: number[] = [];
  private attemptHistory: PhaseAttempt[] = [];

  constructor(config: SimulatorConfig = {}, apiBaseUrl: string = 'http://localhost:3002') {
    super();
    this.config = config;
    this.apiBaseUrl = apiBaseUrl;
    
    // Generate unique instance
    this.instance = {
      id: `bot-sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'idle',
      workspaceId: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Start the bot simulator
   */
  async start(): Promise<BotInstance> {
    this.instance.status = 'running';
    this.emit('started', this.instance);
    
    // Simulate container creation if Docker is configured
    if (this.config.image) {
      await this.createContainer();
    }
    
    return this.instance;
  }

  /**
   * Execute a task with the bot
   */
  async executeTask(taskId: string): Promise<TaskResult> {
    if (this.instance.status !== 'running') {
      throw new Error('Bot is not running');
    }

    this.instance.currentTaskId = taskId;
    this.instance.currentPhase = 0;
    this.emit('task_started', { taskId, botId: this.instance.id });

    try {
      // Assign task to bot via API
      await this.assignTaskToBot(taskId);
      
      // Execute through phases
      const result = await this.executePhases(taskId);
      
      return result;
    } catch (error: any) {
      this.instance.status = 'crashed';
      this.emit('crashed', { taskId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute task through all phases
   */
  private async executePhases(taskId: string): Promise<TaskResult> {
    const phases = [0, 1, 2, 3, 4, 5, 6]; // 7 phases
    
    for (const phase of phases) {
      this.instance.currentPhase = phase;
      this.phaseHistory.push(phase);
      this.emit('phase_change', phase);
      
      // Check for injected failures
      if (this.config.failAtPhase === phase) {
        await this.injectFailure(phase, this.config.failureType || 'validation_error');
        // Retry logic would happen here in real implementation
      }
      
      if (this.config.hangAtPhase === phase) {
        await this.hangPhase(phase);
      }
      
      if (this.config.crashAtPhase === phase) {
        this.instance.status = 'crashed';
        throw new Error(`Bot crashed at phase ${phase}`);
      }
      
      // Execute phase
      const attempt = await this.executePhase(taskId, phase);
      this.attemptHistory.push(attempt);
      this.emit('phase_attempt', attempt);
      
      if (!attempt.success) {
        // Phase failed, would trigger recovery in real implementation
        this.emit('phase_failed', { phase, error: attempt.error });
      }
      
      // Simulate phase execution time
      await this.delay(100);
    }
    
    // Task completed
    this.instance.status = 'idle';
    this.instance.currentTaskId = undefined;
    this.instance.currentPhase = undefined;
    
    return {
      success: true,
      taskId,
      finalPhase: 6,
      prUrl: `https://github.com/test/repo/pull/${Math.floor(Math.random() * 1000)}`
    };
  }

  /**
   * Execute a single phase
   */
  private async executePhase(taskId: string, phase: number): Promise<PhaseAttempt> {
    try {
      // Call API to update phase
      const response = await fetch(`${this.apiBaseUrl}/api/dev-bots/tasks/${taskId}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          botId: this.instance.id,
          phase,
          status: 'in_progress'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Phase ${phase} failed: ${response.statusText}`);
      }
      
      return {
        phase,
        attempt: 1,
        success: true
      };
    } catch (error: any) {
      return {
        phase,
        attempt: 1,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Inject failure at specific phase
   */
  async injectFailure(phase: number, type: string): Promise<void> {
    this.emit('failure_injected', { phase, type });
    
    // Simulate failure by making phase attempt fail
    const attempt: PhaseAttempt = {
      phase,
      attempt: 1,
      success: false,
      error: `Injected ${type} at phase ${phase}`
    };
    
    this.attemptHistory.push(attempt);
    this.emit('phase_attempt', attempt);
  }

  /**
   * Hang at specific phase (simulate infinite loop)
   */
  private async hangPhase(phase: number): Promise<void> {
    this.emit('phase_hung', { phase });
    
    // Wait for timeout
    const timeout = this.config.timeout || 30000;
    await this.delay(timeout + 1000); // Exceed timeout
    
    // In real implementation, this would trigger timeout recovery
  }

  /**
   * Complete a phase with specific outcome
   */
  async completePhase(phase: number, outcome: { filesCreated?: string[], success?: boolean }): Promise<void> {
    const attempt: PhaseAttempt = {
      phase,
      attempt: 1,
      success: outcome.success !== false
    };
    
    // Validate phase requirements
    if (phase === 1 && (!outcome.filesCreated || outcome.filesCreated.length === 0)) {
      attempt.success = false;
      attempt.error = 'Implementation phase requires files to be created';
    }
    
    this.attemptHistory.push(attempt);
    this.emit('phase_attempt', attempt);
  }

  /**
   * Wait for specific phase to be reached
   */
  async waitForPhase(targetPhase: number, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout || 60000;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkPhase = () => {
        if (this.instance.currentPhase === targetPhase) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for phase ${targetPhase}`));
        } else {
          setTimeout(checkPhase, 100);
        }
      };
      
      checkPhase();
    });
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        if (this.instance.status === 'idle' && !this.instance.currentTaskId) {
          resolve();
        } else if (this.instance.status === 'crashed') {
          reject(new Error('Bot crashed during execution'));
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for completion'));
        } else {
          setTimeout(checkStatus, 100);
        }
      };
      
      checkStatus();
    });
  }

  /**
   * Wait for bot crash
   */
  async waitForCrash(): Promise<void> {
    return new Promise((resolve) => {
      this.once('crashed', () => resolve());
    });
  }

  /**
   * Execute command in bot container
   */
  async execute(command: string): Promise<{ stdout: string, stderr: string, exitCode: number }> {
    // Simulate command execution in container
    // In real implementation, would use docker.exec()
    return {
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0
    };
  }

  /**
   * Get phase history
   */
  getPhaseHistory(): number[] {
    return [...this.phaseHistory];
  }

  /**
   * Get attempt history
   */
  getAttemptHistory(): PhaseAttempt[] {
    return [...this.attemptHistory];
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    this.instance.status = 'stopped';
    this.emit('stopped', this.instance);
    
    if (this.instance.containerId) {
      await this.removeContainer();
    }
  }

  /**
   * Get bot instance details
   */
  getInstance(): BotInstance {
    return { ...this.instance };
  }

  // Private helper methods
  
  private async createContainer(): Promise<void> {
    // Simulate Docker container creation
    this.instance.containerId = `container-${this.instance.id}`;
    this.emit('container_created', { containerId: this.instance.containerId });
  }

  private async removeContainer(): Promise<void> {
    if (!this.instance.containerId) return;
    
    // Simulate container removal
    this.emit('container_removed', { containerId: this.instance.containerId });
    this.instance.containerId = undefined;
  }

  private async assignTaskToBot(taskId: string): Promise<void> {
    // Call API to assign task
    await fetch(`${this.apiBaseUrl}/api/dev-bots/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: this.instance.id })
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to start a dev-bot simulator
 */
export async function startDevBotSimulator(
  config: SimulatorConfig = {},
  apiBaseUrl?: string
): Promise<DevBotSimulator> {
  const simulator = new DevBotSimulator(config, apiBaseUrl);
  await simulator.start();
  return simulator;
}

/**
 * Helper to create a task via API
 */
export async function createTask(
  data: {
    title: string;
    type: 'implementation' | 'analysis' | 'documentation' | 'review';
    prompt: string;
    success_criteria?: string[];
  },
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<{ id: string }> {
  const response = await fetch(`${apiBaseUrl}/api/dev-bots/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.statusText}`);
  }
  
  const result = await response.json();
  return { id: result.data.id };
}

/**
 * Helper to get task details
 */
export async function getTask(
  taskId: string,
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<any> {
  const response = await fetch(`${apiBaseUrl}/api/dev-bots/tasks/${taskId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get task: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data;
}

/**
 * Helper to get task logs
 */
export async function getTaskLogs(
  taskId: string,
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/dev-bots/tasks/${taskId}/logs`);
  
  if (!response.ok) {
    throw new Error(`Failed to get logs: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data.logs.join('\n');
}
