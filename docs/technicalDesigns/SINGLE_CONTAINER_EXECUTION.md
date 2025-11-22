# Single Container Task Execution (Implemented)

**Status:** Implemented on `staging` (Nov 2025)  
**Priority:** P1 - Performance Enhancement  
**Effort:** Landed via EphemeralWorkerService reuse (no feature flag)

---

## Problem → Solution

- Previous: Each phase created/destroyed its own Docker container (~18s × 7 ≈ 126s overhead).  
- Now: One container per task reused across phases. Blocked/retry tasks keep the same container/seat. Workspace snapshots are copied to host on block. Overhead ~18s/task (~85% reduction).

---

## Architecture (what shipped)

- **Reuse, not rewrite:** `EphemeralWorkerService` now has a task-scoped worker cache (`getOrCreateWorker`). Containers are recreated only if agent/CLI changes.
- **Lifecycle:** Containers are destroyed on completion or hard failure. If a task blocks or retries, the container is preserved and continues to count toward concurrency.
- **Blocked snapshots:** On block, git status/diff/untracked are written to `/workspace/.artifacts` **and** copied to host under `backend/dev-bots/logs/../artifacts/<taskId>-blocked-*`.
- **Concurrency:** Blocked containers still hold a slot; active count reflects that.
- **Runner:** Same CLI command path/creds/logging/artifact extraction/validation/recovery as before—no new execution surface.

---

## Operational Notes

- **Cleaning blocked containers:** Use existing unblock/cleanup flows; containers are kept specifically to retain context and snapshots.
- **Host artifacts:** Look under `backend/dev-bots/logs/../artifacts/` for blocked snapshots.
- **Failure handling:** Hard failures destroy the container; blocked/retry keeps it.

---

## Files Modified (summary)

- `backend/src/services/ephemeralWorker.service.ts`  
  - Worker cache by task, blocked status, blocked snapshots to host, logging on destroy failures.
- `backend/src/services/taskExecution.service.ts`  
  - Reuse worker via cache; keep container on block/retry; destroy on completion/hard failure.

---

## What We Deliberately Did NOT Add

- No new container manager class or feature flags.  
- No per-phase containers.  
- No dual-path execution.

---

## Rollback

Revert the relevant commits and restart backend (no flags to toggle):
```bash
git revert <SHAs>
pm2 restart app-monitor-backend
```
Data loss: none (blocked snapshots already on host).

---

## Success Criteria (current state)

1) ~85% fewer container operations (1 create/destroy vs 7)  
2) ~20–30% faster task execution  
3) Blocked tasks retain context; host snapshots exist  
4) Concurrency respects blocked containers  
5) Tests: build passes; full unit/e2e still need to run after this change
