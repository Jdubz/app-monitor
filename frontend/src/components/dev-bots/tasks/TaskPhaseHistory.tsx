import { useState, useEffect } from 'react';
import { Clock, Calendar, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getDevBotsTaskStageRuns } from '@/services/api';

interface StageRun {
  id: number;
  task_id: string;
  phase_index: number;
  phase_name: string;
  attempt: number;
  status: 'success' | 'failed' | 'recovered' | 'blocked';
  artifacts_blob?: string;
  created_at: number;
  completed_at?: number;
  recovery_diagnosis?: string;
  exit_code?: number;
}

function isStageRun(obj: unknown): obj is StageRun {
  if (!obj || typeof obj !== 'object') return false;
  const run = obj as Record<string, unknown>;

  return (
    typeof run.id === 'number' &&
    typeof run.task_id === 'string' &&
    typeof run.phase_index === 'number' &&
    typeof run.phase_name === 'string' &&
    typeof run.attempt === 'number' &&
    typeof run.status === 'string' &&
    ['success', 'failed', 'recovered', 'blocked'].includes(run.status as string) &&
    typeof run.created_at === 'number' &&
    (run.completed_at === undefined || typeof run.completed_at === 'number') &&
    (run.artifacts_blob === undefined || typeof run.artifacts_blob === 'string') &&
    (run.recovery_diagnosis === undefined || typeof run.recovery_diagnosis === 'string') &&
    (run.exit_code === undefined || typeof run.exit_code === 'number')
  );
}

function isStageRunArray(data: unknown): data is StageRun[] {
  return Array.isArray(data) && data.every(isStageRun);
}

interface TaskPhaseHistoryProps {
  taskId: string;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getStatusIcon(status: StageRun['status']) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'recovered':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'blocked':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return null;
  }
}

function getStatusColor(status: StageRun['status']): string {
  switch (status) {
    case 'success':
      return 'border-emerald-500 text-emerald-500';
    case 'failed':
      return 'border-destructive text-destructive';
    case 'recovered':
      return 'border-amber-500 text-amber-500';
    case 'blocked':
      return 'border-destructive text-destructive';
    default:
      return '';
  }
}

export function TaskPhaseHistory({ taskId }: TaskPhaseHistoryProps) {
  const [stageRuns, setStageRuns] = useState<StageRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStageRuns = async () => {
    try {
      setIsLoading(true);
      const data = await getDevBotsTaskStageRuns(taskId);

      // Validate the response data with runtime type checking
      if (!isStageRunArray(data.stageRuns)) {
        throw new Error('Invalid stage runs data received from API');
      }

      setStageRuns(data.stageRuns);
      setError(null);
    } catch (err) {
      console.error('Error fetching stage runs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStageRuns();
  }, [taskId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase History</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stageRuns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase History</CardTitle>
          <CardDescription>No phase execution history yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Phase History</CardTitle>
        <CardDescription>
          {stageRuns.length} phase execution{stageRuns.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stageRuns.map((run) => {
            const duration = run.completed_at ? run.completed_at - run.created_at : null;
            let artifacts = null;
            let recovery = null;

            try {
              if (run.artifacts_blob) {
                artifacts = JSON.parse(run.artifacts_blob);
              }
              if (run.recovery_diagnosis) {
                recovery = JSON.parse(run.recovery_diagnosis);
              }
            } catch (e) {
              console.error('Failed to parse JSON:', e);
            }

            return (
              <div
                key={run.id}
                className={cn(
                  'rounded-lg border-l-4 bg-muted/30 p-4',
                  run.status === 'success' && 'border-l-emerald-500',
                  run.status === 'failed' && 'border-l-destructive',
                  run.status === 'recovered' && 'border-l-amber-500',
                  run.status === 'blocked' && 'border-l-destructive',
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    <span className="font-semibold text-sm">
                      {run.phase_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Attempt {run.attempt})
                    </span>
                  </div>
                  <Badge variant="outline" className={getStatusColor(run.status)}>
                    {run.status}
                  </Badge>
                </div>

                {/* Meta */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(duration)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(run.created_at)}
                  </span>
                  {run.exit_code !== undefined && run.exit_code !== null && (
                    <span className={cn(
                      'font-mono',
                      run.exit_code === 0 ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      exit {run.exit_code}
                    </span>
                  )}
                </div>

                {/* Recovery Info */}
                {recovery && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <span className="text-xs font-medium text-amber-900 dark:text-amber-100">
                          Recovery Attempted
                        </span>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-amber-700 dark:text-amber-300 hover:text-amber-800">
                            View Diagnosis
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded bg-amber-950/20 p-2 text-[11px]">
                            {JSON.stringify(recovery, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  </div>
                )}

                {/* Artifacts */}
                {artifacts && (
                  <Collapsible>
                    <div>
                      <CollapsibleTrigger asChild><button className="flex items-center gap-2 text-xs hover:underline">
                        📎 View Artifacts
                      <ChevronDown className="h-3 w-3" /></button></CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="rounded-md bg-muted p-3">
                          <pre className="overflow-x-auto text-[11px]">
                            {JSON.stringify(artifacts, null, 2)}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
