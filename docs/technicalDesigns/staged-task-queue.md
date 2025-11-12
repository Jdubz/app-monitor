# Staged Task Queue Design

**Author:** Codex Agent (per architecture owner direction)
**Date:** November 12, 2025
**Status:** Draft

## Problem Statement
Implementation tasks currently enter the same FIFO queue as all follow-up work (reviews, fixes, recovery bots, delegated tasks). When multiple implementation tasks are enqueued simultaneously, they can all start executing, saturating the dev-bot pool and producing many parallel PRs, each requiring numerous follow-up tasks. This overwhelms the automated review pipeline and violates the design intent limiting concurrent implementation chains to the number of available bots.

## Goals
1. **Chain-Aware Scheduling:** Launch new implementation tasks only when there are fewer active chains than dev-bot slots (configurable, default 3).
2. **Staged Queues:** Separate work into two logical stages:
   - **Implementation queue:** original implementation tasks awaiting chain start.
   - **Follow-up queue:** REVIEW, FIX, RECOVERY, PR tasks, Copilot delegation handlers, etc., tied to existing chains.
3. **Fairness & Progress:** Ensure follow-up tasks continue advancing even when no new chains can start.
4. **Integration Simplicity:** Operate within the existing SQLite TaskQueueService and dev-bot orchestration without introducing external brokers.

## High-Level Flow
```
Implementation Queue (new chains) ─┐
                                   ├─> Queue Worker → Dev-Bots/Copilot
Follow-up Queue (chain tasks) ─────┘
```
1. Queue worker counts active chains.
2. If `activeChains < maxBots`, it dequeues an implementation task, marking a new chain active.
3. Otherwise, it dequeues the next follow-up task.

## Detailed Behavior
### Definitions
- **Chain ID:** The `id` of the implementation task; all follow-ups reference `original_task_id` = chain ID.
- **Active chain:** Chain with pending or running tasks whose PR is not yet merged/closed.
- **Blocked chain:** Chain flagged for human intervention (e.g., >4 automated reviews). Blocked chains do not count against the concurrency cap until unblocked.

### Queue Worker Logic
1. **Compute chain stats:**
   - Query SQLite for chains marked `active`.
   - Exclude blocked chains.
2. **Select task source:**
   - If `activeChains < maxBots`: dequeue oldest implementation task (`queue_stage=implementation`) and mark `chain_status=active`.
   - Else: dequeue oldest follow-up task (`queue_stage=followup`), skipping blocked chains.
3. **Assignment & bookkeeping:**
   - Assign to dev-bot or Copilot per AgentSelector.
   - Update worker heartbeat to bind the task.
   - Store chain transitions (`chain_stage`: implementation, review, fix, validation, merged).
4. **Chain completion:**
   - When PR merges and all follow-ups finish, mark chain `closed`, freeing a slot.

### Schema Changes
- Add `queue_stage` enum (`implementation`, `followup`).
- Track chains via either:
  - New `task_chains` table (`chain_id`, `status`, `current_stage`, timestamps), or
  - Extended columns on implementation tasks.
- Indexes for `queue_stage`, `chain_status`, `chain_id` to keep lookups efficient.

### API / Service Updates
- **Task creation:** Implementation tasks default to `queue_stage=implementation` and `chain_status=pending`. Follow-up tasks inherit `chain_id` and set `queue_stage=followup`.
- **DevBotsManager / TaskExecutionService:** Must respect staged dequeue rules and update chain state when tasks finish or block.
- **Dev-monitor UI:** Display implementation vs follow-up queue depth, active vs blocked chains, and provide controls to unblock or abort chains.

### Failure Handling
- **Hung tasks:** When detected, kill container, capture artifacts, enqueue REVIEW task in follow-up queue.
- **Blocked chains:** Excluded from active count. When unblocked they may temporarily cause `activeChains > maxBots`, but no new implementation tasks start until chains return within the cap.

## Open Questions
1. Should follow-up task ordering be purely FIFO, or should certain types (e.g., FIX vs REVIEW) have priority?
2. What throttle should apply to Copilot delegated tasks so they do not overwhelm review capacity?
3. Do we need a dedicated `task_chains` table for clarity, or can we extend the tasks table without impacting performance?
4. Migration strategy for existing tasks to set `queue_stage` and `chain_status` correctly.

## Next Steps
1. Review this design with architecture owners.
2. Finalize schema changes and write migrations.
3. Implement queue worker selection logic + dev-monitor instrumentation.
4. Extend automated tests to cover staged scheduling, blocked chain handling, and follow-up ordering.
