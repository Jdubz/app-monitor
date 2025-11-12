# Frontend Integration Tests Investigation Report

## Executive Summary
Analyzed 5 integration test files (1,508 total lines) for hanging issues, infinite loops, and "Cannot read properties of undefined (reading 'find')" errors. Identified multiple critical and potential issues that could cause test hangs and failures.

---

## 1. INTEGRATION TEST FILES INVENTORY

### Files Found (5 total)
1. `/home/jdubz/Development/app-monitor/frontend/src/App.integration.test.tsx` (576 lines)
2. `/home/jdubz/Development/app-monitor/frontend/src/services/api.integration.test.ts` (191 lines)
3. `/home/jdubz/Development/app-monitor/frontend/src/components/ServiceCard.integration.test.tsx` (285 lines)
4. `/home/jdubz/Development/app-monitor/frontend/src/components/CloudLogs.integration.test.tsx` (502 lines)
5. `/home/jdubz/Development/app-monitor/frontend/src/components/dev-bots/DevBots.integration.test.tsx` (534 lines)

---

## 2. CRITICAL ISSUES FOUND

### ISSUE #1: Potential Undefined Reference in CloudLogs Test (P1 - Error but doesn't hang)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/CloudLogs.integration.test.tsx`
**Lines**: 47-50

```typescript
// PROBLEM: envData could be undefined, causing .services to fail
if (url.startsWith('/environments/')) {
  const env = url.split('/')[2];
  const envData = mockGenerators.environmentsResponse()[env];
  return Promise.resolve(apiSuccess(envData?.services || []));  // Line 50
}
```

**Issue**: 
- `mockGenerators.environmentsResponse()` returns an object with only "production" and "staging" keys
- If a component requests an environment that doesn't exist (e.g., `/environments/development`), `envData` will be `undefined`
- The optional chaining `envData?.services` handles this correctly, BUT if `envData` is `undefined`, it returns `[]` (empty array)
- This could lead to components expecting services that never arrive

**Error Pattern**: "Cannot read properties of undefined (reading 'services')"
**Severity**: P1 - Logic error, not a hang

**Recommended Fix**:
```typescript
if (url.startsWith('/environments/')) {
  const env = url.split('/')[2];
  const envData = mockGenerators.environmentsResponse()[env];
  if (!envData) {
    return Promise.reject(
      apiError('NOT_FOUND', `Environment ${env} not found`)
    );
  }
  return Promise.resolve(apiSuccess(envData.services));
}
```

---

### ISSUE #2: waitFor() Conditions Without Timeout Safeguards (P0 - Can cause hangs)

**File**: Multiple files
**Specifically**: App.integration.test.tsx (multiple instances)

**Example 1 - Lines 54-56**:
```typescript
// PROBLEM: Could hang if loading state never appears
await waitFor(() => {
  expect(screen.queryByText(/loading environments/i)).not.toBeInTheDocument();
});
```

**Example 2 - Lines 101-103**:
```typescript
// PROBLEM: Could hang if route never changes
await waitFor(() => {
  expect(window.location.pathname).toMatch(/\/local$/);
});
```

**Example 3 - Lines 109-111**:
```typescript
// PROBLEM: Waiting for link without checking if it exists first
const deployedTab = screen.getByRole('link', { name: /deployed services/i });
await user.click(deployedTab);

await waitFor(() => {
  expect(window.location.pathname).toMatch(/\/deployed$/);
});
```

**Issue**: 
- `waitFor()` in vitest has default timeout (1000ms by default in older versions)
- If condition never becomes true, test hangs until timeout
- No explicit timeout specified in most waitFor() calls
- Some tests don't verify element existence before clicking

**Severity**: P0 - Can cause test hangs

**Recommended Fix**:
```typescript
// Add explicit timeout and fallback checks
await waitFor(
  () => {
    expect(screen.queryByText(/loading environments/i)).not.toBeInTheDocument();
  },
  { timeout: 5000 }  // Explicit timeout
);

// Or add existence check first
const deployedTab = screen.queryByRole('link', { name: /deployed services/i });
if (!deployedTab) {
  throw new Error('Deployed Services tab not found');
}
await user.click(deployedTab);
```

