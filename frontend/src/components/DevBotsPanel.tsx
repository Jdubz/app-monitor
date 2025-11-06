import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { api } from '../services/api';
import StatusBadge from './StatusBadge';
// import ControlButtons from './ControlButtons';
import styles from './DevBotsPanel.module.css';

const PRIORITY_THRESHOLDS = {
  HIGH: 8,
  MEDIUM: 5,
  LOW_MEDIUM: 3,
} as const;

const PRIORITY_COLORS = {
  DEFAULT: '#888888',
  HIGH: '#ff4444',
  MEDIUM: '#ff8800',
  LOW_MEDIUM: '#0088ff',
} as const;

// interface RetryAttempt {
//   attemptNumber: number;
//   timestamp: string;
//   reason: string;
//   error?: string;
//   exitCode?: number;
//   duration?: number;
//   workerId?: string;
//   agentId?: string;
// }

interface Task {
  id: string;
  type: string;
  description: string;
  status: 'pending' | 'assigned' | 'active' | 'completed' | 'failed';
  createdAt: string;
  assignedWorker?: string;
  assignedAgent: string; // New: assigned agent personality (required)
  assignedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  exitCode?: number;
  prompt?: string; // New: generated prompt for the task
  files?: string[]; // New: files to be modified
  dependencies?: string[]; // New: task dependencies
  project?: string; // New: target project
  priority?: number; // Task priority (1-10, higher is more important)

  // Simple retry fields
  retryCount?: number;
  maxRetries?: number;
  canRetry?: boolean;
  scope?: {
    type: string;
    boundaries: {
      maxChanges: number;
      forbiddenActions: string[];
      maxNewLines: number;
    };
    validation: {
      forbiddenPatterns: string[];
      allowedPatterns: string[];
    };
  };
  isEmergency?: boolean;
  chainId?: string;
  scopeViolations?: Array<{ type: string; severity: string }>;
  isPeriodicCleanup?: boolean;
}

interface WorkerStatus {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  currentTask?: string;
  lastSeen: number;
  personality?: {
    id: string;
    name: string;
    role: string;
    description: string;
    specialties: string[];
  };
  onboardingComplete?: boolean;
  lastOnboardingCheck?: number;
}

