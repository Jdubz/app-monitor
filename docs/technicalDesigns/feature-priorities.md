# Feature Priority Assessment (Impact vs Effort)

Date: November 12, 2025  
Method: Reviewed consolidated technical designs against the master design intent, evaluated impact (system stability, autonomy progression, compliance) and estimated effort (relative complexity, dependencies). Priorities assume staged queue + review chain rules are mandatory guardrails.

| Priority | Feature | Impact Summary | Effort Estimate | Rationale |
|----------|---------|----------------|-----------------|-----------|
| P0 | **Staged Task Queue** (staged-task-queue.md) | Unlocks chain-aware scheduling, preventing runaway PRs and enforcing concurrency caps required by the master intent. | Medium | Foundational for every other initiative (PR healing, review depth, blocked chain handling). Must land first so downstream work can rely on accurate chain accounting. |
| P0 | **PR Self-Healing & Resilience** (pr-self-healing-and-resilience.md) | Ensures continuous REVIEW→FIX→COMPLETE flow, Copilot gating, and infrastructure reliability (webhook heartbeat, backups). | High | Directly tied to system autonomy and correctness; blocked until staged queue rules exist but should start immediately after. |
| P1 | **Error Detection & Recovery Enhancements** (error-detection-and-recovery-design.md) | Implements structured review outputs, escalation alerts, and chain tracking per master intent. | Medium | Complements PR self-healing; enhances reliability across all tasks (not just PR). Shares dependencies but narrower scope. |
| P1 | **Dev-Bot Foundational Upgrades** (dev-bot-foundational-upgrades.md) | Delivers data/analytics backbone (session summaries, artifact DB, work targets, diagnostics) feeding review/context systems. | High | Required for reliable review chains and context bundles. Can run in parallel with PR/recovery work once staged queue schemas exist. |
| P1 | **App-Monitor Resilience & Deployments** (app-monitor-resilience-and-deployments.md) | Zero-downtime deploys, webhook heartbeat metrics, websocket state handoff. | Medium | Protects production stability and ensures the monitoring plane matches intent. |
| P2 | **Dev-Bot Context Management** (dev-bot-context-management.md) | Programmatic context bundles per task type; integrates with storage from foundational upgrades. | Medium | High leverage for bot accuracy but depends on foundational schema; schedule after base storage + review telemetry are underway. |
| P2 | **Frontend Integration Test Remediation** (frontend-integration-test-remediation-design.md) | Stabilizes FE integration tests and surfaces results in dev-monitor. | Medium-Low | Important for overall confidence but less critical than reliability/autonomy work. |
| P3 | **Bug Report System** (bug-report-system-design.md) | Structured bug capture + UI. | Medium | Valuable for ops but can wait until core automation/resilience investments land. |

## Recommended Execution Order
1. Staged Task Queue
2. PR Self-Healing & Resilience (kickoff immediately after staged queue schema in place)
3. Error Detection & Recovery enhancements (parallel with #2 once chain tracking exists)
4. Dev-Bot Foundational Upgrades (schema + diagnostics)
5. App-Monitor Resilience & Deployments
6. Dev-Bot Context Management (build on foundational storage)
7. Frontend Integration Test Remediation
8. Bug Report System

## Notes
- Master design intent requires review depth enforcement, Copilot gating, and admin visibility; P0/P1 items satisfy these guardrails.
- Context management defers until foundational storage + review telemetry exist, reducing risk of rework.
- Lower-priority items remain documented for future cycles; revisit priorities after P0/P1 completion.
