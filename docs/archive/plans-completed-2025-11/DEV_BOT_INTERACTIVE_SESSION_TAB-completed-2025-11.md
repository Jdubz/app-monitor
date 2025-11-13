# Dev-Bot Interactive Session Tab (Archived)

> **Archived:** November 11, 2025  
> **Superseded by:** [PRIORITIZED_FEATURE_ROADMAP.md – P2.2](../../plans/PRIORITIZED_FEATURE_ROADMAP.md#p22-interactive-session-tab-optional-enhancement) and the Interactive Sessions sections in [frontend/README.md](../../../frontend/README.md) + [backend/README.md](../../../backend/README.md)

The interactive session tab plan described the UI/UX work required for humans to
attach to a running dev-bot container, stream logs, and issue commands with the
same safety rails as automated tasks. The implementation landed during the
November 2025 stabilization cycle, after which the detailed plan was removed.

## Delivered scope (snapshot)

1. **Session lifecycle wiring**
   - WebSocket channel exposed at `/ws/dev-bots/sessions/:id`.
   - Bidirectional streaming bridging the browser terminal and the
     container-namespace shell.
   - Session heartbeat + idle timeout mirrored from automation jobs.

2. **UI tab + controls**
   - Dev Monitor tab with terminal view, log history scroller, and session
     metadata (bot, task id, started at, status).
   - Inline controls for `End Session`, `Send Ctrl+C`, log level filters, and
     a collapsible execution transcript.

3. **Safety + auditing**
   - Session transcripts automatically stored in the shared log sink.
   - Command whitelist + structured logging aligned with the stabilization plan
     safety matrix.

## Where to find the living docs

- Feature status + backlog: `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md`
- Backend implementation notes: `backend/README.md` (`Interactive Sessions`)
- Frontend UX patterns: `frontend/README.md` (`Interactive Sessions` and
  Playwright scenarios)

This stub exists solely to keep legacy ToC links functioning; new work should
extend the active references above.
