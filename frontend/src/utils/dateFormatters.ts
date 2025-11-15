/**
 * Shared date and time formatting utilities
 * Consolidates duplicate formatting logic across components
 */

/**
 * Formats a timestamp as a relative time string (e.g., "2m ago", "5h ago", "3d ago")
 * @param timestamp - Can be an ISO string, Unix timestamp (ms), or undefined
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp?: string | number): string {
  if (!timestamp) {
    return 'unknown';
  }

  const date = typeof timestamp === 'number'
    ? timestamp
    : new Date(timestamp).getTime();

  const diff = Date.now() - date;

  if (diff < 0) return 'in the future';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Formats a timestamp as a localized date/time string
 * @param timestamp - ISO string or Unix timestamp (ms)
 * @returns Formatted date/time string
 */
export function formatTimestamp(timestamp: string | number): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp)
    : new Date(timestamp);

  return date.toLocaleString();
}

/**
 * Formats a timestamp as a localized date string (no time)
 * @param timestamp - ISO string or Unix timestamp (ms)
 * @returns Formatted date string
 */
export function formatDate(timestamp: string | number): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp)
    : new Date(timestamp);

  return date.toLocaleDateString();
}

/**
 * Formats a timestamp as a localized time string (no date)
 * @param timestamp - ISO string or Unix timestamp (ms)
 * @returns Formatted time string
 */
export function formatTime(timestamp: string | number): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp)
    : new Date(timestamp);

  return date.toLocaleTimeString();
}

/**
 * Formats a duration in milliseconds as a human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "2m 30s", "1h 15m")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}
