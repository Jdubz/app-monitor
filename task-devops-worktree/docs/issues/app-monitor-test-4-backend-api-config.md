# APP-MONITOR-TEST-4: Backend API Routes and Config Tests

**Priority:** P1 (High)  
**Type:** Testing  
**Effort:** 1 day  
**Parent:** APP-MONITOR-TEST-1  
**Depends On:** APP-MONITOR-TEST-2  
**Repository:** job-finder-app-manager (app-monitor/backend)

## Problem Statement

API routes and configuration are untested, leading to runtime failures when invalid configs are deployed or API contracts change. Need comprehensive testing of all endpoints and config validation.

## Goal

Achieve **50% overall backend coverage** by adding tests for API routes, service configuration validation, and integration scenarios.

## Scope

### Configuration Tests (`src/config.ts`)

- ✅ Validate all service configs have required fields
- ✅ Reject configs with invalid paths
- ✅ Reject configs with invalid ports
- ✅ Validate environment variables
- ✅ Test path resolution (relative, absolute, symlinks)
- ✅ Ensure no duplicate ports across services

### API Route Tests (`src/routes/api.ts`)

- ✅ GET /api/health - Returns server health
- ✅ GET /api/services - Returns all service statuses
- ✅ POST /api/services/:name/start - Starts service
- ✅ POST /api/services/:name/stop - Stops service
- ✅ POST /api/services/:name/restart - Restarts service
- ✅ POST /api/services/:name/kill - Kills service
- ✅ GET /api/ports/status - Returns port statuses
- ✅ GET /api/scripts - Returns available scripts
- ✅ POST /api/scripts/:id/execute - Executes script
- ✅ GET /api/scripts/:id/status - Gets execution status

### Integration Tests

- ✅ Full service lifecycle via API
- ✅ Error handling and status codes
- ✅ Concurrent requests
- ✅ Invalid input validation

## Acceptance Criteria

### Must Have

- [ ] Config validation tests passing
- [ ] All API endpoints tested
- [ ] Integration tests for service operations
- [ ] Error cases handled correctly
- [ ] Backend overall coverage ≥50%
- [ ] Config module coverage ≥70%
- [ ] API routes coverage ≥50%

### Should Have

- [ ] Request validation tests
- [ ] Response schema validation
- [ ] Authentication/authorization tests (if applicable)
- [ ] Rate limiting tests (if applicable)

## Implementation Details

### Configuration Tests

**File:** `src/__tests__/config.test.ts`

```typescript
import { describe, it, expect } from "@jest/globals";
import { services } from "../config.js";

describe("Service Configuration", () => {
  describe("Configuration Validation", () => {
    it("all services have required fields", () => {
      for (const [name, config] of Object.entries(services)) {
        expect(config).toHaveProperty("name");
        expect(config).toHaveProperty("displayName");
        expect(config).toHaveProperty("command");
        expect(config).toHaveProperty("args");
        expect(config).toHaveProperty("cwd");
        expect(config.name).toBe(name);
      }
    });

    it("all working directories exist", () => {
      for (const config of Object.values(services)) {
        expect(fs.existsSync(config.cwd)).toBe(true);
      }
    });

    it("no duplicate ports across services", () => {
      const allPorts = new Set<number>();

      for (const config of Object.values(services)) {
        if (config.ports) {
          for (const port of config.ports) {
            expect(allPorts.has(port)).toBe(false);
            allPorts.add(port);
          }
        }
      }
    });

    it("all ports are valid numbers", () => {
      for (const config of Object.values(services)) {
        if (config.ports) {
          for (const port of config.ports) {
            expect(port).toBeGreaterThan(0);
            expect(port).toBeLessThan(65536);
          }
        }
      }
    });

    it("commands are executable", () => {
      // Test that commands exist on system
      for (const config of Object.values(services)) {
        // Use 'which' or similar to verify command exists
      }
    });
  });
});
```

### API Route Tests

