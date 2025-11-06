import styles from "./StatusIndicator.module.css";

export type StatusType = "success" | "warning" | "error" | "info" | "loading";

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
}

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
    loading: "Starting...",
  };

  const displayLabel = label || statusLabels[status];

  return (
    <div className={`${styles.indicator} ${styles[size]}`}>
      <span
        className={`${styles.dot} ${styles[status]} ${pulse ? styles.pulse : ""}`}
        aria-label={displayLabel}
      />
      {showLabel && <span className={styles.label}>{displayLabel}</span>}
    </div>
  );
}

interface ConnectionStatusProps {
  isConnected: boolean;
  lastUpdate?: Date;
}

export function ConnectionStatus({
  isConnected,
  lastUpdate,
}: ConnectionStatusProps) {
  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className={styles.connectionStatus}>
      <StatusIndicator
        status={isConnected ? "success" : "error"}
        label={isConnected ? "Connected" : "Disconnected"}
        pulse={isConnected}
        size="small"
      />
      {lastUpdate && isConnected && (
        <span className={styles.timestamp}>
          Updated {getTimeAgo(lastUpdate)}
        </span>
      )}
    </div>
  );
}

interface ProcessStatusProps {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  uptime?: number;
}

export function ProcessStatus({ status, uptime }: ProcessStatusProps) {
  const statusMap: Record<string, StatusType> = {
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
    <div className={styles.processStatus}>
      <StatusIndicator
        status={statusMap[status]}
        label={status.charAt(0).toUpperCase() + status.slice(1)}
        pulse={status === "starting" || status === "running"}
      />
      {uptime !== undefined && status === "running" && (
        <span className={styles.uptime}>Uptime: {formatUptime(uptime)}</span>
      )}
    </div>
  );
}
