# Testing Guide - Dev-Monitor

**Last Updated:** October 25, 2025  
**Status:** Phase 3.5 Complete

---

## Overview

The dev-monitor has a comprehensive testing strategy covering unit tests, integration tests, and manual testing procedures. This guide explains how to run tests, write new tests, and maintain test quality.

---

## Test Structure

```
backend/
├── src/
│   └── **/*.test.ts          # Unit tests (co-located with source)
├── tests/
│   ├── integration/          # Integration tests
│   │   ├── process-lifecycle.test.ts
│   │   ├── docker-operations.test.ts
│   │   └── socket-events.test.ts
│   ├── e2e/                  # E2E tests (future)
│   └── test-utils.ts         # Shared test utilities
frontend/
└── src/
    └── **/*.test.tsx         # Frontend component tests
```

---

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests (unit + integration)
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Watch mode (auto-rerun on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Current Status

**Backend:**

- Unit tests: 257/257 passing ✅
- Integration tests: 3 test files created
- Coverage: TBD

**Frontend:**

- Component tests: Vitest configured ✅
- Integration: Manual testing verified ✅

---

## Test Categories

### 1. Unit Tests

**Purpose:** Test individual functions/classes in isolation

**Location:** Co-located with source files (`*.test.ts`)

**Example:**

```typescript
// src/services/processManager/lifecycle.test.ts
describe("ProcessLifecycle", () => {
  it("should start in stopped state", () => {
    const lifecycle = new ProcessLifecycle();
    expect(lifecycle.getState()).toBe("stopped");
  });
});
```

**Guidelines:**

- Fast (< 10ms each)
- No external dependencies (mocked)
- Test single responsibility
- Clear, descriptive names

### 2. Integration Tests

**Purpose:** Test interactions between multiple components

**Location:** `tests/integration/*.test.ts`

**Examples:**

#### Process Lifecycle Integration

```typescript
// tests/integration/process-lifecycle.test.ts
describe("Process Lifecycle Integration", () => {
  it("should start and stop a process", async () => {
    await processManager.startProcess(config);
    await processManager.stopProcess(processId);

    const processInfo = processManager.getProcess(processId);
    expect(["stopping", "stopped"]).toContain(processInfo?.status);
  });
});
```

#### Docker Operations Integration

```typescript
// tests/integration/docker-operations.test.ts
describe("Docker Operations Integration", () => {
  it("should create and start a container", async () => {
    const container = await dockerManager.createContainer({
      Image: "alpine:latest",
      Cmd: ["sleep", "30"],
    });

    await dockerManager.startContainer(container.id);
    const inspect = await dockerManager.inspectContainer(container.id);

    expect(inspect.State.Running).toBe(true);
  });
});
```

#### Socket.IO Real-time Integration

```typescript
// tests/integration/socket-events.test.ts
describe("Socket.IO Real-time Updates", () => {
  it("should emit and receive process events", async () => {
    const receivedEvents = [];

    clientSocket.on("process:started", (data) => {
      receivedEvents.push(data);
    });

    socketServer.emit("process:started", { processId: "test" });

    await waitFor(() => receivedEvents.length > 0);
    expect(receivedEvents[0].processId).toBe("test");
  });
});
```

**Guidelines:**

- Slower (can take seconds)
- Test real interactions
- Clean up resources after
- May require external services (Docker, etc.)

### 3. E2E Tests (Future)

**Purpose:** Test complete user workflows

**Location:** `tests/e2e/*.test.ts`

**Tools:** Playwright (planned)

**Examples:**

- Start all services from UI
- View logs in real-time
- Stop and restart services
- Create and execute tasks

---

## Test Utilities

Located in `tests/test-utils.ts`, provides common helpers:

### Wait for Condition

```typescript
await waitFor(() => processManager.getProcess(id)?.status === "running", {
  timeout: 5000,
  message: "Process didnt start",
});
```

### Sleep

```typescript
await sleep(1000); // Wait 1 second
```

### Retry with Backoff

```typescript
const result = await retry(() => fetchData(), {
  retries: 3,
  delay: 1000,
  backoff: 2,
});
```

### Generate Test ID

```typescript
const testId = generateTestId("process"); // process-1234567890-abc123
```

### Mock Events

```typescript
const emitter = createMockEmitter();
// Use emitter...
const events = emitter.getEvents();
expect(events).toHaveLength(2);
```

### Capture Console

```typescript
const console = captureConsole();
// Run code...
console.restore();
expect(console.logs).toContain("Expected message");
```

### Time Operation

```typescript
const { result, duration } = await timeOperation(() => heavyTask());
expect(duration).toBeLessThan(1000);
```

---

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MyClass } from "./myClass.js";

