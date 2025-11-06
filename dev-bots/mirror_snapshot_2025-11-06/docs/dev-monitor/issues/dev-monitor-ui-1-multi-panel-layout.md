# DEV-MONITOR-UI-1 — Multi-Panel Draggable and Resizable Layout

## Issue Metadata

```yaml
Title: DEV-MONITOR-UI-1 — Multi-Panel Draggable and Resizable Layout
Labels: [priority-p1, repository-dev-monitor, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 8-10 hours
Repository: dev-monitor
GitHub Issue: TBD
```

## Summary

**ENHANCEMENT**: Implement a multi-panel draggable and resizable layout system for the dev-monitor frontend, allowing users to create custom dashboard layouts with multiple log panels, service panels, and other monitoring components that can be arranged, resized, and repositioned according to their workflow preferences.

## Background & Context

### Project Overview

**Application Name**: Dev Monitor Application  
**Technology Stack**: React 18, TypeScript, React Grid Layout, DnD Kit  
**Architecture**: Real-time monitoring system with customizable dashboard layouts

### This Repository's Role

The dev-monitor provides a centralized monitoring interface for all development services, and this enhancement will significantly improve the user experience by allowing developers to create personalized dashboard layouts.

### Current State

The application currently:

- ✅ **Basic grid layout**: Simple responsive grid for service cards
- ✅ **Single log viewer**: One logs panel per environment tab
- ❌ **No draggable panels**: Panels cannot be repositioned
- ❌ **No resizable panels**: Panels cannot be resized
- ❌ **No multi-panel support**: Cannot have multiple log panels
- ❌ **No layout persistence**: Layouts reset on page refresh

### Desired State

After completion:

- Multiple draggable and resizable panels per dashboard
- Customizable panel layouts with drag-and-drop
- Panel size persistence and restoration
- Multiple log panels with different source selectors
- Copyable panel configurations
- Layout templates and presets

## Technical Specifications

### Affected Files

```yaml
CREATE:
  - frontend/src/components/layout/DashboardLayout.tsx - Main dashboard layout component
  - frontend/src/components/layout/PanelContainer.tsx - Individual panel wrapper
  - frontend/src/components/layout/PanelHeader.tsx - Panel header with controls
  - frontend/src/components/layout/PanelResizer.tsx - Resize handles
  - frontend/src/hooks/useDashboardLayout.ts - Layout state management
  - frontend/src/hooks/usePanelDrag.ts - Drag and drop logic
  - frontend/src/services/layoutStorage.ts - Layout persistence
  - frontend/src/types/layout.types.ts - Layout type definitions

MODIFY:
  - frontend/src/App.tsx - Integrate dashboard layout
  - frontend/src/components/LogsViewer.tsx - Make panel-compatible
  - frontend/src/components/ServiceGrid.tsx - Make panel-compatible
  - frontend/package.json - Add layout dependencies
```

### Technology Requirements

**Languages**: TypeScript, JavaScript  
**Frameworks**: React 18, React Grid Layout, @dnd-kit/core  
**Tools**: React Grid Layout, DnD Kit, Local Storage  
**Dependencies**: react-grid-layout, @dnd-kit/core, @dnd-kit/sortable

### Code Standards

