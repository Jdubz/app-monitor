# APP-MONITOR-TEST-7: Frontend Integration and Panel Tests

**Priority:** P1 (High)  
**Type:** Testing  
**Effort:** 2 days  
**Parent:** APP-MONITOR-TEST-1  
**Depends On:** APP-MONITOR-TEST-5, APP-MONITOR-TEST-6  
**Repository:** job-finder-app-manager (app-monitor/frontend)

## Problem Statement

Panel management, additional hooks (useLogStream, usePortStatus, useScripts), and App-level integration are untested. Need comprehensive tests to reach 50%+ overall frontend coverage.

## Goal

Achieve **50%+ overall frontend coverage** by testing panel management, remaining hooks, and full app integration.

## Scope

### Panel Management Tests

- ✅ **PanelContainer** - Multi-panel layout and management
- ✅ **PanelWrapper** - Individual panel with toolbar
- ✅ **PanelToolbar** - Panel controls (source select, close)
- ✅ Panel add/remove operations
- ✅ Panel persistence (localStorage)
- ✅ Max 6 panels enforcement

### Additional Hook Tests

- ✅ **useLogStream** - Real-time log streaming
- ✅ **usePortStatus** - Port status monitoring
- ✅ **useScripts** - Script management
- ✅ **useLogFilter** - Log filtering logic

### Integration Tests

- ✅ **App.tsx** - Full application integration
- ✅ **API Client** - API service wrapper
- ✅ Tab switching and state management
- ✅ Service-to-logs workflow
- ✅ Error boundary behavior

## Acceptance Criteria

### Must Have

- [ ] Panel management fully tested
- [ ] All hooks tested
- [ ] App integration tests passing
- [ ] API client tested
- [ ] Frontend overall coverage ≥50%
- [ ] All tests passing in CI

### Should Have

- [ ] E2E workflows tested
- [ ] Performance tests for log streaming
- [ ] Memory leak detection
- [ ] Accessibility tests

## Implementation Details

### Panel Management Tests

**File:** `src/components/panels/__tests__/PanelContainer.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PanelContainer from '../PanelContainer'

describe('PanelContainer', () => {
  it('renders initial panels', () => {
    render(<PanelContainer initialPanels={2} />)

    // Should show 2 panels
    const panels = screen.getAllByRole('region')
    expect(panels).toHaveLength(2)
  })

  it('adds new panel when Add button clicked', () => {
    render(<PanelContainer initialPanels={1} />)

    fireEvent.click(screen.getByText(/Add Panel/))

    const panels = screen.getAllByRole('region')
    expect(panels).toHaveLength(2)
  })

  it('removes panel when close button clicked', () => {
    render(<PanelContainer initialPanels={2} />)

    const closeButtons = screen.getAllByText('×')
    fireEvent.click(closeButtons[0])

    const panels = screen.getAllByRole('region')
    expect(panels).toHaveLength(1)
  })

  it('enforces max 6 panels limit', () => {
    render(<PanelContainer initialPanels={6} />)

    const addButton = screen.queryByText(/Add Panel/)
    expect(addButton).toBeDisabled()
  })

  it('persists panel configuration to localStorage', () => {
    const { rerender } = render(<PanelContainer initialPanels={2} />)

    // Add panel
    fireEvent.click(screen.getByText(/Add Panel/))

    // Simulate reload
    rerender(<PanelContainer />)

    // Should restore 3 panels
    const panels = screen.getAllByRole('region')
    expect(panels).toHaveLength(3)
  })
})
```

### Hook Tests

**File:** `src/hooks/__tests__/useLogStream.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLogStream } from "../useLogStream";
import { io } from "socket.io-client";

vi.mock("socket.io-client");

describe("useLogStream", () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.mocked(io).mockReturnValue(mockSocket);
  });

  it("connects to socket on mount", () => {
    renderHook(() => useLogStream("test-service"));

    expect(io).toHaveBeenCalledWith(
      expect.stringContaining("5000"),
      expect.any(Object),
    );
  });

  it("subscribes to log events for selected source", () => {
    renderHook(() => useLogStream("test-service"));

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "subscribe:logs",
      "test-service",
    );
  });

  it("receives and stores log lines", async () => {
    const { result } = renderHook(() => useLogStream("test-service"));

    // Simulate receiving logs
    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "log:line",
    )[1];

    logHandler({ message: "Test log", level: "info" });

    await waitFor(() => {
      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0].message).toBe("Test log");
    });
  });

  it("disconnects on unmount", () => {
    const { unmount } = renderHook(() => useLogStream("test-service"));

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("limits log buffer to max size", async () => {
    const { result } = renderHook(() => useLogStream("test-service", 100));

    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "log:line",
    )[1];

    // Send 150 logs
    for (let i = 0; i < 150; i++) {
      logHandler({ message: `Log ${i}`, level: "info" });
    }

    await waitFor(() => {
      expect(result.current.logs.length).toBeLessThanOrEqual(100);
    });
  });
});
```

