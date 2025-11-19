/**
 * Dev-Bot Test Simulator
 * 
 * Provides a controllable dev-bot instance for E2E testing.
 * Simulates real dev-bot behavior with configurable failures, delays, and phase progression.
 */

import { EventEmitter } from 'events';

// API key for E2E tests (must match playwright.config.ts)
const API_KEY = 'test-e2e-api-key-not-for-production';

export type FailureType = 
  | 'compilation_error'
  | 'test_failure'
  | 'timeout'
  | 'validation_error'
  | 'linting_error'
  | 'insufficient_coverage'
  | 'invalid_plan_structure'
  | 'out_of_memory'
  | 'disk_full'
  | 'flaky_test'
  | 'no_files_changed'
  | 'success_criteria_not_met'
  | 'persistent_error'
  | 'various';

export interface SimulatorConfig {
  /** Docker image to use for bot */
  image?: string;
  /** Mount workspace to container */
  mountWorkspace?: boolean;
  /** Inject failure at specific phase */
  failAtPhase?: number;
  /** Inject failures at multiple phases */
  failAtPhases?: number[];
  /** Type of failure to inject */
  failureType?: FailureType;
  /** Hang (infinite loop) at specific phase */
  hangAtPhase?: number;
  /** Timeout for hung phases (ms) */
  timeout?: number;
  /** Crash bot at specific phase */
  crashAtPhase?: number;
  
  // Advanced failure simulation
  /** Number of times to fail before succeeding (for retry tests) */
  failCount?: number;
  /** Maximum total failures before giving up */
  maxFailures?: number;
  /** Flaky failure rate (0.0-1.0) for intermittent failures */
  flakyFailureRate?: number;
  
  // Validation failures
  /** Success criteria that should not be met */
  unmetCriteria?: string[];
  /** Test coverage percentage to report (0-100) */
  coverage?: number;
  
  // State recovery
  /** Resume from this task ID */
  resumeTask?: string;
  /** Phase timeout in milliseconds */
  phaseTimeout?: number;
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
  reason?: string;
  timestamp?: number;
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
  private phaseAttemptCounts: Map<number, number> = new Map();
  private totalFailureCount: number = 0;
  private phaseFailureCount: Map<number, number> = new Map();

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
      // Trigger simulated phase progression in backend (test-only endpoint)
      await this.triggerBackendPhaseExecution(taskId);
      
      // Monitor backend for phase progression
      const result = await this.executePhases(taskId);
      
