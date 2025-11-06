# APP-MONITOR-TEST-5: Frontend Testing Infrastructure Setup

**Priority:** P1 (High)  
**Type:** Testing Infrastructure  
**Effort:** 1 day  
**Parent:** APP-MONITOR-TEST-1  
**Repository:** job-finder-app-manager (app-monitor/frontend)

## Problem Statement

The app-monitor frontend has **0% test coverage** and no testing infrastructure. Before writing component tests, we need to set up Vitest, React Testing Library, and create test utilities.

## Goal

Set up complete frontend testing infrastructure and achieve **15% initial coverage** by writing tests for service hooks and basic components.

## Scope

### Testing Infrastructure

- ✅ Install Vitest and React Testing Library
- ✅ Create Vitest configuration
- ✅ Set up test directory structure
- ✅ Create test utilities (renderWithProviders, mockApi)
- ✅ Add test scripts to package.json
- ✅ Configure coverage reporting

### Initial Tests

- ✅ Write tests for `useServices` hook
- ✅ Write tests for `StatusBadge` component
- ✅ Write tests for `PortBadge` component
- ✅ Achieve 15% overall coverage

## Acceptance Criteria

### Must Have

- [ ] Vitest installed and configured
- [ ] React Testing Library set up
- [ ] Test infrastructure in place
- [ ] First test suites passing (hooks + components)
- [ ] Coverage reporting working
- [ ] `npm test` command runs successfully
- [ ] Frontend overall coverage ≥15%

### Should Have

- [ ] Mock API client utility
- [ ] Render helper with providers
- [ ] Mock Socket.IO client
- [ ] CI-compatible test configuration

## Implementation Steps

### 1. Install Dependencies

```bash
cd app-monitor/frontend

npm install --save-dev \
  @testing-library/react@^14.2.1 \
  @testing-library/jest-dom@^6.4.2 \
  @testing-library/user-event@^14.5.2 \
  @vitest/ui@^1.2.2 \
  vitest@^1.2.2 \
  jsdom@^24.0.0 \
  @vitest/coverage-v8@^1.2.2
```

### 2. Create Vitest Configuration

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/__tests__/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "**/*.d.ts",
        "dist/",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 3. Update Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage"
  }
}
```

### 4. Create Test Infrastructure

Create directory structure:

```bash
mkdir -p src/__tests__/{utils,integration}
mkdir -p src/components/__tests__
mkdir -p src/hooks/__tests__
mkdir -p src/services/__tests__
```

**Create `src/__tests__/setup.ts`:**

```typescript
import "@testing-library/jest-dom";
import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Mock Socket.IO client
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));
```

**Create `src/__tests__/utils/renderWithProviders.tsx`:**

```typescript
import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { ...options });
}
```

**Create `src/__tests__/utils/mockApi.ts`:**

```typescript
import { vi } from "vitest";
import type { ServiceStatus } from "../../types/service.types";

export function createMockApiClient() {
  return {
    healthCheck: vi.fn(),
    getServices: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
    killService: vi.fn(),
    getPortStatuses: vi.fn(),
    getScripts: vi.fn(),
    executeScript: vi.fn(),
  };
}

export function createMockServiceStatus(): ServiceStatus {
  return {
    name: "test-service",
    displayName: "Test Service",
    status: "running",
    pid: 12345,
    ports: [5000],
    uptime: 100,
    startedAt: Date.now() - 100000,
  };
}
```

### 5. Write Initial Tests

**`src/hooks/__tests__/useServices.test.ts`:**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useServices } from "../useServices";
import * as api from "../../services/api";

vi.mock("../../services/api");

describe("useServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches initial service statuses", async () => {
    const mockServices = [
      { name: "test1", status: "running" },
      { name: "test2", status: "stopped" },
    ];

    vi.mocked(api.getServices).mockResolvedValue(mockServices);

    const { result } = renderHook(() => useServices());

    await waitFor(() => {
      expect(result.current.services).toHaveLength(2);
    });
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(api.getServices).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useServices());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});
```

**`src/components/__tests__/StatusBadge.test.tsx`:**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
  it('renders running status correctly', () => {
    render(<StatusBadge status="running" />)
    expect(screen.getByText(/running/i)).toBeInTheDocument()
  })

  it('renders stopped status correctly', () => {
    render(<StatusBadge status="stopped" />)
    expect(screen.getByText(/stopped/i)).toBeInTheDocument()
  })

  it('renders error status correctly', () => {
    render(<StatusBadge status="error" />)
    expect(screen.getByText(/error/i)).toBeInTheDocument()
  })
})
```

### 6. Run Tests

```bash
npm test
```

Expected: **~10 tests passing, 15% coverage**

## Deliverables

- [ ] `vitest.config.ts` - Vitest configuration
- [ ] `package.json` - Updated with test scripts
- [ ] `src/__tests__/setup.ts` - Global test setup
- [ ] `src/__tests__/utils/renderWithProviders.tsx` - Render helper
- [ ] `src/__tests__/utils/mockApi.ts` - API mocking utilities
- [ ] `src/hooks/__tests__/useServices.test.ts` - Service hook tests
- [ ] `src/components/__tests__/StatusBadge.test.tsx` - Badge component test
- [ ] `src/components/__tests__/PortBadge.test.tsx` - Port badge test
- [ ] Coverage report in `coverage/` directory

## Success Metrics

- ✅ All tests pass locally
- ✅ Coverage report generated
- ✅ Frontend overall coverage ≥15%
- ✅ Infrastructure ready for more tests

## Dependencies

- None (first frontend testing step)

## Blocks

- APP-MONITOR-TEST-6 (Frontend component tests)
- APP-MONITOR-TEST-7 (Frontend integration tests)

## Follow-up

After completing this issue:

1. Move to APP-MONITOR-TEST-6 (Service components)
2. Continue building on this infrastructure
3. Keep test patterns consistent

## Testing Commands

```bash
# Run all tests (watch mode)
npm test

# Run once with coverage
npm run test:coverage

# UI mode
npm run test:ui

# View coverage
open coverage/index.html
```

## References

- [TESTING_QUICKSTART.md](../app-monitor/TESTING_QUICKSTART.md) - Day 6 instructions
- [TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md) - Overall plan
- [Vitest Documentation](https://vitest.dev/guide/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)

---

**Labels:** `app-monitor`, `testing`, `infrastructure`, `priority-p1`, `frontend`  
**Estimated Points:** 3 (1 day)  
**Assignee:** TBD