**File:** `src/hooks/__tests__/usePortStatus.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePortStatus } from "../usePortStatus";
import * as api from "../../services/api";

vi.mock("../../services/api");

describe("usePortStatus", () => {
  it("fetches initial port statuses", async () => {
    const mockPorts = [
      { port: 5000, inUse: true, service: "backend" },
      { port: 5173, inUse: true, service: "frontend" },
    ];

    vi.mocked(api.getPortStatuses).mockResolvedValue(mockPorts);

    const { result } = renderHook(() => usePortStatus());

    await waitFor(() => {
      expect(result.current.portStatuses).toHaveLength(2);
    });
  });

  it("polls for updates at regular interval", async () => {
    vi.mocked(api.getPortStatuses).mockResolvedValue([]);

    renderHook(() => usePortStatus());

    // Should call API immediately
    expect(api.getPortStatuses).toHaveBeenCalledTimes(1);

    // Should poll again after interval
    await waitFor(
      () => {
        expect(api.getPortStatuses).toHaveBeenCalledTimes(2);
      },
      { timeout: 6000 },
    );
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(api.getPortStatuses).mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => usePortStatus());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});
```

### Integration Tests

**File:** `src/__tests__/integration/serviceManagement.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../../App'
import * as api from '../../services/api'

vi.mock('../../services/api')

describe('Service Management Integration', () => {
  it('displays services on initial load', async () => {
    const mockServices = [
      { name: 'backend', displayName: 'Backend', status: 'running', pid: 123 },
    ]

    vi.mocked(api.getServices).mockResolvedValue(mockServices)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeInTheDocument()
    })
  })

  it('starts service and updates UI', async () => {
    vi.mocked(api.getServices).mockResolvedValue([
      { name: 'test', displayName: 'Test', status: 'stopped' },
    ])

    vi.mocked(api.startService).mockResolvedValue({
      name: 'test',
      displayName: 'Test',
      status: 'running',
      pid: 123,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start'))

    await waitFor(() => {
      expect(screen.getByText(/running/i)).toBeInTheDocument()
    })
  })

  it('shows error message when service fails to start', async () => {
    vi.mocked(api.getServices).mockResolvedValue([
      { name: 'test', displayName: 'Test', status: 'stopped' },
    ])

    vi.mocked(api.startService).mockRejectedValue(
      new Error('Port conflict')
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start'))

    await waitFor(() => {
      expect(screen.getByText(/Port conflict/)).toBeInTheDocument()
    })
  })

  it('switches between environment tabs', () => {
    render(<App />)

    fireEvent.click(screen.getByText('Scripts'))
    expect(screen.getByText(/Available Scripts/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Local Development'))
    expect(screen.getByText(/Services/i)).toBeInTheDocument()
  })
})
```

## Deliverables

- [ ] `src/components/panels/__tests__/PanelContainer.test.tsx`
- [ ] `src/components/panels/__tests__/PanelWrapper.test.tsx`
- [ ] `src/hooks/__tests__/useLogStream.test.ts`
- [ ] `src/hooks/__tests__/usePortStatus.test.ts`
- [ ] `src/hooks/__tests__/useScripts.test.ts`
- [ ] `src/hooks/__tests__/useLogFilter.test.ts`
- [ ] `src/services/__tests__/api.test.ts`
- [ ] `src/__tests__/integration/serviceManagement.test.tsx`
- [ ] `src/__tests__/App.test.tsx`
- [ ] Coverage report showing ≥50%

## Success Metrics

- ✅ Frontend coverage ≥50% (target: 52%)
- ✅ Panel tests comprehensive
- ✅ All hooks tested
- ✅ Integration tests passing
- ✅ Zero test failures

## Testing Commands

```bash
# Run all tests
npm test

# Coverage report
npm run test:coverage

# UI mode
npm run test:ui

# Specific test file
npm test -- PanelContainer.test.tsx
```

## References

- [TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md) - Days 9-10
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Labels:** `app-monitor`, `testing`, `priority-p1`, `frontend`, `integration`  
**Estimated Points:** 5 (2 days)  
**Assignee:** TBD
