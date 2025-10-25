import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as apiModule from './api';
import { mockServices, mockHealthCheckResponse, mockPortStatuses, mockScript, mockScriptExecution, mockScriptExecutionSummary } from '../test/fixtures';

// Mock axios.create to return our mock instance
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn(),
    },
    isAxiosError: vi.fn(),
  };
});

// Get reference to mock axios instance for test assertions
const mockAxiosInstance = (axios.create as ReturnType<typeof vi.fn>)() as AxiosInstance;

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should fetch health status', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: mockHealthCheckResponse } as any);

      const result = await apiModule.healthCheck();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(mockHealthCheckResponse);
    });
  });

  describe('Service Management', () => {
    it('should fetch all service statuses', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: mockServices } as any);

      const result = await apiModule.getAllStatuses();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/services/status');
      expect(result).toEqual(mockServices);
    });

    it('should start a service', async () => {
      const service = mockServices[0];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: service } as any);

      const result = await apiModule.startService('test-service');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/services/test-service/start');
      expect(result).toEqual(service);
    });

    it('should stop a service with graceful shutdown', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: service } as any);

      const result = await apiModule.stopService('test-service', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/services/test-service/stop',
        {},
        { params: { graceful: true } }
      );
      expect(result).toEqual(service);
    });

    it('should stop a service with force kill', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: service } as any);

      const result = await apiModule.stopService('test-service', false);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/services/test-service/stop',
        {},
        { params: { graceful: false } }
      );
      expect(result).toEqual(service);
    });

    it('should restart a service gracefully', async () => {
      const service = mockServices[0];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: service } as any);

      const result = await apiModule.restartService('test-service', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/services/test-service/restart',
        {},
        { params: { graceful: true } }
      );
      expect(result).toEqual(service);
    });

    it('should kill a service', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: service } as any);

      const result = await apiModule.killService('test-service');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/services/test-service/kill');
      expect(result).toEqual(service);
    });

    it('should fetch service logs with default lines', async () => {
      const logs = { serviceName: 'test-service', logs: ['log1', 'log2'] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: logs } as any);

      const result = await apiModule.getServiceLogs('test-service');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/services/test-service/logs', {
        params: { lines: 100 },
      });
      expect(result).toEqual(logs);
    });

    it('should fetch service logs with custom lines', async () => {
      const logs = { serviceName: 'test-service', logs: ['log1'] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: logs } as any);

      const result = await apiModule.getServiceLogs('test-service', 50);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/services/test-service/logs', {
        params: { lines: 50 },
      });
      expect(result).toEqual(logs);
    });
  });

  describe('Port Management', () => {
    it('should fetch port statuses', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: mockPortStatuses } as any);

      const result = await apiModule.getPortStatuses();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ports/status');
      expect(result).toEqual(mockPortStatuses);
    });

    it('should kill a port process', async () => {
      const response = {
        success: true,
        message: 'Port 3000 killed',
        port: 3000,
        pid: 12345,
        wasInUse: true,
      };
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: response } as any);

      const result = await apiModule.killPortProcess(3000);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/ports/3000/kill');
      expect(result).toEqual(response);
    });
  });

  describe('Script Management', () => {
    it('should fetch all scripts', async () => {
      const response = { count: 1, scripts: [mockScript] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: response } as any);

      const result = await apiModule.getScripts();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/scripts');
      expect(result).toEqual([mockScript]);
    });

    it('should execute a script', async () => {
      const response = {
        success: true,
        execution: {
          id: 'exec-1',
          scriptId: 'script-1',
          status: 'running',
          startTime: new Date(),
        },
      };
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: response } as any);

      const result = await apiModule.executeScript('script-1');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/scripts/script-1/execute');
      expect(result).toEqual(response);
    });

    it('should fetch all executions', async () => {
      const response = { count: 1, executions: [mockScriptExecutionSummary] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: response } as any);

      const result = await apiModule.getExecutions();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/scripts/executions');
      expect(result).toEqual([mockScriptExecutionSummary]);
    });

    it('should fetch a specific execution', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue({ data: mockScriptExecution } as any);

      const result = await apiModule.getExecution('exec-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/scripts/executions/exec-1');
      expect(result).toEqual(mockScriptExecution);
    });

    it('should kill a script execution', async () => {
      const response = { success: true, message: 'Script killed' };
      vi.mocked(mockAxiosInstance.post).mockResolvedValue({ data: response } as any);

      const result = await apiModule.killScript('exec-1');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/scripts/executions/exec-1/kill');
      expect(result).toEqual(response);
    });

    it('should clear script history', async () => {
      const response = { success: true, message: 'History cleared' };
      vi.mocked(mockAxiosInstance.delete).mockResolvedValue({ data: response } as any);

      const result = await apiModule.clearScriptHistory();

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/scripts/executions');
      expect(result).toEqual(response);
    });
  });

  describe('Error Handling', () => {
    it('should handle axios error with response data message', () => {
      const error = {
        isAxiosError: true,
        response: {
          data: {
            message: 'Service not found',
          },
        },
      };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Service not found');
    });

    it('should handle axios error with response data error', () => {
      const error = {
        isAxiosError: true,
        response: {
          data: {
            error: 'Connection failed',
          },
        },
      };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Connection failed');
    });

    it('should handle axios error with error message', () => {
      const error = {
        isAxiosError: true,
        message: 'Network error',
      };
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Network error');
    });

    it('should handle Error instance', () => {
      const error = new Error('Something went wrong');

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Something went wrong');
    });

    it('should handle unknown error', () => {
      const error = 'string error';

      const result = apiModule.handleApiError(error);

      expect(result).toBe('An unknown error occurred');
    });
  });
});
