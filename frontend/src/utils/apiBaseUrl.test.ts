/**
 * API Base URL Tests
 * 
 * Ensures consistent API URL resolution across development and production
 * 
 * Note: These tests verify the code structure rather than runtime behavior
 * because import.meta.env is resolved at build time by Vite.
 */

import { describe, it, expect } from 'vitest';
import { getApiBaseUrl, getApiBasePath, DEFAULT_API_BASE_URL } from './apiBaseUrl';
import * as fs from 'fs';
import * as path from 'path';

describe('apiBaseUrl', () => {
  describe('Source code verification', () => {
    it('should use VITE_API_BASE_URL in source code', () => {
      const sourcePath = path.join(__dirname, 'apiBaseUrl.ts');
      const source = fs.readFileSync(sourcePath, 'utf8');
      
      // Verify correct env var is used
      expect(source).toContain('VITE_API_BASE_URL');
      
      // Should NOT use alternative names
      expect(source).not.toContain('VITE_API_URL');
      expect(source).not.toContain('VITE_BASE_URL');
    });
  });

  describe('getApiBaseUrl runtime behavior', () => {
    it('should return a valid URL', () => {
      const result = getApiBaseUrl();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should not have trailing slashes', () => {
      const result = getApiBaseUrl();
      expect(result).not.toMatch(/\/$/);
    });
  });

  describe('getApiBasePath', () => {
    it('should append /api to base URL', () => {
      const result = getApiBasePath();
      expect(result).toMatch(/\/api$/);
    });

    it('should return a string', () => {
      const result = getApiBasePath();
      expect(typeof result).toBe('string');
    });
  });

  describe('DEFAULT_API_BASE_URL constant', () => {
    it('should be localhost:5000 for development', () => {
      expect(DEFAULT_API_BASE_URL).toBe('http://localhost:5000');
    });
  });
});
