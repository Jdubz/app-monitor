import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as apiModule from './api';
import { mockServices, mockHealthCheckResponse, mockPortStatuses } from '../test/fixtures';
import type { ApiError } from '@/types/contracts';

const success = <T>(data: T) => ({ data: { success: true, data } } as any);

// Mock axios.create to return our mock instance
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
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
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(mockHealthCheckResponse));

      const result = await apiModule.healthCheck();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', undefined);
      expect(result).toEqual(mockHealthCheckResponse);
    });
  });

  describe('Service Management', () => {
    it('should fetch all service statuses', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(mockServices));

      const result = await apiModule.getAllStatuses();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/services/status', undefined);
      expect(result).toEqual(mockServices);
    });

    it('should start a service', async () => {
      const service = mockServices[0];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(service));

      const result = await apiModule.startService('test-service');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/services/test-service/start', undefined, undefined);
      expect(result).toEqual(service);
    });

    it('should stop a service with graceful shutdown', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(service));

      const result = await apiModule.stopService('test-service', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/services/test-service/stop',
        {},
        { params: { graceful: true } }
      );
      expect(result).toEqual(service);
    });

    it('should stop a service with force kill', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(service));

      const result = await apiModule.stopService('test-service', false);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/services/test-service/stop',
        {},
        { params: { graceful: false } }
      );
      expect(result).toEqual(service);
    });

    it('should restart a service gracefully', async () => {
      const service = mockServices[0];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(service));

      const result = await apiModule.restartService('test-service', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/services/test-service/restart',
        {},
        { params: { graceful: true } }
      );
      expect(result).toEqual(service);
    });

    it('should kill a service', async () => {
      const service = mockServices[1];
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(service));

      const result = await apiModule.killService('test-service');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/services/test-service/kill', undefined, undefined);
      expect(result).toEqual(service);
    });

    it('should fetch service logs with default lines', async () => {
      const logs = { serviceName: 'test-service', logs: ['log1', 'log2'] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(logs));

      const result = await apiModule.getServiceLogs('test-service');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/logs/services/test-service/logs', {
        params: { lines: 100 },
      });
      expect(result).toEqual(logs);
    });

    it('should fetch service logs with custom lines', async () => {
      const logs = { serviceName: 'test-service', logs: ['log1'] };
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(logs));

      const result = await apiModule.getServiceLogs('test-service', 50);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/logs/services/test-service/logs', {
        params: { lines: 50 },
      });
      expect(result).toEqual(logs);
    });
  });

  describe('Port Management', () => {
    it('should fetch port statuses', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(mockPortStatuses));

      const result = await apiModule.getPortStatuses();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ports/status', undefined);
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
      vi.mocked(mockAxiosInstance.post).mockResolvedValue(success(response));

      const result = await apiModule.killPortProcess(3000);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ports/3000/kill', undefined, undefined);
      expect(result).toEqual(response);
    });
  });

  describe('Error Handling', () => {
    it('returns ApiError.error when no message is provided', () => {
      const error: ApiError = { success: false, error: 'Service not found' };

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Service not found');
    });

    it('prefers ApiError.message over error code', () => {
      const error: ApiError = { success: false, error: 'SERVER_ERROR', message: 'Internal Server Error' };

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Internal Server Error');
    });

    it('returns message for Error instances', () => {
      const error = new Error('Something went wrong');

      const result = apiModule.handleApiError(error);

      expect(result).toBe('Something went wrong');
    });

    it('returns string values when provided', () => {
      const result = apiModule.handleApiError('string error');

      expect(result).toBe('string error');
    });

    it('falls back to default message', () => {
      const result = apiModule.handleApiError({ random: true });

      expect(result).toBe('An unknown error occurred');
    });
  });
});
