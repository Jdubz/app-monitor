import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockApiClient } from '../test/test-utils';
import * as apiModule from './api';
import type { ApiSuccess, ApiError } from '@app-monitor/api-contracts';

// Mock the ApiClient
vi.mock('./ApiClient', () => ({
  apiClient: createMockApiClient(),
}));

// Get reference to mock API client
const mockApiClient = (await import('./ApiClient')).apiClient;

const success = <T>(data: T): ApiSuccess<T> => ({ success: true, data });
const apiError = (error: string, message?: string): ApiError => ({
  success: false,
  error,
  ...(message ? { message } : {}),
});

describe('API Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Management Integration', () => {
    it('should handle complete service lifecycle', async () => {
      const mockService = {
        id: 'test-service-1',
        name: 'test-service',
        status: 'stopped',
        port: 3000,
        pid: null,
        startTime: null,
        restartCount: 0,
        lastRestart: null,
        health: {
          status: 'unhealthy',
          lastCheck: '2025-01-27T14:10:00.000Z',
          responseTime: null
        },
        logs: {
          enabled: true,
          level: 'error',
          lastEntry: '2025-01-27T14:10:00.000Z'
        },
        config: {
          autoRestart: false,
          maxRestarts: 5,
          restartDelay: 10000
        }
      };

      // Mock API responses
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(success([mockService]));
      vi.mocked(mockApiClient.post).mockResolvedValueOnce(success({ ...mockService, status: 'starting' }));
      vi.mocked(mockApiClient.post).mockResolvedValueOnce(success({ ...mockService, status: 'running' }));
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(
        success({ serviceName: 'test-service', logs: ['Service started'] }),
      );

      // Test complete service lifecycle
      const services = await apiModule.getAllStatuses();
      expect(services).toHaveLength(1);
      expect(services[0].status).toBe('stopped');

      const startedService = await apiModule.startService('test-service');
      expect(startedService.status).toBe('starting');

      const runningService = await apiModule.restartService('test-service');
      expect(runningService.status).toBe('running');

      const logs = await apiModule.getServiceLogs('test-service');
      expect(logs.serviceName).toBe('test-service');
      expect(logs.logs).toContain('Service started');
    });

    it('should handle service errors gracefully', async () => {
      const errorPayload = apiError('Service not found');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(errorPayload);

      await expect(apiModule.getAllStatuses()).rejects.toEqual(errorPayload);
    });

    it('should handle network errors', async () => {
      const networkError = apiError('Network error - please check your connection');
      vi.mocked(mockApiClient.post).mockRejectedValueOnce(networkError);

      await expect(apiModule.startService('test-service')).rejects.toEqual(networkError);
    });
  });

  describe('Port Management Integration', () => {
    it('should handle port status and killing', async () => {
      const mockPortStatuses = {
        'test-service': [
          {
            port: 3000,
            pid: 12345,
            inUse: true,
            processName: 'node',
            command: 'node server.js',
            startTime: '2025-01-27T14:00:00.000Z'
          }
        ]
      };

      const mockKillResponse = {
        success: true,
        message: 'Port 3000 killed',
        port: 3000,
        pid: 12345,
        wasInUse: true
      };

      vi.mocked(mockApiClient.get).mockResolvedValueOnce(success(mockPortStatuses));
      vi.mocked(mockApiClient.post).mockResolvedValueOnce(success(mockKillResponse));

      const portStatuses = await apiModule.getPortStatuses();
      expect(portStatuses['test-service']).toHaveLength(1);
      expect(portStatuses['test-service'][0].inUse).toBe(true);

      const killResult = await apiModule.killPortProcess(3000);
      expect(killResult.success).toBe(true);
      expect(killResult.port).toBe(3000);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle different types of API errors', async () => {
      // Test 404 error
      const notFoundError = apiError('Not Found');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(notFoundError);

      await expect(apiModule.getServiceStatus('nonexistent')).rejects.toEqual(notFoundError);

      // Test 500 error
      const serverError = apiError('Internal Server Error');
      vi.mocked(mockApiClient.post).mockRejectedValueOnce(serverError);

      await expect(apiModule.startService('test-service')).rejects.toEqual(serverError);

      // Test timeout error
      const timeoutError = apiError('Request timeout');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(timeoutError);

      await expect(apiModule.getAllStatuses()).rejects.toEqual(timeoutError);
    });

    it('should handle malformed responses', async () => {
      // Test malformed JSON response
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(null);

      await expect(apiModule.getAllStatuses()).rejects.toThrow(
        'Malformed API response while fetching all service statuses',
      );
    });
  });

  describe('Concurrent Operations Integration', () => {
    it('should handle multiple concurrent API calls', async () => {
      const mockServices = [
        { id: 'service-1', name: 'service-1', status: 'running' },
        { id: 'service-2', name: 'service-2', status: 'stopped' }
      ];

      const mockPortStatuses = {
        'service-1': [{ port: 3000, pid: 12345, inUse: true }],
        'service-2': [{ port: 3001, pid: null, inUse: false }]
      };

      vi.mocked(mockApiClient.get).mockResolvedValueOnce(success(mockServices));
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(success(mockPortStatuses));

      // Make concurrent calls
      const [services, portStatuses] = await Promise.all([
        apiModule.getAllStatuses(),
        apiModule.getPortStatuses()
      ]);

      expect(services).toHaveLength(2);
      expect(portStatuses).toHaveProperty('service-1');
      expect(portStatuses).toHaveProperty('service-2');
    });
  });
});
