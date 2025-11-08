import { RefreshCw } from 'lucide-react';
import type { Socket } from 'socket.io-client';

import { DevBotsStoreProvider, useDevBotsStore } from '@/contexts/devBotsStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TaskQueuePanel } from './queue/TaskQueuePanel';
import { WorkerConsolePanel } from './workers/WorkerConsolePanel';

interface DevBotsLayoutProps {
  socket: Socket | null;
}

export function DevBotsLayout({ socket }: DevBotsLayoutProps) {
  return (
    <DevBotsStoreProvider socket={socket}>
      <DevBotsLayoutContent />
    </DevBotsStoreProvider>
  );
}

function DevBotsLayoutContent() {
  const { status, isLoading, refreshStatus } = useDevBotsStore();

  const summaryItems = [
    {
      label: 'Queue Size',
      value: status?.queueSize ?? 0,
    },
    {
      label: 'Active Tasks',
      value: status?.activeTasks ?? 0,
    },
    {
      label: 'Workers',
      value: `${status?.workerCount ?? 0}/${status?.maxWorkers ?? 0}`,
      systemStatus: status?.systemStatus,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dev Bots Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Track queue health, worker activity, and automation settings.
          </p>
        </div>
        <Button variant="outline" onClick={() => refreshStatus()} disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryItems.map((item) => (
          <Card key={item.label} className="border-border/60 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {item.value}
              {item.systemStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    'ml-2 text-xs capitalize',
                    item.systemStatus === 'running'
                      ? 'border-emerald-500 text-emerald-500'
                      : item.systemStatus === 'stopped'
                        ? 'border-yellow-500 text-yellow-500'
                        : 'border-destructive text-destructive',
                  )}
                >
                  {item.systemStatus}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,_7fr)_minmax(0,_5fr)]">
        <TaskQueuePanel />
        <WorkerConsolePanel />
      </div>
    </div>
  );
}