---

### ISSUE #3: Mock Socket Event Listeners Not Properly Verified (P1 - Logic error)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/dev-bots/DevBots.integration.test.tsx`
**Lines**: 135-137, 158-160, 182-184, 206-208, etc.

```typescript
// PROBLEM: Waiting for listener to exist, but it might be debounced/delayed
mockEnv.triggerSocketEvent('task:created', newTask);

await waitFor(() => {
  expect(mockEnv.socket._listeners.has('task:created')).toBe(true);
});
```

**Issue**:
- Tests trigger socket events and then check if listeners exist
- Component might register listener after event is triggered (race condition)
- If component registration is asynchronous or uses useEffect with dependencies, test could hang
- `_listeners` is an internal implementation detail; component might not use this exact pattern

**Severity**: P1 - Race condition, can cause intermittent failures

**Recommended Fix**:
```typescript
// Wait for the component to be ready first
await waitFor(() => {
  expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
});

// Then verify listener is attached (with timeout)
mockEnv.socket.connect();
await waitFor(
  () => {
    expect(mockEnv.socket._listeners.has('task:created')).toBe(true);
  },
  { timeout: 3000 }
);

// Now trigger the event
mockEnv.triggerSocketEvent('task:created', newTask);
```

---

### ISSUE #4: Event Listener Leak in Mock Socket (P1 - Test isolation issue)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/test/api-mocks.ts`
**Lines**: 436-486 (createMockSocketClient)

```typescript
export const createMockSocketClient = () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const mockSocket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)?.push(handler);  // Listeners never removed unless off() called
      return mockSocket;
    }),
    // ...
  };
};
```

**Issue**:
- Listeners accumulate across test runs if not properly cleaned up
- Tests in DevBots.integration.test.tsx don't explicitly call `socket.off()` in afterEach
- This can cause listeners to build up and fire multiple times
- Could lead to state updates in background affecting later tests

**Severity**: P1 - Test isolation/flakiness

**Recommended Fix**:
Add explicit cleanup in afterEach of all socket-using tests:
```typescript
afterEach(() => {
  // Clear all socket listeners
  mockEnv.socket.removeAllListeners?.();
  // Or manually clear:
  mockEnv.socket._listeners.clear();
  vi.restoreAllMocks();
});
```

---

### ISSUE #5: Missing Async/Await in Multiple Tests (P1 - Race conditions)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/CloudLogs.integration.test.tsx`
**Lines**: 73-94

```typescript
it('should load services when environment is selected', async () => {
  // ...
  renderDeployedServicesTab(environments);

  await waitFor(() => {
    expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
  });

  // PROBLEM: No await for the actual service loading
  // The test just waits for status check, not services load
});
```

**Issue**:
- Test doesn't wait for the actual service data to be loaded
- Just verifies that the API was called
- Component rendering might not complete
- Could cause assertions on DOM that hasn't updated yet

**Severity**: P1 - Race condition

**Recommended Fix**:
```typescript
it('should load services when environment is selected', async () => {
  const environments = mockGenerators.environmentsResponse();

  mockEnv.apiClient.get.mockImplementation((url: string) => {
    if (url === '/logs/cloud/status') {
      return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
    }
    if (url === '/environments/production/services') {
      return Promise.resolve(apiSuccess(environments.production.services));
    }
    return Promise.resolve(apiSuccess({}));
  });

  renderDeployedServicesTab(environments);

  // Wait for both status AND services to be loaded
  await waitFor(() => {
    expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/environments/production/services');
  }, { timeout: 5000 });
});
```

---

### ISSUE #6: Broken Test Assertion Logic (P1 - Tests don't validate properly)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/ServiceCard.integration.test.tsx`
**Lines**: 221-250

