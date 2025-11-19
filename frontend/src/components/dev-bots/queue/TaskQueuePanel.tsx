import { useMemo } from 'react';
import { AlertCircle, Clock3, RefreshCw } from 'lucide-react';
import type { DevBotsTask } from '@/types/dev-bots';

import { useDevBotsStore } from '@/contexts/devBotsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/dateFormatters';
import { PhaseProgressBar, PhaseBadge } from './PhaseProgress';

type QueueBucket = 'pending' | 'active' | 'blocked' | 'completed' | 'failed';

const getStatusBadgeVariant = (status: DevBotsTask['status']) => {
  switch (status) {
    case 'active':
      return { variant: 'outline' as const, className: 'border-amber-500 text-amber-500' };
    case 'blocked':
      return { variant: 'outline' as const, className: 'border-amber-600 text-amber-600' };
    case 'completed':
      return { variant: 'outline' as const, className: 'border-emerald-500 text-emerald-500' };
    case 'failed':
      return { variant: 'outline' as const, className: 'border-destructive text-destructive' };
    default:
      return { variant: 'outline' as const, className: '' };
  }
};

const bucketCopy: Record<QueueBucket, { label: string; helper: string }> = {
  pending: { label: 'Pending', helper: 'Awaiting assignment' },
  active: { label: 'Active', helper: 'Workers currently executing' },
  blocked: { label: 'Blocked', helper: 'Awaiting manual intervention' },
  completed: { label: 'Completed', helper: 'Recently finished tasks' },
  failed: { label: 'Failed', helper: 'Permanently failed tasks' },
};

export function TaskQueuePanel() {
  const {
    queueFilter,
    setQueueFilter,
    filteredRows,
    selectTask,
    selectedTaskId,
    queueSummary,
    refreshStatus,
    isLoading,
    error,
  } = useDevBotsStore();

  const counts = queueSummary?.counts;

  const filters = useMemo(
    () =>
      (['pending', 'active', 'blocked', 'completed', 'failed'] as QueueBucket[]).map((bucket) => ({
        bucket,
        label: bucketCopy[bucket].label,
        count:
          bucket === 'failed'
            ? counts?.failed ?? 0
            : bucket === 'blocked'
              ? counts?.blocked ?? 0
              : bucket === 'active'
                ? counts?.active ?? 0
                : bucket === 'completed'
                  ? counts?.completed ?? 0
                  : counts?.pending ?? 0,
      })),
    [counts],
  );

  const lastUpdated = queueSummary?.lastUpdated
    ? formatRelativeTime(queueSummary.lastUpdated)
    : '—';

  return (
    <Card className="flex h-full flex-col border-border/70 bg-card/80">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-semibold">Task Queue</CardTitle>
          <CardDescription>Monitor queue health and pick tasks to inspect</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refreshStatus()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter.bucket}
              type="button"
              onClick={() => setQueueFilter(filter.bucket)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                queueFilter === filter.bucket
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted',
              )}
            >
              {filter.label}
              <span className="ml-2 font-mono text-[11px]">{filter.count}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            <span>Updated {lastUpdated}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <ScrollArea className="flex-1 rounded-md border border-border/60 bg-muted/20 pr-4">
          <div className="divide-y divide-border/60">
            {filteredRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5" />
                <p>No tasks found for this bucket.</p>
              </div>
            )}

            {filteredRows.map((row) => {
              const { task } = row;
              const bucket =
                queueFilter === 'failed'
                  ? 'failed'
                  : (row.bucket as QueueBucket);
              const statusStyles = getStatusBadgeVariant(task.status);
              const isSelected = selectedTaskId === task.id;

              return (
                <button
                  type="button"
                  key={`${row.bucket}-${task.id}`}
                  className={cn(
                    'flex w-full flex-col gap-2 border-l-2 px-4 py-3 text-left transition-colors hover:bg-background/60',
                    isSelected ? 'border-l-primary bg-background/80' : 'border-l-transparent',
                  )}
                  onClick={() => selectTask(task.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-[0.2em]">
                      {bucketCopy[bucket].label}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">
                      {task.description || task.id}
                    </span>
                    <Badge
                      variant={statusStyles.variant}
                      className={cn('text-[10px] uppercase tracking-[0.2em]', statusStyles.className)}
                    >
                      {task.status}
                    </Badge>
                    {Boolean(task.priority) && (
                      <Badge variant="warning" className="text-[10px]">
                        Priority {task.priority}
                      </Badge>
                    )}
                  </div>

                  {/* Phase Progress - Enhanced */}
                  {task.phaseIndex && task.phaseName && (
                    <div className="flex flex-col gap-1.5">
                      <PhaseBadge
                        phaseIndex={task.phaseIndex}
                        phaseName={task.phaseName}
                        phaseStatus={task.phaseStatus}
                        phaseAttempts={task.phaseAttempts}
                      />
                      <PhaseProgressBar currentPhase={task.phaseIndex} />
                    </div>
                  )}

                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {bucketCopy[bucket].helper}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="font-mono">{task.assignedWorker || 'Unassigned worker'}</span>
                    <span className="font-mono">{task.assignedAgent}</span>
                    <span>Created {formatRelativeTime(task.createdAt)}</span>
                    {task.completedAt && <span>Completed {formatRelativeTime(task.completedAt)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
