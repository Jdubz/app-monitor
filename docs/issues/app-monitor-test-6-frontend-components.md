# APP-MONITOR-TEST-6: Frontend Service Component Tests

**Priority:** P1 (High)  
**Type:** Testing  
**Effort:** 2 days  
**Parent:** APP-MONITOR-TEST-1  
**Depends On:** APP-MONITOR-TEST-5  
**Repository:** job-finder-app-manager (app-monitor/frontend)

## Problem Statement

Service management components (ServiceCard, ServiceGrid, ServiceInfo) are untested, leading to UI bugs when service states change or user interactions occur. Need comprehensive component testing.

## Goal

Achieve **40% overall frontend coverage** by testing all service-related components and log viewer components.

## Scope

### Service Components

- ✅ **ServiceCard** - Service display card with actions
- ✅ **ServiceGrid** - Grid layout of service cards
- ✅ **ServiceInfo** - Service detail display
- ✅ **ControlButtons** - Start/Stop/Restart/Kill buttons
- ✅ **StatusBadge** - Status indicator (already done in TEST-5)
- ✅ **PortBadge** - Port status indicator

### Log Components

- ✅ **LogsViewer** - Main log display component
- ✅ **LogLine** - Individual log line rendering
- ✅ **LogFilters** - Filter controls
- ✅ **LogsToolbar** - Toolbar with actions
- ✅ **LogLevelBadge** - Log level indicator

## Acceptance Criteria

### Must Have

- [ ] All service components tested
- [ ] All log components tested
- [ ] User interactions tested (button clicks, filtering)
- [ ] Status changes tested
- [ ] Error states tested
- [ ] Frontend overall coverage ≥40%
- [ ] ServiceCard coverage ≥60%
- [ ] LogsViewer coverage ≥60%

### Should Have

- [ ] Accessibility tests
- [ ] Keyboard navigation tests
- [ ] Visual state tests
- [ ] Loading states tested

## Implementation Details

### ServiceCard Tests

**File:** `src/components/__tests__/ServiceCard.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ServiceCard from '../ServiceCard'
import { createMockServiceStatus } from '../../__tests__/utils/mockApi'

describe('ServiceCard', () => {
  const mockHandlers = {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onKill: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders service information correctly', () => {
      const service = createMockServiceStatus()
      render(<ServiceCard service={service} {...mockHandlers} />)

      expect(screen.getByText(service.displayName)).toBeInTheDocument()
      expect(screen.getByText(/running/i)).toBeInTheDocument()
      expect(screen.getByText(/PID:/)).toBeInTheDocument()
    })

    it('shows ports when service is running', () => {
      const service = { ...createMockServiceStatus(), ports: [5000, 8080] }
      render(<ServiceCard service={service} {...mockHandlers} />)

      expect(screen.getByText('5000')).toBeInTheDocument()
      expect(screen.getByText('8080')).toBeInTheDocument()
    })

    it('shows error message when status is error', () => {
      const service = {
        ...createMockServiceStatus(),
        status: 'error',
        error: 'Port conflict',
      }
      render(<ServiceCard service={service} {...mockHandlers} />)

      expect(screen.getByText(/Port conflict/)).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('calls onStart when Start button clicked', () => {
      const service = { ...createMockServiceStatus(), status: 'stopped' }
      render(<ServiceCard service={service} {...mockHandlers} />)

      fireEvent.click(screen.getByText('Start'))
      expect(mockHandlers.onStart).toHaveBeenCalledTimes(1)
    })

    it('calls onStop when Stop button clicked', () => {
      const service = createMockServiceStatus() // running by default
      render(<ServiceCard service={service} {...mockHandlers} />)

      fireEvent.click(screen.getByText('Stop'))
      expect(mockHandlers.onStop).toHaveBeenCalledTimes(1)
    })

    it('calls onRestart when Restart button clicked', () => {
      const service = createMockServiceStatus()
      render(<ServiceCard service={service} {...mockHandlers} />)

      fireEvent.click(screen.getByText('Restart'))
      expect(mockHandlers.onRestart).toHaveBeenCalledTimes(1)
    })

    it('calls onKill when Kill button clicked', () => {
      const service = createMockServiceStatus()
      render(<ServiceCard service={service} {...mockHandlers} />)

      fireEvent.click(screen.getByText('Kill'))
      expect(mockHandlers.onKill).toHaveBeenCalledTimes(1)
    })
  })

  describe('Button States', () => {
    it('disables Start when service is running', () => {
      const service = createMockServiceStatus()
      render(<ServiceCard service={service} {...mockHandlers} />)

      const startButton = screen.getByText('Start')
      expect(startButton).toBeDisabled()
    })

    it('disables Stop when service is not running', () => {
      const service = { ...createMockServiceStatus(), status: 'stopped' }
      render(<ServiceCard service={service} {...mockHandlers} />)

      const stopButton = screen.getByText('Stop')
      expect(stopButton).toBeDisabled()
    })

    it('enables all buttons when in error state', () => {
      const service = { ...createMockServiceStatus(), status: 'error' }
      render(<ServiceCard service={service} {...mockHandlers} />)

      expect(screen.getByText('Start')).toBeEnabled()
      expect(screen.getByText('Kill')).toBeEnabled()
    })
  })
})
```

