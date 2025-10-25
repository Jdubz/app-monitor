# DEV-MONITOR-UI-2 — Multiple Log Panels with Source Selectors

## Issue Metadata

```yaml
Title: DEV-MONITOR-UI-2 — Multiple Log Panels with Source Selectors
Labels: [priority-p1, repository-dev-monitor, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 6-8 hours
Repository: dev-monitor
GitHub Issue: TBD
```

## Summary

**ENHANCEMENT**: Implement multiple log panels with source selectors, allowing users to create multiple log viewing panels that can monitor different services, environments, or log sources simultaneously. Each panel will have its own source selector to choose which service or environment to monitor.

## Background & Context

### Project Overview
**Application Name**: Dev Monitor Application  
**Technology Stack**: React 18, TypeScript, Socket.IO, React Context  
**Architecture**: Real-time monitoring system with multiple concurrent log streams

### This Repository's Role
The dev-monitor provides centralized monitoring for all development services, and this enhancement will allow developers to monitor multiple log sources simultaneously in separate panels.

### Current State
The application currently:
- ✅ **Single log panel**: One logs panel per environment tab
- ✅ **Service filtering**: Can filter logs by service within a single panel
- ❌ **No multiple panels**: Cannot create multiple log panels
- ❌ **No source selectors**: Cannot choose different sources per panel
- ❌ **No concurrent monitoring**: Cannot monitor multiple services simultaneously
- ❌ **No panel-specific filtering**: Each panel needs independent filtering

### Desired State
After completion:
- Multiple log panels can be created and configured independently
- Each panel has its own source selector (service, environment, log type)
- Panels can monitor different services or environments simultaneously
- Independent filtering and controls per panel
- Panel-specific log streaming and buffering
- Copyable panel configurations with source settings

## Technical Specifications

### Affected Files
```yaml
CREATE:
- frontend/src/components/logs/MultiLogPanel.tsx - Multiple log panels container
- frontend/src/components/logs/LogPanel.tsx - Individual log panel component
- frontend/src/components/logs/SourceSelector.tsx - Source selection component
- frontend/src/components/logs/PanelControls.tsx - Panel-specific controls
- frontend/src/hooks/useMultiLogStream.ts - Multiple log stream management
- frontend/src/hooks/usePanelSource.ts - Panel source management
- frontend/src/services/panelManager.ts - Panel state management
- frontend/src/types/panel.types.ts - Panel type definitions

MODIFY:
- frontend/src/components/LogsViewer.tsx - Make compatible with multi-panel
- frontend/src/hooks/useLogStream.ts - Support multiple concurrent streams
- frontend/src/App.tsx - Integrate multi-panel layout
```

### Technology Requirements
**Languages**: TypeScript, JavaScript  
**Frameworks**: React 18, Socket.IO, React Context  
**Tools**: React Grid Layout, Local Storage  
**Dependencies**: Existing Socket.IO client, React Context API

### Code Standards
**Naming Conventions**: Follow existing component naming patterns  
**File Organization**: Place log components in `src/components/logs/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Create Panel Type System**
   - Define LogPanelConfig interface with source settings
   - Create PanelSource enum (service, environment, log-type)
   - Add panel state management types
   - Define panel persistence structure

2. **Implement Source Selector Component**
   - Create SourceSelector with dropdown for service selection
   - Add environment selector (local, staging, production)
   - Add log type selector (stdout, stderr, combined)
   - Implement source validation and error handling

3. **Create Individual Log Panel Component**
   - Implement LogPanel with independent log streaming
   - Add panel-specific controls (pause, clear, download)
   - Add panel-specific filtering (service, level, search)
   - Include panel header with source information

4. **Implement Multi-Panel Container**
   - Create MultiLogPanel container component
   - Add panel creation and deletion functionality
   - Implement panel duplication with source copying
   - Add panel configuration management

5. **Add Multi-Stream Management**
   - Create useMultiLogStream hook for concurrent streams
   - Implement independent Socket.IO subscriptions per panel
   - Add stream buffering and management per panel
   - Handle stream cleanup and reconnection

6. **Integrate with Layout System**
   - Connect with draggable/resizable layout system
   - Add panel-specific layout persistence
   - Implement panel templates with source presets
   - Add layout export/import with source configurations

### Architecture Decisions

**Why this approach:**
- Independent log streams per panel for better performance
- Source selectors provide flexibility in monitoring
- Panel-based architecture allows for customization
- React Context for shared state management

**Alternatives considered:**
- Single stream with filtering: Less flexible, performance issues
- Tab-based approach: Less concurrent visibility
- Modal-based panels: Poor user experience

### Dependencies & Integration

**Internal Dependencies:**
- Depends on: Existing LogsViewer, Socket.IO integration, layout system
- Consumed by: Dashboard layout, panel management

**External Dependencies:**
- APIs: Socket.IO API, React Context API
- Services: Log streaming service, panel management service

## Testing Requirements

### Test Coverage Required

**Unit Tests:**
```typescript
describe('LogPanel', () => {
  it('should display logs from selected source', () => {
    // Test source selection and log display
  });

  it('should handle independent filtering', () => {
    // Test panel-specific filtering
  });
});
```

**Integration Tests:**
- Test multiple concurrent log streams
- Test source selector functionality
- Test panel creation and deletion

**Manual Testing Checklist**
- [ ] Multiple log panels can be created
- [ ] Each panel can select different sources
- [ ] Panels stream logs independently
- [ ] Source selectors work correctly
- [ ] Panel controls work independently
- [ ] Panel configurations can be copied

### Test Data

**Sample panel scenarios:**
- Multiple panels monitoring different services
- Panels with different environment sources
- Panels with different log types (stdout vs stderr)
- Mixed panel configurations

## Acceptance Criteria

- [ ] Multiple log panels can be created and configured
- [ ] Each panel has independent source selection
- [ ] Panels can monitor different services simultaneously
- [ ] Source selectors include service, environment, and log type options
- [ ] Panel-specific filtering and controls work independently
- [ ] Panel configurations can be copied and duplicated
- [ ] Log streaming works correctly for multiple panels
- [ ] Panel state persists across page refreshes
- [ ] Performance remains good with multiple panels
- [ ] Accessibility features work for all panels

## Environment Setup

### Prerequisites
```bash
# Required tools and versions
Node.js: v18+
npm: v9+
React: v18+
TypeScript: v5+
Socket.IO: latest
```

### Repository Setup
```bash
# Clone dev-monitor repository
git clone https://github.com/Jdubz/dev-monitor.git
cd dev-monitor

