# Dev-Monitor Testing Quick Start

**Goal:** Get from 0% to 50%+ test coverage in 2 weeks  
**Audience:** Developers implementing the testing plan

## Day 1: Backend Setup (2-3 hours)

### Step 1: Install Dependencies

```bash
cd ~/Development/app-monitor/backend

npm install --save-dev \
  @types/jest@^29.5.12 \
  @types/supertest@^6.0.2 \
  jest@^29.7.0 \
  supertest@^6.3.4 \
  ts-jest@^29.1.2
```

### Step 2: Create Jest Configuration

Create `jest.config.js`:

```javascript
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/index.ts", // Entry point, hard to test
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
  },
  coverageReporters: ["text", "html", "lcov"],
  testTimeout: 10000,
};
```

### Step 3: Add Test Scripts

Update `package.json`:

```json
{
  "scripts": {
    "test": "NODE_OPTIONS=--experimental-vm-modules jest",
    "test:watch": "NODE_OPTIONS=--experimental-vm-modules jest --watch",
    "test:coverage": "NODE_OPTIONS=--experimental-vm-modules jest --coverage",
    "test:ci": "NODE_OPTIONS=--experimental-vm-modules jest --ci --coverage --maxWorkers=2"
  }
}
```

### Step 4: Create Test Infrastructure

Create directory structure:

```bash
mkdir -p src/__tests__/{helpers,fixtures,integration}
mkdir -p src/utils/__tests__
mkdir -p src/services/__tests__
mkdir -p src/routes/__tests__
```

Create `src/__tests__/setup.ts`:

```typescript
// Global test setup
import { jest } from "@jest/globals";

// Silence console during tests unless debugging
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
```

### Step 5: Write Your First Test

Create `src/utils/__tests__/portManager.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import { isPortInUse } from "../portManager.js";

describe("PortManager", () => {
  describe("isPortInUse", () => {
    it("should return true for port in use", async () => {
      // Port 22 (SSH) is almost always in use
      const inUse = await isPortInUse(22);
      expect(inUse).toBe(true);
    });

    it("should return false for free port", async () => {
      // Port 65535 is unlikely to be in use
      const inUse = await isPortInUse(65535);
      expect(inUse).toBe(false);
    });
  });
});
```

### Step 6: Run Tests

```bash
npm test
```

Expected output:

```
 PASS  src/utils/__tests__/portManager.test.ts
  PortManager
    isPortInUse
      ✓ should return true for port in use (XX ms)
      ✓ should return false for free port (XX ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

✅ **Day 1 Complete:** You now have a working test infrastructure!

---

## Day 6: Frontend Setup (2-3 hours)

### Step 1: Install Dependencies

```bash
cd ~/Development/app-monitor/frontend

npm install --save-dev \
  @testing-library/react@^14.2.1 \
  @testing-library/jest-dom@^6.4.2 \
  @testing-library/user-event@^14.5.2 \
  @vitest/ui@^1.2.2 \
  vitest@^1.2.2 \
  jsdom@^24.0.0 \
  @vitest/coverage-v8@^1.2.2
```

### Step 2: Create Vitest Configuration

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

### Step 3: Add Test Scripts

Update `package.json`:

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

### Step 4: Create Test Infrastructure

Create directory structure:

```bash
mkdir -p src/__tests__/{utils,integration}
mkdir -p src/components/__tests__
mkdir -p src/hooks/__tests__
mkdir -p src/services/__tests__
```

Create `src/__tests__/setup.ts`:

```typescript
import "@testing-library/jest-dom";
import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
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

Create `src/__tests__/utils/renderWithProviders.tsx`:

```typescript
import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { ...options });
}
```

### Step 5: Write Your First Test

Create `src/components/__tests__/StatusBadge.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
  it('renders running status with green color', () => {
    render(<StatusBadge status="running" />)
    const badge = screen.getByText('Running')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ color: expect.stringContaining('green') })
  })

  it('renders stopped status with gray color', () => {
    render(<StatusBadge status="stopped" />)
    const badge = screen.getByText('Stopped')
    expect(badge).toBeInTheDocument()
  })

  it('renders error status with red color', () => {
    render(<StatusBadge status="error" />)
    const badge = screen.getByText('Error')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ color: expect.stringContaining('red') })
  })
})
```

### Step 6: Run Tests

```bash
npm test
```

Expected output:

```
 ✓ src/components/__tests__/StatusBadge.test.tsx (3)
   ✓ StatusBadge (3)
     ✓ renders running status with green color
     ✓ renders stopped status with gray color
     ✓ renders error status with red color

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

✅ **Day 6 Complete:** Frontend testing infrastructure ready!

---

## Quick Command Reference

### Backend

```bash
cd app-monitor/backend

# Run all tests
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Coverage report
npm run test:coverage

# View coverage
open coverage/index.html

# Run specific test file
npm test -- portManager.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="port conflict"
```

### Frontend

```bash
cd app-monitor/frontend

# Run all tests (watch mode)
npm test

# Run once with coverage
npm run test:coverage

# UI mode (visual test runner)
npm run test:ui

# View coverage
open coverage/index.html

# Run specific test file
npm test -- ServiceCard.test.tsx

