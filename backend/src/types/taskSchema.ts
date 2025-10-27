/**
 * Task Schema Validation
 * 
 * Zod schemas for type-safe task validation
 */

import { z } from 'zod';

// Task status enum
export const TaskStatus = z.enum([
  'pending',
  'assigned',
  'active',
  'completed',
  'failed',
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

// Task schema
export const TaskSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  documentation: z.string().optional(),
  notes: z.string().optional(),
  status: TaskStatus,
  createdAt: z.string().datetime(),
  assignedWorker: z.string().optional(),
  assignedAgent: z.string(),
  assignedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
  prompt: z.string().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  project: z.string().optional(),
  priority: z.number().min(0).max(10).default(5),
  retryCount: z.number().min(0).default(0),
  maxRetries: z.number().min(0).default(3),
  timeout: z.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// Partial task for updates
export const TaskUpdateSchema = TaskSchema.partial().required({ id: true });
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;

// Task creation schema (without generated fields)
export const TaskCreateSchema = z.object({
  type: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  documentation: z.string().optional(),
  notes: z.string().optional(),
  assignedAgent: z.string().optional(),
  prompt: z.string().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  project: z.string().optional(),
  priority: z.number().min(0).max(10).optional(),
  retryCount: z.number().min(0).optional(),
  maxRetries: z.number().min(0).optional(),
  timeout: z.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TaskCreate = z.infer<typeof TaskCreateSchema>;

// Task query filters
export const TaskQuerySchema = z.object({
  status: TaskStatus.optional(),
  type: z.string().optional(),
  assignedAgent: z.string().optional(),
  assignedWorker: z.string().optional(),
  project: z.string().optional(),
  priority: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().positive().default(100),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['createdAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
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
  retrying: z.number(),
  averageCompletionTime: z.number().optional(),
  successRate: z.number().optional(),
});

export type TaskStats = z.infer<typeof TaskStatsSchema>;
