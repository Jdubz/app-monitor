/**
 * Task Schema Validation
 *
 * Zod schemas for API validation only.
 * Task type itself comes from SQLite (canonical source of truth).
 */

import { z } from 'zod';

// Re-export canonical Task type from SQLite (database is authoritative per Master Design Intent)
export type { Task, TaskStatus as SQLiteTaskStatus, Worker } from '../services/taskQueue.sqlite.js';

// Task status enum for Zod validation (matches SQLite values)
export const TaskStatus = z.enum([
  'pending',
  'assigned',
  'active',
  'completed',
  'failed',
  'cancelled',
  'timeout',
  'retrying'
]);

export type TaskStatusType = z.infer<typeof TaskStatus>;

// Task type enum (based on existing types)
export const TaskType = z.enum([
  'feature',
  'bug-fix',
  'refactor',
  'documentation',
  'test',
  'security',
  'performance',
  'infrastructure',
  'maintenance'
]);

export type TaskTypeType = z.infer<typeof TaskType>;

// Task schema for API validation (snake_case to match SQLite)
// NOTE: This is for validation only, not for creating a separate Task type
export const TaskSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  documentation: z.string().optional(),
  notes: z.string().optional(),
  status: TaskStatus,
  created_at: z.number(), // Unix timestamp in ms
  assigned_worker: z.string().optional(),
  assigned_agent: z.string(),
  assigned_at: z.number().optional(), // Unix timestamp in ms
  completed_at: z.number().optional(), // Unix timestamp in ms
  started_at: z.number().optional(), // Unix timestamp in ms
  output: z.string().optional(),
  error: z.string().optional(),
  prompt: z.string().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  architecture_references: z.array(z.string()).optional(),
  validation_steps: z.array(z.string()).optional(),
  success_metrics: z.array(z.string()).optional(),
  estimated_hours: z.number().optional(),
  complexity: z.string().optional(),
  priority: z.number().min(0).max(10).default(5),
  can_retry: z.boolean().optional(),
  retry_count: z.number().min(0).default(0),
  max_retries: z.number().min(0).default(3),
  timeout_ms: z.number().positive().nullable().optional(),
  fingerprint: z.string().optional(),
  agent_type: z.string().optional(),
});

// Partial task for updates
export const TaskUpdateSchema = TaskSchema.partial().required({ id: true });
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;

// Task creation schema (without generated fields, snake_case)
export const TaskCreateSchema = z.object({
  type: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  documentation: z.string().optional(),
  notes: z.string().optional(),
  assigned_agent: z.string().optional(),
  prompt: z.string().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  architecture_references: z.array(z.string()).optional(),
  validation_steps: z.array(z.string()).optional(),
  success_metrics: z.array(z.string()).optional(),
  estimated_hours: z.number().optional(),
  complexity: z.string().optional(),
  priority: z.number().min(0).max(10).optional(),
  retry_count: z.number().min(0).optional(),
  max_retries: z.number().min(0).optional(),
  timeout_ms: z.number().positive().optional(),
});

export type TaskCreate = z.infer<typeof TaskCreateSchema>;

// Task query filters (snake_case)
export const TaskQuerySchema = z.object({
  status: TaskStatus.optional(),
  type: z.string().optional(),
  assigned_agent: z.string().optional(),
  assigned_worker: z.string().optional(),
  priority: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  created_after: z.number().optional(), // Unix timestamp
  created_before: z.number().optional(), // Unix timestamp
  limit: z.number().positive().default(100),
  offset: z.number().min(0).default(0),
  sort_by: z.enum(['created_at', 'priority', 'status']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type TaskQuery = z.infer<typeof TaskQuerySchema>;

// Task statistics
export const TaskStatsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  assigned: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  cancelled: z.number(),
  timeout: z.number(),
  retrying: z.number(),
  average_completion_time: z.number().optional(),
  success_rate: z.number().optional(),
});

export type TaskStats = z.infer<typeof TaskStatsSchema>;
