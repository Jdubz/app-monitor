import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  ClipboardPlus,
  FileText,
  ListChecks,
  Loader2,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Users,
} from 'lucide-react';
import { Socket } from 'socket.io-client';

import { api } from '../services/api';
import StatusBadge from './StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { LogLevel } from '../types/log.types';

const PRIORITY_THRESHOLDS = {
  HIGH: 8,
  MEDIUM: 5,
  LOW_MEDIUM: 3,
} as const;

type PriorityVariant = 'destructive' | 'warning' | 'info' | 'outline';

interface Task {
  id: string;
  type: string;
  description: string;
  status: 'pending' | 'assigned' | 'active' | 'completed' | 'failed';
  createdAt: string;
  assignedWorker?: string;
  assignedAgent: string;
  assignedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  exitCode?: number;
  prompt?: string;
  files?: string[];
  dependencies?: string[];
  project?: string;
  priority?: number;
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

type DevBotsTab = 'overview' | 'tasks' | 'metrics' | 'cleanup' | 'agents' | 'templates';

const formatTimestamp = (timestamp: string | number | undefined) => {
  if (!timestamp) return 'Unknown';
  const value = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  if (Number.isNaN(value)) return 'Unknown';
  return new Date(value).toLocaleString();
};

const formatRelativeTime = (timestamp: number) => {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatUptime = (seconds: number) => {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
};

const getPriorityVariant = (priority: number | undefined): { variant: PriorityVariant; label: string } => {
  if (priority === undefined) {
    return { variant: 'outline', label: 'Unprioritized' };
  }

  if (priority >= PRIORITY_THRESHOLDS.HIGH) {
    return { variant: 'destructive', label: `Priority ${priority}` };
  }

  if (priority >= PRIORITY_THRESHOLDS.MEDIUM) {
    return { variant: 'warning', label: `Priority ${priority}` };
  }

  if (priority >= PRIORITY_THRESHOLDS.LOW_MEDIUM) {
    return { variant: 'info', label: `Priority ${priority}` };
  }

  return { variant: 'outline', label: `Priority ${priority}` };
};

const getTaskStatusVariant = (status: Task['status']): PriorityVariant => {
  switch (status) {
    case 'failed':
      return 'destructive';
    case 'completed':
      return 'info';
    case 'active':
    case 'assigned':
      return 'warning';
    default:
      return 'outline';
  }
};

const mapWorkerStatusToBadge = (status: WorkerStatus['status']): {
  badgeStatus: 'running' | 'stopped' | 'busy' | LogLevel;
  label: string;
} => {
  switch (status) {
    case 'busy':
      return { badgeStatus: 'busy', label: 'Busy' };
    case 'stopped':
      return { badgeStatus: 'stopped', label: 'Stopped' };
    default:
      return { badgeStatus: 'running', label: 'Idle' };
  }
};

export const DevBotsPanel: React.FC<DevBotsPanelProps> = ({
  serviceName: _serviceName,
  onStatusChange,
  socket,
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
    assignedAgent: 'backend-specialist',
  });
  const [addingTask, setAddingTask] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [scopeViolations, setScopeViolations] = useState<ScopeViolation[]>([]);
  const [cleanupStatus, setCleanupStatus] = useState<CleanupStatus | null>(null);
  const [activeTab, setActiveTab] = useState<DevBotsTab>('overview');
  const [agents, setAgents] = useState<AgentPersonality[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      console.log('[DevBotsPanel] Fetching status from /dev-bots/status');
      const [
        statusResponse,
        violationsResponse,
        cleanupResponse,
        agentsResponse,
        templatesResponse,
      ] = await Promise.all([
        api.get<DevBotsStatus>('/dev-bots/status'),
        api
          .get<{ violations: ScopeViolation[] }>('/dev-bots/scope-violations')
          .catch(() => ({ violations: [] as ScopeViolation[] })),
        api
          .get<CleanupStatus>('/dev-bots/cleanup-status')
          .catch(() => ({
            schedules: [],
            recentTasks: [],
            totalCleanupTasks: 0,
          })),
        api
          .get<{ agents: AgentPersonality[] }>('/dev-bots/agents')
          .catch(() => ({ agents: [] as AgentPersonality[] })),
        api
          .get<{ templates: TaskTemplate[] }>('/dev-bots/templates')
          .catch(() => ({ templates: [] as TaskTemplate[] })),
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
        code: err.code,
      });
      const errorMessage =
        err.error || err.response?.data?.error || err.message || 'Failed to fetch status';
      setError(errorMessage);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim() || !newTask.documentation.trim() || !newTask.acceptanceCriteria.trim()) {
      return;
    }

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
        assignedAgent: 'backend-specialist',
      });
      await fetchStatus();
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
      interval = setInterval(fetchStatus, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  useEffect(() => {
    if (!socket) return;

    const handleTaskAdded = (task: Task) => {
      console.log('Task added:', task);
      fetchStatus();
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

    socket.on('claude:taskAdded', handleTaskAdded);
    socket.on('claude:taskAssigned', handleTaskAssigned);
    socket.on('claude:taskStarted', handleTaskStarted);
    socket.on('claude:taskCompleted', handleTaskCompleted);
    socket.on('claude:taskFailed', handleTaskFailed);
    socket.on('claude:systemStatusChange', handleSystemStatusChange);
    socket.on('claude:coordinatorHealthChange', handleCoordinatorHealthChange);

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

  const workers = useMemo(
    () => (status ? Object.values(status.workers ?? {}) : []),
    [status],
  );

  const pendingTasks = status?.tasks.pending ?? [];
  const activeTasks = status?.tasks.active ?? [];
  const completedTasks = status?.tasks.completed ?? [];

  const getTotalTasks = () => {
    if (!status) return 0;
    return (
      (status.tasks.pending?.length || 0) +
      (status.tasks.active?.length || 0) +
      (status.tasks.completed?.length || 0)
    );
  };

  if (loading && !status) {
    return (
      <Card className="h-full border border-border/60 bg-card/70 text-foreground shadow-xl">
        <CardHeader>
          <CardTitle>🤖 Dev-Bots</CardTitle>
          <CardDescription>Automation control center</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading dev-bot status…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !status) {
    return (
      <Card className="h-full border border-destructive/40 bg-card/70 text-foreground shadow-xl">
        <CardHeader>
          <CardTitle>🤖 Dev-Bots</CardTitle>
          <CardDescription>Automation control center</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-10">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
          <Button variant="outline" onClick={fetchStatus}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col border border-border/60 bg-card/70 text-foreground shadow-xl">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 bg-card/80 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-xl font-semibold tracking-tight">🤖 Dev-Bots (Ephemeral)</CardTitle>
          <CardDescription className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
            Automation pipeline status & controls
          </CardDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
            <span>
              Queue:{' '}
              <span className="font-semibold text-foreground">
                {status?.queueSize ?? 0}
              </span>
            </span>
            <span>
              Active:{' '}
              <span className="font-semibold text-foreground">
                {status?.activeTasks ?? 0}
              </span>
            </span>
            <span>
              Workers:{' '}
              <span className="font-semibold text-foreground">
                {status?.workerCount ?? 0}/{status?.maxWorkers ?? 0}
              </span>
            </span>
            <span>
              Uptime:{' '}
              <span className="font-semibold text-foreground">
                {formatUptime(status?.uptime ?? 0)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              status?.systemStatus === 'running'
                ? 'success'
                : status?.systemStatus === 'stopped'
                ? 'outline'
                : 'destructive'
            }
            className="gap-1 text-[11px]"
          >
            <Activity className="h-3 w-3" />
            {status?.systemStatus?.toUpperCase() ?? 'UNKNOWN'}
          </Badge>
          <Button
            type="button"
            variant={autoRefresh ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-2"
          >
            {autoRefresh ? (
              <>
                <PauseCircle className="h-4 w-4" />
                Auto-refresh on
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Auto-refresh off
              </>
            )}
          </Button>
          <Button
            type="button"
            variant={status?.systemStatus === 'running' ? 'destructive' : 'default'}
            size="sm"
            onClick={status?.systemStatus === 'running' ? stopSystem : startSystem}
            className="gap-2"
          >
            {status?.systemStatus === 'running' ? (
              <>
                <Square className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      {error && status && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <CardContent className="flex flex-1 flex-col overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as DevBotsTab)}
          className="flex h-full flex-col"
        >
          <TabsList className="flex flex-wrap items-center justify-start gap-2 bg-card/80">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <ClipboardPlus className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="cleanup" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Cleanup
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Bot className="h-4 w-4" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 flex-1 overflow-hidden">
            <TabsContent
              value="overview"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Queue Size
                    <ListChecks className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {status?.queueSize ?? 0}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    {pendingTasks.length} pending / {activeTasks.length} active
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Throughput
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {completedTasks.length}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    Completed records (recent window)
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Workers Online
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {workers.length}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    {status?.activeWorkerTypes?.join(', ') || 'No active worker types'}
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Scope Alerts
                    <AlertTriangle className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {scopeViolations.length}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    Violations recorded across recent runs
                  </p>
                </div>
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-2">
                <div className="flex h-full flex-col rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Worker Status
                    </h4>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.3em]">
                      {workers.length} online
                    </Badge>
                  </div>
                  <Separator className="my-3 opacity-50" />
                  <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-3 pr-3">
                      {workers.length === 0 && (
                        <div className="rounded-lg border border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                          No workers currently connected.
                        </div>
                      )}
                      {workers.map((worker) => {
                        const { badgeStatus, label } = mapWorkerStatusToBadge(worker.status);
                        return (
                          <div
                            key={worker.id}
                            className="rounded-lg border border-border/60 bg-background/60 p-4 shadow-sm transition hover:border-primary/50"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {worker.personality?.name || worker.id}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {worker.personality?.role || worker.personality?.description || 'Ephemeral worker'}
                                </p>
                              </div>
                              <StatusBadge status={badgeStatus as any} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                              <span>Mode: {label}</span>
                              <span>
                                Last seen: {formatRelativeTime(worker.lastSeen)}
                              </span>
                              {worker.currentTask && <span>Task: {worker.currentTask}</span>}
                              {worker.onboardingComplete === false && (
                                <span className="text-warning-foreground">Onboarding incomplete</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                <div className="flex h-full flex-col rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Scope & Activity
                    </h4>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.3em]">
                      {getTotalTasks()} total tasks
                    </Badge>
                  </div>
                  <Separator className="my-3 opacity-50" />
                  <div className="flex flex-col gap-4">
                    <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                        Recent Scope Violations
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {scopeViolations.length === 0 && (
                          <p className="text-xs text-muted-foreground">No violations recorded.</p>
                        )}
                        {scopeViolations.slice(-5).map((violation) => (
                          <div
                            key={violation.taskId}
                            className="rounded-md border border-border/60 bg-muted/10 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-3 text-muted-foreground/80">
                              <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
                                {violation.taskId}
                              </span>
                              <Badge variant="destructive" className="text-[10px]">
                                {violation.violations.length} issues
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {violation.violations.map((v, index) => (
                                <Badge
                                  key={`${violation.taskId}-${index}`}
                                  variant={v.severity === 'critical' ? 'destructive' : 'warning'}
                                  className="text-[10px]"
                                >
                                  {v.type} ({v.severity})
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                        Recent Completions
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {completedTasks.length === 0 && (
                          <p className="text-xs text-muted-foreground">No recent completions logged.</p>
                        )}
                        {completedTasks.slice(-8).reverse().map((task) => (
                          <div
                            key={`${task.id}-activity`}
                            className="rounded-md border border-border/60 bg-muted/10 p-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
                                {task.id}
                              </span>
                              <Badge variant={getTaskStatusVariant(task.status)} className="text-[10px]">
                                {task.status.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-foreground">
                              {task.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground/80">
                              <span>{task.assignedWorker || 'Unassigned'}</span>
                              <span>{formatTimestamp(task.completedAt || task.createdAt)}</span>
                              {task.priority !== undefined && (
                                <Badge variant={getPriorityVariant(task.priority).variant} className="text-[10px]">
                                  {getPriorityVariant(task.priority).label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="tasks"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <div className="rounded-xl border border-border/60 bg-muted/10 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Add Task
                    </h4>
                    <p className="text-xs text-muted-foreground/80">
                      Provide thorough documentation and explicit acceptance criteria.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={triggerEmergencyRecovery}
                    className="gap-2"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Emergency Recovery
                  </Button>
                </div>
                <Separator className="my-4 opacity-40" />
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Task Type
                      <select
                        value={newTask.type}
                        onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                        className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                    </label>

                    <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Assign Agent
                      <select
                        value={newTask.assignedAgent}
                        onChange={(e) => setNewTask({ ...newTask, assignedAgent: e.target.value })}
                        className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Target Project
                      <select
                        value={newTask.project}
                        onChange={(e) => setNewTask({ ...newTask, project: e.target.value })}
                        className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="app-monitor">app-monitor</option>
                        <option value="dev-bots">dev-bots</option>
                        <option value="job-finder-FE">job-finder-FE</option>
                        <option value="job-finder-BE">job-finder-BE</option>
                        <option value="job-finder-shared-types">job-finder-shared-types</option>
                        <option value="job-finder-worker">job-finder-worker</option>
                        <option value="docs">docs</option>
                        <option value="infrastructure">infrastructure</option>
                      </select>
                    </label>

                    <Input
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="Task title (concise and specific)"
                      className="bg-background/80 text-sm"
                    />
                  </div>

                  <div className="grid gap-3">
                    <textarea
                      value={newTask.documentation}
                      onChange={(e) => setNewTask({ ...newTask, documentation: e.target.value })}
                      placeholder="Documentation: reference materials, architecture docs, onboarding, etc."
                      rows={3}
                      className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <textarea
                      value={newTask.acceptanceCriteria}
                      onChange={(e) => setNewTask({ ...newTask, acceptanceCriteria: e.target.value })}
                      placeholder="Acceptance criteria: define successful completion explicitly."
                      rows={3}
                      className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <textarea
                      value={newTask.notes}
                      onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                      placeholder="Notes (optional): extra context, known pitfalls, assumptions."
                      rows={2}
                      className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="default"
                    onClick={addTask}
                    disabled={
                      addingTask ||
                      !newTask.title.trim() ||
                      !newTask.documentation.trim() ||
                      !newTask.acceptanceCriteria.trim()
                    }
                    className="gap-2"
                  >
                    {addingTask ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding…
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add Task
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 rounded-xl border border-border/60 bg-muted/10 p-5">
                <div className="flex flex-col gap-6 pr-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Pending ({pendingTasks.length})
                    </h4>
                    <div className="mt-3 grid gap-3">
                      {pendingTasks.length === 0 && (
                        <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                          No pending tasks.
                        </div>
                      )}
                      {pendingTasks.map((task) => {
                        const { variant, label } = getPriorityVariant(task.priority);
                        return (
                          <div
                            key={task.id}
                            className="rounded-lg border border-border/60 bg-background/60 p-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">
                                {task.id}
                              </span>
                              <Badge variant={variant} className="text-[10px]">
                                {label}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-foreground">{task.description}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground/80">
                              <span>Created {formatTimestamp(task.createdAt)}</span>
                              {task.scope && <span className="text-warning-foreground">Scoped</span>}
                              {task.project && <span>Project: {task.project}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Active ({activeTasks.length})
                    </h4>
                    <div className="mt-3 grid gap-3">
                      {activeTasks.length === 0 && (
                        <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                          No active tasks.
                        </div>
                      )}
                      {activeTasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-lg border border-border/60 bg-background/60 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">
                              {task.id}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {task.assignedWorker && (
                                <Badge variant="outline" className="text-[10px]">
                                  {task.assignedWorker}
                                </Badge>
                              )}
                              {task.assignedAgent && (
                                <Badge variant="info" className="text-[10px]">
                                  {task.assignedAgent}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-foreground">{task.description}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground/80">
                            <span>Started {formatTimestamp(task.assignedAt || task.createdAt)}</span>
                            {task.project && <span>Project: {task.project}</span>}
                            {task.files && task.files.length > 0 && <span>Files: {task.files.length}</span>}
                            {task.isEmergency && (
                              <Badge variant="destructive" className="text-[10px]">
                                Emergency
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Recent Completed ({completedTasks.length})
                    </h4>
                    <div className="mt-3 grid gap-3">
                      {completedTasks.length === 0 && (
                        <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                          No completed tasks recorded yet.
                        </div>
                      )}
                      {completedTasks.slice(-12).map((task) => (
                        <div
                          key={task.id}
                          className="rounded-lg border border-border/60 bg-background/60 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">
                              {task.id}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge variant={getTaskStatusVariant(task.status)} className="text-[10px]">
                                {task.status.toUpperCase()}
                              </Badge>
                              {task.status === 'failed' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => retryTask(task.id)}
                                  className="gap-2 text-[11px]"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Retry
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-foreground">{task.description}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground/80">
                            <span>Completed {formatTimestamp(task.completedAt || task.createdAt)}</span>
                            {task.priority !== undefined && (
                              <Badge variant={getPriorityVariant(task.priority).variant} className="text-[10px]">
                                {getPriorityVariant(task.priority).label}
                              </Badge>
                            )}
                            {task.scopeViolations && task.scopeViolations.length > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                Violations: {task.scopeViolations.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="metrics"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: 'Total Tasks', value: getTotalTasks() },
                  { label: 'Pending', value: pendingTasks.length },
                  { label: 'Active', value: activeTasks.length },
                  { label: 'Completed', value: completedTasks.length },
                  { label: 'Scope Violations', value: scopeViolations.length },
                  { label: 'Cleanup Tasks', value: cleanupStatus?.totalCleanupTasks ?? 0 },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{metric.label}</p>
                    <div className="mt-3 text-3xl font-semibold text-foreground">{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-2">
                <div className="flex flex-col rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Recent Scope Violations
                  </h4>
                  <Separator className="my-3 opacity-40" />
                  <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-3 pr-3">
                      {scopeViolations.length === 0 && (
                        <p className="text-xs text-muted-foreground">No scope violations recorded.</p>
                      )}
                      {scopeViolations.slice(-8).map((violation) => (
                        <div
                          key={`metric-${violation.taskId}`}
                          className="rounded-lg border border-border/60 bg-background/60 p-4 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
                              {violation.taskId}
                            </span>
                            <Badge variant="destructive" className="text-[10px]">
                              {violation.violations.length} issues
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {violation.violations.map((v, index) => (
                              <Badge
                                key={`${violation.taskId}-metric-${index}`}
                                variant={v.severity === 'critical' ? 'destructive' : 'warning'}
                                className="text-[10px]"
                              >
                                {v.type} ({v.severity})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="flex flex-col rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Recent Activity
                  </h4>
                  <Separator className="my-3 opacity-40" />
                  <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-3 pr-3">
                      {completedTasks.length === 0 && (
                        <p className="text-xs text-muted-foreground">No task activity recorded.</p>
                      )}
                      {completedTasks.slice(-15).reverse().map((task) => (
                        <div
                          key={`metrics-activity-${task.id}`}
                          className="rounded-lg border border-border/60 bg-background/60 p-4 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
                              {task.type.toUpperCase()}
                            </span>
                            <span className="text-muted-foreground/70">
                              {formatTimestamp(task.completedAt || task.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-foreground">{task.description}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground/80">
                            <span>Worker: {task.assignedWorker || 'Unassigned'}</span>
                            <span>Status: {task.status}</span>
                            <span>Priority: {task.priority ?? 'n/a'}</span>
                            {task.scopeViolations && task.scopeViolations.length > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                Violations: {task.scopeViolations.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="cleanup"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <div className="rounded-xl border border-border/60 bg-muted/10 p-5 shadow-sm">
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Cleanup Actions
                </h4>
                <p className="mt-2 text-xs text-muted-foreground/80">
                  Trigger targeted cleanups to reduce noise for future runs.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {[
                    { type: 'linting', label: 'Linting Cleanup', icon: <Sparkles className="h-4 w-4" /> },
                    { type: 'deduplication', label: 'Deduplication', icon: <RefreshCw className="h-4 w-4" /> },
                    { type: 'documentation', label: 'Documentation', icon: <FileText className="h-4 w-4" /> },
                    { type: 'testing', label: 'Testing', icon: <ShieldAlert className="h-4 w-4" /> },
                    { type: 'deepCleanup', label: 'Deep Cleanup', icon: <AlertTriangle className="h-4 w-4" /> },
                  ].map((action) => (
                    <Button
                      key={action.type}
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => triggerCleanup(action.type)}
                    >
                      {action.icon}
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex-1 rounded-xl border border-border/60 bg-muted/10 p-5 shadow-sm">
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Cleanup Status
                </h4>
                <Separator className="my-3 opacity-40" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                      Total Cleanup Tasks
                    </p>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {cleanupStatus?.totalCleanupTasks ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                      Due Schedules
                    </p>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {cleanupStatus?.schedules.length ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h5 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                      Scheduled Runs
                    </h5>
                    <div className="mt-2 flex flex-col gap-2">
                      {(cleanupStatus?.schedules.length ?? 0) === 0 && (
                        <p className="text-xs text-muted-foreground">No cleanup schedules pending.</p>
                      )}
                      {cleanupStatus?.schedules.map((schedule, index) => (
                        <div
                          key={`schedule-${index}`}
                          className="rounded-md border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground/80"
                        >
                          {schedule}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
                      Recent Cleanup Tasks
                    </h5>
                    <div className="mt-2 flex flex-col gap-3">
                      {(cleanupStatus?.recentTasks.length ?? 0) === 0 && (
                        <p className="text-xs text-muted-foreground">No cleanup history available.</p>
                      )}
                      {cleanupStatus?.recentTasks.slice(-6).map((task) => (
                        <div
                          key={`cleanup-task-${task.id}`}
                          className="rounded-md border border-border/60 bg-background/60 p-4 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
                              {task.id}
                            </span>
                            <Badge variant={getTaskStatusVariant(task.status)} className="text-[10px]">
                              {task.status}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-foreground">{task.description}</p>
                          <span className="mt-2 block text-[11px] text-muted-foreground/80">
                            {formatTimestamp(task.completedAt || task.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="agents"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <ScrollArea className="flex-1 rounded-xl border border-border/60 bg-muted/10 p-5">
                <div className="grid gap-4 pr-3 lg:grid-cols-2">
                  {agents.length === 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
                      No agent personalities registered.
                    </div>
                  )}
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/60 p-4 text-sm shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-base font-semibold text-foreground">{agent.name}</h4>
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            {agent.role}
                          </p>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
                          {agent.id}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground/90">{agent.description}</p>
                      <div className="grid gap-2 text-xs text-muted-foreground/80">
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Primary:</span>
                          {agent.expertise.primary.map((item) => (
                            <Badge key={item} variant="info" className="text-[10px]">
                              {item}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Secondary:</span>
                          {agent.expertise.secondary.map((item) => (
                            <Badge key={item} variant="outline" className="text-[10px]">
                              {item}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Tools:</span>
                          {agent.expertise.tools.map((item) => (
                            <Badge key={item} variant="outline" className="text-[10px]">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Separator className="opacity-40" />
                      <div className="grid gap-2 text-xs text-muted-foreground/80">
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Communication:</span>
                          <Badge variant="outline" className="text-[10px]">
                            {agent.personality.communicationStyle}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Approach:</span>
                          <Badge variant="outline" className="text-[10px]">
                            {agent.personality.approach}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-semibold text-foreground">Focus:</span>
                          <Badge variant="outline" className="text-[10px]">
                            {agent.personality.focus}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="templates"
              className="flex h-full flex-col gap-6 overflow-hidden border-none bg-transparent p-0"
            >
              <ScrollArea className="flex-1 rounded-xl border border-border/60 bg-muted/10 p-5">
                <div className="grid gap-4 pr-3 lg:grid-cols-2">
                  {templates.length === 0 && (
                    <div className="rounded-lg border border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
                      No task templates defined yet.
                    </div>
                  )}
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/60 p-4 text-sm shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-base font-semibold text-foreground">{template.name}</h4>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
                          {template.id}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground/90">{template.description}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                        <span className="font-semibold text-foreground">Task Types:</span>
                        {template.taskTypes.map((type) => (
                          <Badge key={`${template.id}-${type}`} variant="info" className="text-[10px]">
                            {type}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                        <span className="font-semibold text-foreground">Agent Types:</span>
                        {template.agentTypes.map((type) => (
                          <Badge key={`${template.id}-agent-${type}`} variant="outline" className="text-[10px]">
                            {type}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                        <span className="font-semibold text-foreground">Variables:</span>
                        {template.variables.map((variable) => (
                          <Badge key={`${template.id}-var-${variable}`} variant="outline" className="text-[10px]">
                            {variable}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                        <span className="font-semibold text-foreground">Validation:</span>
                        {template.validationRules.map((rule) => (
                          <Badge key={`${template.id}-rule-${rule}`} variant="outline" className="text-[10px]">
                            {rule}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DevBotsPanel;
