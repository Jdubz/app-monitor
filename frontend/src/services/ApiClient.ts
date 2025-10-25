/**
 * Centralized API Client
 * 
 * Replaces scattered API calls with a consistent, reusable client.
 * Provides error handling, request/response interceptors, and type safety.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message?: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000') {
    this.client = axios.create({
      baseURL: `${baseURL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add any request modifications here
        return config;
      },
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
          // Server responded with error status
          const apiError: ApiError = {
            error: error.response.data?.error || error.response.data?.message || 'Request failed',
            code: error.response.data?.code,
            details: error.response.data?.details,
          };
          return Promise.reject(apiError);
        } else if (error.request) {
          // Network error
          const apiError: ApiError = {
            error: 'Network error - please check your connection',
            code: 'NETWORK_ERROR',
          };
          return Promise.reject(apiError);
        } else {
          // Other error
          const apiError: ApiError = {
            error: error.message || 'An unexpected error occurred',
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
