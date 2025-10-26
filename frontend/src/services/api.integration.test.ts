import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockApiClient, createMockFetch } from '../test/test-utils';
import * as apiModule from './api';

// Mock the ApiClient
vi.mock('./ApiClient', () => ({
  apiClient: createMockApiClient(),
}));

// Get reference to mock API client
const mockApiClient = (await import('./ApiClient')).apiClient;

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
      vi.mocked(mockApiClient.get).mockResolvedValueOnce([mockService]);
      vi.mocked(mockApiClient.post).mockResolvedValueOnce({ ...mockService, status: 'starting' });
      vi.mocked(mockApiClient.post).mockResolvedValueOnce({ ...mockService, status: 'running' });
      vi.mocked(mockApiClient.get).mockResolvedValueOnce({ serviceName: 'test-service', logs: ['Service started'] });

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
      const error = new Error('Service not found');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(error);

      await expect(apiModule.getAllStatuses()).rejects.toThrow('Service not found');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error - please check your connection');
      vi.mocked(mockApiClient.post).mockRejectedValueOnce(networkError);

      await expect(apiModule.startService('test-service')).rejects.toThrow('Network error');
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

      vi.mocked(mockApiClient.get).mockResolvedValueOnce(mockPortStatuses);
      vi.mocked(mockApiClient.post).mockResolvedValueOnce(mockKillResponse);

      const portStatuses = await apiModule.getPortStatuses();
      expect(portStatuses['test-service']).toHaveLength(1);
      expect(portStatuses['test-service'][0].inUse).toBe(true);

      const killResult = await apiModule.killPortProcess(3000);
      expect(killResult.success).toBe(true);
      expect(killResult.port).toBe(3000);
    });
  });

  describe('Script Management Integration', () => {
    it('should handle complete script execution lifecycle', async () => {
      const mockScript = {
        id: 'script-1',
        name: 'test-script',
        description: 'A test script',
        command: 'echo "Hello World"',
        workingDirectory: '/app',
        environment: { NODE_ENV: 'test' },
        timeout: 30000,
        retries: 3,
        tags: ['test'],
        createdAt: '2025-01-27T14:00:00.000Z',
        updatedAt: '2025-01-27T14:00:00.000Z',
        createdBy: 'test-user',
        isActive: true
      };

      const mockExecution = {
        id: 'exec-1',
        scriptId: 'script-1',
        status: 'running',
        startTime: '2025-01-27T14:13:00.000Z',
        endTime: null,
        duration: null,
        exitCode: null,
        output: '',
        error: null,
        environment: { NODE_ENV: 'test' },
        workingDirectory: '/app',
        command: 'echo "Hello World"',
        pid: 12345,
        retryCount: 0,
        maxRetries: 3,
        timeout: 30000,
        tags: ['test'],
        createdAt: '2025-01-27T14:13:00.000Z',
        updatedAt: '2025-01-27T14:13:00.000Z'
      };

      const mockExecutionSummary = {
        id: 'exec-1',
        scriptId: 'script-1',
        scriptName: 'test-script',
        status: 'completed',
        startTime: '2025-01-27T14:13:00.000Z',
        endTime: '2025-01-27T14:13:05.000Z',
        duration: 5000,
        exitCode: 0,
        retryCount: 0,
        tags: ['test'],
        createdAt: '2025-01-27T14:13:00.000Z'
      };

      // Mock API responses
      vi.mocked(mockApiClient.get).mockResolvedValueOnce({ count: 1, scripts: [mockScript] });
      vi.mocked(mockApiClient.post).mockResolvedValueOnce({
        success: true,
        execution: {
          id: 'exec-1',
          scriptId: 'script-1',
          status: 'running',
          startTime: new Date()
        }
      });
      vi.mocked(mockApiClient.get).mockResolvedValueOnce({ count: 1, executions: [mockExecutionSummary] });
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(mockExecution);

      // Test script execution lifecycle
      const scripts = await apiModule.getScripts();
      expect(scripts).toHaveLength(1);
      expect(scripts[0].name).toBe('test-script');

      const execution = await apiModule.executeScript('script-1');
      expect(execution.success).toBe(true);
      expect(execution.execution.status).toBe('running');

      const executions = await apiModule.getExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe('completed');

      const executionDetails = await apiModule.getExecution('exec-1');
      expect(executionDetails.id).toBe('exec-1');
      expect(executionDetails.scriptId).toBe('script-1');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle different types of API errors', async () => {
      // Test 404 error
      const notFoundError = new Error('Not Found');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(notFoundError);

      await expect(apiModule.getServiceStatus('nonexistent')).rejects.toThrow('Not Found');

      // Test 500 error
      const serverError = new Error('Internal Server Error');
      vi.mocked(mockApiClient.post).mockRejectedValueOnce(serverError);

      await expect(apiModule.startService('test-service')).rejects.toThrow('Internal Server Error');

      // Test timeout error
      const timeoutError = new Error('Request timeout');
      vi.mocked(mockApiClient.get).mockRejectedValueOnce(timeoutError);

      await expect(apiModule.getAllStatuses()).rejects.toThrow('Request timeout');
    });

    it('should handle malformed responses', async () => {
      // Test malformed JSON response
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(null);

      const result = await apiModule.getAllStatuses();
      expect(result).toBeNull();
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

      vi.mocked(mockApiClient.get).mockResolvedValueOnce(mockServices);
      vi.mocked(mockApiClient.get).mockResolvedValueOnce(mockPortStatuses);

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