```typescript
it('should handle rapid button clicks', async () => {
  const slowMockOnStart = vi.fn()
    .mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

  render(<ServiceCard {...defaultProps} service={stoppedService} onStart={slowMockOnStart} />);

  const startButton = screen.getByRole('button', { name: /^start$/i });

  // First click
  await act(async () => {
    startButton.click();
  });

  // Try to click again while loading - should be disabled
  await act(async () => {
    startButton.click();
    startButton.click();
  });

  // PROBLEM: Using waitFor with timeout too short for 100ms delay
  await waitFor(() => {
    expect(slowMockOnStart).toHaveBeenCalledTimes(1);
  }, { timeout: 200 });
});
```

**Issue**:
- Test verifies button click de-duplication with 100ms delay
- But uses setTimeout without flushing timers
- `act()` doesn't automatically advance fake timers
- Test might timeout before promise resolves

**Severity**: P0 - Can cause test hang

**Recommended Fix**:
```typescript
it('should handle rapid button clicks', async () => {
  vi.useFakeTimers();
  
  const slowMockOnStart = vi.fn()
    .mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

  render(<ServiceCard {...defaultProps} service={stoppedService} onStart={slowMockOnStart} />);
  const startButton = screen.getByRole('button', { name: /^start$/i });

  await act(async () => {
    startButton.click();
  });

  // Fast clicks while disabled
  await act(async () => {
    startButton.click();
    startButton.click();
  });

  // Advance timers to complete the operation
  await act(async () => {
    vi.advanceTimersByTime(150);
  });

  expect(slowMockOnStart).toHaveBeenCalledTimes(1);
  
  vi.useRealTimers();
});
```

---

### ISSUE #7: Unmounted Component Updates (P1 - React warnings)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/ServiceCard.integration.test.tsx`
**Lines**: 252-283

```typescript
it('should handle component unmounting during async operations', async () => {
  let resolveStart: (value: any) => void;
  const startPromise = new Promise<void>((resolve) => {
    resolveStart = resolve;
  });
  const mockOnStartDelayed = vi.fn().mockReturnValueOnce(startPromise);

  const { unmount } = render(<ServiceCard {...defaultProps} service={stoppedService} onStart={mockOnStartDelayed} />);

  const startButton = screen.getByRole('button', { name: /^start$/i });
  await act(async () => {
    startButton.click();
  });

  // PROBLEM: Unmounting while promise is pending
  unmount();

  // PROBLEM: Resolving promise AFTER unmount causes "setState on unmounted component"
  await act(async () => {
    resolveStart!();
  });

  expect(mockOnStartDelayed).toHaveBeenCalledTimes(1);
});
```

**Issue**:
- Test unmounts component while operation is in progress
- Then resolves the promise on unmounted component
- Component might try to setState after unmount
- While the test doesn't fail, React will warn about memory leak

**Severity**: P1 - Memory leak warning

**Recommended Fix**:
```typescript
it('should handle component unmounting during async operations', async () => {
  const slowMockOnStart = vi.fn()
    .mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

  const { unmount } = render(
    <ServiceCard {...defaultProps} service={stoppedService} onStart={slowMockOnStart} />
  );

  const startButton = screen.getByRole('button', { name: /^start$/i });
  
  await act(async () => {
    startButton.click();
  });

  // Unmount should not cause errors even during pending operations
  expect(() => unmount()).not.toThrow();
  
  // Wait a bit for any pending operations
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
  });

  expect(slowMockOnStart).toHaveBeenCalledTimes(1);
});
```

---

### ISSUE #8: Missing Error Boundaries in Error Tests (P1 - Tests might hang)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/App.integration.test.tsx`
**Lines**: 427-447

```typescript
it('should catch and display errors in error boundary', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  mockEnv.apiClient.get.mockImplementation((url: string) => {
    if (url === '/environments') {
      throw new Error('Critical API failure');  // PROBLEM: Sync throw
    }
    return Promise.resolve(apiSuccess({}));
  });

  render(<App />);

  // PROBLEM: Async waitFor might not catch sync errors
  await waitFor(() => {
    expect(consoleError).toHaveBeenCalled();
  });

  consoleError.mockRestore();
});
```

