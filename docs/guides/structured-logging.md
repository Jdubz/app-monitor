# Structured Logging Aggregation (App Monitor)

App Monitor collects JSON logs from the frontend, backend, worker, and other local services, then forwards them to Google Cloud Logging when configured.

## Local File Watching
- `backend/src/services/logWatcher.ts` tails `../logs/*.log` files created by each repository.
- Ensure the expected log files exist (`backend.log`, `frontend.log`, `worker.log`, etc.).
- Use the Logs panel or multi-panel viewer to inspect real-time entries.

### Local Design Principles
1. Keep development logs local (no cloud sink).
2. Emit structured JSON conforming to shared-types.
3. Store all service logs under `/logs` in the planning repo.
4. Stream updates via Socket.IO for the UI.
5. Rotate log files to manage disk usage.

```
job-finder-app-manager/
├── logs/
│   ├── backend.log
│   ├── frontend.log
│   ├── worker.log
│   ├── dev-monitor-backend.log
│   └── archived/
├── job-finder-BE/functions/src/utils/local-logger.ts
├── job-finder-FE/src/lib/logger.ts
├── job-finder-worker/src/job_finder/logging_config.py
└── app-monitor/backend/src/services/logWatcher.ts
```

## Log Streaming API
- `/api/logs/frontend` accepts POSTed `StructuredLogEntry` payloads from the browser.
- `/api/logs/sources` lists available file-based log sources.
- Socket.IO emits `log_line` and `log_history` events to the frontend.

## Cloud Forwarding
- `backend/src/services/cloudLogging.ts` forwards logs to Google Cloud when credentials are present.
- Configure service account JSON and `GOOGLE_CLOUD_PROJECT` environment variables.
- Set `LOG_FORWARDING_ENABLED=true` to turn on forwarding in staging/production.

## Troubleshooting
- Use `npm run monitor:dev` (legacy) or `make dev` from the App Monitor repo to start both backend and frontend.
- Check `logs/app-monitor-backend.log` for errors from the Cloud Logging client.
- If log panels are empty, verify file paths in `backend/src/config.ts`.

See `docs/architecture/structured-logging-overview.md` for platform-wide context.
