# Frontend Integration Test Suite

## Overview

This document describes the comprehensive integration test suite for the app-monitor frontend application. The test suite validates the entire frontend application by mocking all server calls using API contracts and testing all features end-to-end.

## Architecture

### Core Components

1. **API Contract Mocks** (`src/test/api-mocks.ts`)
   - Type-safe mock factory based on `@app-monitor/api-contracts`
   - Mock generators for all API responses
   - Configured mock API client with realistic responses
   - Mock Socket.IO client for real-time features

2. **Test Setup** (`src/test/setup.ts`)
   - JSDOM environment configuration
   - Mock implementations for browser APIs
   - Mock implementations for third-party libraries (xterm.js, Socket.IO)
   - Global test utilities and helpers

3. **Integration Test Suites**
   - `App.integration.test.tsx` - Full application tests
   - `DevBots.integration.test.tsx` - Dev-Bots features
   - `CloudLogs.integration.test.tsx` - Cloud logging features
   - `ServiceCard.integration.test.tsx` - Service management
   - `api.integration.test.ts` - API layer integration

## Test Coverage

### Application-Level Tests (`App.integration.test.tsx`)

**Application Initialization**
- ✅ Renders app and loads initial data
- ✅ Handles initialization errors gracefully
- ✅ Establishes socket connection on mount

**Navigation and Routing**
- ✅ Navigate between tabs (Local, Deployed, Dev-Bots)
- ✅ Redirects invalid routes to /local
- ✅ Preserves state during navigation

**Local Services Tab**
- ✅ Loads and displays local services
- ✅ Starts and stops services
- ✅ Restarts services
- ✅ Displays service status in real-time

**Deployed Services Tab**
- ✅ Loads environments and cloud services
- ✅ Handles cloud logging unavailable state
- ✅ Filters services by environment

**Dev-Bots Tab**
- ✅ Loads and displays dev-bots status
- ✅ Shows task queue information
- ✅ Displays worker status

**Real-time Updates**
- ✅ Handles service status updates from socket
- ✅ Handles task updates from socket
- ✅ Reconnects on disconnection

**Error Handling**
- ✅ Catches errors in error boundary
- ✅ Handles network errors gracefully
- ✅ Handles socket disconnections

**Port Management**
- ✅ Loads and displays port status
- ✅ Kills port processes

**Keyboard Shortcuts**
- ✅ Handles keyboard shortcuts for navigation

### Dev-Bots Integration Tests (`DevBots.integration.test.tsx`)

**Task Queue Management**
- ✅ Loads and displays task queue
- ✅ Displays pending, active, and completed tasks
- ✅ Handles task updates via socket
- ✅ Handles task status changes
- ✅ Handles task completion
- ✅ Handles task failure

**Worker Management**
- ✅ Displays worker status
- ✅ Handles worker status updates via socket
- ✅ Displays worker types and availability
- ✅ Shows worker capacity (current/max)

**Interactive Sessions**
- ✅ Shows no active session state
- ✅ Displays active session information
- ✅ Starts new interactive session
- ✅ Ends active interactive session
- ✅ Sends input to interactive session
- ✅ Sends heartbeats

**Agent Comparison Metrics**
- ✅ Loads and displays agent comparison data
- ✅ Displays task type breakdown
- ✅ Shows success rates by agent
- ✅ Shows performance metrics

**Error Handling**
- ✅ Handles API errors gracefully
- ✅ Handles socket disconnections
- ✅ Handles task fetch errors

**Real-time System Status**
- ✅ Updates system status via socket
- ✅ Updates queue size in real-time
- ✅ Updates active task count

### Cloud Logs Integration Tests (`CloudLogs.integration.test.tsx`)

**Environment Selection**
- ✅ Displays available environments
- ✅ Loads services when environment is selected
- ✅ Respects read-only flag for environments

**Service Selection and Log Filtering**
- ✅ Loads logs for selected service
- ✅ Filters logs by severity level
- ✅ Supports custom time range filtering
- ✅ Supports custom filter expressions

**Log Display and Formatting**
- ✅ Displays logs with correct severity levels
- ✅ Formats log timestamps correctly
- ✅ Displays log metadata (trace, spanId, etc.)
- ✅ Shows structured log data

**Cloud Logging Status**
- ✅ Checks cloud logging availability on mount
- ✅ Displays message when unavailable
- ✅ Handles status check errors

**Read-Only Environments**
- ✅ Respects read-only flag for production
- ✅ Prevents actions on read-only environments

**Error Handling**
- ✅ Handles log fetch errors
- ✅ Handles empty log responses
- ✅ Handles malformed log data

**Performance and Pagination**
- ✅ Respects log limit parameter
- ✅ Handles large log volumes efficiently

### API Integration Tests (`api.integration.test.ts`)

**Service Management Integration**
- ✅ Complete service lifecycle (get status → start → restart → stop)
- ✅ Handles service errors gracefully
- ✅ Handles network errors

