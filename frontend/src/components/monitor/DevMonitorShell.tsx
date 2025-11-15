import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DevBotsStoreProvider } from '@/contexts/devBotsStore';
import { DevBotsTabContent } from './tabs/DevBotsTabContent';
import { PrTrackingTabContent } from './tabs/PrTrackingTabContent';
import { TaskQueueTabContent } from './tabs/TaskQueueTabContent';
import { PlansTabContent } from './tabs/PlansTabContent';
import { InteractiveTerminalTabContent } from './tabs/InteractiveTerminalTabContent';

interface DevMonitorShellProps {
  socket: Socket | null;
}

type MonitorTab = 'dev-bots' | 'pr-tracking' | 'task-queue' | 'plans' | 'interactive';

const TAB_PATH_MAP: Record<MonitorTab, string> = {
  'dev-bots': '/monitor/dev-bots',
  'pr-tracking': '/monitor/prs',
  'task-queue': '/monitor/queue',
  'plans': '/monitor/plans',
  'interactive': '/monitor/interactive',
};

const PATH_TAB_MAP: Record<string, MonitorTab> = {
  '/monitor/dev-bots': 'dev-bots',
  '/monitor/prs': 'pr-tracking',
  '/monitor/queue': 'task-queue',
  '/monitor/plans': 'plans',
  '/monitor/interactive': 'interactive',
};

/**
 * GlobalStatusStrip - Stub component for global system status
 * TODO: Connect to real-time status updates via socket
 */
function GlobalStatusStrip() {
  const [systemStatus] = useState<'healthy' | 'degraded' | 'down'>('healthy');

  const statusColor =
    systemStatus === 'healthy'
      ? 'bg-green-500'
      : systemStatus === 'degraded'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="flex items-center justify-between border-b border-border/50 bg-card/50 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <div className={`h-2 w-2 rounded-full ${statusColor}`} />
        <span className="text-muted-foreground">System Status:</span>
        <Badge variant="outline" className="capitalize">
          {systemStatus}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

/**
 * DevMonitorShell - Main tabbed shell component for monitoring
 *
 * Provides URL-based routing for different monitor views:
 * - /monitor/dev-bots: Development bots automation
 * - /monitor/prs: Pull request tracking
 * - /monitor/queue: Task queue monitoring
 * - /monitor/plans: Plans system overview
 * - /monitor/interactive: Interactive terminal sessions
 */
export function DevMonitorShell({ socket }: DevMonitorShellProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL
  const activeTab: MonitorTab = PATH_TAB_MAP[location.pathname] || 'dev-bots';

  const handleTabChange = (value: string) => {
    const tab = value as MonitorTab;
    const path = TAB_PATH_MAP[tab];
    if (path) {
      navigate(path);
    }
  };

  return (
    <DevBotsStoreProvider socket={socket}>
      <div className="flex h-full flex-col">
        <GlobalStatusStrip />

        <div className="flex-1 overflow-hidden p-4">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="dev-bots">Dev-Bots</TabsTrigger>
              <TabsTrigger value="pr-tracking">PR Tracking</TabsTrigger>
              <TabsTrigger value="task-queue">Task Queue</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="interactive">Interactive</TabsTrigger>
            </TabsList>

            <TabsContent value="dev-bots" className="flex-1 overflow-hidden">
              <DevBotsTabContent />
            </TabsContent>

            <TabsContent value="pr-tracking" className="flex-1 overflow-hidden">
              <PrTrackingTabContent />
            </TabsContent>

            <TabsContent value="task-queue" className="flex-1 overflow-hidden">
              <TaskQueueTabContent />
            </TabsContent>

            <TabsContent value="plans" className="flex-1 overflow-hidden">
              <PlansTabContent />
            </TabsContent>

            <TabsContent value="interactive" className="flex-1 overflow-hidden">
              <InteractiveTerminalTabContent />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DevBotsStoreProvider>
  );
}
