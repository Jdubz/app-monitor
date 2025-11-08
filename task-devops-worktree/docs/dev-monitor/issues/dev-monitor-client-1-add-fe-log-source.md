# DEV-MONITOR-CLIENT-1 — Add Frontend Client as Log Source

## Issue Metadata

```yaml
Title: DEV-MONITOR-CLIENT-1 — Add Frontend Client as Log Source
Labels: [priority-p1, repository-dev-monitor, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 8-10 hours
Repository: dev-monitor
GitHub Issue: TBD
```

## Summary

**ENHANCEMENT**: Add the job-finder-FE client as a log source in the dev-monitor, including implementing the log streaming from the client in the job-finder-FE repository. For staging and production, the job-finder-FE client should log to Google Cloud Logging.

## Background & Context

### Project Overview
**Application Name**: Dev Monitor Application  
**Technology Stack**: Node.js, Express, WebSocket, Google Cloud Logging, React  
**Architecture**: Centralized log monitoring system with multiple log sources

### This Repository's Role
The dev-monitor provides centralized monitoring for all development services, including backend services, worker processes, and now frontend client applications.

### Current State
The application currently:
- ✅ **Backend log capture**: Successfully captures logs from backend services
- ✅ **Worker log capture**: Successfully captures logs from worker processes
- ❌ **Frontend client logs**: No frontend client log capture
- ❌ **Google Cloud integration**: No cloud logging for production environments

### Desired State
After completion:
- Frontend client logs are captured and streamed to dev-monitor
- Staging and production frontend logs are sent to Google Cloud Logging
- Complete log visibility across all application layers
- Unified log monitoring for full-stack applications

## Technical Specifications

### Affected Files
```yaml
DEV-MONITOR REPOSITORY:
CREATE:
- backend/src/services/frontendLogCapture.ts - Frontend log capture service
- backend/src/services/cloudLogging.ts - Google Cloud Logging integration
- backend/src/types/frontendLogTypes.ts - Frontend log type definitions
- backend/src/config/cloudLogging.ts - Cloud logging configuration

MODIFY:
- backend/src/services/logCapture.ts - Add frontend log handling
- backend/src/routes/logs.ts - Add frontend log endpoints
- frontend/src/components/LogViewer.tsx - Add frontend log display

JOB-FINDER-FE REPOSITORY:
CREATE:
- src/utils/logging/clientLogger.ts - Client-side logging utility
- src/utils/logging/cloudLogger.ts - Google Cloud Logging client
- src/utils/logging/logStream.ts - WebSocket log streaming
- src/config/logging.ts - Logging configuration

MODIFY:
- src/main.tsx - Initialize client logging
- src/App.tsx - Add log streaming setup
- package.json - Add logging dependencies
```

### Technology Requirements
**Languages**: TypeScript, JavaScript  
**Frameworks**: React, Node.js, Express, WebSocket  
**Tools**: Google Cloud Logging, WebSocket, PM2  
**Dependencies**: @google-cloud/logging, ws, existing dev-monitor infrastructure

### Code Standards
**Naming Conventions**: Follow existing service naming patterns  
**File Organization**: Place logging utilities in `src/utils/logging/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Implement Frontend Logging in job-finder-FE**
   - Create client-side logging utility with different log levels
   - Implement WebSocket connection for real-time log streaming
   - Add Google Cloud Logging integration for staging/production
   - Configure logging based on environment (dev vs staging vs production)

2. **Update Dev-Monitor Backend**
   - Add frontend log capture service to handle client logs
   - Implement Google Cloud Logging service for production logs
   - Update log routing to handle frontend log sources
   - Add frontend log type definitions and validation

3. **Implement Log Streaming**
   - Create WebSocket connection between frontend and dev-monitor
   - Implement log streaming protocol for frontend logs
   - Add log buffering and retry logic for network issues
   - Handle connection lifecycle and reconnection

4. **Add Google Cloud Integration**
   - Configure Google Cloud Logging for staging and production
   - Implement log forwarding from dev-monitor to Google Cloud
   - Add log filtering and aggregation for cloud logs
   - Set up log retention and archival policies

5. **Update Frontend Log Display**
   - Add frontend log source to log viewer
   - Implement log filtering by source (backend, worker, frontend)
   - Add log level filtering and search functionality
   - Update log formatting for frontend-specific logs

### Architecture Decisions

**Why this approach:**
- WebSocket for real-time log streaming
- Google Cloud Logging for production scalability
- Environment-specific logging configuration
- Unified log monitoring across all application layers

**Alternatives considered:**
- HTTP polling: Less efficient, higher latency
- File-based logging: No real-time capabilities
- External logging service: Additional complexity and cost

### Dependencies & Integration

**Internal Dependencies:**
- Depends on: Existing dev-monitor infrastructure, job-finder-FE application
- Consumed by: Dev-monitor frontend, Google Cloud Logging

**External Dependencies:**
- APIs: Google Cloud Logging API, WebSocket API
- Services: Google Cloud Platform, WebSocket server

## Testing Requirements

### Test Coverage Required

**Unit Tests:**
```typescript
describe('FrontendLogCapture', () => {
  it('should capture frontend logs via WebSocket', () => {
    // Test WebSocket log capture
  });

  it('should forward logs to Google Cloud in production', () => {
    // Test Google Cloud Logging integration
  });
});
```

**Integration Tests:**
- Test frontend log streaming to dev-monitor
- Test Google Cloud Logging integration
- Test log filtering and display

**Manual Testing Checklist**
- [ ] Frontend logs are captured and streamed to dev-monitor
- [ ] Google Cloud Logging works in staging/production
- [ ] Log filtering by source works correctly
- [ ] WebSocket connection handles network issues
- [ ] Log retention and archival work as expected

### Test Data

**Sample frontend log scenarios:**
- User interactions and events
- API call logs and responses
- Error logs and stack traces
- Performance metrics and timing

## Acceptance Criteria

- [ ] Frontend client logs are captured and streamed to dev-monitor
- [ ] Google Cloud Logging integration works for staging/production
- [ ] Log filtering by source (backend, worker, frontend) works
- [ ] WebSocket connection is stable and handles reconnection
- [ ] Log retention and archival policies are configured
- [ ] Performance impact is minimal on frontend application
- [ ] Documentation is updated with logging setup instructions

## Environment Setup

### Prerequisites
```bash
# Required tools and versions
Node.js: v18+
npm: v9+
Google Cloud SDK: latest
WebSocket: ws library
```

### Repository Setup
```bash
# Dev-monitor repository
git clone https://github.com/Jdubz/dev-monitor.git
cd dev-monitor
npm install