# Run tests matching pattern
npm test -- -t "renders service info"
```

## Common Testing Patterns

### Backend: Testing ProcessManager

```typescript
import { ProcessManager } from "../services/processManager.js";

describe("ProcessManager", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  afterEach(async () => {
    // Cleanup all processes after each test
    await manager.cleanupAll();
  });

  it("starts service successfully", async () => {
    const result = await manager.startService("test-service");
    expect(result.status).toBe("running");
    expect(result.pid).toBeDefined();
  });
});
```

### Frontend: Testing Hooks

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { useServices } from "../hooks/useServices";

describe("useServices", () => {
  it("fetches initial service statuses", async () => {
    const { result } = renderHook(() => useServices());

    await waitFor(() => {
      expect(result.current.services.length).toBeGreaterThan(0);
    });
  });
});
```

### Frontend: Testing Components

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import ServiceCard from '../ServiceCard'

describe('ServiceCard', () => {
  it('calls onStart when Start button clicked', async () => {
    const onStart = vi.fn()
    render(
      <ServiceCard
        service={{ name: 'test', status: 'stopped' }}
        onStart={onStart}
      />
    )

    const startButton = screen.getByText('Start')
    fireEvent.click(startButton)

    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
```

## Tips for Success

### General

- ✅ Write tests BEFORE fixing bugs (TDD for bug fixes)
- ✅ Test one thing at a time
- ✅ Use descriptive test names
- ✅ Mock external dependencies (Docker, ports, file system)
- ✅ Clean up resources in afterEach()

### Backend Specific

- ✅ Use `supertest` for API endpoint tests
- ✅ Mock `ChildProcess` for process tests
- ✅ Use actual ports in integration tests, mocks in unit tests
- ✅ Test async operations with async/await
- ✅ Set reasonable timeouts (10s default)

### Frontend Specific

- ✅ Use `screen.getByRole()` over `getByText()` when possible
- ✅ Test user interactions with `fireEvent` or `userEvent`
- ✅ Wait for async updates with `waitFor()`
- ✅ Mock API calls with `vi.mock()` or MSW
- ✅ Test accessibility (screen reader labels, keyboard nav)

## Troubleshooting

### "Tests are timing out"

- Increase timeout in jest.config.js or vitest.config.ts
- Check for unresolved promises
- Ensure async operations complete

### "Port conflicts in tests"

- Use random port selection
- Clean up ports in afterEach()
- Run tests serially with `--maxWorkers=1`

### "Docker tests failing in CI"

- Make Docker tests conditional
- Use Docker in CI with services
- Or skip Docker tests in CI (mark as manual)

### "Coverage not updating"

- Clear coverage cache: `rm -rf coverage`
- Re-run with `--coverage` flag
- Check collectCoverageFrom patterns

### "Flaky tests"

- Add waitFor() for async operations
- Increase timeouts for slow operations
- Mock time-dependent behavior
- Use deterministic test data

## Progress Tracking

Track your progress in the issue: [APP-MONITOR-TEST-1](../issues/app-monitor-test-1-implement-test-coverage.md)

### Daily Checklist

**Backend:**

- [ ] Day 1: Setup + PortManager (10% coverage)
- [ ] Day 2: ProcessManager basics (25% coverage)
- [ ] Day 3: ProcessManager edges (40% coverage)
- [ ] Day 4: Config + API (50% coverage)
- [ ] Day 5: Logs + cleanup (50%+ ✅)

**Frontend:**

- [ ] Day 6: Setup + Hooks (15% coverage)
- [ ] Day 7: Service components (30% coverage)
- [ ] Day 8: Log components (40% coverage)
- [ ] Day 9: Panels + hooks (48% coverage)
- [ ] Day 10: Integration + cleanup (50%+ ✅)

## Sample Test Checklist

Copy this into your test files as you work:

```typescript
/**
 * PortManager Test Coverage Checklist
 *
 * Core Functions:
 * [x] isPortInUse() - basic usage
 * [x] isPortInUse() - edge cases (0, 65535, invalid)
 * [x] killPortProcess() - success case
 * [x] killPortProcess() - no process on port
 * [x] killPortProcess() - permission denied
 * [x] killMultiplePorts() - all ports killed
 * [x] killMultiplePorts() - partial failures
 * [ ] getDockerContainerInfo() - running container
 * [ ] getDockerContainerInfo() - stopped container
 * [ ] getDockerContainerInfo() - no container
 * [ ] stopDockerContainer() - graceful stop
 * [ ] stopDockerContainer() - force stop
 *
 * Edge Cases:
 * [ ] Concurrent port checks
 * [ ] Race conditions in kill
 * [ ] Docker daemon not running
 * [ ] Invalid container names
 *
 * Current Coverage: 60% (target: 80%)
 */
```

## Resources

- **Jest Docs:** https://jestjs.io/docs/getting-started
- **Vitest Docs:** https://vitest.dev/guide/
- **Testing Library:** https://testing-library.com/docs/react-testing-library/intro
- **Supertest:** https://github.com/ladjs/supertest

## Next Steps

1. **Start with Day 1** (backend setup)
2. **Write one test** to verify setup
3. **Run test** and see it pass
4. **Commit** your setup before moving on
5. **Continue with Day 2** following the plan

Good luck! 🧪
