/**
 * Time Constants
 *
 * Centralized time duration constants to eliminate magic numbers
 * and improve code readability across the application.
 */

// Base time units
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// Network timeouts
export const GITHUB_API_TIMEOUT_MS = 30 * MS_PER_SECOND;
export const WEBHOOK_TIMEOUT_MS = 30 * MS_PER_SECOND;
export const HTTP_REQUEST_TIMEOUT_MS = 30 * MS_PER_SECOND;

// Container timeouts
export const CONTAINER_START_TIMEOUT_MS = 30 * MS_PER_SECOND;
export const CONTAINER_HEALTH_CHECK_INTERVAL_MS = 100;
export const CONTAINER_HEALTH_MAX_ATTEMPTS = 300; // 30 seconds total with 100ms interval

// Worker timeouts
export const HEARTBEAT_INTERVAL_MS = 30 * MS_PER_SECOND;
export const HEARTBEAT_TIMEOUT_MS = 45 * MS_PER_SECOND;
export const IDLE_CHECK_INTERVAL_MS = 30 * MS_PER_SECOND;
export const WORKER_IDLE_TIMEOUT_MS = 5 * MS_PER_MINUTE;

// Task execution timeouts
export const TASK_MAX_DURATION_MS = 60 * MS_PER_MINUTE;
export const TASK_ABSOLUTE_MAX_DURATION_MS = 60 * MS_PER_HOUR;

// Polling intervals
export const PR_SYNC_INTERVAL_MS = 5 * MS_PER_MINUTE;
export const METRICS_UPDATE_INTERVAL_MS = 1 * MS_PER_MINUTE;
export const LOG_ROTATION_INTERVAL_MS = 24 * MS_PER_HOUR;

// Retry delays
export const RETRY_BASE_DELAY_MS = 1 * MS_PER_SECOND;
export const RETRY_MAX_DELAY_MS = 30 * MS_PER_SECOND;

/**
 * Utility Functions
 */

/**
 * Calculate a date N days in the past
 * @param days Number of days ago
 * @returns Date object for that point in time
 */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - (days * MS_PER_DAY));
}

/**
 * Add a duration to a date
 * @param date Base date
 * @param duration Duration to add in various units
 * @returns New date with duration added
 */
export function addDuration(
  date: Date,
  duration: { hours?: number; minutes?: number; seconds?: number }
): Date {
  const ms = (duration.hours ?? 0) * MS_PER_HOUR +
              (duration.minutes ?? 0) * MS_PER_MINUTE +
              (duration.seconds ?? 0) * MS_PER_SECOND;
  return new Date(date.getTime() + ms);
}

/**
 * Convert milliseconds to human-readable string
 * @param ms Milliseconds
 * @returns Human-readable string (e.g., "5m 30s")
 */
export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}