      return result;
    } catch (error: any) {
      this.instance.status = 'crashed';
      this.emit('crashed', { taskId, error: error.message });
      throw error;
    }
  }

  /**
   * Trigger backend phase execution (uses test-only simulation endpoint)
   */
  private async triggerBackendPhaseExecution(taskId: string): Promise<void> {
    const response = await fetch(
      `${this.apiBaseUrl}/api/dev-bots/tasks/${taskId}/simulate-phase-progression`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ speed: 'fast' }) // 100ms per phase
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DevBotSimulator] Phase progression failed: ${errorText}`);
      throw new Error(`Failed to start phase execution: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Backend rejected phase execution: ${result.message || 'Unknown error'}`);
    }
  }

  /**
   * Execute task through all phases (REAL BACKEND MONITORING)
   */
  private async executePhases(taskId: string): Promise<TaskResult> {
    // Backend uses 1-indexed phases (1-7), not 0-indexed
    // Phase 1: Planning, 2: Implementation, 3: Review, 4: Fixes,
    // 5: Test & Validate, 6: Cleanup, 7: PR Shepherding
    
    let currentPhase = 0; // Start at 0 so we detect phase 1
    let pollCount = 0;
    const maxPolls = 600; // 60 seconds timeout
    
    while (pollCount < maxPolls) {
      // Get real task status from backend
      const task = await this.getTaskStatus(taskId);
      
      if (!task) {
        throw new Error(`Task ${taskId} not found in backend`);
      }
      
      const backendPhase = task.phaseIndex || 1;  // Use camelCase from API contract
      
      // Detect phase change
      if (backendPhase !== currentPhase) {
        this.instance.currentPhase = backendPhase;
        this.phaseHistory.push(backendPhase);
        this.emit('phase_change', backendPhase);
        
        // Record phase attempt
        this.attemptHistory.push({
          phase: backendPhase,
          attempt: task.phaseAttempts || 1,
          success: task.phaseStatus === 'complete'
        });
        
        this.emit('phase_attempt', {
          phase: backendPhase,
          attempt: task.phaseAttempts || 1,
          success: task.phaseStatus === 'complete'
        });
        
        currentPhase = backendPhase;
      }
      
      // Check for crash injection
      if (this.config.crashAtPhase === backendPhase) {
        this.instance.status = 'crashed';
        this.emit('crashed', { taskId, phase: backendPhase });
        throw new Error(`Bot crashed at phase ${backendPhase} (injected)`);
      }
      
      // Check if task completed (phase 7 complete OR task status = completed)
      if (task.status === 'completed' || (backendPhase === 7 && task.phaseStatus === 'complete')) {
        this.instance.status = 'idle';
        this.instance.currentTaskId = undefined;
        this.instance.currentPhase = undefined;
        
        this.emit('task_completed', { taskId });
        
        return {
          success: true,
          taskId,
          finalPhase: backendPhase,
          prUrl: task.pr_url || task.prUrl || undefined
        };
      }
      
      // Check if task failed
      if (task.status === 'failed') {
        this.instance.status = 'idle';
        this.instance.currentTaskId = undefined;
        
        this.emit('task_failed', { taskId, error: task.error });
        
        return {
          success: false,
          taskId,
          finalPhase: backendPhase,
          error: task.error || 'Task failed in backend'
        };
      }
      
      // Poll interval
      await this.delay(100);
      pollCount++;
    }
    
    // Timeout
    throw new Error(`Task execution timeout after ${maxPolls * 100}ms - backend did not complete`);
  }

  /**
   * Get task status from backend
   */
  private async getTaskStatus(taskId: string): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}/api/dev-bots/tasks/${taskId}/detail`, {
      headers: { 'X-API-Key': API_KEY }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DevBotSimulator] Failed to get task status: ${response.status} - ${errorText}`);
      throw new Error(`Failed to get task status: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // API returns { success: true, data: { task: {...}, history: [...] } }
    const taskData = result.data?.task || result.data || result;
    return taskData;
  }

  private hasLoggedFirstResponse = false;

  /**
   * Inject failure at specific phase (FOR TESTING ONLY)
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
   * Determine if failure should be injected for this phase attempt
   */
  private shouldInjectFailure(phase: number): boolean {
    // Check single phase failure
    if (this.config.failAtPhase === phase) {
      const failureCount = this.phaseFailureCount.get(phase) || 0;
      
      // If failCount specified, only fail that many times
      if (this.config.failCount !== undefined) {
        if (failureCount < this.config.failCount) {
          this.phaseFailureCount.set(phase, failureCount + 1);
          return true;
        }
        return false;
      }
      
      // If maxFailures specified, check total failure limit
      if (this.config.maxFailures !== undefined) {
        if (this.totalFailureCount < this.config.maxFailures) {
          this.totalFailureCount++;
          this.phaseFailureCount.set(phase, failureCount + 1);
          return true;
        }
        return false;
      }
      
      // Default: always fail
      this.totalFailureCount++;
      this.phaseFailureCount.set(phase, failureCount + 1);
      return true;
    }
    
    // Check multiple phase failures
    if (this.config.failAtPhases && this.config.failAtPhases.includes(phase)) {
      this.totalFailureCount++;
      return true;
    }
    
    // Check flaky failures
    if (this.config.flakyFailureRate && this.config.flakyFailureRate > 0) {
      return Math.random() < this.config.flakyFailureRate;
    }
    
    return false;
  }

  /**
   * Get failure reason based on failure type
   */
  private getFailureReason(phase: number, failureType?: FailureType): string {
    const type = failureType || this.config.failureType;
    
    switch (type) {
      case 'compilation_error':
        return 'Compilation failed: Syntax error in generated code';
      case 'test_failure':
        return 'Tests failed: 3 of 10 tests failing';
      case 'linting_error':
        return 'Linting failed: 15 ESLint errors found';
      case 'insufficient_coverage':
        return `Test coverage ${this.config.coverage || 65}% below required 80%`;
      case 'invalid_plan_structure':
        return 'Plan validation failed: Missing required fields';
      case 'out_of_memory':
        return 'Container killed: Out of memory (OOM)';
      case 'disk_full':
        return 'Disk space exhausted: No space left on device';
      case 'flaky_test':
        return 'Intermittent test failure detected';
      case 'no_files_changed':
        return 'No files modified: Implementation phase requires changes';
      case 'success_criteria_not_met':
        return `Success criteria not met: ${this.config.unmetCriteria?.join(', ') || 'Unknown criteria'}`;
      case 'persistent_error':
        return 'Persistent error: Unable to resolve after multiple attempts';
      case 'timeout':
        return 'Phase execution timeout exceeded';
      case 'validation_error':
        return 'Validation failed: Output does not meet requirements';
      default:
        return `Phase ${phase} failed`;
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
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
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
    headers: { 
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      title: data.title,
      taskType: data.type,
      intent: data.prompt
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create task (${response.status}): ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  console.log('Create task response:', JSON.stringify(result, null, 2));
  
  if (!result.success || !result.data || !result.data.task || !result.data.task.id) {
    throw new Error(`Invalid task creation response: ${JSON.stringify(result)}`);
  }
  
  return { id: result.data.task.id };
}

/**
 * Helper to get task details
 */
export async function getTask(
  taskId: string,
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<any> {
  const response = await fetch(`${apiBaseUrl}/api/dev-bots/tasks/${taskId}/detail`, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get task: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data.task;  // Return just the task, not the whole detail object
}

/**
 * Helper to get task logs
 */
export async function getTaskLogs(
  taskId: string,
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/dev-bots/tasks/${taskId}/logs`, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get logs: ${response.statusText}`);
  }
  
  const result = await response.json();
  
  // The logs endpoint returns descriptors, not actual log content
  // For test purposes, we can return a formatted string of the descriptors
  if (result.data && (result.data.stdout || result.data.stderr)) {
    const parts = [];
    if (result.data.stdout) {
      parts.push(`STDOUT: ${result.data.stdout.absolutePath || 'No logs'}`);
    }
    if (result.data.stderr) {
      parts.push(`STDERR: ${result.data.stderr.absolutePath || 'No logs'}`);
    }
    return parts.join('\n');
  }
  
  // If logs array exists (old format), join it
  if (result.data && Array.isArray(result.data.logs)) {
    return result.data.logs.join('\n');
  }
  
  return 'No logs available';
}
