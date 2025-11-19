# Master Design Intent

**Purpose:** The core, unchanging philosophy of the App Monitor system.

---

## Core Philosophy

1.  **Autonomy First:** The system operates autonomously after initial human dispatch.
2.  **Isolation Everywhere:** AI agents run in isolated, ephemeral Docker containers.
3.  **Chain-Aware Processing:** Concurrency limits apply to task chains, not individual tasks.

---

## High-Level Restrictions

-   **Event-Driven Architecture:** No cron jobs, polling loops, or timers.
-   **Minimalist UI:** Only critical controls and high-signal alerts.
-   **Filesystem Isolation:** No direct host filesystem writes.
-   **Database as Source of Truth:** All state must be persisted to the SQLite database.
-   **Deployment-Safe Architecture:** All features must survive blue-green deployment rollover.
