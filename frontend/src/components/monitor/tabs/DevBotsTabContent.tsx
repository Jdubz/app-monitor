import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RotateCcw, SkipForward, XCircle, ShieldAlert, Terminal } from 'lucide-react';
import { useDevBotsStore } from '@/contexts/devBotsStore';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DevBotsTask } from '@/types/dev-bots';
import { getTaskStatusIcon, getTaskStatusColor } from '@/utils/statusHelpers';
import { useListSelection } from '@/hooks/common';
import { api } from '@/services/api';

type ChainFilter = 'all' | 'blocked' | 'quarantined';

/**
 * DevBotsTabContent - Dev-Bots monitoring tab using ListDetailLayout
 *
 * Displays automation chains (tasks) with:
 * - Summary metrics (queue size, workers, active tasks)
 * - Filterable list (all, blocked, quarantined)
 * - Detail view with intervention controls
 */
export function DevBotsTabContent() {
  const { status, queueRows, isLoading } = useDevBotsStore();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<ChainFilter>('all');
  const [interventionLoading, setInterventionLoading] = useState<string | null>(null);
  const [interventionError, setInterventionError] = useState<string | null>(null);

  // For now, treat each task as a "chain" - in the future, group by chainId
  const chains = useMemo(() => {
    return queueRows.map((row) => row.task);
  }, [queueRows]);

  // Use list selection hook for consistent auto-selection behavior
  const { selectedItem: selectedChain, selectItem: selectChain } = useListSelection(
    chains,
    (chain) => chain.id,
    { autoSelectFirst: true }
  );

  const filteredChains = useMemo(() => {
    switch (activeFilter) {
      case 'blocked':
        // Stub: tasks with status 'failed' as "blocked"
        return chains.filter((chain) => chain.status === 'failed');
      case 'quarantined':
        // Stub: no quarantine logic yet
        return [];
      case 'all':
      default:
        return chains;
    }
  }, [chains, activeFilter]);

  // Summary cards
  const summaryCards = useMemo(() => {
    const queueSize = status?.queueSize ?? 0;
    const activeWorkers = status?.workerCount ?? 0;
    const maxWorkers = status?.maxWorkers ?? 0;
    const activeTasks = status?.activeTasks ?? 0;

    return [
      { label: 'Queue Size', value: queueSize },
      { label: 'Workers', value: `${activeWorkers}/${maxWorkers}` },
      { label: 'Active Tasks', value: activeTasks },
    ];
  }, [status]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const blockedCount = chains.filter((c) => c.status === 'failed').length;
    return [
      { value: 'all' as const, label: 'All', count: chains.length },
      { value: 'blocked' as const, label: 'Blocked', count: blockedCount },
      { value: 'quarantined' as const, label: 'Quarantined', count: 0 },
    ];
  }, [chains]);

  // Intervention action handlers
  const handleRetryTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to retry this task?')) {
      return;
    }

    setInterventionLoading('retry');
    setInterventionError(null);

    try {
      const result = await api.retryDevBotsTask(taskId);
      alert(`Success: ${result.message}`);
      // Refresh data after successful retry
      window.location.reload();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleSkipTask = async (taskId: string) => {
    const reason = window.prompt('Optional: Provide a reason for skipping this task');

    if (reason === null) {
      // User cancelled
      return;
    }

    setInterventionLoading('skip');
    setInterventionError(null);

    try {
      const result = await api.skipDevBotsTask(taskId, reason || undefined);
      alert(`Success: ${result.message}`);
      window.location.reload();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to CANCEL this task? This action cannot be undone.')) {
      return;
    }

    setInterventionLoading('cancel');
    setInterventionError(null);

    try {
      const result = await api.cancelDevBotsTask(taskId);
      alert(`Success: ${result.message}`);
      window.location.reload();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleQuarantineChain = async (chainId: string) => {
    const reason = window.prompt('Provide a reason for quarantining this chain (required):');

    if (!reason) {
      alert('Reason is required to quarantine a chain.');
      return;
    }

    if (!window.confirm(`Are you sure you want to QUARANTINE this chain? Reason: ${reason}`)) {
      return;
    }

    setInterventionLoading('quarantine');
    setInterventionError(null);

    try {
      const result = await api.quarantineDevBotsChain(chainId, reason);
      alert(`Success: ${result.message}`);
      window.location.reload();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      alert(`Error: ${errorMessage}`);
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleOpenSession = async (task: DevBotsTask) => {
    try {
      // Start an interactive session with context from this task
      const sessionState = await api.startDevBotsInteractiveSession({
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-5',
        metadata: {
          taskContext: `Task: ${task.type}\nDescription: ${task.description || 'N/A'}\nStatus: ${task.status}\nID: ${task.id}`,
        },
      });

      // Navigate to interactive tab with the new session
      navigate('/monitor/interactive');
      const sessionId = sessionState.session?.id || 'unknown';
      alert(`Interactive session started: ${sessionId}`);
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      alert(`Error starting session: ${errorMessage}`);
    }
  };

  // Render list item
  const renderListItem = (chain: DevBotsTask, _isSelected: boolean) => {
    const statusIcon = getTaskStatusIcon(chain.status);
    const statusColor = getTaskStatusColor(chain.status);

    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-sm font-medium">{chain.type}</span>
            <Badge variant="outline" className={cn('text-xs capitalize', statusColor)}>
              {chain.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {chain.description || 'No description'}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Created: {new Date(chain.createdAt).toLocaleString()}</span>
            {chain.assignedWorker && (
              <>
                <span>•</span>
                <span>Worker: {chain.assignedWorker}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render detail pane
  const renderDetail = (chain: DevBotsTask | null) => {
    if (!chain) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No Chain Selected</CardTitle>
            <CardDescription>Select a chain from the list to view details</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Chain Details</span>
              <Badge variant="outline" className="capitalize">
                {chain.status}
              </Badge>
            </CardTitle>
            <CardDescription>Task ID: {chain.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Type</h4>
              <p className="text-sm text-muted-foreground">{chain.type}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Description</h4>
              <p className="text-sm text-muted-foreground">
                {chain.description || 'No description provided'}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Timeline</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Created: {new Date(chain.createdAt).toLocaleString()}</p>
                {chain.assignedAt && (
                  <p>Assigned: {new Date(chain.assignedAt).toLocaleString()}</p>
                )}
                {chain.completedAt && (
                  <p>Completed: {new Date(chain.completedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
            {chain.assignedWorker && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Worker</h4>
                <Badge variant="outline">{chain.assignedWorker}</Badge>
              </div>
            )}
            {chain.assignedAgent && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Agent</h4>
                <Badge variant="outline">{chain.assignedAgent}</Badge>
              </div>
            )}
            {chain.error && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-red-600">Error</h4>
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-900">{chain.error}</p>
                </div>
              </div>
            )}
            {chain.output && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Output</h4>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">
                  <pre className="whitespace-pre-wrap">{chain.output}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Intervention Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intervention Controls</CardTitle>
            <CardDescription>
              Manual actions to resolve blocked or quarantined chains
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {interventionError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-900">
                {interventionError}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              disabled={chain.status === 'completed' || interventionLoading !== null}
              onClick={() => handleRetryTask(chain.id)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {interventionLoading === 'retry' ? 'Retrying...' : 'Retry Task'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              disabled={chain.status === 'completed' || interventionLoading !== null}
              onClick={() => handleSkipTask(chain.id)}
            >
              <SkipForward className="mr-2 h-4 w-4" />
              {interventionLoading === 'skip' ? 'Skipping...' : 'Skip and Continue'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="w-full justify-start"
              disabled={chain.status === 'completed' || interventionLoading !== null}
              onClick={() => handleCancelTask(chain.id)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {interventionLoading === 'cancel' ? 'Canceling...' : 'Cancel Task'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-orange-500 text-orange-600 hover:bg-orange-50"
              disabled={interventionLoading !== null}
              onClick={() => handleQuarantineChain(chain.id)}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              {interventionLoading === 'quarantine' ? 'Quarantining...' : 'Quarantine Chain'}
            </Button>
            <div className="pt-2 border-t">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleOpenSession(chain)}
              >
                <Terminal className="mr-2 h-4 w-4" />
                Open Interactive Session
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading dev-bots status...</p>
      </div>
    );
  }

  return (
    <ListDetailLayout<DevBotsTask, ChainFilter>
      summaryCards={summaryCards}
      filterTabs={filterTabs}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      items={filteredChains}
      selectedItem={selectedChain}
      onSelectItem={selectChain}
      renderListItem={renderListItem}
      renderDetail={renderDetail}
      getItemKey={(chain) => chain.id}
      emptyMessage="No chains found for this filter"
    />
  );
}