**File:** `src/routes/__tests__/api.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import express from "express";
import { createApiRouter } from "../api.js";

describe("API Routes", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api", createApiRouter());
  });

  describe("GET /api/health", () => {
    it("returns healthy status", async () => {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body).toHaveProperty("timestamp");
    });
  });

  describe("GET /api/services", () => {
    it("returns array of service statuses", async () => {
      const response = await request(app).get("/api/services");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        const service = response.body[0];
        expect(service).toHaveProperty("name");
        expect(service).toHaveProperty("displayName");
        expect(service).toHaveProperty("status");
      }
    });

    it("handles no running services", async () => {
      const response = await request(app).get("/api/services");

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/services/:name/start", () => {
    it("starts service successfully", async () => {
      const response = await request(app).post(
        "/api/services/test-service/start",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "running");
      expect(response.body).toHaveProperty("pid");
    });

    it("returns 409 if service already running", async () => {
      await request(app).post("/api/services/test-service/start");

      const response = await request(app).post(
        "/api/services/test-service/start",
      );

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty("error");
    });

    it("returns 404 for unknown service", async () => {
      const response = await request(app).post(
        "/api/services/nonexistent/start",
      );

      expect(response.status).toBe(404);
    });

    it("returns 500 on start failure", async () => {
      // Mock a service that will fail to start
      const response = await request(app).post(
        "/api/services/failing-service/start",
      );

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toContain("failed");
    });
  });

  describe("POST /api/services/:name/stop", () => {
    it("stops running service", async () => {
      await request(app).post("/api/services/test-service/start");

      const response = await request(app).post(
        "/api/services/test-service/stop",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "stopped");
    });

    it("handles stopping non-running service", async () => {
      const response = await request(app).post(
        "/api/services/test-service/stop",
      );

      expect(response.status).toBe(200);
      // Should be idempotent
    });
  });

  describe("POST /api/services/:name/restart", () => {
    it("restarts running service", async () => {
      await request(app).post("/api/services/test-service/start");

      const response = await request(app).post(
        "/api/services/test-service/restart",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "running");
    });
  });

  describe("GET /api/ports/status", () => {
    it("returns status for all configured ports", async () => {
      const response = await request(app).get("/api/ports/status");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        const portStatus = response.body[0];
        expect(portStatus).toHaveProperty("port");
        expect(portStatus).toHaveProperty("inUse");
        expect(portStatus).toHaveProperty("service");
      }
    });
  });

  describe("GET /api/scripts", () => {
    it("returns available scripts", async () => {
      const response = await request(app).get("/api/scripts");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("quality");
      expect(response.body).toHaveProperty("test");
      expect(response.body).toHaveProperty("utility");
    });
  });

  describe("POST /api/scripts/:id/execute", () => {
    it("executes script and returns execution ID", async () => {
      const response = await request(app).post("/api/scripts/test-all/execute");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("executionId");
      expect(response.body).toHaveProperty("status", "running");
    });

    it("rejects invalid script IDs", async () => {
      const response = await request(app).post(
        "/api/scripts/nonexistent/execute",
      );

      expect(response.status).toBe(404);
    });
  });
});
```

### Integration Tests

**File:** `src/__tests__/integration/serviceLifecycle.test.ts`

```typescript
import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../server.js";

describe("Service Lifecycle Integration", () => {
  it("complete start-stop-restart cycle", async () => {
    const app = createApp();

    // Start
    let response = await request(app).post("/api/services/test-service/start");
    expect(response.status).toBe(200);
    const pid1 = response.body.pid;

    // Stop
    response = await request(app).post("/api/services/test-service/stop");
    expect(response.status).toBe(200);

    // Restart (should get new PID)
    response = await request(app).post("/api/services/test-service/start");
    expect(response.status).toBe(200);
    expect(response.body.pid).not.toBe(pid1);
  });

  it("handles concurrent start requests gracefully", async () => {
    const app = createApp();

    // Send 3 simultaneous start requests
    const requests = [
      request(app).post("/api/services/test-service/start"),
      request(app).post("/api/services/test-service/start"),
      request(app).post("/api/services/test-service/start"),
    ];

    const responses = await Promise.all(requests);

    // One should succeed, others should return 409 or succeed idempotently
    const successful = responses.filter((r) => r.status === 200);
    expect(successful.length).toBeGreaterThanOrEqual(1);
  });
});
```

## Deliverables

- [ ] `src/__tests__/config.test.ts`
- [ ] `src/routes/__tests__/api.test.ts`
- [ ] `src/__tests__/integration/serviceLifecycle.test.ts`
- [ ] Coverage report showing ≥50%

## Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- config.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## References

- [Supertest Documentation](https://github.com/ladjs/supertest)
- [TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md) - Day 4
- [TESTING_QUICKSTART.md](../app-monitor/TESTING_QUICKSTART.md)

---

**Labels:** `app-monitor`, `testing`, `priority-p1`, `backend`, `api`  
**Estimated Points:** 3 (1 day)  
**Assignee:** TBD