**Port Management Integration**
- ✅ Port status and killing
- ✅ Multiple ports per service

**Error Handling Integration**
- ✅ Different types of API errors (404, 500, timeout)
- ✅ Malformed responses

**Concurrent Operations Integration**
- ✅ Multiple concurrent API calls
- ✅ Race condition handling

## Mock Data Generators

The `mockGenerators` object provides type-safe mock data for all API contracts:

```typescript
import { mockGenerators, apiSuccess } from './test/api-mocks';

// Generate mock health check response
const health = mockGenerators.healthCheck();

// Generate mock service with custom props
const service = mockGenerators.processInfo({
  name: 'custom-service',
  status: 'running',
  ports: [3000]
});

// Generate dev-bots status
const devBotsStatus = mockGenerators.devBotsStatus();

// Wrap in API success envelope
const response = apiSuccess(health);
```

## Running Tests

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Integration Tests in Watch Mode
```bash
npm run test:watch:integration
```

### Run Integration Tests with Coverage
```bash
npm run test:coverage:integration
```

### Run Specific Test File
```bash
npx vitest run src/App.integration.test.tsx --config vitest.integration.config.ts
```

## Configuration

Integration tests use a dedicated Vitest configuration (`vitest.integration.config.ts`):

- **Single process execution**: Ensures consistent test environment
- **No file parallelism**: Prevents race conditions
- **Extended timeouts**: 60 seconds for complex integration scenarios
- **JSDOM environment**: Simulates browser environment
- **Path alias resolution**: Matches main vite.config.ts

## Best Practices

### Writing Integration Tests

1. **Use API Contract Mocks**
   ```typescript
   import { createMockEnvironment } from './test/api-mocks';

   const mockEnv = createMockEnvironment();
   vi.mock('./services/ApiClient', () => ({
     apiClient: mockEnv.apiClient,
   }));
   ```

2. **Test Complete User Flows**
   ```typescript
   // Don't just test individual functions
   // Test the complete user journey
   it('should complete service management workflow', async () => {
     // 1. User sees services
     // 2. User clicks start button
     // 3. Service starts
     // 4. UI updates to show running state
   });
   ```

3. **Use Realistic Data**
   ```typescript
   // Use mock generators for consistent, realistic data
   const service = mockGenerators.processInfo({
     name: 'backend',
     status: 'running',
     ports: [5000]
   });
   ```

4. **Test Real-time Features**
   ```typescript
   // Simulate socket events
   mockEnv.triggerSocketEvent('service:status', {
     name: 'backend',
     status: 'stopped'
   });

   // Verify UI updates
   await waitFor(() => {
     expect(screen.getByText(/stopped/i)).toBeInTheDocument();
   });
   ```

5. **Test Error States**
   ```typescript
   // Always test error handling
   mockEnv.apiClient.get.mockRejectedValueOnce(
     mockEnv.respondWithError('SERVER_ERROR', 'Failed to fetch')
   );
   ```

### Common Patterns

**Setup and Teardown**
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.socket.connected = false;

  // Configure default mocks
  mockEnv.apiClient.get.mockImplementation((url) => {
    if (url === '/health') {
      return Promise.resolve(apiSuccess(mockGenerators.healthCheck()));
    }
    return Promise.resolve(apiSuccess({}));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Testing User Interactions**
```typescript
const user = userEvent.setup();

// Click button
await user.click(screen.getByRole('button', { name: /start/i }));

// Type input
await user.type(screen.getByRole('textbox'), 'test input');

// Select option
await user.selectOptions(screen.getByRole('combobox'), 'option-value');
```

**Testing Async Operations**
```typescript
// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});

// Wait for element to disappear
await waitFor(() => {
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});
```

## Troubleshooting

### Tests Timing Out

If tests are timing out, increase the timeout in the config:
```typescript
testTimeout: 120000, // 2 minutes
```

### Socket Events Not Triggering

Make sure to connect the socket before triggering events:
```typescript
mockEnv.socket.connect();
mockEnv.triggerSocketEvent('event:name', data);
```

### Router Issues

Ensure tests that use routing are wrapped in BrowserRouter:
```typescript
render(
  <BrowserRouter>
    <Component />
  </BrowserRouter>
);
```

### API Mocks Not Working

Check that the mock is configured before the component renders:
```typescript
// WRONG - mock after render
render(<Component />);
mockEnv.apiClient.get.mockResolvedValue(apiSuccess(data));

// RIGHT - mock before render
mockEnv.apiClient.get.mockResolvedValue(apiSuccess(data));
render(<Component />);
```

## Future Enhancements

- [ ] Visual regression testing with Playwright
- [ ] Performance benchmarking for large datasets
- [ ] Accessibility testing (axe-core integration)
- [ ] Network condition simulation (slow 3G, offline, etc.)
- [ ] Extended WebSocket scenario testing
- [ ] Integration with CI/CD pipeline metrics

## Related Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [API Contracts](../shared/api-contracts/index.ts)
- [E2E Tests](./e2e/README.md)
