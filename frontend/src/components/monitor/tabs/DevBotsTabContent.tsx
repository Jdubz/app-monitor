import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, SkipForward, XCircle, ShieldAlert, Terminal } from 'lucide-react';
import { useDevBotsStore } from '@/contexts/devBotsStore';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
type DialogState =
  | { type: 'none' }
  | { type: 'retry'; taskId: string }
  | { type: 'skip'; taskId: string; reason: string }
  | { type: 'cancel'; taskId: string }
  | { type: 'quarantine'; chainId: string; reason: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export function DevBotsTabContent() {
  const { status, queueRows, isLoading, refreshStatus } = useDevBotsStore();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<ChainFilter>('all');
  const [interventionLoading, setInterventionLoading] = useState<string | null>(null);
  const [interventionError, setInterventionError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ type: 'none' });

  // For now, treat each task as a "chain" - in the future, group by chainId
  const chains = useMemo(() => {
    const result = queueRows.map((row) => row.task);
    return result;
  }, [queueRows]);

  // Use list selection hook for consistent auto-selection behavior
  const { selectedItem: selectedChain, selectItem: selectChain } = useListSelection(
    chains,
    (chain) => chain.id,
    { autoSelectFirst: true }
  );

  const filteredChains = useMemo(() => {
    let result: DevBotsTask[];
    switch (activeFilter) {
      case 'blocked':
        // Stub: tasks with status 'failed' as "blocked"
        result = chains.filter((chain) => chain.status === 'failed');
        break;
      case 'quarantined':
        // Stub: no quarantine logic yet
        result = [];
        break;
      case 'all':
      default:
        result = chains;
    }
    return result;
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
    setDialogState({ type: 'retry', taskId });
  };

  const confirmRetryTask = async (taskId: string) => {
    setDialogState({ type: 'none' });
    setInterventionLoading('retry');
    setInterventionError(null);

    try {
      const result = await api.retryDevBotsTask(taskId);
      setDialogState({ type: 'success', message: result.message });
      refreshStatus();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      setDialogState({ type: 'error', message: errorMessage });
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleSkipTask = async (taskId: string) => {
    setDialogState({ type: 'skip', taskId, reason: '' });
  };

  const confirmSkipTask = async (taskId: string, reason: string) => {
    setDialogState({ type: 'none' });
    setInterventionLoading('skip');
    setInterventionError(null);

    try {
      const result = await api.skipDevBotsTask(taskId, reason || undefined);
      setDialogState({ type: 'success', message: result.message });
      refreshStatus();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      setDialogState({ type: 'error', message: errorMessage });
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    setDialogState({ type: 'cancel', taskId });
  };

  const confirmCancelTask = async (taskId: string) => {
    setDialogState({ type: 'none' });
    setInterventionLoading('cancel');
    setInterventionError(null);

    try {
      const result = await api.cancelDevBotsTask(taskId);
      setDialogState({ type: 'success', message: result.message });
      refreshStatus();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      setDialogState({ type: 'error', message: errorMessage });
    } finally {
      setInterventionLoading(null);
    }
  };

  const handleQuarantineChain = async (chainId: string) => {
    setDialogState({ type: 'quarantine', chainId, reason: '' });
  };

  const confirmQuarantineChain = async (chainId: string, reason: string) => {
    if (!reason.trim()) {
      setDialogState({ type: 'error', message: 'Reason is required to quarantine a chain.' });
      return;
    }

    setDialogState({ type: 'none' });
    setInterventionLoading('quarantine');
    setInterventionError(null);

    try {
      const result = await api.quarantineDevBotsChain(chainId, reason);
      setDialogState({ type: 'success', message: result.message });
      refreshStatus();
    } catch (error) {
      const errorMessage = api.handleApiError(error);
      setInterventionError(errorMessage);
      setDialogState({ type: 'error', message: errorMessage });
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
    <>
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

      {/* Retry Confirmation Dialog */}
      <Dialog open={dialogState.type === 'retry'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Task</DialogTitle>
            <DialogDescription>Are you sure you want to retry this task?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState({ type: 'none' })}>Cancel</Button>
            <Button onClick={() => dialogState.type === 'retry' && confirmRetryTask(dialogState.taskId)}>
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip Task Dialog */}
      <Dialog open={dialogState.type === 'skip'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Task</DialogTitle>
            <DialogDescription>Optionally provide a reason for skipping this task.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="skip-reason">Reason (optional)</Label>
              <Input
                id="skip-reason"
                value={dialogState.type === 'skip' ? dialogState.reason : ''}
                onChange={(e) => dialogState.type === 'skip' && setDialogState({ ...dialogState, reason: e.target.value })}
                placeholder="Enter reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState({ type: 'none' })}>Cancel</Button>
            <Button onClick={() => dialogState.type === 'skip' && confirmSkipTask(dialogState.taskId, dialogState.reason)}>
              Skip Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Task Dialog */}
      <Dialog open={dialogState.type === 'cancel'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Task</DialogTitle>
            <DialogDescription className="text-destructive">
              Are you sure you want to CANCEL this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState({ type: 'none' })}>Go Back</Button>
            <Button variant="destructive" onClick={() => dialogState.type === 'cancel' && confirmCancelTask(dialogState.taskId)}>
              Cancel Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quarantine Chain Dialog */}
      <Dialog open={dialogState.type === 'quarantine'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quarantine Chain</DialogTitle>
            <DialogDescription>Provide a reason for quarantining this chain (required).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="quarantine-reason">Reason *</Label>
              <Input
                id="quarantine-reason"
                value={dialogState.type === 'quarantine' ? dialogState.reason : ''}
                onChange={(e) => dialogState.type === 'quarantine' && setDialogState({ ...dialogState, reason: e.target.value })}
                placeholder="Enter reason..."
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState({ type: 'none' })}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => dialogState.type === 'quarantine' && confirmQuarantineChain(dialogState.chainId, dialogState.reason)}
              disabled={dialogState.type === 'quarantine' && !dialogState.reason.trim()}
            >
              Quarantine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={dialogState.type === 'success'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Success</DialogTitle>
            <DialogDescription>{dialogState.type === 'success' && dialogState.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogState({ type: 'none' })}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={dialogState.type === 'error'} onOpenChange={() => setDialogState({ type: 'none' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Error</DialogTitle>
            <DialogDescription>{dialogState.type === 'error' && dialogState.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogState({ type: 'none' })}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
