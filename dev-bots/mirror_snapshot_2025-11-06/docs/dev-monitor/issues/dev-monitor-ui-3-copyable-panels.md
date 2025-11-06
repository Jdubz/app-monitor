# DEV-MONITOR-UI-3 — Fix Ctrl+C to Copy Selected Text Instead of Clearing Logs

## Issue Metadata

```yaml
Title: DEV-MONITOR-UI-3 — Fix Ctrl+C to Copy Selected Text Instead of Clearing Logs
Labels: [priority-p1, repository-dev-monitor, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 2-3 hours
Repository: dev-monitor
GitHub Issue: TBD
```

## Summary

**BUG FIX**: Currently Ctrl+C clears the log view, but it should instead copy selected text to the clipboard. This is a standard expected behavior that users expect from log viewers. The clear logs functionality should use a different shortcut or button.

## Background & Context

### Project Overview

**Application Name**: Dev Monitor Application  
**Technology Stack**: React 18, TypeScript, Clipboard API  
**Architecture**: Real-time monitoring system with proper text selection and copying

### This Repository's Role

The dev-monitor provides centralized monitoring for all development services, and this fix will improve user experience by providing standard copy-to-clipboard behavior that users expect.

### Current State

The application currently:

- ❌ **Ctrl+C clears logs**: Ctrl+C clears the log view instead of copying text
- ✅ **Text selection**: Users can select text in log panels
- ❌ **No clipboard integration**: Selected text cannot be copied to clipboard
- ✅ **Clear logs button**: Clear functionality exists via button
- ❌ **Non-standard behavior**: Ctrl+C should copy, not clear

### Desired State

After completion:

- Ctrl+C copies selected text to clipboard (standard behavior)
- Clear logs uses alternative shortcut (Ctrl+L) or button
- Text selection works properly in all log panels
- Standard copy/paste behavior is maintained
- Clear functionality remains accessible via alternative method

## Technical Specifications

### Affected Files

```yaml
MODIFY:
  - frontend/src/components/LogsViewer.tsx - Fix Ctrl+C behavior
  - frontend/src/components/LogsToolbar.tsx - Update clear logs shortcut
  - frontend/src/hooks/useLogStream.ts - Add clipboard integration
  - frontend/src/components/LogLine.tsx - Improve text selection
  - frontend/src/utils/clipboard.ts - Clipboard utility functions

CREATE:
  - frontend/src/hooks/useClipboard.ts - Clipboard management hook
  - frontend/src/utils/textSelection.ts - Text selection utilities
```

### Technology Requirements

**Languages**: TypeScript, JavaScript  
**Frameworks**: React 18, Clipboard API  
**Tools**: Browser Clipboard API, Keyboard event handling  
**Dependencies**: Existing log components, keyboard shortcuts

### Code Standards

**Naming Conventions**: Follow existing component naming patterns  
**File Organization**: Place clipboard utilities in `src/utils/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Fix Ctrl+C Keyboard Handler**
   - Remove Ctrl+C clear logs functionality
   - Add proper Ctrl+C copy-to-clipboard behavior
   - Implement text selection detection
   - Add clipboard API integration

2. **Update Clear Logs Functionality**
   - Change clear logs to use Ctrl+L shortcut
   - Update clear logs button functionality
   - Maintain existing clear logs behavior
   - Add keyboard shortcut documentation

3. **Implement Clipboard Integration**
   - Create useClipboard hook for clipboard operations
   - Add text selection utilities
   - Implement copy-to-clipboard functionality
   - Add clipboard error handling

4. **Enhance Text Selection**
   - Improve text selection in log panels
   - Add support for selecting log lines
   - Implement timestamp and log level selection
   - Add visual feedback for selected text

5. **Update Keyboard Shortcuts**
   - Document new keyboard shortcuts
   - Update help text and tooltips
   - Add keyboard shortcut indicators
   - Ensure accessibility compliance

6. **Test Copy Functionality**
   - Test text selection in all log panels
   - Verify clipboard integration works
   - Test keyboard shortcuts
   - Ensure clear logs still works via alternative method

### Architecture Decisions

**Why this approach:**

- Standard clipboard behavior that users expect
- Simple keyboard shortcut change
- Maintains existing clear functionality
- Improves user experience with standard behavior

**Alternatives considered:**

- Keep Ctrl+C for clear: Conflicts with user expectations
- Add separate copy shortcut: More complex than necessary
- Modal confirmation: Unnecessary for standard behavior

### Dependencies & Integration

**Internal Dependencies:**

- Depends on: Log components, keyboard event handling
- Consumed by: All log viewing components

**External Dependencies:**

- APIs: Browser Clipboard API, Keyboard events
- Services: Text selection utilities, clipboard management

## Testing Requirements

### Test Coverage Required

**Unit Tests:**

```typescript
describe("ClipboardIntegration", () => {
  it("should copy selected text to clipboard", () => {
    // Test Ctrl+C copy functionality
  });

  it("should clear logs with Ctrl+L", () => {
    // Test clear logs with new shortcut
  });
});
```

**Integration Tests:**

- Test text selection in log panels
- Test clipboard integration
- Test keyboard shortcuts

**Manual Testing Checklist**

- [ ] Ctrl+C copies selected text to clipboard
- [ ] Text selection works properly in log panels
- [ ] Clear logs uses Ctrl+L or button
- [ ] Copy functionality works across all log panels
- [ ] Standard copy/paste behavior is maintained
- [ ] Clear logs still works via alternative method

### Test Data

**Sample text selection scenarios:**

- Single log line selection
- Multiple log lines selection
- Timestamp and log level selection
- Full log entry selection

## Acceptance Criteria

- [ ] Ctrl+C copies selected text to clipboard
- [ ] Text selection works properly in log panels
- [ ] Clear logs uses alternative method (Ctrl+L or button)
- [ ] Copy functionality works across all log panels
- [ ] Standard copy/paste behavior is maintained
- [ ] Clear logs functionality remains accessible
- [ ] Keyboard shortcuts are documented
- [ ] Text selection provides visual feedback
- [ ] Clipboard integration handles errors gracefully
- [ ] All log panels support text copying

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

# Environment variables needed
cp .env.example .env
# Configure clipboard and keyboard settings
```

