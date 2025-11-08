import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../services/api";
import type {
  DevBotsWorkspaceSyncResult as SyncResult,
  DevBotsWorkspaceSyncStatus as SyncStatus,
} from "@app-monitor/api-contracts";

interface WorkspaceSyncPanelProps {
  onStatusChange?: (status: SyncStatus) => void;
}

const panelClasses = {
  container:
    "rounded-2xl border border-border/60 bg-card/90 shadow-sm backdrop-blur-sm",
  header:
    "flex flex-col gap-3 border-b border-border/60 bg-card/80 px-6 py-4 md:flex-row md:items-center md:justify-between",
  title: "text-xl font-semibold tracking-tight",
  headerActions: "flex items-center gap-2",
  body: "space-y-8 px-6 py-6",
  sectionCard:
    "space-y-4 rounded-xl border border-border/60 bg-background/70 p-5 shadow-sm",
  sectionHeader: "flex items-center justify-between",
  sectionTitle: "text-base font-semibold tracking-tight",
  grid: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  statusItem:
    "flex flex-col gap-1 rounded-lg border border-border/50 bg-background/80 p-4",
  statusLabel: "text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground",
  statusValue: "text-sm font-medium text-foreground",
  checkboxRow:
    "flex items-start gap-3 rounded-lg border border-border/40 bg-background/70 px-4 py-3 text-sm",
  checkboxInput:
    "mt-1 h-4 w-4 rounded border border-border/60 bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  select:
    "mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  mutedText: "text-sm text-muted-foreground",
  list: "space-y-2 text-sm text-muted-foreground",
  badge: "rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 text-xs font-medium",
  resultCard:
    "space-y-2 rounded-xl border border-border/50 bg-background/70 p-4 text-center",
  resultValue: "text-2xl font-semibold",
  detailList: "space-y-3",
  detailItem:
    "flex flex-col gap-1 rounded-lg border border-border/40 bg-background/70 p-3 text-sm",
  detailLabel: "font-medium text-foreground",
  infoGrid: "grid gap-4 lg:grid-cols-3",
  infoCard:
    "space-y-3 rounded-xl border border-border/50 bg-background/70 p-4 shadow-sm",
  infoTitle: "text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground",
  infoList: "space-y-2 text-sm text-muted-foreground",
  infoText:
    "rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm text-muted-foreground",
  errorContainer:
    "space-y-4 rounded-xl border border-destructive/50 bg-destructive/10 p-5 text-sm",
};

const statusAccent: Record<string, string> = {
  ready: "text-emerald-400",
  progress: "text-amber-400",
};

const conflictAccent: Record<string, string> = {
  "auto-merge": "text-emerald-400",
  stash: "text-amber-400",
  abort: "text-destructive",
  default: "text-muted-foreground",
};

const resultAccent = {
  success: "text-emerald-400",
  conflict: "text-amber-400",
  error: "text-destructive",
  skipped: "text-muted-foreground",
};

