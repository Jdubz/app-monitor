/**
 * Plan Types
 *
 * Types for the AI agent-managed planning system.
 * Plans track multi-task initiatives with automatic status computation.
 */

/**
 * Plan entity stored in the database
 */
export interface Plan {
  id: string;
  title: string;
  description?: string;
  markdown_ref?: string; // Reference to docs/plans/*.md file

  // Categorization
  plan_type: 'feature' | 'refactor' | 'fix' | 'investigation';
  priority: 'p0' | 'p1' | 'p2' | 'p3';

  // Lifecycle (status is computed but stored for query performance)
  status: 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  created_at: number; // Unix timestamp
  started_at?: number; // When first task started
  completed_at?: number; // When all tasks completed
  cancelled_at?: number;

  // Ownership & tracking
  created_by?: string; // User or AI agent who created plan
  assigned_to?: string; // Team/person responsible

  // Goals & scope
  success_criteria?: string[]; // Array of success criteria
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Scope boundaries for a plan
 */
export interface PlanScopeBoundaries {
  mustNotChange?: string[]; // Files/systems that must not be modified
  mustNotAffect?: string[]; // Systems that must not be impacted
  integrationPoints?: string[]; // Systems that will be affected
}

/**
 * Plan status type (derived from task states)
 */
export type PlanStatus = 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

/**
 * Plan type categorization
 */
export type PlanType = 'feature' | 'refactor' | 'fix' | 'investigation';

/**
 * Plan priority levels
 */
export type PlanPriority = 'p0' | 'p1' | 'p2' | 'p3';

/**
 * Real-time plan progress computed from task/PR/chain state
 */
export interface PlanProgress {
  // Task metrics
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksRunning: number;
  tasksFailed: number;
  tasksCancelled: number;

  // PR metrics
  prsTotal: number;
  prsMerged: number;
  prsOpen: number;
  prsClosed: number;
  prsBlocked: number;

  // Chain metrics
  chainsActive: number;
  chainsBlocked: number;
  chainsClosed: number;

  // Overall progress
  percentComplete: number; // 0-100
  estimatedHoursRemaining?: number;
}

/**
 * PR status for a plan (aggregated from linked tasks)
 */
export interface PlanPRStatus {
  prs: Array<{
    number: number;
    taskId: string;
    status: 'open' | 'merged' | 'closed';
    url?: string;
    branch?: string;
    created_at?: string;
    merged_at?: string;
  }>;
  blockingIssues: string[]; // Aggregated from all PR merge gates
}

/**
 * Chain status for a plan (inherited from tasks)
 */
export interface PlanChainStatus {
  activeChains: number;
  blockedChains: Array<{
    chainId: string;
    taskId: string;
    blockedReason?: string;
    blockedAt?: number;
  }>;
  escalationNeeded: boolean;
  escalationReason?: string;
}

/**
 * Comprehensive plan details with computed status
 */
export interface PlanDetails extends Plan {
  progress: PlanProgress;
  prStatus: PlanPRStatus;
  chainStatus: PlanChainStatus;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    pr_number?: number;
    chain_id?: string;
    chain_status?: string;
  }>;
}

/**
 * Input for creating a new plan
 */
export interface CreatePlanInput {
  title: string;
  description?: string;
  markdown_ref?: string;
  plan_type: PlanType;
  priority: PlanPriority;
  created_by?: string;
  assigned_to?: string;
  success_criteria?: string[];
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating an existing plan
 */
export interface UpdatePlanInput {
  title?: string;
  description?: string;
  markdown_ref?: string;
  plan_type?: PlanType;
  priority?: PlanPriority;
  assigned_to?: string;
  success_criteria?: string[];
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;
  metadata?: Record<string, unknown>;
  // Note: status is computed, cannot be manually updated
}

/**
 * Query filters for listing plans
 */
export interface PlanQueryFilters {
  status?: PlanStatus | PlanStatus[];
  priority?: PlanPriority | PlanPriority[];
  plan_type?: PlanType | PlanType[];
  created_by?: string;
  assigned_to?: string;
}

/**
 * Plan list item (lightweight version for list views)
 */
export interface PlanListItem {
  id: string;
  title: string;
  plan_type: PlanType;
  priority: PlanPriority;
  status: PlanStatus;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  created_by?: string;
  assigned_to?: string;
  progress: {
    tasksTotal: number;
    tasksCompleted: number;
    percentComplete: number;
  };
  hasBlockers: boolean;
}
