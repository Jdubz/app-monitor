import { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { AgentPersonality } from './agentPersonalities.js';

export interface WorkerStatus {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  currentTask?: string;
  lastSeen: number;
  personality?: AgentPersonality;
  onboardingComplete?: boolean;
  lastOnboardingCheck?: number;
}

export interface DevBotsStatus {
  systemStatus: 'running' | 'stopped' | 'error';
  workers: Record<string, WorkerStatus>;
  queueSize: number;
  activeTasks: number;
  uptime: number;
  workerCount: number;
  maxWorkers: number;
  activeWorkerTypes: string[];
  availableWorkerTypes: string[];
  tasks: {
    pending: Task[];
    active: Task[];
    completed: Task[];
  };
}

export interface SystemStateSnapshot {
  isHealthy: boolean;
  startTime: number;
  maxWorkers: number;
}

/**
 * Service responsible for aggregating system status from multiple services
 * Extracted from DevBotsManager to reduce complexity
 */
export class StatusAggregationService {
  constructor(
    private taskQueue: TaskQueueService,
    private ephemeralWorkerService: EphemeralWorkerService
  ) {}

  /**
   * Get comprehensive system status by aggregating from all services
   */
  async getSystemStatus(systemState: SystemStateSnapshot): Promise<DevBotsStatus> {
    // Convert ephemeral workers to worker status format for compatibility
    const workersRecord: Record<string, WorkerStatus> = {};
    const activeEphemeralWorkers = Array.from(
      this.ephemeralWorkerService.getAllWorkers().values()
    ).filter(worker => worker.status !== 'destroyed');

    for (const [workerId, ephemeralWorker] of this.ephemeralWorkerService.getAllWorkers().entries()) {
      workersRecord[workerId] = {
        id: workerId,
        status:
          ephemeralWorker.status === 'starting'
            ? 'busy'
            : ephemeralWorker.status === 'running'
            ? 'busy'
            : ephemeralWorker.status === 'completing'
            ? 'busy'
            : 'stopped',
        currentTask: ephemeralWorker.task.id,
        lastSeen: new Date(ephemeralWorker.createdAt).getTime(),
        personality: ephemeralWorker.agent,
        onboardingComplete: true
      };
    }

    return {
      systemStatus: systemState.isHealthy ? 'running' : 'stopped',
      workers: workersRecord,
      queueSize: this.taskQueue.getTasksByStatus('pending').length,
      activeTasks: this.taskQueue.getTasksByStatus('running').length,
      uptime: Date.now() - systemState.startTime,
      workerCount: this.ephemeralWorkerService.getActiveWorkers().length,
      maxWorkers: systemState.maxWorkers,
      activeWorkerTypes: activeEphemeralWorkers.map(w => w.id),
      availableWorkerTypes: Array.from(
        { length: Math.max(systemState.maxWorkers - activeEphemeralWorkers.length, 0) },
        (_value, index) => `slot-${index + 1}`
      ),
      tasks: {
        pending: this.taskQueue.getTasksByStatus('pending'),
        active: this.taskQueue.getTasksByStatus('running'),
        completed: this.taskQueue.getTasksByStatus('completed').slice(-50) // Keep last 50 completed tasks
      }
    };
  }

  /**
   * Get tasks grouped by status
   */
  async getTasks(): Promise<{ pending: Task[]; active: Task[]; completed: Task[]; failed: Task[] }> {
    return {
      pending: this.taskQueue.getTasksByStatus('pending'),
      active: this.taskQueue.getTasksByStatus('running'),
      completed: this.taskQueue.getTasksByStatus('completed').slice(-50),
      failed: this.taskQueue.getTasksByStatus('failed')
    };
  }
}
