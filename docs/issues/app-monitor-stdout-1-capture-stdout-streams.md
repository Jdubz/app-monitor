# APP-MONITOR-STDOUT-1 — Capture stdout Streams from All Managed Services

## Issue Metadata

```yaml
Title: APP-MONITOR-STDOUT-1 — Capture stdout Streams from All Managed Services
Labels: [priority-p1, repository-app-monitor, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 4-6 hours
Repository: app-monitor
GitHub Issue: TBD
```

## Summary

**ENHANCEMENT**: Implement stdout stream capture for all managed services in the app-monitor, similar to the existing stderr capture functionality. This will provide complete log visibility for debugging and monitoring purposes.

## Background & Context

### Project Overview

**Application Name**: App Monitor Application  
**Technology Stack**: Node.js, Express, WebSocket, Docker, PM2  
**Architecture**: Real-time log monitoring system for development services

### This Repository's Role

The app-monitor repository provides a centralized monitoring interface for all development services, capturing and streaming logs in real-time to help developers debug and monitor their applications.

### Current State

The application currently:

- ✅ **stderr capture**: Successfully captures and streams stderr from all managed services
- ✅ **Real-time streaming**: WebSocket-based log streaming to frontend
- ❌ **stdout capture**: Only stderr is captured, stdout is not logged
- ❌ **Complete log visibility**: Missing stdout means incomplete debugging information

### Desired State

After completion:

- Both stdout and stderr streams are captured from all managed services
- Complete log visibility for debugging and monitoring
- Consistent logging behavior across all services
- Improved debugging capabilities with full log context

## Technical Specifications

### Affected Files

```yaml
MODIFY:
  - app-monitor/backend/src/services/logCapture.ts - Add stdout capture logic
  - app-monitor/backend/src/services/processManager.ts - Update process management for stdout
  - app-monitor/backend/src/types/logTypes.ts - Add stdout log type definitions
  - app-monitor/backend/src/config.ts - Add stdout configuration options

CREATE:
  - app-monitor/backend/src/services/stdoutCapture.ts - Dedicated stdout capture service
  - app-monitor/backend/src/utils/logFileManager.ts - File management for stdout logs
  - app-monitor/docs/logging/stdout-capture-guide.md - Documentation for stdout capture
```

### Technology Requirements

**Languages**: TypeScript, JavaScript  
**Frameworks**: Node.js, Express, WebSocket  
**Tools**: PM2, Docker, File System APIs  
**Dependencies**: Existing log capture infrastructure

### Code Standards

**Naming Conventions**: Follow existing service naming patterns  
**File Organization**: Place stdout services in `src/services/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Analyze Current stderr Implementation**
   - Review existing stderr capture in `logCapture.ts`
   - Document the current streaming mechanism
   - Identify reusable patterns for stdout implementation

2. **Create stdout Capture Service**
   - Implement `stdoutCapture.ts` service
   - Mirror stderr capture patterns for stdout
   - Add stdout-specific configuration options
   - Implement file writing for stdout logs

3. **Update Process Manager**
   - Modify `processManager.ts` to capture stdout streams
   - Add stdout event listeners to managed processes
   - Ensure both stdout and stderr are captured simultaneously
   - Handle process lifecycle for stdout streams

4. **Update Log Types and Configuration**
   - Add stdout log type definitions
   - Update configuration to include stdout settings
   - Add stdout-specific log formatting
   - Ensure consistent log structure between stdout and stderr

5. **Update Frontend Log Display**
   - Modify frontend to display stdout logs
   - Add stdout/stderr filtering options
   - Update log viewer to handle both stream types
   - Ensure proper log formatting and coloring

### Architecture Decisions

**Why this approach:**

- Mirror existing stderr implementation for consistency
- Maintain real-time streaming capabilities
- Ensure complete log capture for debugging
- Preserve existing WebSocket architecture

**Alternatives considered:**

- Combined stdout/stderr capture: More complex, potential for log mixing
- Separate stdout service: Better separation of concerns, easier maintenance

### Dependencies & Integration

**Internal Dependencies:**

- Depends on: Existing stderr capture implementation
- Consumed by: Frontend log viewer, process management system

**External Dependencies:**

- APIs: Node.js process APIs, file system APIs
- Services: PM2 process management, Docker containers

## Testing Requirements

### Test Coverage Required

**Unit Tests:**

```typescript
describe("StdoutCapture", () => {
  it("should capture stdout from managed processes", () => {
    // Test stdout capture functionality
  });

  it("should write stdout to log files", () => {
    // Test file writing for stdout
  });
});
```

**Integration Tests:**

- Test stdout capture with multiple managed services
- Test stdout streaming to frontend
- Test file writing and log persistence

**Manual Testing Checklist**

- [ ] stdout is captured from all managed services
- [ ] stdout logs are written to files
- [ ] stdout streams to frontend in real-time
- [ ] stdout and stderr can be filtered separately
- [ ] Log files contain both stdout and stderr

### Test Data

**Sample stdout scenarios:**

- Application startup messages
- Debug output from services
- Status messages and progress indicators
- Error messages that go to stdout

## Acceptance Criteria

- [ ] stdout is captured from all managed services
- [ ] stdout logs are written to files similar to stderr
- [ ] stdout streams to frontend in real-time
- [ ] Frontend can filter between stdout and stderr
- [ ] Log files contain complete log history
- [ ] No performance degradation from stdout capture
- [ ] Documentation updated with stdout capture guide

## Environment Setup

### Prerequisites

```bash
# Required tools and versions
Node.js: v18+
npm: v9+
PM2: latest
Docker: latest
```

### Repository Setup

```bash
# Clone app-monitor repository
git clone https://github.com/Jdubz/app-monitor.git
cd app-monitor

