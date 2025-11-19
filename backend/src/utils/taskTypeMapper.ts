/**
 * Task Type Mapping Utility
 * 
 * Provides utilities for mapping raw task type strings (including aliases)
 * to canonical TaskType values from api-contracts.
 */

import { TASK_TYPES, type TaskType } from '@app-monitor/api-contracts';

/**
 * Map raw task type string to canonical TaskType
 * 
 * Handles aliases like 'bugfix' -> 'fix' and 'bug' -> 'fix'
 * Falls back to 'implementation' for unknown types
 * 
 * @param type Raw task type string (may be alias or canonical)
 * @returns Canonical TaskType
 */
export function mapTaskType(type: string): TaskType {
  const typeMap: Record<string, TaskType> = {
    'implementation': TASK_TYPES.IMPLEMENTATION,
    'fix': TASK_TYPES.FIX,
    'bugfix': TASK_TYPES.FIX,
    'bug': TASK_TYPES.FIX,
    'review': TASK_TYPES.REVIEW,
    'pr-follow-up': TASK_TYPES.PR_FOLLOW_UP,
    'analysis': TASK_TYPES.ANALYSIS
  };
  
  return typeMap[type.toLowerCase()] || TASK_TYPES.IMPLEMENTATION;
}
