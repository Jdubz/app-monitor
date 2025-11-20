import { useMemo, useState } from 'react';
import { Activity, Bot, Settings2, Server, Clock, Zap } from 'lucide-react';
import { useDevBotsStore } from '@/contexts/devBotsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { DevBotsWorkerStatus } from '@/types/dev-bots';

/**
 * DevBotsTabContent - Dev-Bots Infrastructure & Container Health Tab
 *
 * This tab focuses EXCLUSIVELY on dev-bot infrastructure:
 * - How many bots are running
 * - What task each bot is currently working on
 * - Container health and agent status
 * - System configuration (max workers)
 *
 * This is NOT about task queue management - that's the Task Queue tab.
 * This is about the infrastructure and agents themselves.
 */
export function DevBotsTabContent() {
  const {
    status,
    workers,
    settings,
    settingsLoading,
    settingsUpdateError,
    isLoading,
    refreshStatus,
  } = useDevBotsStore();

  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // System metrics
  const systemStatus = status?.systemStatus ?? 'unknown';
  const workerCount = status?.workerCount ?? 0;
  const maxWorkers = status?.maxWorkers ?? settings?.maxWorkers ?? 0;
  const activeTasks = status?.activeTasks ?? 0;
  const uptime = status?.uptime ?? 0;

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get system status color
  const getSystemStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  // Open settings dialog
  const handleOpenSettings = () => {
    setShowSettingsDialog(true);
  };

  // Convert workers object to array
  const workersList = useMemo<Array<{ id: string; data: DevBotsWorkerStatus }>>(() => {
    return Object.entries(workers).map(([id, data]) => ({ id, data }));
  }, [workers]);

  // Get worker status badge color
  const getWorkerStatusColor = (status: string) => {
    switch (status) {
      case 'busy':
        return 'bg-blue-500 text-white';
      case 'idle':
        return 'bg-green-500 text-white';
      case 'stopped':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-yellow-500 text-white';
    }
  };

  // Format last seen
  const formatLastSeen = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading dev-bots infrastructure...</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto">
        <div className="container mx-auto p-6 space-y-6">
          {/* System Overview Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Dev-Bots Infrastructure
                  </CardTitle>
                  <CardDescription>
                    Container health, agent status, and system configuration
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenSettings}
                  disabled={settingsLoading}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* System Status */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">System Status</div>
                  <div className="flex items-center gap-2">
                    <div className={cn('w-3 h-3 rounded-full', getSystemStatusColor(systemStatus))} />
                    <span className="font-semibold capitalize">{systemStatus}</span>
                  </div>
                </div>

                {/* Active Workers */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Active Workers</div>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {workerCount} / {maxWorkers}
                    </span>
                  </div>
                </div>

                {/* Active Tasks */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Active Tasks</div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{activeTasks}</span>
                  </div>
                </div>

                {/* Uptime */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Uptime</div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{formatUptime(uptime)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Worker Status List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Worker Status</CardTitle>
                  <CardDescription>
                    {workersList.length === 0
                      ? 'No workers currently active'
                      : `${workersList.length} worker${workersList.length === 1 ? '' : 's'} active`}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refreshStatus()}>
                  <Zap className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {workersList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No workers are currently running.</p>
                  <p className="text-sm mt-2">Workers will appear here when tasks are assigned.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workersList.map(({ id, data }) => (
                    <Card key={id} className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Bot className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold">{id}</span>
                              <Badge className={cn('ml-auto', getWorkerStatusColor(data.status))}>
                                {data.status}
                              </Badge>
                            </div>
                            {data.currentTask && (
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium">Current Task: </span>
                                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                  {data.currentTask}
                                </code>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1 text-sm">
                            {data.personality && (
                              <div>
                                <span className="text-muted-foreground">Personality: </span>
                                <span className="font-medium">{data.personality.name}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Last Seen: </span>
                              <span className="font-medium">{formatLastSeen(data.lastSeen)}</span>
                            </div>
                            {data.onboardingComplete !== undefined && (
                              <div>
                                <span className="text-muted-foreground">Onboarding: </span>
                                <Badge variant={data.onboardingComplete ? 'success' : 'warning'}>
                                  {data.onboardingComplete ? 'Complete' : 'Pending'}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Settings Dialog - Read-Only */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Dev-Bots Settings</DialogTitle>
            <DialogDescription>
              Current system configuration. Settings are read from environment variables.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Max Workers - Read Only */}
            <div className="grid gap-2">
              <Label>Maximum Workers</Label>
              <div className="flex items-center gap-3 rounded-md border border-input bg-muted px-3 py-2">
                <span className="text-2xl font-bold">{settings?.maxWorkers ?? maxWorkers}</span>
                <span className="text-sm text-muted-foreground">concurrent workers</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This value is configured via the <code className="text-xs bg-muted px-1 py-0.5 rounded">MAX_DEV_BOTS</code> environment variable.
                To change this setting, update the environment variable and restart the service.
              </p>
            </div>

            {settingsUpdateError && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-900">{settingsUpdateError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettingsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
