import { CheckCircle2, Clock, XCircle, CircleDot, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Shared status icon and color utilities
 * Consolidates duplicate status logic across tab components
 */

export type TaskStatus = 'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'blocked';

/**
 * Returns the appropriate icon component for a task status
 * @param status - The task status
 * @returns React icon component with appropriate styling
 */
export function getTaskStatusIcon(status: TaskStatus): ReactNode {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'blocked':
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case 'active':
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case 'assigned':
      return <CircleDot className="h-4 w-4 text-cyan-500" />;
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * Returns the appropriate text color class for a task status
 * @param status - The task status
 * @returns Tailwind text color class name
 */
export function getTaskStatusColor(status: TaskStatus): string {
  const colorMap: Record<TaskStatus, string> = {
    completed: 'text-green-600',
    failed: 'text-red-600',
    blocked: 'text-amber-600',
    active: 'text-blue-600',
    assigned: 'text-cyan-600',
    pending: 'text-muted-foreground',
  };

  return colorMap[status] || 'text-muted-foreground';
}

/**
 * Returns the appropriate background color class for a task status badge
 * @param status - The task status
 * @returns Tailwind background color class name
 */
export function getTaskStatusBgColor(status: TaskStatus): string {
  const bgColorMap: Record<TaskStatus, string> = {
    completed: 'bg-green-500/10 text-green-700 dark:text-green-400',
    failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
    blocked: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    active: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    assigned: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    pending: 'bg-muted text-muted-foreground',
  };

  return bgColorMap[status] || 'bg-muted text-muted-foreground';
}

/**
 * Returns a human-readable label for a task status
 * @param status - The task status
 * @returns Capitalized status label
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  const labelMap: Record<TaskStatus, string> = {
    completed: 'Completed',
    failed: 'Failed',
    active: 'Active',
    assigned: 'Assigned',
    pending: 'Pending',
  };

  return labelMap[status] || 'Unknown';
}

/**
 * Checks if a task status indicates the task is in progress
 * @param status - The task status
 * @returns True if the task is active or assigned
 */
export function isTaskInProgress(status: TaskStatus): boolean {
  return status === 'active' || status === 'assigned';
}

/**
 * Checks if a task status indicates the task is completed (success or failure)
 * @param status - The task status
 * @returns True if the task is completed or failed
 */
export function isTaskDone(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed';
}

/**
 * Checks if a task status indicates success
 * @param status - The task status
 * @returns True if the task is completed successfully
 */
export function isTaskSuccessful(status: TaskStatus): boolean {
  return status === 'completed';
}

/**
 * Checks if a task status indicates failure
 * @param status - The task status
 * @returns True if the task failed
 */
export function isTaskFailed(status: TaskStatus): boolean {
  return status === 'failed';
}
