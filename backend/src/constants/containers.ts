/**
 * Container Configuration Constants
 *
 * Centralized container resource limits and configuration values
 * for Docker-based worker execution.
 */

// Memory limits
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * BYTES_PER_KB;
export const BYTES_PER_GB = 1024 * BYTES_PER_MB;

export const CONTAINER_MEMORY_LIMIT_BYTES = 512 * BYTES_PER_MB; // 512 MB
export const CONTAINER_MEMORY_SWAP_LIMIT_BYTES = 1024 * BYTES_PER_MB; // 1 GB

// CPU limits
export const CONTAINER_CPU_QUOTA = 50000; // 50% of one CPU core (50000/100000)
export const CONTAINER_CPU_PERIOD = 100000; // Standard Docker CPU period

// User/Group IDs for worker processes
export const WORKER_UID = 1000;
export const WORKER_GID = 1000;
export const WORKER_UID_GID = `uid=${WORKER_UID},gid=${WORKER_GID}` as const;

// Container directories
export const CONTAINER_WORKSPACE_DIR = '/workspace' as const;
export const CONTAINER_HOME_DIR = '/home/worker' as const;
export const CONTAINER_CONFIG_DIRS = {
  claude: '/home/worker/.claude',
  gemini: '/home/worker/.gemini',
  codex: '/home/worker/.codex',
  copilot: '/home/worker/.copilot',
} as const;

// Container labels
export const CONTAINER_LABELS = {
  MANAGED_BY: 'app-monitor-devbots',
  VERSION: '1.0.0',
} as const;

// Network configuration
export const CONTAINER_NETWORK_MODE = 'bridge' as const;
export const CONTAINER_DNS_SERVERS = ['8.8.8.8', '8.8.4.4'] as const;

// Security options
export const CONTAINER_SECURITY_OPTS = [
  'no-new-privileges:true',
  'seccomp=unconfined', // Required for some dev tools
] as const;

/**
 * Get volume mount options for agent config directory
 * @param _agentType Agent type (claude, gemini, codex, copilot) - reserved for future use
 * @returns Volume mount options string
 */
export function getAgentConfigMountOptions(_agentType: string): string {
  return WORKER_UID_GID;
}

/**
 * Format memory limit in human-readable form
 * @param bytes Memory limit in bytes
 * @returns Human-readable string (e.g., "512 MB")
 */
export function formatMemoryLimit(bytes: number): string {
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(0)} MB`;
  }
  return `${(bytes / BYTES_PER_KB).toFixed(0)} KB`;
}

/**
 * Format CPU quota as percentage
 * @param quota CPU quota (e.g., 50000)
 * @param period CPU period (default: 100000)
 * @returns Percentage string (e.g., "50%")
 */
export function formatCPUQuota(quota: number, period: number = CONTAINER_CPU_PERIOD): string {
  const percentage = (quota / period) * 100;
  return `${percentage.toFixed(0)}%`;
}