interface DevBotsStatus {
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

interface ScopeViolation {
  taskId: string;
  violations: Array<{ type: string; severity: string }>;
}

interface CleanupStatus {
  schedules: string[];
  recentTasks: Task[];
  totalCleanupTasks: number;
}

interface AgentPersonality {
  id: string;
  name: string;
  role: string;
  description: string;
  specialties: string[];
  expertise: {
    primary: string[];
    secondary: string[];
    tools: string[];
  };
  personality: {
    communicationStyle: 'formal' | 'casual' | 'technical' | 'collaborative';
    approach: 'methodical' | 'creative' | 'analytical' | 'pragmatic';
    focus: 'quality' | 'speed' | 'innovation' | 'reliability';
  };
  taskPreferences: {
    preferredTypes: string[];
    avoidedTypes: string[];
    complexityRange: 'simple' | 'medium' | 'complex' | 'any';
  };
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  taskTypes: string[];
  agentTypes: string[];
  template: string;
  variables: string[];
  validationRules: string[];
}

interface DevBotsPanelProps {
  serviceName?: string;
  onStatusChange?: (status: DevBotsStatus) => void;
  socket?: Socket | null;
}

export const DevBotsPanel: React.FC<DevBotsPanelProps> = ({
  serviceName: _serviceName,
  onStatusChange,
  socket
}) => {
  const [status, setStatus] = useState<DevBotsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    type: 'implementation',
    title: '',
    documentation: '',
    acceptanceCriteria: '',
    notes: '',
    files: [] as string[],
    dependencies: [] as string[],
    project: 'app-monitor',
    assignedAgent: 'backend-specialist'
  });
  const [addingTask, setAddingTask] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [scopeViolations, setScopeViolations] = useState<ScopeViolation[]>([]);
  const [cleanupStatus, setCleanupStatus] = useState<CleanupStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'metrics' | 'cleanup' | 'agents' | 'templates'>('overview');
  
  // Enhanced features state
  const [agents, setAgents] = useState<AgentPersonality[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  // const [showTaskPrompt, setShowTaskPrompt] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      console.log('[DevBotsPanel] Fetching status from /dev-bots/status');
      const [statusResponse, violationsResponse, cleanupResponse, agentsResponse, templatesResponse] = await Promise.all([
        api.get<DevBotsStatus>('/dev-bots/status'),
        api.get<{ violations: ScopeViolation[] }>('/dev-bots/scope-violations').catch(() => ({ violations: [] as ScopeViolation[] })),
        api.get<CleanupStatus>('/dev-bots/cleanup-status').catch(() => ({
          schedules: [],
          recentTasks: [],
          totalCleanupTasks: 0,
        })),
        api.get<{ agents: AgentPersonality[] }>('/dev-bots/agents').catch(() => ({ agents: [] as AgentPersonality[] })),
        api.get<{ templates: TaskTemplate[] }>('/dev-bots/templates').catch(() => ({ templates: [] as TaskTemplate[] })),
      ]);

      console.log('[DevBotsPanel] Status response:', statusResponse);
      setStatus(statusResponse);
      setScopeViolations(violationsResponse.violations ?? []);
      setCleanupStatus(cleanupResponse);
      setAgents(agentsResponse.agents ?? []);
      setTemplates(templatesResponse.templates ?? []);
      setError(null);
      if (onStatusChange) {
        onStatusChange(statusResponse);
      }
    } catch (err: any) {
      console.error('[DevBotsPanel] Error fetching status:', err);
      console.error('[DevBotsPanel] Error details:', {
        message: err.message,
        response: err.response,
        error: err.error,
        code: err.code
      });
      const errorMessage = err.error || err.response?.data?.error || err.message || 'Failed to fetch status';
      setError(errorMessage);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim() || !newTask.documentation.trim() || !newTask.acceptanceCriteria.trim()) return;

    try {
      setAddingTask(true);
      await api.post('/dev-bots/tasks', newTask);
      setNewTask({ 
        type: 'implementation',
        title: '',
        documentation: '',
        acceptanceCriteria: '',
        notes: '',
        files: [],
        dependencies: [],
        project: 'app-monitor',
        assignedAgent: 'backend-specialist'
      });
      await fetchStatus(); // Refresh status
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setAddingTask(false);
    }
  };

  const triggerEmergencyRecovery = async () => {
    try {
      await api.post('/dev-bots/emergency-recovery');
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger emergency recovery');
    }
  };

  const triggerCleanup = async (type: string) => {
    try {
      await api.post('/dev-bots/trigger-cleanup', { type });
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger cleanup');
    }
  };

  const startSystem = async () => {
    try {
      await api.post('/dev-bots/start');
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start system');
    }
  };

  const stopSystem = async () => {
    try {
      await api.post('/dev-bots/stop');
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to stop system');
    }
  };

  // Simple manual retry function
  const retryTask = async (taskId: string) => {
    try {
      await api.post(`/dev-bots/tasks/${taskId}/retry`);
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to retry task');
    }
  };

  useEffect(() => {
    fetchStatus();
    let interval: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      interval = setInterval(fetchStatus, 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!socket) return;

    // Listen for Claude worker events
    const handleTaskAdded = (task: Task) => {
      console.log('Task added:', task);
      fetchStatus(); // Refresh to get updated status
    };

    const handleTaskAssigned = (task: Task) => {
      console.log('Task assigned:', task);
      fetchStatus();
    };

    const handleTaskStarted = (task: Task) => {
      console.log('Task started:', task);
      fetchStatus();
    };

    const handleTaskCompleted = (task: Task) => {
      console.log('Task completed:', task);
      fetchStatus();
    };

    const handleTaskFailed = (task: Task) => {
      console.log('Task failed:', task);
      fetchStatus();
    };

    const handleSystemStatusChange = (systemStatus: any) => {
      console.log('System status changed:', systemStatus);
      fetchStatus();
    };

    const handleCoordinatorHealthChange = (isHealthy: boolean) => {
      console.log('Coordinator health changed:', isHealthy);
      fetchStatus();
    };

    // Register event listeners
    socket.on('claude:taskAdded', handleTaskAdded);
    socket.on('claude:taskAssigned', handleTaskAssigned);
    socket.on('claude:taskStarted', handleTaskStarted);
    socket.on('claude:taskCompleted', handleTaskCompleted);
    socket.on('claude:taskFailed', handleTaskFailed);
    socket.on('claude:systemStatusChange', handleSystemStatusChange);
    socket.on('claude:coordinatorHealthChange', handleCoordinatorHealthChange);

    // Cleanup listeners on unmount
    return () => {
      socket.off('claude:taskAdded', handleTaskAdded);
      socket.off('claude:taskAssigned', handleTaskAssigned);
      socket.off('claude:taskStarted', handleTaskStarted);
      socket.off('claude:taskCompleted', handleTaskCompleted);
      socket.off('claude:taskFailed', handleTaskFailed);
      socket.off('claude:systemStatusChange', handleSystemStatusChange);
      socket.off('claude:coordinatorHealthChange', handleCoordinatorHealthChange);
    };
  }, [socket]);

  if (loading && !status) {
    return (
      <div className={styles['dev-bots-panel']}>
        <div className={styles['panel-header']}>
          <h3>🤖 Dev-Bots</h3>
        </div>
        <div className={styles['panel-content']}>
          <div className={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className={styles['dev-bots-panel']}>
        <div className={styles['panel-header']}>
          <h3>🤖 Dev-Bots</h3>
        </div>
        <div className={styles['panel-content']}>
          <div className={styles.error}>
            <p>❌ {error}</p>
            <button onClick={fetchStatus} className={styles['retry-btn']}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getPriorityColor = (priority: number | undefined) => {
    if (priority === undefined) {
      return PRIORITY_COLORS.DEFAULT;
    }
    if (priority >= PRIORITY_THRESHOLDS.HIGH) {
      return PRIORITY_COLORS.HIGH;
    }
    if (priority >= PRIORITY_THRESHOLDS.MEDIUM) {
      return PRIORITY_COLORS.MEDIUM;
    }
    if (priority >= PRIORITY_THRESHOLDS.LOW_MEDIUM) {
      return PRIORITY_COLORS.LOW_MEDIUM;
    }
    return PRIORITY_COLORS.DEFAULT;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'failed': return '#f44336';
      case 'active': return '#ff9800';
      case 'assigned': return '#2196f3';
      case 'pending': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  };

  const getActivityClass = (task: Task) => {
    if (task.status === 'failed') return 'activity-error';
    if (task.isPeriodicCleanup) return 'activity-cleanup';
    if (task.isEmergency) return 'activity-recovery';
    if (task.status === 'completed') return 'activity-task';
    return '';
  };

  const formatTimestamp = (timestamp: string | number) => {
    const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp);
    return date.toLocaleString();
  };

  const getTotalTasks = () => {
    if (!status) return 0;
    return (status.tasks.pending?.length || 0) + 
           (status.tasks.active?.length || 0) + 
           (status.tasks.completed?.length || 0);
  };

  return (
    <div className={styles["dev-bots-panel"]}>
      <div className={styles["panel-header"]}>
        <h3>🤖 Dev-Bots (Ephemeral)</h3>
        <div className={styles["header-actions"]}>
          {status?.systemStatus === 'stopped' ? (
            <button
              onClick={startSystem}
              className={styles["start-btn"]}
              title="Start Dev-Bots system"
            >
              ▶️ Start System
            </button>
          ) : (
            <button
              onClick={stopSystem}
              className={styles["stop-btn"]}
              title="Stop Dev-Bots system"
            >
              ⏹️ Stop System
            </button>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`${styles['auto-refresh-btn']} ${autoRefresh ? styles.active : ''}`}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            {autoRefresh ? '⏸️' : '▶️'}
          </button>
          <button onClick={fetchStatus} className={styles["refresh-btn"]} disabled={loading}>
            🔄
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles["tab-navigation"]}>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'tasks' ? styles.active : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          📋 Tasks
        </button>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'metrics' ? styles.active : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          📈 Metrics
        </button>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'cleanup' ? styles.active : ''}`}
          onClick={() => setActiveTab('cleanup')}
        >
          🧹 Cleanup
        </button>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'agents' ? styles.active : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          🤖 Agents
        </button>
        <button
          className={`${styles['tab-btn']} ${activeTab === 'templates' ? styles.active : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          📝 Templates
        </button>
      </div>

      <div className={styles["panel-content"]}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* System Status */}
            <div className={styles["status-section"]}>
              <h4>System Status</h4>
              <div className={styles["status-grid"]}>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Status:</span>
                  <StatusBadge status={status?.systemStatus || 'stopped'} />
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Queue:</span>
                  <span className={styles["value"]}>{status?.queueSize || 0}</span>
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Active:</span>
                  <span className={styles["value"]}>{status?.activeTasks || 0}</span>
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Uptime:</span>
                  <span className={styles["value"]}>{status ? Math.round(status.uptime) : 0}s</span>
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Workers:</span>
                  <span className={styles["value"]}>{status?.workerCount || 0}/{status?.maxWorkers || 2}</span>
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Active Types:</span>
                  <span className={styles["value"]}>{status?.activeWorkerTypes?.join(', ') || 'None'}</span>
                </div>
                <div className={styles["status-item"]}>
                  <span className={styles["label"]}>Available Types:</span>
                  <span className={styles["value"]}>{status?.availableWorkerTypes?.join(', ') || 'None'}</span>
                </div>
              </div>
            </div>

            {/* Ephemeral Workers */}
            <div className={styles["workers-section"]}>
              <h4>Ephemeral Workers</h4>
              {!status?.workers || Object.keys(status.workers).length === 0 ? (
                <div className={styles["no-workers"]}>
                  <p>No active workers. Workers are created ephemerally for each task and destroyed when complete.</p>
                </div>
              ) : (
                <div className={styles["workers-grid"]}>
                  {Object.entries(status.workers).map(([workerId, worker]) => (
                    <div key={workerId} className={`${styles['worker-card']} ${styles[`worker-${worker.status}`]}`}>
                      <div className={styles["worker-header"]}>
                        <span className={styles["worker-id"]}>{workerId}</span>
                        <StatusBadge status={worker.status === 'idle' ? 'running' : worker.status === 'stopped' ? 'stopped' : 'busy'} />
                      </div>
                      <div className={styles["worker-info"]}>
                        <div className={styles["info-item"]}>
                          <div className={styles["info-label"]}>Current Task</div>
                          <div className={styles["info-value"]}>{worker.currentTask || 'None'}</div>
                        </div>
                        <div className={styles["info-item"]}>
                          <div className={styles["info-label"]}>Agent</div>
                          <div className={styles["info-value"]}>{worker.personality?.name || 'Unknown'}</div>
                        </div>
                        <div className={styles["info-item"]}>
                          <div className={styles["info-label"]}>Type</div>
                          <div className={styles["info-value"]}>Ephemeral</div>
                        </div>
                        <div className={styles["info-item"]}>
                          <div className={styles["info-label"]}>Last Seen</div>
                          <div className={styles["info-value"]}>{formatTimestamp(worker.lastSeen)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Task */}
            <div className={styles["add-task-section"]}>
              <h4>Add Task</h4>
              <div className={styles["task-form"]}>
                <div className={styles["form-row"]}>
                  <select
                    value={newTask.type}
                    onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                    className={styles["form-input"]}
                    title="Select task type"
                  >
                    <option value="implementation">Implementation</option>
                    <option value="api-development">API Development</option>
                    <option value="ui-development">UI Development</option>
                    <option value="review">Review</option>
                    <option value="testing">Testing</option>
                    <option value="documentation">Documentation</option>
                    <option value="deployment">Deployment</option>
                    <option value="debugging">Debugging</option>
                    <option value="cleanup">Cleanup</option>
                  </select>
                </div>
                
                <div className={styles["form-row"]}>
                  <select
                    value={newTask.assignedAgent}
                    onChange={(e) => setNewTask({ ...newTask, assignedAgent: e.target.value })}
                    className={styles["form-input"]}
                    title="Select agent personality (required)"
                    required
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newTask.project}
                    onChange={(e) => setNewTask({ ...newTask, project: e.target.value })}
                    className={styles["form-input"]}
                    title="Target project"
                  >
                    <option value="app-monitor">app-monitor</option>
                    <option value="dev-bots">dev-bots</option>
                    <option value="job-finder-FE">job-finder-FE</option>
                    <option value="job-finder-BE">job-finder-BE</option>
                    <option value="job-finder-shared-types">job-finder-shared-types</option>
                    <option value="job-finder-worker">job-finder-worker</option>
                    <option value="docs">docs</option>
                    <option value="scripts">scripts</option>
                    <option value="infrastructure">infrastructure</option>
                  </select>
                </div>
                
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Task title (brief, specific)"
                  className={styles["form-input"]}
                />
                
                <textarea
                  value={newTask.documentation}
                  onChange={(e) => setNewTask({ ...newTask, documentation: e.target.value })}
                  placeholder="Documentation - what should the worker read before starting work (e.g., README files, API docs, architecture docs)"
                  className={styles["form-textarea"]}
                  rows={3}
                />
                
                <textarea
                  value={newTask.acceptanceCriteria}
                  onChange={(e) => setNewTask({ ...newTask, acceptanceCriteria: e.target.value })}
                  placeholder="Acceptance Criteria - what specifically qualifies as task complete (be explicit and measurable)"
                  className={styles["form-textarea"]}
                  rows={3}
                />
                
                <textarea
                  value={newTask.notes}
                  onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                  placeholder="Notes (optional) - additional context, assumptions, or considerations"
                  className={styles["form-textarea"]}
                  rows={2}
                />
                <div className={styles["form-actions"]}>
                  <button
                    onClick={addTask}
                    disabled={addingTask || !newTask.title.trim() || !newTask.documentation.trim() || !newTask.acceptanceCriteria.trim()}
                    className={styles["add-task-btn"]}
                  >
                    {addingTask ? 'Adding...' : 'Add Task'}
                  </button>
                  <button
                    onClick={triggerEmergencyRecovery}
                    className={styles["emergency-btn"]}
                    title="Trigger emergency recovery to clean up scope creep"
                  >
                    🚨 Emergency Recovery
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className={styles["tasks-section"]}>
            <h4>Task Queue</h4>
            
            {/* Pending Tasks */}
            {status?.tasks.pending && status.tasks.pending.length > 0 && (
              <div className={styles["task-group"]}>
                <h5>Pending ({status.tasks.pending.length})</h5>
                {status.tasks.pending.map((task) => (
                  <div key={task.id} className={`${styles['task-item']} ${styles.pending}`}>
                    <div className={styles["task-header"]}>
                      <span className={styles["task-id"]}>{task.id}</span>
                      <span 
                        className={styles["task-priority"]}
                        style={{ color: getPriorityColor(task.priority) }}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <div className={styles["task-description"]}>{task.description}</div>
                    <div className={styles["task-meta"]}>
                      Created: {formatTimestamp(task.createdAt)}
                      {task.scope && <span className={styles["scope-indicator"]}>🔒 Scoped</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active Tasks */}
            {status?.tasks.active && status.tasks.active.length > 0 && (
              <div className={styles["task-group"]}>
                <h5>Active ({status.tasks.active.length})</h5>
                {status.tasks.active.map((task) => (
                  <div key={task.id} className={`${styles['task-item']} ${styles.active}`}>
                    <div className={styles["task-header"]}>
                      <span className={styles["task-id"]}>{task.id}</span>
                      <span className={styles["task-worker"]}>{task.assignedWorker}</span>
                      {task.assignedAgent && (
                        <span className={styles["task-agent"]}>
                          🤖 {agents.find(a => a.id === task.assignedAgent)?.name || task.assignedAgent}
                        </span>
                      )}
                    </div>
                    <div className={styles["task-description"]}>{task.description}</div>
                    <div className={styles["task-meta"]}>
                      Started: {formatTimestamp(task.assignedAt || task.createdAt)}
                      {task.project && <span className={styles["project-indicator"]}>📁 {task.project}</span>}
                      {task.files && task.files.length > 0 && (
                        <span className={styles["files-indicator"]}>📄 {task.files.length} files</span>
                      )}
                      {task.isEmergency && <span className={styles["emergency-indicator"]}>🚨 Emergency</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Completed Tasks */}
            {status?.tasks.completed && status.tasks.completed.length > 0 && (
              <div className={styles["task-group"]}>
                <h5>Recent Completed ({status.tasks.completed.length})</h5>
                {status.tasks.completed.slice(-10).map((task) => (
                  <div key={task.id} className={`${styles['task-item']} ${styles.completed} ${getActivityClass(task) ? styles[getActivityClass(task)] : ''}`}>
                    <div className={styles["task-header"]}>
                      <span className={styles["task-id"]}>{task.id}</span>
                      <span 
                        className={styles["task-status"]}
                        style={{ color: getStatusColor(task.status) }}
                      >
                        {task.status}
                      </span>
                      {task.status === 'failed' && (
                        <div className={styles["retry-controls"]}>
                          <button 
                            className={styles["retry-button"]}
                            onClick={() => retryTask(task.id)}
                            title="Retry this failed task"
                          >
                            🔄 Retry
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles["task-description"]}>{task.description}</div>
                    <div className={styles["task-meta"]}>
                      Completed: {formatTimestamp(task.completedAt || task.createdAt)}
                      {task.scopeViolations && task.scopeViolations.length > 0 && (
                        <span className={styles["violation-indicator"]}>
                          ⚠️ {task.scopeViolations.length} violations
                        </span>
                      )}
                      {task.retryCount && task.retryCount > 0 && (
                        <span className={styles["retry-indicator"]}>
                          🔄 {task.retryCount} retries
                        </span>
                      )}
                      {task.error && (
                        <div className={styles["error-details"]}>
                          <details>
                            <summary>Error Details</summary>
                            <pre className={styles["error-text"]}>{task.error}</pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(!status?.tasks.pending?.length && !status?.tasks.active?.length && !status?.tasks.completed?.length) && (
              <div className={styles["no-tasks"]}>No tasks in queue</div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className={styles["metrics-section"]}>
            <h4>System Metrics</h4>
            
            {/* Metrics Grid */}
            <div className={styles["metrics-grid"]}>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{getTotalTasks()}</div>
                <div className={styles["metric-label"]}>Total Tasks</div>
              </div>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{status?.tasks.pending?.length || 0}</div>
                <div className={styles["metric-label"]}>Pending Tasks</div>
              </div>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{status?.tasks.active?.length || 0}</div>
                <div className={styles["metric-label"]}>Active Tasks</div>
              </div>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{status?.tasks.completed?.length || 0}</div>
                <div className={styles["metric-label"]}>Completed Tasks</div>
              </div>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{scopeViolations.length}</div>
                <div className={styles["metric-label"]}>Scope Violations</div>
              </div>
              <div className={styles["metric-card"]}>
                <div className={styles["metric-value"]}>{cleanupStatus?.totalCleanupTasks || 0}</div>
                <div className={styles["metric-label"]}>Cleanup Tasks</div>
              </div>
            </div>

            {/* Scope Violations */}
            {scopeViolations.length > 0 && (
              <div className={styles["violations-section"]}>
                <h5>Recent Scope Violations</h5>
                {scopeViolations.slice(-5).map((violation, index) => (
                  <div key={index} className={styles["violation-item"]}>
                    <div className={styles["violation-header"]}>
                      <span className={styles["violation-task"]}>{violation.taskId}</span>
                      <span className={styles["violation-count"]}>{violation.violations.length} violations</span>
                    </div>
                    <div className={styles["violation-details"]}>
                      {violation.violations.map((v, i) => (
                        <span key={i} className={`${styles['violation-type']} ${styles[v.severity.toLowerCase()]}`}>
                          {v.type} ({v.severity})
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Activity Log */}
            <div className={styles["activity-section"]}>
              <h5>Recent Activity</h5>
              <div className={styles["activity-log"]}>
                {status?.tasks.completed && status.tasks.completed.length > 0 ? (
                  status.tasks.completed.slice(-15).reverse().map((task) => {
                    const description = task.description.length > 100 
                      ? task.description.substring(0, 100) + '...' 
                      : task.description;
                    
                    return (
                      <div key={task.id} className={`${styles['activity-item']} ${getActivityClass(task) ? styles[getActivityClass(task)] : ''}`}>
                        <div className={styles["activity-header-info"]}>
                          <div className={styles["activity-type"]}>
                            {task.type.toUpperCase()}
                            {task.isPeriodicCleanup && ' - CLEANUP'}
                            {task.isEmergency && ' - EMERGENCY'}
                          </div>
                          <div className={styles["activity-time"]}>
                            {formatTimestamp(task.completedAt || task.createdAt)}
                          </div>
                        </div>
                        <div className={styles["activity-description"]}>{description}</div>
                        <div className={styles["activity-meta"]}>
                          Worker: {task.assignedWorker || 'Unassigned'} | 
                          Status: {task.status} | 
                          Priority: {task.priority || 'medium'}
                          {task.scopeViolations && ` | Violations: ${task.scopeViolations.length}`}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles["no-activity"]}>No recent activity</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cleanup Tab */}
        {activeTab === 'cleanup' && (
          <div className={styles["cleanup-section"]}>
            <h4>Cleanup Management</h4>
            
            {/* Cleanup Actions */}
            <div className={styles["cleanup-actions"]}>
              <h5>Trigger Cleanup Tasks</h5>
              <div className={styles["cleanup-buttons"]}>
                <button 
                  onClick={() => triggerCleanup('linting')}
                  className={styles["cleanup-btn"]}
                >
                  🧹 Linting Cleanup
                </button>
                <button 
                  onClick={() => triggerCleanup('deduplication')}
                  className={styles["cleanup-btn"]}
                >
                  🔄 Deduplication
                </button>
                <button 
                  onClick={() => triggerCleanup('documentation')}
                  className={styles["cleanup-btn"]}
                >
                  📚 Documentation
                </button>
                <button 
                  onClick={() => triggerCleanup('testing')}
                  className={styles["cleanup-btn"]}
                >
                  🧪 Testing
                </button>
                <button 
                  onClick={() => triggerCleanup('deepCleanup')}
                  className={styles["cleanup-btn"]}
                >
                  🗑️ Deep Cleanup
                </button>
              </div>
            </div>

            {/* Cleanup Status */}
            {cleanupStatus && (
              <div className={styles["cleanup-status"]}>
                <h5>Cleanup Status</h5>
                <div className={styles["cleanup-info"]}>
                  <div className={styles["cleanup-item"]}>
                    <span className={styles["label"]}>Total Cleanup Tasks:</span>
                    <span className={styles["value"]}>{cleanupStatus.totalCleanupTasks}</span>
                  </div>
                  <div className={styles["cleanup-item"]}>
                    <span className={styles["label"]}>Due Schedules:</span>
                    <span className={styles["value"]}>{cleanupStatus.schedules.length}</span>
                  </div>
                </div>
                
                {cleanupStatus.schedules.length > 0 && (
                  <div className={styles["due-schedules"]}>
                    <h6>Due Schedules:</h6>
                    <ul>
                      {cleanupStatus.schedules.map((schedule, index) => (
                        <li key={index}>{schedule}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {cleanupStatus.recentTasks.length > 0 && (
                  <div className={styles["recent-cleanup-tasks"]}>
                    <h6>Recent Cleanup Tasks:</h6>
                    {cleanupStatus.recentTasks.slice(-5).map((task) => (
                      <div key={task.id} className={styles["cleanup-task-item"]}>
                        <div className={styles["task-header"]}>
                          <span className={styles["task-id"]}>{task.id}</span>
                          <span className={styles["task-status"]}>{task.status}</span>
                        </div>
                        <div className={styles["task-description"]}>{task.description}</div>
                        <div className={styles["task-meta"]}>
                          {formatTimestamp(task.completedAt || task.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className={styles["agents-section"]}>
            <h4>Agent Personalities</h4>
            <div className={styles["agents-grid"]}>
              {agents.map((agent) => (
                <div key={agent.id} className={styles["agent-card"]}>
                  <div className={styles["agent-header"]}>
                    <h5>{agent.name}</h5>
                    <span className={styles["agent-role"]}>{agent.role}</span>
                  </div>
                  <p className={styles["agent-description"]}>{agent.description}</p>
                  
                  <div className={styles["agent-specialties"]}>
                    <h6>Specialties:</h6>
                    <div className={styles["specialty-tags"]}>
                      {agent.specialties.map((specialty) => (
                        <span key={specialty} className={styles["specialty-tag"]}>
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={styles["agent-expertise"]}>
                    <h6>Primary Skills:</h6>
                    <div className={styles["skill-tags"]}>
                      {agent.expertise.primary.map((skill) => (
                        <span key={skill} className={styles["skill-tag"]}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={styles["agent-personality"]}>
                    <div className={styles["personality-item"]}>
                      <span className={styles["label"]}>Approach:</span>
                      <span className={styles["value"]}>{agent.personality.approach}</span>
                    </div>
                    <div className={styles["personality-item"]}>
                      <span className={styles["label"]}>Focus:</span>
                      <span className={styles["value"]}>{agent.personality.focus}</span>
                    </div>
                    <div className={styles["personality-item"]}>
                      <span className={styles["label"]}>Style:</span>
                      <span className={styles["value"]}>{agent.personality.communicationStyle}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className={styles["templates-section"]}>
            <h4>Task Templates</h4>
            <div className={styles["templates-list"]}>
              {templates.map((template) => (
                <div key={template.id} className={styles["template-card"]}>
                  <div className={styles["template-header"]}>
                    <h5>{template.name}</h5>
                    <span className={styles["template-id"]}>{template.id}</span>
                  </div>
                  <p className={styles["template-description"]}>{template.description}</p>
                  
                  <div className={styles["template-details"]}>
                    <div className={styles["template-item"]}>
                      <span className={styles["label"]}>Task Types:</span>
                      <div className={styles["type-tags"]}>
                        {template.taskTypes.map((type) => (
                          <span key={type} className={styles["type-tag"]}>
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className={styles["template-item"]}>
                      <span className={styles["label"]}>Agent Types:</span>
                      <div className={styles["agent-tags"]}>
                        {template.agentTypes.map((agentType) => (
                          <span key={agentType} className={styles["agent-tag"]}>
                            {agentType}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retry Configuration Tab - Removed */}
        {false && (
          <div className={styles["retry-section"]}>
            <h4>Retry Configuration</h4>
            
            <div className={styles["retry-config-grid"]}>
              <div className={styles["config-card"]}>
                <h5>Retry Settings</h5>
                <div className={styles["config-form"]}>
                  <div className={styles["form-group"]}>
                    <label>Max Retries</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="10" 
                      defaultValue="3"
                      className={styles["config-input"]}
                    />
                  </div>
                  <div className={styles["form-group"]}>
                    <label>Base Delay (seconds)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="300" 
                      defaultValue="5"
                      className={styles["config-input"]}
                    />
                  </div>
                  <div className={styles["form-group"]}>
                    <label>Max Delay (minutes)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="60" 
                      defaultValue="5"
                      className={styles["config-input"]}
                    />
                  </div>
                  <div className={styles["form-group"]}>
                    <label>Retry Strategy</label>
                    <select className={styles["config-select"]} defaultValue="exponential">
                      <option value="immediate">Immediate</option>
                      <option value="linear">Linear</option>
                      <option value="exponential">Exponential</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <div className={styles["form-group"]}>
                    <label>
                      <input type="checkbox" defaultChecked />
                      Enable Auto Retry
                    </label>
                  </div>
                </div>
              </div>

              <div className={styles["config-card"]}>
                <h5>Error Classification</h5>
                <div className={styles["error-lists"]}>
                  <div className={styles["error-group"]}>
                    <h6>Retryable Errors</h6>
                    <textarea 
                      className={styles["error-textarea"]}
                      defaultValue="timeout, connection, network, temporary, rate limit, service unavailable"
                      placeholder="Comma-separated error patterns"
                    />
                  </div>
                  <div className={styles["error-group"]}>
                    <h6>Non-Retryable Errors</h6>
                    <textarea 
                      className={styles["error-textarea"]}
                      defaultValue="permission denied, authentication, authorization, invalid input, syntax error, not found"
                      placeholder="Comma-separated error patterns"
                    />
                  </div>
                </div>
              </div>

              <div className={styles["config-card"]}>
                <h5>Retry Statistics</h5>
                <div className={styles["stats-grid"]}>
                  <div className={styles["stat-item"]}>
                    <span className={styles["stat-label"]}>Total Retries:</span>
                    <span className={styles["stat-value"]}>0</span>
                  </div>
                  <div className={styles["stat-item"]}>
                    <span className={styles["stat-label"]}>Successful Retries:</span>
                    <span className={styles["stat-value"]}>0</span>
                  </div>
                  <div className={styles["stat-item"]}>
                    <span className={styles["stat-label"]}>Failed Retries:</span>
                    <span className={styles["stat-value"]}>0</span>
                  </div>
                  <div className={styles["stat-item"]}>
                    <span className={styles["stat-label"]}>Scheduled Retries:</span>
                    <span className={styles["stat-value"]}>0</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles["retry-actions"]}>
              <button className={styles["save-config-btn"]}>
                💾 Save Configuration
              </button>
              <button className={styles["reset-config-btn"]}>
                🔄 Reset to Defaults
              </button>
              <button className={styles["test-retry-btn"]}>
                🧪 Test Retry Logic
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