### Running Locally

```bash
# Start dev-monitor with clipboard integration
npm run dev

# Test clipboard functionality
npm run test:clipboard

# Test keyboard shortcuts
npm run test:shortcuts
```

## Code Examples & Patterns

### Example Implementation

**Clipboard integration hook:**

```typescript
export const useClipboard = () => {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      return false;
    }
  };

  const handleCopy = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "c") {
      const selectedText = window.getSelection()?.toString();
      if (selectedText) {
        copyToClipboard(selectedText);
        event.preventDefault();
      }
    }
  };

  return { copyToClipboard, handleCopy };
};
```

**Updated keyboard shortcuts:**

```typescript
const useKeyboardShortcuts = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+C: Copy selected text
      if (event.ctrlKey && event.key === "c") {
        handleCopy(event);
      }
      // Ctrl+L: Clear logs
      if (event.ctrlKey && event.key === "l") {
        clearLogs();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
};
```

## Security & Performance Considerations

### Security

- [ ] Validate clipboard content for security
- [ ] Sanitize copied text to prevent XSS
- [ ] Secure clipboard API usage
- [ ] Handle clipboard permissions properly

### Performance

- [ ] Efficient text selection handling
- [ ] Optimized clipboard operations
- [ ] Minimal memory usage for text operations
- [ ] Fast keyboard shortcut response

### Error Handling

```typescript
// Proper error handling for clipboard operations
const handleClipboardError = (error: Error) => {
  console.error("Clipboard operation failed:", error);
  showNotification("Failed to copy to clipboard", "error");
  // Fallback to alternative copy method if available
  fallbackCopyMethod();
};
```

## Documentation Requirements

### Code Documentation

- [ ] All clipboard components have JSDoc comments
- [ ] Keyboard shortcut handlers are documented
- [ ] Clipboard integration is documented

### README Updates

Update repository README.md with:

- [ ] Keyboard shortcuts documentation
- [ ] Clipboard functionality guide
- [ ] Text selection instructions

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
fix(ui): fix Ctrl+C to copy selected text instead of clearing logs

Change Ctrl+C from clearing logs to copying selected text to clipboard.
Update clear logs to use Ctrl+L shortcut. Improves standard
keyboard behavior and user experience.

Closes #[issue-number]
```

### Commit Types

- `fix:` - Bug fix (keyboard shortcut behavior)

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

**Estimated Effort**: 2-3 hours  
**Target Completion**: This week (important for standard keyboard behavior)  
**Dependencies**: Log components, keyboard event handling  
**Blocks**: Improved user experience with standard copy behavior

## Success Metrics

How we'll measure success:

- **Usability**: Ctrl+C works as users expect (copy selected text)
- **Standards**: Keyboard shortcuts follow standard conventions
- **Functionality**: Clear logs still works via alternative method
- **User Experience**: Improved workflow with proper copy behavior

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:

   ```bash
   # Revert to original Ctrl+C clear behavior if needed
   git revert [commit-hash]
   ```

2. **Decision criteria**: If clipboard integration causes security issues or conflicts

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
**Priority Justification**: Important for standard keyboard behavior and user experience  
**Last Updated**: 2025-10-21
