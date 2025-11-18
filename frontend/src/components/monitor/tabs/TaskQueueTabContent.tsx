import { useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useDevBotsStore } from '@/contexts/devBotsStore';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DevBotsTask } from '@/types/dev-bots';
import { getTaskStatusIcon, getTaskStatusColor } from '@/utils/statusHelpers';
import { useListSelection } from '@/hooks/common';
import { PhaseBadge, PhaseProgressBar } from '@/components/dev-bots/queue/PhaseProgress';
import { TaskPhaseHistory } from '@/components/dev-bots/tasks/TaskPhaseHistory';
import { usePhaseUpdates } from '@/hooks/usePhaseUpdates';

type QueueFilter = 'pending' | 'active' | 'completed' | 'failed';

/**
 * TaskQueueTabContent - Task queue monitoring using dev-bots store
 *
 * Displays task queue with:
 * - Summary metrics (pending, active, completed, failed)
 * - Filterable list by status
 * - Detail view with task metadata
 */
export function TaskQueueTabContent() {
  const { queueRows, status, isLoading } = useDevBotsStore();
  const [activeFilter, setActiveFilter] = useState<QueueFilter>('pending');

  const tasks = useMemo(() => {
    return queueRows.map((row) => row.task);
  }, [queueRows]);

  // Use list selection hook for consistent auto-selection behavior
  const { selectedItem: selectedTask, selectItem: selectTask } = useListSelection(
    tasks,
    (task) => task.id,
    { autoSelectFirst: true }
  );

  // Subscribe to live phase updates for selected task
  const livePhase = usePhaseUpdates(selectedTask?.id);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => task.status === activeFilter);
  }, [tasks, activeFilter]);

  // Summary cards
  const summaryCards = useMemo(() => {
    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const activeCount = tasks.filter((t) => t.status === 'active').length;
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;

    return [
      { label: 'Pending', value: pendingCount, className: 'text-blue-600' },
      { label: 'Active', value: activeCount, className: 'text-green-600' },
      { label: 'Completed', value: completedCount, className: 'text-gray-600' },
      { label: 'Failed', value: failedCount, className: failedCount > 0 ? 'text-red-600' : '' },
    ];
  }, [tasks]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const activeCount = tasks.filter((t) => t.status === 'active').length;
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;

    return [
      { value: 'pending' as const, label: 'Pending', count: pendingCount },
      { value: 'active' as const, label: 'Active', count: activeCount },
      { value: 'completed' as const, label: 'Completed', count: completedCount },
      { value: 'failed' as const, label: 'Failed', count: failedCount },
    ];
  }, [tasks]);

  // Render list item
  const renderListItem = (task: DevBotsTask, _isSelected: boolean) => {
    const statusIcon = getTaskStatusIcon(task.status);
    const statusColor = getTaskStatusColor(task.status);

    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-sm font-medium">{task.type}</span>
            <Badge variant="outline" className={cn('text-xs capitalize', statusColor)}>
              {task.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description || 'No description'}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
            {task.assignedAgent && (
              <>
                <span>•</span>
                <span>{task.assignedAgent}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render detail pane
  const renderDetail = (task: DevBotsTask | null) => {
    if (!task) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No Task Selected</CardTitle>
            <CardDescription>Select a task from the list to view details</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Task Details</span>
              <Badge variant="outline" className="capitalize">
                {task.status}
              </Badge>
            </CardTitle>
            <CardDescription>ID: {task.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phase Progress */}
            {task.phaseIndex && task.phaseName && (
              <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                <h4 className="text-sm font-semibold">Current Phase</h4>
                <PhaseBadge
                  phaseIndex={task.phaseIndex}
                  phaseName={task.phaseName}
                  phaseStatus={task.phaseStatus}
                  phaseAttempts={task.phaseAttempts}
                />
                <PhaseProgressBar currentPhase={task.phaseIndex} />
                
                {/* Live status indicators */}
                {livePhase && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {livePhase.status === 'validating' && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        <span className="text-amber-500">Validating phase {livePhase.phase}...</span>
                      </>
                    )}
                    {livePhase.status === 'recovering' && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                        <span className="text-yellow-500">Recovery agent analyzing...</span>
                      </>
                    )}
                    {livePhase.status === 'running' && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <span className="text-blue-500">Executing phase {livePhase.phase}...</span>
                      </>
                    )}
                    {livePhase.status === 'complete' && (
                      <>
                        <span className="text-emerald-500">✓ Phase {livePhase.phase} complete</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Type</h4>
              <Badge variant="default">{task.type}</Badge>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Description</h4>
              <p className="text-sm text-muted-foreground">
                {task.description || 'No description provided'}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Timeline</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
                {task.assignedAt && (
                  <p>Assigned: {new Date(task.assignedAt).toLocaleString()}</p>
                )}
                {task.completedAt && (
                  <p>Completed: {new Date(task.completedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
            {task.assignedWorker && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Assigned Worker</h4>
                <Badge variant="outline">{task.assignedWorker}</Badge>
              </div>
            )}
            {task.assignedAgent && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Assigned Agent</h4>
                <Badge variant="outline">{task.assignedAgent}</Badge>
              </div>
            )}
            {task.priority !== undefined && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Priority</h4>
                <Badge variant="outline">{task.priority}</Badge>
              </div>
            )}
            {task.files && task.files.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Target Files</h4>
                <div className="space-y-1">
                  {task.files.map((file, idx) => (
                    <p key={idx} className="font-mono text-xs text-muted-foreground">
                      {file}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {task.error && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Error
                </h4>
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-900">{task.error}</p>
                </div>
              </div>
            )}
            {task.output && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Output</h4>
                <div className="rounded-md bg-muted p-3 font-mono text-xs max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{task.output}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phase History */}
        {task.phaseIndex && <TaskPhaseHistory taskId={task.id} />}

        {task.canRetry && task.status === 'failed' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retry Options</CardTitle>
              <CardDescription>
                This task can be retried (attempts: {task.retryCount ?? 0}/{task.maxRetries ?? 0})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Retry functionality will be available in a future update.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading task queue...</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Task Queue</h2>
        <p className="text-sm text-muted-foreground">
          Monitor all tasks in the dev-bots queue (Workers: {status?.workerCount ?? 0}/{status?.maxWorkers ?? 0})
        </p>
      </div>
      <ListDetailLayout<DevBotsTask, QueueFilter>
        summaryCards={summaryCards}
        filterTabs={filterTabs}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        items={filteredTasks}
        selectedItem={selectedTask}
        onSelectItem={selectTask}
        renderListItem={renderListItem}
        renderDetail={renderDetail}
        getItemKey={(task) => task.id}
        emptyMessage={`No ${activeFilter} tasks`}
      />
    </div>
  );
}
