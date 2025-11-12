import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Unlock, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ChainStats {
  activeChains: number;
  blockedChains: number;
  implementationQueueDepth: number;
  followupQueueDepth: number;
  maxConcurrentChains: number;
}

interface BlockedChain {
  chain_id: string;
  blocked_reason: string;
  blocked_at: number;
  blocked_by: string;
  task_count: number;
}

const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export function ChainStatusPanel() {
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [blockedChains, setBlockedChains] = useState<BlockedChain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unblockingChain, setUnblockingChain] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<BlockedChain | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [operatorName, setOperatorName] = useState('');

  const OPERATOR_NAME_STORAGE_KEY = 'dev-bots.operator-name';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const storedName = window.localStorage.getItem(OPERATOR_NAME_STORAGE_KEY);
      if (storedName) {
        setOperatorName(storedName);
      }
    } catch (err) {
      console.error('Failed to load operator name from storage', err);
    }
  }, []);

  const updateOperatorName = (value: string) => {
    setOperatorName(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(OPERATOR_NAME_STORAGE_KEY, value);
      } catch (err) {
        console.error('Failed to persist operator name', err);
      }
    }
  };

  const fetchStats = async () => {
    try {
      setError(null);
      const response = await fetch('/api/dev-bots/queue/stats');
      if (!response.ok) throw new Error('Failed to fetch queue stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    }
  };

  const fetchBlockedChains = async () => {
    try {
      const response = await fetch('/api/dev-bots/chains/blocked');
      if (!response.ok) throw new Error('Failed to fetch blocked chains');
      const data = await response.json();
      setBlockedChains(data);
    } catch (err) {
      console.error('Failed to fetch blocked chains:', err);
    }
  };

  const handleUnblock = async (chain: BlockedChain) => {
    try {
      const operator = operatorName.trim();
      if (!operator) {
        setError('Please enter your name before unblocking a chain.');
        return;
      }

      setUnblockingChain(chain.chain_id);
      const response = await fetch(`/api/dev-bots/chains/${chain.chain_id}/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unblockedBy: operator })
      });

      if (!response.ok) throw new Error('Failed to unblock chain');

      // Refresh data
      await Promise.all([fetchStats(), fetchBlockedChains()]);
      setConfirmUnblock(null);
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unblock chain');
    } finally {
      setUnblockingChain(null);
    }
  };

  const openUnblockDialog = (chain: BlockedChain) => {
    setConfirmUnblock(chain);
    setShowConfirm(true);
  };

  useEffect(() => {
    fetchStats();
    fetchBlockedChains();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchBlockedChains();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const refresh = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchStats(), fetchBlockedChains()]);
    } finally {
      setIsLoading(false);
    }
  };

  const utilizationPercent = stats
    ? Math.round((stats.activeChains / stats.maxConcurrentChains) * 100)
    : 0;

  return (
    <>
      <Card className="border-border/70 bg-card/80">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">Chain Status</CardTitle>
            <CardDescription>Implementation chain concurrency and queue depths</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {stats && (
            <>
              {/* Chain Utilization */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Chain Utilization</span>
                  <span className="font-medium">
                    {stats.activeChains} / {stats.maxConcurrentChains}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      utilizationPercent >= 100
                        ? 'bg-amber-500'
                        : utilizationPercent >= 75
                          ? 'bg-blue-500'
                          : 'bg-emerald-500',
                    )}
                    style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Queue Depths */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Implementation Queue</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {stats.implementationQueueDepth}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">new chains</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Follow-up Queue</div>
                  <div className="mt-1 text-2xl font-semibold">{stats.followupQueueDepth}</div>
                  <div className="mt-1 text-xs text-muted-foreground">existing chains</div>
                </div>
              </div>

              {/* Blocked Chains Warning */}
              {stats.blockedChains > 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                    <div>
                      <div className="font-semibold text-sm">Blocked Chains</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {stats.blockedChains} chain{stats.blockedChains > 1 ? 's' : ''} blocked and
                        requiring manual intervention
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Blocked Chains List */}
      {blockedChains.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Blocked Chains - Manual Intervention Required
            </CardTitle>
            <CardDescription>
              These chains are blocked and need your attention before they can continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {blockedChains.map((chain) => (
              <div
                key={chain.chain_id}
                className="rounded-lg border border-border/50 bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="font-mono text-sm font-medium">{chain.chain_id}</div>
                    <div className="text-sm text-muted-foreground">{chain.blocked_reason}</div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Blocked {formatRelativeTime(chain.blocked_at)}</span>
                      <span>•</span>
                      <span>{chain.task_count} task{chain.task_count > 1 ? 's' : ''} waiting</span>
                      <span>•</span>
                      <span className="font-mono">{chain.blocked_by}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openUnblockDialog(chain)}
                    disabled={unblockingChain === chain.chain_id}
                  >
                    <Unlock className="mr-2 h-4 w-4" />
                    Unblock
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unblock Confirmation Dialog */}
      {showConfirm && confirmUnblock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Unblock Chain?</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowConfirm(false);
                    setConfirmUnblock(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Chain:</span>{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{confirmUnblock.chain_id}</code>
                </div>
                <div>
                  <span className="font-semibold">Blocked:</span> {confirmUnblock.blocked_reason}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-muted">
                  <AlertCircle className="h-4 w-4 inline-block mr-2 text-amber-500" />
                  <span className="font-medium">Have you fixed the underlying issue?</span>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="operator-name" className="text-xs font-medium text-muted-foreground">
                    Your name (for audit trail)
                  </Label>
                  <Input
                    id="operator-name"
                    value={operatorName}
                    onChange={(event) => updateOperatorName(event.target.value)}
                    placeholder="e.g. Jane Operator"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored locally so you only need to enter it once.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowConfirm(false);
                    setConfirmUnblock(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => confirmUnblock && handleUnblock(confirmUnblock)}
                  disabled={unblockingChain !== null || operatorName.trim().length === 0}
                >
                  {unblockingChain ? 'Unblocking...' : 'Yes, Unblock Chain'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
