/**
 * Centralized API Client
 * 
 * Replaces scattered API calls with a consistent, reusable client.
 * Provides error handling, request/response interceptors, and type safety.
 */

import axios, { AxiosInstance, AxiosRequestConfig, CreateAxiosDefaults } from 'axios';
import type { ApiError } from '@/types/contracts';
import { createLogger } from '@/utils/logger';

import { getApiBaseUrl } from '@/utils/apiBaseUrl';

export class ApiClient {
  private client: AxiosInstance;
  private log = createLogger('ApiClient');

  constructor(baseURL: string = getApiBaseUrl()) {
    const normalizedBaseUrl = baseURL.replace(/\/+$/, '');
    const fullBaseURL = `${normalizedBaseUrl}/api`;
    this.log.debug('Initializing with base URL', fullBaseURL);
    this.log.debug('Resolved API base input', normalizedBaseUrl || '[current origin]');
    this.log.debug('Raw VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL);

    const apiKey = import.meta.env.VITE_API_KEY;
    
    const config: CreateAxiosDefaults = {
      baseURL: fullBaseURL,
      timeout: 30000,
    };

    this.client = axios.create(config);

    // Set headers after instance creation to ensure they're properly registered
    // in both Node and browser environments
    this.client.defaults.headers.common['Content-Type'] = 'application/json';
    
    if (apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = apiKey;
      this.log.debug('API key configured');
    } else {
      this.log.warn('No API key configured - requests may fail');
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => config,
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        // Centralized error handling
        if (error.response) {
          const payload = error.response.data;
          if (payload?.success === false && typeof payload?.error === 'string') {
            return Promise.reject(payload as ApiError);
          }

          const apiError: ApiError = {
            success: false,
            error: payload?.error || payload?.message || 'Request failed',
            message: payload?.message ?? payload?.error,
            code: payload?.code,
            details: payload?.details,
          };
          return Promise.reject(apiError);
        } else if (error.request) {
          // Network error
          const apiError: ApiError = {
            success: false,
            error: 'Network error - please check your connection',
            message: 'Network error - please check your connection',
            code: 'NETWORK_ERROR',
          };
          return Promise.reject(apiError);
        } else {
          // Other error
          const apiError: ApiError = {
            success: false,
            error: error.message || 'An unexpected error occurred',
            message: error.message || 'An unexpected error occurred',
            code: 'UNKNOWN_ERROR',
          };
          return Promise.reject(apiError);
        }
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
