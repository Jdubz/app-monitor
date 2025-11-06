# APP-MONITOR-TEST-2: Backend Testing Infrastructure Setup

**Priority:** P0 (Critical)  
**Type:** Testing Infrastructure  
**Effort:** 1 day  
**Parent:** APP-MONITOR-TEST-1  
**Repository:** job-finder-app-manager (app-monitor/backend)

## Problem Statement

The app-monitor backend has **0% test coverage** and no testing infrastructure. Before we can write tests, we need to set up Jest, create test helpers, and establish testing patterns.

## Goal

Set up complete backend testing infrastructure and achieve **10% initial coverage** by writing PortManager tests.

## Scope

### Testing Infrastructure

- ✅ Install Jest and TypeScript testing dependencies
- ✅ Create Jest configuration for ESM modules
- ✅ Set up test directory structure
- ✅ Create test helpers and utilities
- ✅ Add test scripts to package.json
- ✅ Configure coverage reporting

### Initial Tests (PortManager)

- ✅ Write comprehensive tests for `portManager.ts`
- ✅ Achieve 80%+ coverage on PortManager
- ✅ Test all critical port management functions
- ✅ Validate edge cases and error handling

## Acceptance Criteria

### Must Have

- [ ] Jest installed and configured
- [ ] Test infrastructure in place (helpers, mocks, fixtures)
- [ ] First test suite passing (PortManager)
- [ ] Coverage reporting working
- [ ] `npm test` command runs successfully
- [ ] Backend overall coverage ≥10%
- [ ] PortManager coverage ≥80%

### Should Have

- [ ] Test helpers for mocking ChildProcess
- [ ] Fixtures for sample service configurations
- [ ] Helper for finding free ports
- [ ] CI-compatible test configuration

## Implementation Steps

### 1. Install Dependencies

```bash
cd app-monitor/backend

npm install --save-dev \
  @types/jest@^29.5.12 \
  @types/supertest@^6.0.2 \
  jest@^29.7.0 \
  supertest@^6.3.4 \
  ts-jest@^29.1.2
```

### 2. Create Jest Configuration

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
    "!src/index.ts",
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

### 3. Update Package Scripts

Add to `package.json`:

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

### 4. Create Test Infrastructure

```bash
mkdir -p src/__tests__/{helpers,fixtures,integration}
mkdir -p src/utils/__tests__
mkdir -p src/services/__tests__
mkdir -p src/routes/__tests__
```

**Create `src/__tests__/setup.ts`:**

```typescript
import { jest } from "@jest/globals";

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

afterEach(() => {
  jest.clearAllMocks();
});
```

**Create `src/__tests__/helpers/portHelpers.ts`:**

```typescript
import net from "net";

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to get port"));
      }
    });
  });
}

export async function startDummyServer(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(port, () => resolve(server));
  });
}

export async function stopServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
```

**Create `src/__tests__/helpers/mockProcess.ts`:**

```typescript
import { EventEmitter } from "events";
import { Readable } from "stream";

export function createMockChildProcess() {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const emitter = new EventEmitter();

  return Object.assign(emitter, {
    pid: Math.floor(Math.random() * 100000),
    stdout,
    stderr,
    kill: jest.fn(),
    exitCode: null,
  });
}
```

### 5. Write PortManager Tests