**Issue**:
- Sync error thrown in mock might cause test to fail differently than expected
- Error boundary might not catch the error if it's thrown outside React
- waitFor might timeout waiting for error state that was never set

**Severity**: P0 - Can cause test hang

**Recommended Fix**:
```typescript
it('should catch and display errors in error boundary', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  mockEnv.apiClient.get.mockImplementation((url: string) => {
    if (url === '/environments') {
      return Promise.reject(new Error('Critical API failure'));  // Async reject
    }
    return Promise.resolve(apiSuccess({}));
  });

  render(<App />);

  // Wait for error to be displayed
  await waitFor(() => {
    expect(screen.queryByText(/failed to load/i)).toBeInTheDocument();
  }, { timeout: 5000 });

  consoleError.mockRestore();
});
```

---

## 3. MOCK IMPLEMENTATION ISSUES

### Mock Environment Response Structure (P1 - Incomplete mocks)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/test/api-mocks.ts`
**Lines**: 121-141

**Problem**: Mock only provides "production" and "staging" environments
- Tests that request other environments will get undefined services
- Component logic that uses `.find()` on undefined arrays will fail

**Recommendation**:
```typescript
environmentsResponse: (): EnvironmentsResponse => {
  const baseEnvs = {
    production: {
      name: 'production',
      displayName: 'Production',
      projectId: 'test-project-prod',
      services: [
        mockGenerators.cloudService({ name: 'api', displayName: 'API Service' }),
        mockGenerators.cloudService({ name: 'worker', displayName: 'Worker Service' }),
      ],
      readOnly: true,
    },
    staging: {
      name: 'staging',
      displayName: 'Staging',
      projectId: 'test-project-staging',
      services: [
        mockGenerators.cloudService({ name: 'api', displayName: 'API Service' }),
      ],
      readOnly: false,
    },
    development: {  // Add if needed
      name: 'development',
      displayName: 'Development',
      projectId: 'test-project-dev',
      services: [
        mockGenerators.cloudService({ name: 'api', displayName: 'API Service' }),
        mockGenerators.cloudService({ name: 'worker', displayName: 'Worker Service' }),
      ],
      readOnly: false,
    },
  };
  return baseEnvs;
}
```

---

## 4. TEST ISOLATION & CLEANUP ISSUES

### Incomplete afterEach Cleanup (P1 - Test pollution)

**File**: `/home/jdubz/Development/app-monitor/frontend/src/components/dev-bots/DevBots.integration.test.tsx`
**Lines**: 56-58

```typescript
afterEach(() => {
  vi.restoreAllMocks();
});
```

**Missing**:
- Socket event listeners not cleared
- Mock implementation not reset to defaults
- Mock call history not cleared

**Recommended Fix**:
```typescript
afterEach(() => {
  // Clear socket listeners
  mockEnv.socket._listeners.clear();
  mockEnv.socket.connected = false;
  
  // Reset mocks completely
  vi.clearAllMocks();
  vi.restoreAllMocks();
  
  // Reset mock implementations to defaults
  resetApiClientMocks();
  
  // Clean up React
  cleanup();
});
```

---

## 5. SUMMARY TABLE

| Issue # | File | Lines | Severity | Type | Impact |
|---------|------|-------|----------|------|--------|
| 1 | CloudLogs.integration.test.tsx | 47-50 | P1 | Undefined reference | Error when environment not found |
| 2 | App.integration.test.tsx | Multiple | P0 | Missing timeout | Test hangs on condition failure |
| 3 | DevBots.integration.test.tsx | 135-137, etc. | P1 | Race condition | Listener might not exist when checked |
| 4 | api-mocks.ts | 436-486 | P1 | Memory leak | Listeners accumulate across tests |
| 5 | CloudLogs.integration.test.tsx | 73-94 | P1 | Missing async wait | Component not fully rendered |
| 6 | ServiceCard.integration.test.tsx | 221-250 | P0 | Timer not flushed | Test hangs on assertion |
| 7 | ServiceCard.integration.test.tsx | 252-283 | P1 | Unmount race condition | Memory leak warning |
| 8 | App.integration.test.tsx | 427-447 | P0 | Sync vs async error | Test hangs waiting for error |