# Install dependencies
npm install

# Environment variables needed
cp .env.example .env
# Configure stdout capture settings
```

### Running Locally

```bash
# Start app-monitor with stdout capture
npm run dev

# Test stdout capture with managed services
npm run test:stdout

# Check log files
ls logs/
```

## Code Examples & Patterns

### Example Implementation

**stdout capture service:**

```typescript
export class StdoutCapture {
  private logFile: string;
  private writeStream: WriteStream;

  constructor(serviceName: string) {
    this.logFile = `logs/${serviceName}-stdout.log`;
    this.writeStream = createWriteStream(this.logFile, { flags: "a" });
  }

  capture(process: ChildProcess) {
    process.stdout?.on("data", (data) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        level: "info",
        message: data.toString(),
      };

      this.writeStream.write(JSON.stringify(logEntry) + "\n");
      this.emit("stdout", logEntry);
    });
  }
}
```

## Security & Performance Considerations

### Security

- [ ] No sensitive data in stdout logs
- [ ] Proper log file permissions
- [ ] Secure log file cleanup

### Performance

- [ ] stdout capture adds <10ms overhead per log entry
- [ ] Efficient file writing with buffering
- [ ] Memory usage remains stable during long-running processes

### Error Handling

```typescript
// Proper error handling for stdout capture
process.stdout?.on("error", (error) => {
  console.error("stdout capture error:", error);
  // Continue operation without stdout capture
});
```

## Documentation Requirements

### Code Documentation

- [ ] All stdout capture functions have JSDoc comments
- [ ] Complex stdout logic has inline comments
- [ ] Configuration options are documented

### README Updates

Update repository README.md with:

- [ ] stdout capture configuration
- [ ] How to view stdout logs
- [ ] Troubleshooting stdout capture issues

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
feat(logging): implement stdout capture for all managed services

Add stdout stream capture similar to existing stderr capture.
Includes file writing, real-time streaming, and frontend display
updates for complete log visibility.

Closes #[issue-number]
```

### Commit Types

- `feat:` - New feature (stdout capture functionality)

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

**Estimated Effort**: 4-6 hours  
**Target Completion**: This week (important for complete log visibility)  
**Dependencies**: None  
**Blocks**: Complete app-monitor logging functionality

## Success Metrics

How we'll measure success:

- **Completeness**: All managed services now capture both stdout and stderr
- **Visibility**: Developers can see complete log output for debugging
- **Performance**: No significant overhead from stdout capture
- **Usability**: Frontend provides clear separation between stdout and stderr

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:

   ```bash
   # Disable stdout capture if causing performance issues
   git revert [commit-hash]
   ```

2. **Decision criteria**: If stdout capture consistently causes performance degradation

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
**Priority Justification**: Important for complete log visibility and debugging capabilities  
**Last Updated**: 2025-10-21
