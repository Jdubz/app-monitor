/**
 * Tests for ApiClient
 * 
 * Verifies API key configuration and header setup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios before importing ApiClient
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      defaults: {
        headers: {
          common: {},
        },
      },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    })),
  },
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock apiBaseUrl
vi.mock('@/utils/apiBaseUrl', () => ({
  getApiBaseUrl: () => 'https://test-api.example.com',
}));

// Import after mocks are set up
import { ApiClient } from './ApiClient';
import axios from 'axios';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset import.meta.env
    (import.meta.env as any).VITE_API_KEY = undefined;
    (import.meta.env as any).VITE_API_BASE_URL = undefined;
  });

  describe('Header Configuration', () => {
    it('should configure API key and Content-Type when VITE_API_KEY is provided', () => {
      // Set environment variable
      (import.meta.env as any).VITE_API_KEY = 'test-api-key-123';

      new ApiClient();

      // Verify axios.create was called with correct headers
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key-123',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should only set Content-Type when VITE_API_KEY is missing', () => {
      // Ensure VITE_API_KEY is not set
      delete (import.meta.env as any).VITE_API_KEY;

      new ApiClient();

      // Verify axios.create was called with headers but no API key
      const mockCreate = axios.create as any;
      const createCall = mockCreate.mock.calls[0][0];
      
      expect(createCall?.headers).toHaveProperty('Content-Type', 'application/json');
      expect(createCall?.headers).not.toHaveProperty('X-API-Key');
    });
  });

  describe('Configuration', () => {
    it('should set correct baseURL', () => {
      new ApiClient();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://test-api.example.com/api',
        })
      );
    });

    it('should set timeout to 30 seconds', () => {
      new ApiClient();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should accept custom baseURL', () => {
      new ApiClient('https://custom-api.example.com');

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom-api.example.com/api',
        })
      );
    });
  });

  describe('Type Safety', () => {
    it('should use proper TypeScript types for axios config', () => {
      // This test verifies that the code compiles with proper types
      // If CreateAxiosDefaults type is wrong, TypeScript compilation will fail
      const client = new ApiClient();
      expect(client).toBeDefined();
    });
  });
});
