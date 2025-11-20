import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Info, RefreshCw, Users } from 'lucide-react';

import { useDevBotsStore } from '@/contexts/devBotsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { TaskLogViewer } from './TaskLogViewer';
import { ResumeTaskButton } from '../queue/ResumeTaskButton';

export function WorkerConsolePanel() {
  const {
    workers,
    selectedWorkerId,
    selectWorker,
    selectedTask,
    selectedTaskDetail,
    taskDetailLoading,
    taskDetailError,
    refreshTaskDetail,
    taskLogs,
    settings,
    settingsUpdating,
    settingsError,
    updateSettings,
  } = useDevBotsStore();

  const workerEntries = useMemo(() => Object.entries(workers), [workers]);

  const [maxWorkers, setMaxWorkers] = useState(settings?.maxWorkers ?? 2);
  const [dryRun, setDryRun] = useState(settings?.dryRun ?? true);
  const [autoCleanup, setAutoCleanup] = useState(settings?.autoCleanup ?? false);

  useEffect(() => {
    if (!settings) return;
    setMaxWorkers(settings.maxWorkers);
    setDryRun(settings.dryRun);
    setAutoCleanup(settings.autoCleanup);
  }, [settings]);

  const handleSettingsSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    void updateSettings({
      maxWorkers,
      dryRun,
      autoCleanup,
    });
  };

  const activeHistory = selectedTaskDetail?.history ?? [];
  const canEditSettings = Boolean(settings);

  return (
    <Card className="flex h-full flex-col border-border/70 bg-card/80">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-semibold">Worker Console</CardTitle>
          <CardDescription>Inspect workers, task metadata, and live logs.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshTaskDetail()}
          disabled={taskDetailLoading || !selectedTask}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', taskDetailLoading && 'animate-spin')} />
          Refresh Task
        </Button>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card className="border-border/70 bg-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" />
                Workers
              </CardTitle>
              <CardDescription>Connected dev-bot workers and their status.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-[220px] pr-4">
                <div className="space-y-2">
                  {workerEntries.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border/60 bg-background/60 py-6 text-xs text-muted-foreground">
                      <Bot className="h-5 w-5" />
                      <span>No workers connected.</span>
                    </div>
                  )}

                  {workerEntries.map(([workerId, worker]) => (
                    <button
                      key={workerId}
                      type="button"
                      onClick={() => selectWorker(workerId)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                        selectedWorkerId === workerId
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 hover:border-border hover:bg-background/40',
                      )}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">{workerId}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] uppercase tracking-[0.2em]',
                            worker.status === 'busy'
                              ? 'border-amber-500 text-amber-500'
                              : worker.status === 'stopped'
                                ? 'border-muted-foreground text-muted-foreground'
                                : 'border-emerald-500 text-emerald-500',
                          )}
                        >
                          {worker.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {worker.currentTask ? `Working on ${worker.currentTask}` : 'Idle'}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Automation Settings</CardTitle>
              <CardDescription>Adjust coordinator limits and safety toggles.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <form className="space-y-3" onSubmit={handleSettingsSubmit}>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Max Workers
                  <Input
                    type="number"
                    min={1}
                    value={maxWorkers}
                    onChange={(event) => setMaxWorkers(Number(event.target.value))}
                    disabled={!canEditSettings || settingsUpdating}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant={dryRun ? 'default' : 'outline'}
                    onClick={() => setDryRun((value) => !value)}
                    disabled={!canEditSettings || settingsUpdating}
                  >
                    {dryRun ? 'Dry-run enabled' : 'Dry-run disabled'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={autoCleanup ? 'default' : 'outline'}
                    onClick={() => setAutoCleanup((value) => !value)}
                    disabled={!canEditSettings || settingsUpdating}
                  >
                    {autoCleanup ? 'Auto cleanup on' : 'Auto cleanup off'}
                  </Button>
                </div>
                {settingsError && (
                  <p className="text-xs text-destructive">{settingsError}</p>
                )}
                <Button type="submit" size="sm" disabled={!canEditSettings || settingsUpdating}>
                  {settingsUpdating ? 'Saving…' : 'Save settings'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-muted/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Task Detail</CardTitle>
            <CardDescription>
              {selectedTask ? selectedTask.description : 'Select a task from the queue to inspect.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="space-y-2 text-sm">
              {selectedTask ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">Task #{selectedTask.id}</Badge>
                    <Badge variant="outline">{selectedTask.type}</Badge>
                    <span>Priority {selectedTask.priority ?? '—'}</span>
                  </div>
                  <p className="text-foreground">{selectedTask.description}</p>
                  {Array.isArray(selectedTask.acceptanceCriteria) &&
                  selectedTask.acceptanceCriteria.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Acceptance Criteria
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {selectedTask.acceptanceCriteria.map((criterion: string) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Blocking Metadata */}
                  {selectedTask.status === 'blocked' && (
                    <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          Task Blocked
                        </h3>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {selectedTask.blockedReason && (
                          <div>
                            <span className="font-medium">Reason:</span>{' '}
                            <span className="text-muted-foreground">{selectedTask.blockedReason}</span>
                          </div>
                        )}

                        {selectedTask.blockedAt && (
                          <div>
                            <span className="font-medium">Blocked:</span>{' '}
                            <span className="text-muted-foreground">
                              {new Date(selectedTask.blockedAt).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {selectedTask.blockedBy && (
                          <div>
                            <span className="font-medium">Blocked By:</span>{' '}
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {selectedTask.blockedBy}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        <ResumeTaskButton
                          taskId={selectedTask.id}
                          onResumeSuccess={() => {
                            refreshTaskDetail();
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Resume Audit Trail */}
                  {selectedTask.resumedBy && selectedTask.resumedAt && (
                    <div className="mt-2 rounded-lg border border-emerald-500/50 bg-emerald-50/50 p-2.5 dark:bg-emerald-950/20">
                      <div className="flex items-center gap-2 text-xs">
                        <Info className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-medium">Resumed by {selectedTask.resumedBy}</span>
                        <span className="text-muted-foreground">
                          {new Date(selectedTask.resumedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Select a task from the queue to load detail.</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Execution History
              </p>
              <ScrollArea className="mt-2 max-h-[160px] pr-4">
                <div className="space-y-2">
                  {taskDetailLoading && (
                    <p className="text-xs text-muted-foreground">Loading history…</p>
                  )}
                  {taskDetailError && (
                    <p className="text-xs text-destructive">{taskDetailError}</p>
                  )}
                  {!taskDetailLoading && activeHistory.length === 0 && (
                    <p className="text-xs text-muted-foreground">No executions recorded.</p>
                  )}
                  {activeHistory.map((event) => (
                    <div key={event.id} className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-mono uppercase tracking-[0.2em]">{event.type}</span>
                        <span>{new Date(event.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground">{event.message}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <TaskLogViewer taskId={selectedTask?.id ?? null} logs={taskLogs} />

        <Separator className="opacity-0" />

        <div className="text-xs text-muted-foreground">
          {selectedTask?.status === 'failed' && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>
                This task failed. Review the stderr logs above and consider manual cleanup or retry.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
