import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import * as apiModule from './api';
import { resetApiClientInstance } from './api';
import { mockHealthCheckResponse } from '../test/fixtures';
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
    resetApiClientInstance();
  });

  describe('Health Check', () => {
    it('should fetch health status', async () => {
      vi.mocked(mockAxiosInstance.get).mockResolvedValue(success(mockHealthCheckResponse));

      const result = await apiModule.healthCheck();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', undefined);
      expect(result).toEqual(mockHealthCheckResponse);
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