Create `src/utils/__tests__/portManager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  isPortInUse,
  killPortProcess,
  killMultiplePorts,
  getDockerContainerInfo,
  stopDockerContainer,
} from "../portManager.js";
import {
  findFreePort,
  startDummyServer,
  stopServer,
} from "../../__tests__/helpers/portHelpers.js";
import net from "net";

describe("PortManager", () => {
  describe("isPortInUse", () => {
    it("should return true for port in use", async () => {
      const inUse = await isPortInUse(22); // SSH typically running
      expect(inUse).toBe(true);
    });

    it("should return false for free port", async () => {
      const port = await findFreePort();
      const inUse = await isPortInUse(port);
      expect(inUse).toBe(false);
    });

    it("should handle invalid port numbers", async () => {
      await expect(isPortInUse(0)).rejects.toThrow();
      await expect(isPortInUse(70000)).rejects.toThrow();
      await expect(isPortInUse(-1)).rejects.toThrow();
    });
  });

  describe("killPortProcess", () => {
    let server: net.Server;
    let testPort: number;

    beforeEach(async () => {
      testPort = await findFreePort();
      server = await startDummyServer(testPort);
    });

    afterEach(async () => {
      if (server.listening) {
        await stopServer(server);
      }
    });

    it("should kill process on port successfully", async () => {
      const killed = await killPortProcess(testPort);
      expect(killed).toBe(true);

      // Verify port is now free
      const inUse = await isPortInUse(testPort);
      expect(inUse).toBe(false);
    });

    it("should return false when no process on port", async () => {
      const freePort = await findFreePort();
      const killed = await killPortProcess(freePort);
      expect(killed).toBe(false);
    });

    it("should wait for port to be freed", async () => {
      await killPortProcess(testPort);

      // Small delay to ensure port is fully freed
      await new Promise((resolve) => setTimeout(resolve, 100));

      const inUse = await isPortInUse(testPort);
      expect(inUse).toBe(false);
    });
  });

  describe("killMultiplePorts", () => {
    let servers: net.Server[] = [];
    let ports: number[] = [];

    beforeEach(async () => {
      // Start 3 dummy servers
      for (let i = 0; i < 3; i++) {
        const port = await findFreePort();
        const server = await startDummyServer(port);
        servers.push(server);
        ports.push(port);
      }
    });

    afterEach(async () => {
      for (const server of servers) {
        if (server.listening) {
          await stopServer(server);
        }
      }
      servers = [];
      ports = [];
    });

    it("should kill all processes on specified ports", async () => {
      const results = await killMultiplePorts(ports);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);

      // Verify all ports are freed
      for (const port of ports) {
        const inUse = await isPortInUse(port);
        expect(inUse).toBe(false);
      }
    });

    it("should report partial failures correctly", async () => {
      const freePort = await findFreePort();
      const mixedPorts = [...ports, freePort];

      const results = await killMultiplePorts(mixedPorts);

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      expect(succeeded).toBe(3);
      expect(failed).toBe(1);
    });
  });

  describe("getDockerContainerInfo", () => {
    it("should detect running container", async () => {
      // This test requires Docker - can be skipped in CI
      const info = await getDockerContainerInfo("test-container");
      expect(info).toHaveProperty("running");
      expect(info).toHaveProperty("pid");
    });

    it("should handle non-existent container", async () => {
      const info = await getDockerContainerInfo(
        "definitely-does-not-exist-12345",
      );
      expect(info.running).toBe(false);
      expect(info.pid).toBeUndefined();
    });
  });
});
```

### 6. Run Tests

```bash
npm test
```

Expected: **~12 tests passing, 10% overall coverage**

## Deliverables

- [ ] `jest.config.js` - Jest configuration
- [ ] `package.json` - Updated with test scripts
- [ ] `src/__tests__/setup.ts` - Global test setup
- [ ] `src/__tests__/helpers/portHelpers.ts` - Port testing utilities
- [ ] `src/__tests__/helpers/mockProcess.ts` - Process mocking utilities
- [ ] `src/__tests__/fixtures/services.ts` - Sample service configs
- [ ] `src/utils/__tests__/portManager.test.ts` - PortManager test suite
- [ ] Coverage report in `coverage/` directory

## Success Metrics

- ✅ All tests pass locally
- ✅ Coverage report generated
- ✅ Backend overall coverage ≥10%
- ✅ PortManager coverage ≥80%
- ✅ Zero test failures
- ✅ Infrastructure ready for more tests

## Dependencies

- None (first step in testing initiative)

## Blocks

- APP-MONITOR-TEST-3 (ProcessManager tests - needs this infrastructure)
- APP-MONITOR-TEST-4 (API tests - needs this infrastructure)

## Follow-up

After completing this issue:

1. Move to APP-MONITOR-TEST-3 (ProcessManager tests)
2. Continue building on this infrastructure
3. Keep test patterns consistent

## Testing Commands

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# View coverage
open coverage/index.html
```

## References

- [TESTING_QUICKSTART.md](../app-monitor/TESTING_QUICKSTART.md) - Day 1 instructions
- [TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md) - Overall plan

---

**Labels:** `app-monitor`, `testing`, `infrastructure`, `priority-p0`, `backend`  
**Estimated Points:** 3 (1 day)  
**Assignee:** TBD