describe("MyClass", () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  afterEach(() => {
    // Clean up if needed
  });

  describe("methodName", () => {
    it("should do something when condition", () => {
      const result = instance.methodName("input");
      expect(result).toBe("expected");
    });

    it("should throw error when invalid input", () => {
      expect(() => {
        instance.methodName(null);
      }).toThrow();
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MyService } from "../../src/services/myService.js";
import { sleep, waitFor, generateTestId } from "../test-utils.js";

describe("My Service Integration", () => {
  let service: MyService;

  beforeAll(async () => {
    service = new MyService();
    await service.initialize();
  }, 30000);

  afterAll(async () => {
    await service.cleanup();
  }, 10000);

  describe("Feature Name", () => {
    it("should perform integration", async () => {
      const id = generateTestId("test");

      await service.doSomething(id);

      await waitFor(() => service.checkStatus(id) === "done", {
        timeout: 5000,
      });

      const result = service.getResult(id);
      expect(result).toBeDefined();
    });
  });
});
```

---

## Test Best Practices

### DO ✅

1. **Write descriptive test names**

   ```typescript
   // Good
   it("should retry failed task up to 3 times", () => {});

   // Bad
   it("test retry", () => {});
   ```

2. **Arrange-Act-Assert pattern**

   ```typescript
   it("should calculate total", () => {
     // Arrange
     const items = [1, 2, 3];

     // Act
     const total = calculateTotal(items);

     // Assert
     expect(total).toBe(6);
   });
   ```

3. **Test one thing per test**

   ```typescript
   // Good - focused
   it("should validate email format", () => {});
   it("should reject empty email", () => {});

   // Bad - too much
   it("should validate all user input", () => {
     // tests email, password, name, etc.
   });
   ```

4. **Clean up resources**

   ```typescript
   afterEach(async () => {
     await processManager.stopAll();
     await dockerManager.cleanup();
   });
   ```

5. **Use meaningful assertions**

   ```typescript
   // Good
   expect(result.status).toBe("completed");
   expect(result.errors).toHaveLength(0);

   // Bad
   expect(result).toBeTruthy();
   ```

### DON'T ❌

1. **Don't test implementation details**

   ```typescript
   // Bad - brittle
   expect(manager["_internalState"]).toBe("...");

   // Good - behavior
   expect(manager.getStatus()).toBe("running");
   ```

2. **Don't use magic values**

   ```typescript
   // Bad
   await sleep(5432);
   expect(result).toBe(42);

   // Good
   const STARTUP_DELAY = 5000;
   await sleep(STARTUP_DELAY);

   const EXPECTED_COUNT = 42;
   expect(result).toBe(EXPECTED_COUNT);
   ```

3. **Don't rely on test order**

   ```typescript
   // Bad - order dependent
   it("first test sets state", () => {
     state = "x";
   });
   it("second test uses state", () => {
     expect(state).toBe("x");
   });

   // Good - independent
   beforeEach(() => {
     state = "x";
   });
   it("uses state", () => {
     expect(state).toBe("x");
   });
   ```

4. **Don't ignore async issues**

   ```typescript
   // Bad - missing await
   it("should save data", () => {
     service.save(data); // Returns promise!
     expect(service.getData()).toBe(data);
   });

   // Good
   it("should save data", async () => {
     await service.save(data);
     expect(service.getData()).toBe(data);
   });
   ```

5. **Don't test the framework**

   ```typescript
   // Bad - testing Express, not your code
   it("should have req.body", () => {
     expect(req.body).toBeDefined();
   });

   // Good - testing your logic
   it("should validate request body", () => {
     const result = validateBody(req.body);
     expect(result.isValid).toBe(true);
   });
   ```

---

## Mocking Strategies

### 1. Manual Mocks

```typescript
const mockService = {
  getData: vi.fn().mockResolvedValue({ data: "test" }),
  saveData: vi.fn().mockResolvedValue(undefined),
};
```

### 2. Spy on Real Objects

```typescript
const spy = vi.spyOn(service, "method");
service.method("arg");
expect(spy).toHaveBeenCalledWith("arg");
spy.mockRestore();
```

### 3. Mock Modules

```typescript
vi.mock("dockerode", () => ({
  default: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue(true),
  })),
}));
```

### 4. Partial Mocks

```typescript
const service = new RealService();
vi.spyOn(service, "expensiveOperation").mockResolvedValue("cached");
// Other methods work normally
```

---

## Code Coverage

### Running Coverage

```bash
npm run test:coverage
```

### Coverage Reports

- **Terminal:** Summary in console
- **HTML:** `coverage/index.html` (open in browser)
- **JSON:** `coverage/coverage-final.json`

### Target Coverage

- **Overall:** > 80%
- **Critical paths:** 100% (process management, Docker operations)
- **Utilities:** > 90%
- **UI components:** > 70%

### Excluding from Coverage

```typescript
/* istanbul ignore next */
function debugOnly() {
  // This won't count towards coverage
}
```

---

## CI/CD Integration (Future)

### GitHub Actions (Planned)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

---

## Troubleshooting

### Tests Timing Out

```typescript
// Increase timeout for specific test
it("slow operation", async () => {
  // ...
}, 60000); // 60 second timeout
```

### Flaky Tests

1. **Add retries:** Use `retry()` helper
2. **Increase waits:** Use `waitFor()` instead of fixed `sleep()`
3. **Clean state:** Ensure proper `beforeEach`/`afterEach`
4. **Debug:** Add logging to see what's happening

### Resource Leaks

```typescript
// Always clean up
afterEach(async () => {
  await processManager.stopAll();
  await dockerManager.removeAll();
});
```

### Docker Tests Failing

```bash
# Check Docker is running
docker ps

# Pull test image
docker pull alpine:latest

# Run tests with verbose logging
DEBUG=* npm run test:integration
```

---

## Performance

### Test Speed Goals

- **Unit tests:** < 10ms each
- **Integration tests:** < 5s each
- **Full test suite:** < 30s

### Current Performance

- **Backend unit tests:** ~5 seconds ⚡
- **Backend integration tests:** ~20-30 seconds (with Docker)
- **Frontend tests:** ~3 seconds ⚡

---

## Future Improvements

### Planned (Phase 4)

1. **E2E Tests with Playwright**
   - Full user workflow tests
   - Visual regression testing
   - Cross-browser testing

2. **Test Coverage Dashboard**
   - Codecov integration
   - Coverage badges
   - Trend tracking

3. **Performance Tests**
   - Load testing for API endpoints
   - Memory leak detection
   - Stress testing

4. **Visual Tests**
   - Screenshot comparison
   - Component visual regression
   - Accessibility testing

---

## Resources

- **Vitest Docs:** https://vitest.dev/
- **Testing Library:** https://testing-library.com/
- **Playwright:** https://playwright.dev/
- **Test Utilities:** `backend/tests/test-utils.ts`

---

**Questions?** See existing tests for examples or ask the team!
