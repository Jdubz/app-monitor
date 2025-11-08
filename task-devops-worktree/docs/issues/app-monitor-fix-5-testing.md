# APP-MONITOR-FIX-5 — Add Testing Infrastructure (OPTIONAL)

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P3 (Low - Probably Skip for Local Tool)
- **Labels**: priority-p3, app-monitor, type-feature, testing, optional
- **Estimated Effort**: 2-3 hours
- **Dependencies**: None
- **Related**: APP-MONITOR-SETUP Part 1.3 & 2.3

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed. Testing is **not necessary** for a local dev tool that can be manually verified. **Recommend skipping this entirely.**

## What This Issue Covers

Add testing frameworks and write initial tests for app-monitor. This is **completely optional** and probably not worth the effort for a local-only development tool that can be manually tested.

## Context

**Missing**:

- No Jest configuration (backend)
- No Vitest configuration (frontend)
- No test files (0 tests)
- No test scripts
- No coverage reporting

**Risk**: Can't verify changes don't break functionality

## Tasks

### Backend Testing (Jest)

- [ ] Install Jest + ts-jest
- [ ] Create `jest.config.js`
- [ ] Add test scripts to package.json
- [ ] Create example test for ProcessManager
- [ ] Create example test for LogStreamer
- [ ] Create example test for API routes

### Frontend Testing (Vitest)

- [ ] Install Vitest + @testing-library/react
- [ ] Create `vitest.config.ts`
- [ ] Add test scripts to package.json
- [ ] Create example test for ServiceCard component
- [ ] Create example test for useServices hook
- [ ] Create example test for API client

### Coverage

- [ ] Configure coverage thresholds (start with 30%)
- [ ] Add coverage scripts
- [ ] Generate coverage reports

## Proposed Configuration

### backend/jest.config.js

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
};
```

### frontend/vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
  },
});
```

### Example Test Files

#### backend/tests/services/processManager.test.ts

```typescript
import { ProcessManager } from "../../src/services/processManager";

describe("ProcessManager", () => {
  it("should initialize with correct services", () => {
    const manager = new ProcessManager();
    expect(manager.getServices()).toHaveLength(4);
  });

  it("should start a service", async () => {
    const manager = new ProcessManager();
    const result = await manager.start("emulators");
    expect(result).toBe(true);
  });
});
```

#### frontend/tests/components/ServiceCard.test.tsx

```typescript
import { render, screen } from '@testing-library/react';
import { ServiceCard } from '../../src/components/ServiceCard';

describe('ServiceCard', () => {
  it('renders service name', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('Firebase Emulators')).toBeInTheDocument();
  });
});
```

## Package.json Scripts

### Backend

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Frontend

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Acceptance Criteria

- [ ] Jest configured and working for backend
- [ ] Vitest configured and working for frontend
- [ ] `npm test` runs tests in both directories
- [ ] At least 3 example tests written for backend
- [ ] At least 3 example tests written for frontend
- [ ] Coverage reports generated
- [ ] All tests pass
- [ ] Tests can be run in CI (update workflow)

## Benefits

- Safety net for refactoring
- Verify features work as expected
- Catch regressions early
- Documentation via tests
- Confidence in changes

## Testing Strategy

Focus on **critical paths first**:

1. Backend: ProcessManager start/stop/restart
2. Backend: LogStreamer event handling
3. Frontend: Service status display
4. Frontend: Control button actions
5. Frontend: Log filtering logic

## Future Coverage Goals

- Phase 1: 30% coverage (initial)
- Phase 2: 50% coverage (medium term)
- Phase 3: 70% coverage (ideal)

## Related Issues

- APP-MONITOR-FIX-2: CI/CD (add test job to workflow)
- APP-MONITOR-FIX-3: Git hooks (add tests to pre-push)