# Job-finder-FE repository
git clone https://github.com/Jdubz/job-finder-FE.git
cd job-finder-FE
npm install

# Environment variables needed
cp .env.example .env
# Configure Google Cloud credentials and logging settings
```

### Running Locally
```bash
# Start dev-monitor with frontend log capture
npm run dev

# Start job-finder-FE with logging enabled
npm run dev:with-logging

# Test log streaming
npm run test:log-streaming
```

## Code Examples & Patterns

### Example Implementation

**Frontend logging utility:**
```typescript
export class ClientLogger {
  private ws: WebSocket;
  private cloudLogger: CloudLogger;

  constructor() {
    this.ws = new WebSocket('ws://localhost:3001/logs');
    this.cloudLogger = new CloudLogger();
  }

  log(level: LogLevel, message: string, metadata?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      source: 'frontend'
    };

    // Stream to dev-monitor
    this.ws.send(JSON.stringify(logEntry));

    // Send to Google Cloud in production
    if (process.env.NODE_ENV === 'production') {
      this.cloudLogger.log(logEntry);
    }
  }
}
```

## Security & Performance Considerations

### Security
- [ ] No sensitive data in frontend logs
- [ ] Secure WebSocket connection (WSS in production)
- [ ] Proper Google Cloud credentials management
- [ ] Log data sanitization

### Performance
- [ ] Log streaming adds <5ms overhead per log entry
- [ ] Efficient WebSocket message handling
- [ ] Minimal impact on frontend application performance
- [ ] Proper log buffering and batching

### Error Handling
```typescript
// Proper error handling for log streaming
ws.onerror = (error) => {
  console.error('WebSocket log streaming error:', error);
  // Implement retry logic
  setTimeout(() => this.reconnect(), 5000);
};
```

## Documentation Requirements

### Code Documentation
- [ ] All logging utilities have JSDoc comments
- [ ] Google Cloud integration is documented
- [ ] WebSocket protocol is documented

### README Updates
Update repository README.md with:
- [ ] Frontend logging setup instructions
- [ ] Google Cloud Logging configuration
- [ ] Log streaming troubleshooting guide

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
feat(logging): add frontend client as log source with cloud integration

Implement frontend log capture via WebSocket streaming and Google Cloud
Logging integration for staging/production environments. Includes
client-side logging utilities and dev-monitor integration.

Closes #[issue-number]
```

### Commit Types
- `feat:` - New feature (frontend logging integration)

## PR Checklist

When submitting the PR for this issue:

- [ ] PR title matches issue title
- [ ] PR description references issue: `Closes #[issue-number]`
- [ ] All acceptance criteria met
- [ ] All tests pass locally
- [ ] No linter errors or warnings
- [ ] Code follows project style guide
- [ ] Self-review completed

## Timeline & Milestones

**Estimated Effort**: 8-10 hours  
**Target Completion**: This week (important for complete log visibility)  
**Dependencies**: Google Cloud Platform setup  
**Blocks**: Full-stack log monitoring capabilities

## Success Metrics

How we'll measure success:

- **Completeness**: All application layers now have log capture
- **Visibility**: Developers can see complete application logs
- **Scalability**: Google Cloud Logging handles production volumes
- **Performance**: Minimal impact on application performance

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:
   ```bash
   # Disable frontend logging if causing performance issues
   git revert [commit-hash]
   ```

2. **Decision criteria**: If frontend logging causes significant performance degradation

## Questions & Clarifications

**If you need clarification during implementation:**

1. **Add a comment** to this issue with what's unclear
2. **Tag the PM** for guidance
3. **Don't assume** - always ask if requirements are ambiguous

## Issue Lifecycle

```
TODO → IN PROGRESS → REVIEW → DONE
```

**Update this issue**:
- When starting work: Add `status-in-progress` label
- When PR is ready: Add `status-review` label and PR link
- When merged: Add `status-done` label and close issue

**PR must reference this issue**:
- Use `Closes #[issue-number]` in PR description

---

**Created**: 2025-10-21  
**Created By**: PM  
**Priority Justification**: Critical for complete full-stack log monitoring and production logging  
**Last Updated**: 2025-10-21