export const WorkspaceSyncPanel: React.FC<WorkspaceSyncPanelProps> = ({
  onStatusChange,
}) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncOptions, setSyncOptions] = useState({
    dryRun: false,
    verbose: false,
    conflictStrategy: "auto-merge" as "auto-merge" | "stash" | "abort",
  });

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get<SyncStatus>("/dev-bots/workspace-sync/status");
      setStatus(response);
      setError(null);
      onStatusChange?.(response);
    } catch (err) {
      setError(api.handleApiError(err) || "Failed to fetch sync status");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    try {
      setSyncInProgress(true);
      setError(null);

      const response = await api.post<SyncResult>(
        "/dev-bots/workspace-sync/trigger",
        syncOptions,
      );
      setLastSyncResult(response);

      await fetchStatus();
    } catch (err) {
      setError(api.handleApiError(err) || "Failed to trigger sync");
    } finally {
      setSyncInProgress(false);
    }
  };

  const updateConfig = async () => {
    try {
      await api.put<void>("/dev-bots/workspace-sync/config", {
        conflictStrategy: syncOptions.conflictStrategy,
      });
      await fetchStatus();
    } catch (err) {
      setError(api.handleApiError(err) || "Failed to update config");
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const strategyClass = conflictAccent[status?.conflictStrategy ?? "default"];

  const renderStatusSkeleton = () => (
    <div className={panelClasses.container}>
      <div className={panelClasses.header}>
        <h3 className={panelClasses.title}>🔄 Workspace Sync</h3>
      </div>
      <div className={panelClasses.body}>
        <div className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded-full bg-muted/40" />
          <div className="h-3 w-48 animate-pulse rounded-full bg-muted/40" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-muted/40" />
        </div>
      </div>
    </div>
  );

  const renderErrorState = (message: string) => (
    <div className={panelClasses.container}>
      <div className={panelClasses.header}>
        <h3 className={panelClasses.title}>🔄 Workspace Sync</h3>
      </div>
      <div className={panelClasses.body}>
        <div className={panelClasses.errorContainer}>
          <p className="font-medium text-destructive">❌ {message}</p>
          <Button variant="outline" onClick={fetchStatus}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading && !status) {
    return renderStatusSkeleton();
  }

  if (error && !status) {
    return renderErrorState(error);
  }

  return (
    <div className={panelClasses.container}>
      <div className={panelClasses.header}>
        <div>
          <h3 className={panelClasses.title}>🔄 Workspace Sync</h3>
          <p className={panelClasses.mutedText}>
            Monitor workspace synchronisation and adjust conflict strategies for
            dev-bots.
          </p>
        </div>
        <div className={panelClasses.headerActions}>
          <Button
            onClick={triggerSync}
            disabled={syncInProgress}
            className="gap-2"
          >
            {syncInProgress ? "🔄 Syncing..." : "🔄 Sync Now"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchStatus}
            disabled={loading}
            title="Refresh status"
          >
            🔄
          </Button>
        </div>
      </div>

      <div className={panelClasses.body}>
        <section className={panelClasses.sectionCard}>
          <div className={panelClasses.sectionHeader}>
            <h4 className={panelClasses.sectionTitle}>Sync Status</h4>
            {status?.syncInProgress && (
              <span className={cn(panelClasses.badge, "border-amber-400/40 text-amber-300")}>In Progress</span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Current State</span>
              <span
                className={cn(
                  panelClasses.statusValue,
                  status?.syncInProgress ? statusAccent.progress : statusAccent.ready,
                )}
              >
                {status?.syncInProgress ? "In Progress" : "Ready"}
              </span>
            </div>
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Last Sync</span>
              <span className={panelClasses.statusValue}>
                {status?.lastSyncTime ? formatTimestamp(status.lastSyncTime) : "Never"}
              </span>
            </div>
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Conflict Strategy</span>
              <span className={cn(panelClasses.statusValue, strategyClass)}>
                {status?.conflictStrategy || "auto-merge"}
              </span>
            </div>
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Repositories</span>
              <span className={panelClasses.statusValue}>
                {status?.repositories?.length ?? 0}
              </span>
            </div>
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Workers</span>
              <span className={panelClasses.statusValue}>
                {status?.workers?.length ? status.workers.join(", ") : "None"}
              </span>
            </div>
            <div className={panelClasses.statusItem}>
              <span className={panelClasses.statusLabel}>Base Directory</span>
              <span className={panelClasses.statusValue}>{status?.baseDir ?? "-"}</span>
            </div>
          </div>
        </section>

        <section className={panelClasses.sectionCard}>
          <div className={panelClasses.sectionHeader}>
            <h4 className={panelClasses.sectionTitle}>Sync Configuration</h4>
          </div>
          <div className="space-y-3">
            <label className={panelClasses.checkboxRow}>
              <input
                type="checkbox"
                checked={syncOptions.dryRun}
                onChange={(event) =>
                  setSyncOptions({ ...syncOptions, dryRun: event.target.checked })
                }
                className={panelClasses.checkboxInput}
              />
              <span>
                <span className="font-medium text-foreground">Dry Run</span>
                <p className="text-sm text-muted-foreground">
                  Preview actions without applying changes to any repository.
                </p>
              </span>
            </label>

            <label className={panelClasses.checkboxRow}>
              <input
                type="checkbox"
                checked={syncOptions.verbose}
                onChange={(event) =>
                  setSyncOptions({ ...syncOptions, verbose: event.target.checked })
                }
                className={panelClasses.checkboxInput}
              />
              <span>
                <span className="font-medium text-foreground">Verbose Output</span>
                <p className="text-sm text-muted-foreground">
                  Include detailed logs for each sync operation.
                </p>
              </span>
            </label>

            <div className="space-y-2">
              <label className={panelClasses.label}>Conflict Strategy</label>
              <select
                value={syncOptions.conflictStrategy}
                onChange={(event) =>
                  setSyncOptions({
                    ...syncOptions,
                    conflictStrategy: event.target.value as "auto-merge" | "stash" | "abort",
                  })
                }
                className={panelClasses.select}
              >
                <option value="auto-merge">Auto-merge (prefer staging)</option>
                <option value="stash">Stash worker changes</option>
                <option value="abort">Abort on conflicts</option>
              </select>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={updateConfig}>
                Update Config
              </Button>
            </div>
          </div>
        </section>

        {lastSyncResult && (
          <section className={panelClasses.sectionCard}>
            <div className={panelClasses.sectionHeader}>
              <h4 className={panelClasses.sectionTitle}>Last Sync Results</h4>
              <span className={panelClasses.mutedText}>
                Updated at {new Date().toLocaleTimeString()}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className={panelClasses.resultCard}>
                <p className={cn(panelClasses.resultValue, resultAccent.success)}>
                  {lastSyncResult.successful.length}
                </p>
                <p className={panelClasses.mutedText}>Successful</p>
              </div>
              <div className={panelClasses.resultCard}>
                <p className={cn(panelClasses.resultValue, resultAccent.conflict)}>
                  {lastSyncResult.conflicts.length}
                </p>
                <p className={panelClasses.mutedText}>Conflicts</p>
              </div>
              <div className={panelClasses.resultCard}>
                <p className={cn(panelClasses.resultValue, resultAccent.error)}>
                  {lastSyncResult.errors.length}
                </p>
                <p className={panelClasses.mutedText}>Errors</p>
              </div>
              <div className={panelClasses.resultCard}>
                <p className={cn(panelClasses.resultValue, resultAccent.skipped)}>
                  {lastSyncResult.skipped.length}
                </p>
                <p className={panelClasses.mutedText}>Skipped</p>
              </div>
            </div>

            {lastSyncResult.conflicts.length > 0 && (
              <div className={panelClasses.detailList}>
                <h5 className="text-sm font-semibold text-foreground">Conflicts</h5>
                {lastSyncResult.conflicts.map((conflict, index) => (
                  <div key={`conflict-${index}`} className={panelClasses.detailItem}>
                    <span className={panelClasses.detailLabel}>
                      {conflict.worker}/{conflict.repo}
                    </span>
                    <span className={panelClasses.mutedText}>{conflict.path}</span>
                    <span className="text-xs text-muted-foreground">
                      {conflict.status || "Unresolved"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lastSyncResult.errors.length > 0 && (
              <div className={panelClasses.detailList}>
                <h5 className="text-sm font-semibold text-foreground">Errors</h5>
                {lastSyncResult.errors.map((log, index) => (
                  <div key={`error-${index}`} className={panelClasses.detailItem}>
                    <span className={panelClasses.detailLabel}>
                      {(log.worker || "main") + "/" + log.repo}
                    </span>
                    <span className={panelClasses.mutedText}>{log.error}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className={panelClasses.sectionCard}>
          <div className={panelClasses.sectionHeader}>
            <h4 className={panelClasses.sectionTitle}>Repository & Worker Information</h4>
          </div>
          <div className={panelClasses.infoGrid}>
            <div className={panelClasses.infoCard}>
              <h5 className={panelClasses.infoTitle}>Repositories</h5>
              <ul className={panelClasses.infoList}>
                {status?.repositories?.map((repo, index) => (
                  <li key={`repo-${index}`}>{repo}</li>
                ))}
              </ul>
            </div>
            <div className={panelClasses.infoCard}>
              <h5 className={panelClasses.infoTitle}>Workers</h5>
              <ul className={panelClasses.infoList}>
                {status?.workers?.map((worker, index) => (
                  <li key={`worker-${index}`}>{worker}</li>
                ))}
              </ul>
            </div>
            <div className={panelClasses.infoCard}>
              <h5 className={panelClasses.infoTitle}>Base Directory</h5>
              <p className={panelClasses.infoText}>{status?.baseDir ?? "-"}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className={panelClasses.errorContainer}>
            <p className="font-medium text-destructive">❌ {error}</p>
            <Button variant="outline" onClick={fetchStatus} size="sm">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