**Naming Conventions**: Follow existing component naming patterns  
**File Organization**: Place layout components in `src/components/layout/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Install Layout Dependencies**
   - Add react-grid-layout for grid-based layouts
   - Add @dnd-kit/core for drag and drop functionality
   - Add @dnd-kit/sortable for sortable panels
   - Configure TypeScript types for layout libraries

2. **Create Layout Type System**
   - Define PanelType enum (logs, services, metrics, scripts)
   - Create PanelConfig interface with position, size, and settings
   - Create DashboardLayout interface with panel configurations
   - Add layout persistence types

3. **Implement Core Layout Components**
   - Create DashboardLayout component with grid system
   - Implement PanelContainer with drag and resize handles
   - Add PanelHeader with minimize, maximize, close controls
   - Create PanelResizer for manual resizing

4. **Add Drag and Drop Functionality**
   - Implement usePanelDrag hook for drag operations
   - Add drag preview and drop zones
   - Handle panel reordering and repositioning
   - Add visual feedback during drag operations

5. **Implement Panel Management**
   - Create useDashboardLayout hook for state management
   - Add panel creation, deletion, and configuration
   - Implement panel duplication and copying
   - Add panel templates and presets

6. **Add Layout Persistence**
   - Implement useLayoutStorage hook for localStorage
   - Save and restore panel positions and sizes
   - Handle layout versioning and migration
   - Add layout export/import functionality

### Architecture Decisions

**Why this approach:**

- React Grid Layout provides robust grid-based layouts
- DnD Kit offers modern drag and drop with accessibility
- Local storage for layout persistence
- Component-based architecture for reusability

**Alternatives considered:**

- Custom drag and drop: More complex, less accessible
- CSS Grid only: Limited functionality
- External dashboard libraries: Too heavyweight for this use case

### Dependencies & Integration

**Internal Dependencies:**

- Depends on: Existing LogsViewer, ServiceGrid, CloudLogsPanel components
- Consumed by: Main App component, dashboard layouts

**External Dependencies:**

- APIs: React Grid Layout API, DnD Kit API
- Services: Local Storage API, React Context API

## Testing Requirements

### Test Coverage Required

**Unit Tests:**

```typescript
describe("DashboardLayout", () => {
  it("should render panels in correct positions", () => {
    // Test panel positioning
  });

  it("should handle panel resizing", () => {
    // Test resize functionality
  });
});
```

**Integration Tests:**

- Test drag and drop operations
- Test layout persistence and restoration
- Test panel creation and deletion

**Manual Testing Checklist**

- [ ] Panels can be dragged to new positions
- [ ] Panels can be resized by dragging edges
- [ ] Layout persists across page refreshes
- [ ] Multiple panels of same type can be created
- [ ] Panel configurations can be copied
- [ ] Layout templates work correctly

### Test Data

**Sample layout scenarios:**

- Multiple log panels with different services
- Service panels alongside log panels
- Custom dashboard layouts
- Layout templates and presets

## Acceptance Criteria

- [ ] Panels can be dragged to reposition them
- [ ] Panels can be resized by dragging edges
- [ ] Multiple panels of the same type can be created
- [ ] Panel configurations can be copied and duplicated
- [ ] Layout persists across page refreshes
- [ ] Layout templates and presets are available
- [ ] Panel headers include minimize, maximize, close controls
- [ ] Drag and drop provides visual feedback
- [ ] Layout is responsive and works on different screen sizes
- [ ] Accessibility features work correctly

## Environment Setup

### Prerequisites

```bash
# Required tools and versions
Node.js: v18+
npm: v9+
React: v18+
TypeScript: v5+
```

### Repository Setup

```bash
# Clone dev-monitor repository
git clone https://github.com/Jdubz/dev-monitor.git
cd dev-monitor

# Install dependencies
npm install

# Install new layout dependencies
npm install react-grid-layout @dnd-kit/core @dnd-kit/sortable
npm install --save-dev @types/react-grid-layout
```

### Running Locally

```bash
# Start dev-monitor with layout features
npm run dev

# Test layout functionality
npm run test:layout

# Check layout persistence
npm run test:persistence
```

## Code Examples & Patterns

### Example Implementation

**DashboardLayout component:**

```typescript
import ReactGridLayout from 'react-grid-layout';
import { DndContext } from '@dnd-kit/core';

export const DashboardLayout: React.FC = () => {
  const { layout, panels, addPanel, removePanel, updateLayout } = useDashboardLayout();

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={30}
        onLayoutChange={updateLayout}
        isDraggable={true}
        isResizable={true}
      >
        {panels.map(panel => (
          <PanelContainer
            key={panel.id}
            panel={panel}
            onRemove={() => removePanel(panel.id)}
            onCopy={() => copyPanel(panel)}
          />
        ))}
      </ReactGridLayout>
    </DndContext>
  );
};
```

## Security & Performance Considerations

### Security

- [ ] No XSS vulnerabilities in layout data
- [ ] Secure layout data storage
- [ ] Input validation for panel configurations

### Performance

- [ ] Efficient re-rendering during drag operations
- [ ] Optimized layout calculations
- [ ] Minimal memory usage for layout state
- [ ] Smooth animations and transitions

### Error Handling

```typescript
// Proper error handling for layout operations
const handleLayoutError = (error: Error) => {
  console.error("Layout operation failed:", error);
  // Fallback to default layout
  resetToDefaultLayout();
};
```

## Documentation Requirements

### Code Documentation

- [ ] All layout components have JSDoc comments
- [ ] Layout hooks are documented with usage examples
- [ ] Layout types are well-documented

### README Updates

Update repository README.md with:

- [ ] Layout system overview
- [ ] Panel creation and management guide
- [ ] Layout customization instructions

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
feat(layout): implement multi-panel draggable and resizable layout

Add React Grid Layout and DnD Kit integration for customizable
dashboard layouts with drag-and-drop panels, resizing, and
layout persistence. Includes panel management and templates.

Closes #[issue-number]
```

### Commit Types

- `feat:` - New feature (layout system implementation)

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
**Target Completion**: This week (important for enhanced user experience)  
**Dependencies**: React Grid Layout, DnD Kit setup  
**Blocks**: Advanced dashboard customization capabilities

## Success Metrics

How we'll measure success:

- **Usability**: Users can create custom dashboard layouts
- **Flexibility**: Multiple panels of same type can be created
- **Persistence**: Layouts persist across sessions
- **Performance**: Smooth drag and drop operations

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:

   ```bash
   # Revert to simple grid layout if layout system causes issues
   git revert [commit-hash]
   ```

2. **Decision criteria**: If layout system causes significant performance issues or complexity

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
**Priority Justification**: Important for enhanced user experience and workflow customization  
**Last Updated**: 2025-10-21
