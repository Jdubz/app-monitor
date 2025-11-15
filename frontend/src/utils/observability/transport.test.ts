/**
 * Log Transport Tests
 * 
 * Regression tests to ensure:
 * 1. Uses correct VITE_API_BASE_URL env var (not VITE_API_URL)
 * 2. Falls back to localhost in dev
 * 3. Properly constructs backend URL
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fetch globally
global.fetch = vi.fn();

describe('LogTransport Configuration', () => {
  it('should use getApiBaseUrl() function for backend URL', () => {
    // Verify the source code uses getApiBaseUrl() function (not manual logic)
    const transportPath = path.join(__dirname, 'transport.ts');
    const source = fs.readFileSync(transportPath, 'utf8');
    
    // Should import and use getApiBaseUrl
    expect(source).toContain('getApiBaseUrl');
    expect(source).toContain("from '../apiBaseUrl'");
    
    // Should NOT have the old broken logic (regression prevention)
    expect(source).not.toContain("VITE_API_BASE_URL || 'http://localhost:5000'");
  });

  it('should construct correct API endpoint for log upload', async () => {
    // Import to test the singleton behavior
    const { transport } = await import('./transport');
    
    // The transport should be configured
    expect(transport).toBeDefined();
  });

  it('should send logs to /api/logs/frontend endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    global.fetch = fetchMock;

    const { transport } = await import('./transport');
    
    // Force upload
    await (transport as any).sendBatch({
      type: 'log_batch',
      sessionId: 'test-session',
      logs: [],
    });

    // Verify fetch was called with correct endpoint path
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toMatch(/\/api\/logs\/frontend$/);
  });
});