# Install dependencies
npm install

# Environment variables needed
cp .env.example .env
# Configure Socket.IO and panel settings
```

### Running Locally
```bash
# Start dev-monitor with multi-panel support
npm run dev

# Test multi-panel functionality
npm run test:multi-panel

# Check panel source selection
npm run test:sources
```

## Code Examples & Patterns

### Example Implementation

**LogPanel component:**
```typescript
interface LogPanelProps {
  panelId: string;
  source: PanelSource;
  onSourceChange: (source: PanelSource) => void;
  onRemove: () => void;
  onCopy: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({
  panelId,
  source,
  onSourceChange,
  onRemove,
  onCopy
}) => {
  const { logs, isLoading, error } = useLogStream(panelId, source);
  const { filteredLogs, filters, setFilters } = useLogFilter(logs);

  return (
    <div className="log-panel">
      <PanelHeader
        source={source}
        onSourceChange={onSourceChange}
        onRemove={onRemove}
        onCopy={onCopy}
      />
      <SourceSelector
        value={source}
        onChange={onSourceChange}
        availableSources={getAvailableSources()}
      />
      <LogsViewer
        logs={filteredLogs}
        filters={filters}
        onFiltersChange={setFilters}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};
```

## Security & Performance Considerations

### Security
- [ ] No XSS vulnerabilities in log content
- [ ] Secure panel configuration storage
- [ ] Input validation for source selectors

### Performance
- [ ] Efficient log streaming for multiple panels
- [ ] Optimized re-rendering during log updates
- [ ] Memory management for multiple log buffers
- [ ] Smooth scrolling and filtering performance

### Error Handling
```typescript
// Proper error handling for multi-panel operations
const handleStreamError = (panelId: string, error: Error) => {
  console.error(`Stream error for panel ${panelId}:`, error);
  // Attempt reconnection or show error state
  attemptReconnection(panelId);
};
```

## Documentation Requirements

### Code Documentation
- [ ] All panel components have JSDoc comments
- [ ] Multi-stream hooks are documented
- [ ] Source selector logic is documented

### README Updates
Update repository README.md with:
- [ ] Multi-panel setup instructions
- [ ] Source selector configuration guide
- [ ] Panel management best practices

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
feat(panels): implement multiple log panels with source selectors

Add multi-panel log viewing with independent source selection
for each panel. Includes source selectors, independent filtering,
and panel-specific controls for enhanced monitoring workflow.

Closes #[issue-number]
```

### Commit Types
- `feat:` - New feature (multi-panel log viewing)

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

**Estimated Effort**: 6-8 hours  
**Target Completion**: This week (important for enhanced monitoring capabilities)  
**Dependencies**: Layout system, Socket.IO integration  
**Blocks**: Advanced multi-source monitoring capabilities

## Success Metrics

How we'll measure success:

- **Flexibility**: Users can monitor multiple sources simultaneously
- **Usability**: Source selectors are intuitive and responsive
- **Performance**: Multiple panels don't impact system performance
- **Functionality**: All panel features work independently

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:
   ```bash
   # Revert to single panel if multi-panel causes issues
   git revert [commit-hash]
   ```

2. **Decision criteria**: If multi-panel system causes significant performance issues

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
**Priority Justification**: Critical for enhanced monitoring workflow and multi-source visibility  
**Last Updated**: 2025-10-21
