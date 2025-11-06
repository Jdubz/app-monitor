import { cn } from "@/lib/utils";

export type StatusType = "success" | "warning" | "error" | "info" | "loading";

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
}

const dotSizes: Record<NonNullable<StatusIndicatorProps["size"]>, string> = {
  small: "h-2 w-2",
  medium: "h-3 w-3",
  large: "h-4 w-4",
};

const labelSizes: Record<NonNullable<StatusIndicatorProps["size"]>, string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-base",
};

const statusColors: Record<StatusType, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-rose-500",
  info: "bg-slate-400",
  loading: "bg-sky-400",
};

export function StatusIndicator({
  status,
  label,
  pulse = false,
  size = "medium",
  showLabel = true,
}: StatusIndicatorProps) {
  const statusLabels: Record<StatusType, string> = {
    success: "Running",
    warning: "Warning",
    error: "Error",
    info: "Stopped",
    loading: "Starting…",
  };

  const displayLabel = label ?? statusLabels[status];

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="relative flex items-center justify-center">
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex rounded-full opacity-60 animate-ping",
              dotSizes[size],
              statusColors[status],
            )}
            aria-hidden="true"
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            dotSizes[size],
            statusColors[status],
          )}
          aria-hidden="true"
        />
      </span>
      {showLabel ? (
        <span className={cn("font-medium text-muted-foreground", labelSizes[size])}>{displayLabel}</span>
      ) : null}
    </div>
  );
}

interface ConnectionStatusProps {
  isConnected: boolean;
  lastUpdate?: Date;
}

export function ConnectionStatus({ isConnected, lastUpdate }: ConnectionStatusProps) {
  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <StatusIndicator
        status={isConnected ? "success" : "error"}
        label={isConnected ? "Connected" : "Disconnected"}
        pulse={isConnected}
        size="small"
      />
      {lastUpdate && isConnected ? (
        <span className="text-xs text-muted-foreground/80">Updated {getTimeAgo(lastUpdate)}</span>
      ) : null}
    </div>
  );
}

interface ProcessStatusProps {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  uptime?: number;
}

export function ProcessStatus({ status, uptime }: ProcessStatusProps) {
  const statusMap: Record<ProcessStatusProps["status"], StatusType> = {
    stopped: "info",
    starting: "loading",
    running: "success",
    stopping: "warning",
    error: "error",
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <StatusIndicator
        status={statusMap[status]}
        label={status.charAt(0).toUpperCase() + status.slice(1)}
        pulse={status === "starting" || status === "running"}
        size="small"
      />
      {uptime !== undefined && status === "running" ? (
        <span className="text-xs text-muted-foreground/80">Uptime: {formatUptime(uptime)}</span>
      ) : null}
    </div>
  );
}
