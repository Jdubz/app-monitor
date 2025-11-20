# Analysis: Phase System vs Chain Concurrency

## Investigation
- Read `backend/src/services/taskQueue.sqlite.ts` (assignNextTask, chainTracker) and `config.ts` to confirm `maxConcurrentChains === MAX_DEV_BOTS`.
- Walked through sample task lifecycles to map how a single task progresses through seven phases without spawning extra queue entries.
- Verified that follow-up tasks (reviews/fixes) reuse the same `chain_id`, so activating a new chain is the only way to consume another concurrency slot.

## Findings
1. **Chain Is the Sole Concurrency Unit** – Every task (implementation or follow-up) carries `chain_id`, so the scheduler only increments active-chain count when dequeuing the first implementation task.
2. **Phase Progression Does Not Affect Slots** – `phase_index`, `phase_status`, and retries operate within a task already tied to an active chain; no additional chain activation occurs during 3↔4 or Phase 5 loops.
3. **Worker Count Mirrors Chain Limit** – `config.devBots.maxWorkers` feeds both worker pool size and `maxConcurrentChains`, ensuring we cannot start more chains than workers available.
4. **Only Risk: Missing Regression Tests** – If future refactors decouple chain activation from worker count, the invariant could be broken without alarms.

## Action Items
- [ ] **Platform Tooling · P1:** Add an automated regression test in `backend/src/services/__tests__/taskQueue.sqlite.test.ts` that asserts active chains never exceed `config.devBots.maxWorkers` even when multiple phases loop.
- [ ] **Dev-Bot Runtime · P2:** Emit a telemetry counter (`chain_concurrency_violation`) in `TaskQueueService.assignNextTask()` so we get runtime alerts if the invariant ever fails.
- [ ] **Docs · P3:** Add a short note to `docs/architecture/master-design-intent.md` (Chain Concurrency Control section) clarifying that max chains === max workers to guide future contributors.

## Delete After
2025-12-17 (no later than 30 days from 2025-11-17)