### LogsViewer Tests

**File:** `src/components/__tests__/LogsViewer.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LogsViewer from '../LogsViewer'

describe('LogsViewer', () => {
  const mockLogs = [
    { timestamp: '2025-10-21T10:00:00Z', level: 'info', message: 'Test log 1', service: 'test' },
    { timestamp: '2025-10-21T10:00:01Z', level: 'error', message: 'Test error', service: 'test' },
    { timestamp: '2025-10-21T10:00:02Z', level: 'info', message: 'Test log 2', service: 'test' },
  ]

  it('renders empty state when no source selected', () => {
    render(<LogsViewer logs={[]} selectedSource={null} />)
    expect(screen.getByText(/select a source/i)).toBeInTheDocument()
  })

  it('displays logs when source is selected', () => {
    render(<LogsViewer logs={mockLogs} selectedSource="test" />)

    expect(screen.getByText('Test log 1')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
    expect(screen.getByText('Test log 2')).toBeInTheDocument()
  })

  it('filters logs when Errors Only is enabled', () => {
    render(<LogsViewer logs={mockLogs} selectedSource="test" errorsOnly={true} />)

    expect(screen.queryByText('Test log 1')).not.toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
    expect(screen.queryByText('Test log 2')).not.toBeInTheDocument()
  })

  it('auto-scrolls to bottom on new logs', async () => {
    const { rerender } = render(<LogsViewer logs={mockLogs} selectedSource="test" />)

    const newLog = { timestamp: '2025-10-21T10:00:03Z', level: 'info', message: 'New log', service: 'test' }
    rerender(<LogsViewer logs={[...mockLogs, newLog]} selectedSource="test" />)

    await waitFor(() => {
      expect(screen.getByText('New log')).toBeInTheDocument()
    })
  })

  it('handles rapid log influx without crashing', () => {
    const manyLogs = Array.from({ length: 1000 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Log ${i}`,
      service: 'test',
    }))

    expect(() => {
      render(<LogsViewer logs={manyLogs} selectedSource="test" />)
    }).not.toThrow()
  })
})
```

## Deliverables

- [ ] `src/components/__tests__/ServiceCard.test.tsx`
- [ ] `src/components/__tests__/ServiceGrid.test.tsx`
- [ ] `src/components/__tests__/ServiceInfo.test.tsx`
- [ ] `src/components/__tests__/ControlButtons.test.tsx`
- [ ] `src/components/__tests__/PortBadge.test.tsx`
- [ ] `src/components/__tests__/LogsViewer.test.tsx`
- [ ] `src/components/__tests__/LogLine.test.tsx`
- [ ] `src/components/__tests__/LogFilters.test.tsx`
- [ ] Coverage report showing ≥40%

## Success Metrics

- ✅ All component tests passing
- ✅ User interactions validated
- ✅ Frontend coverage ≥40%
- ✅ ServiceCard coverage ≥60%
- ✅ LogsViewer coverage ≥60%

## Testing Commands

```bash
# Run tests in watch mode
npm test

# Run with coverage
npm run test:coverage

# UI mode (visual test runner)
npm run test:ui
```

## References

- [TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md) - Days 7-8
- [React Testing Library Cheatsheet](https://testing-library.com/docs/react-testing-library/cheatsheet)

---

**Labels:** `app-monitor`, `testing`, `priority-p1`, `frontend`, `components`  
**Estimated Points:** 5 (2 days)  
**Assignee:** TBD