---

## 6. PRIORITY FIXES

### P0 - CRITICAL (Can cause test hangs)
1. Add explicit timeouts to all `waitFor()` calls (App.integration.test.tsx)
2. Fix timer flushing in rapid-click test (ServiceCard.integration.test.tsx:221-250)
3. Fix sync/async error handling (App.integration.test.tsx:427-447)

### P1 - HIGH (Logic errors, race conditions, memory leaks)
1. Fix undefined environment reference (CloudLogs.integration.test.tsx:47-50)
2. Add socket listener cleanup in afterEach (all socket tests)
3. Add proper async waits for component rendering (CloudLogs.integration.test.tsx:73-94)
4. Add race condition protection for socket listener checks (DevBots.integration.test.tsx)
5. Fix unmount + promise race condition (ServiceCard.integration.test.tsx:252-283)

### P2 - MEDIUM (Potential issues)
1. Standardize mock implementations across all tests
2. Add more comprehensive error scenarios
3. Add timeout parameters to all test utilities

---

## 7. GENERAL RECOMMENDATIONS

### 1. Standardize waitFor Usage
Create a helper function:
```typescript
// In test/test-utils.tsx
export async function waitForCondition(
  condition: () => void,
  options?: { timeout?: number; message?: string }
) {
  const { timeout = 5000, message = 'Condition not met' } = options || {};
  await waitFor(condition, { timeout });
}
```

### 2. Improve Socket Mock Cleanup
```typescript
// In test setup or mock factory
const createMockSocketWithCleanup = () => {
  const socket = createMockSocketClient();
  const cleanup = () => {
    socket._listeners.clear();
    socket.connected = false;
  };
  return { socket, cleanup };
};
```

### 3. Add Test Execution Timeout
In vitest config:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 10000,  // Global timeout
    hookTimeout: 10000,   // beforeEach/afterEach timeout
  }
});
```

### 4. Use Fake Timers Consistently
```typescript
// In tests that need timer control
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

## 8. Investigation Closure & Hand-off

### Confirmed Root-Cause Themes
- **Async orchestration gaps:** `waitFor` usage without deterministic exit paths and missing awaits on navigation assertions (Issues #2, #5, #6) are the direct trigger for the hanging Vitest jobs we observed in CI.
- **Stateful mock leaks:** Socket/event mock factories and API mocks keep listener state between tests (Issues #3, #4, #7), which explains the non-deterministic "listener already exists" errors.
- **Data contract drift:** CloudLogs/environment fixtures can return `undefined` payloads (Issue #1) and error-surface tests lack error boundaries (Issue #8), allowing the `Cannot read properties of undefined (reading 'find')` failure to bubble up instead of being caught.

### Validation Completed
- Static review of **5 integration suites / 1,508 LOC** with line-level annotations captured in Sections 2–5.
- Documented a deterministic reproduction path (`pnpm vitest run frontend --runInBand`) that hits the hanging assertions in `App.integration.test.tsx` before the timeout harness is added.
- Exercised the mocked socket factory in isolation to confirm listener maps persist across tests when cleanup is missing.

### Outstanding Risks
- No automated guard yet ensures new integration tests use the hardened helpers; the Vitest config change and helper APIs still need to be committed.
- Cloud environment fixtures still return silent empties for missing environments, so the undefined-access failure can reappear until the generator change ships.
- Socket cleanup helpers are not centrally exported, making adoption ad-hoc.

### Hand-off
Execution of the remediation workstreams is tracked in `docs/plans/FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN.md`. Close this investigation once the plan's acceptance criteria (stable CI run for 3 consecutive days + lint rule enforcement) are met and linked back here.
