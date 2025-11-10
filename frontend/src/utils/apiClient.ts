/**
 * API Client Configuration with Authentication
 * 
 * Centralized API configuration that includes API key authentication.
 * 
 * Usage:
 *   import { apiClient } from '@/utils/apiClient';
 *   const response = await apiClient.get('/dev-bots/tasks');
 */

const API_KEY = import.meta.env.VITE_API_KEY || 'dev-key-change-in-production';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const apiConfig = {
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
};

/**
 * Simple API client with built-in authentication
 */
export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${apiConfig.baseURL}${path}`, {
      headers: apiConfig.headers,
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${apiConfig.baseURL}${path}`, {
      method: 'POST',
      headers: apiConfig.headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },

  async put<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${apiConfig.baseURL}${path}`, {
      method: 'PUT',
      headers: apiConfig.headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${apiConfig.baseURL}${path}`, {
      method: 'DELETE',
      headers: apiConfig.headers,
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },
};

/**
 * Get headers for manual fetch calls
 */
export function getAuthHeaders(): HeadersInit {
  return apiConfig.headers;
}
