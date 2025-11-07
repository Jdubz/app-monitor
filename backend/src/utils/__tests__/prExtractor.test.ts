/**
 * Tests for PR information extraction utility
 */

import { describe, it, expect } from 'vitest';
import { extractPRInfo, isValidPRInfo, extractPRNumber } from '../prExtractor.js';

describe('prExtractor', () => {
  describe('extractPRInfo', () => {
    it('should extract PR info from explicit format', () => {
      const output = `
        =========================================
        PR_NUMBER: 42
        PR_URL: https://github.com/Jdubz/app-monitor/pull/42
        PR_BRANCH: task-feat-add-feature
        =========================================
      `;

      const result = extractPRInfo(output);
      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/Jdubz/app-monitor/pull/42',
        branch: 'task-feat-add-feature'
      });
    });

    it('should extract PR info from gh pr create output', () => {
      const output = `
        Created pull request: https://github.com/Jdubz/app-monitor/pull/123
        Switched to branch 'task-fix-bug'
      `;

      const result = extractPRInfo(output);
      expect(result).toBeTruthy();
      expect(result?.number).toBe(123);
      expect(result?.url).toBe('https://github.com/Jdubz/app-monitor/pull/123');
    });

    it('should extract PR info from merge message format', () => {
      const output = `
        Pull request #99 from Jdubz/feature-branch
      `;

      const result = extractPRInfo(output);
      expect(result).toBeTruthy();
      expect(result?.number).toBe(99);
      expect(result?.branch).toBe('feature-branch');
    });

    it('should return null for output without PR info', () => {
      const output = 'Task completed successfully';
      const result = extractPRInfo(output);
      expect(result).toBeNull();
    });

    it('should return null for empty output', () => {
      const result = extractPRInfo('');
      expect(result).toBeNull();
    });
  });

  describe('isValidPRInfo', () => {
    it('should validate correct PR info', () => {
      const prInfo = {
        number: 42,
        url: 'https://github.com/Jdubz/app-monitor/pull/42',
        branch: 'task-feat-add-feature'
      };

      expect(isValidPRInfo(prInfo)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidPRInfo(null)).toBe(false);
    });

    it('should reject PR info with invalid number', () => {
      const prInfo = {
        number: 0,
        url: 'https://github.com/Jdubz/app-monitor/pull/42',
        branch: 'task-feat-add-feature'
      };

      expect(isValidPRInfo(prInfo)).toBe(false);
    });

    it('should reject PR info with invalid URL', () => {
      const prInfo = {
        number: 42,
        url: 'not-a-url',
        branch: 'task-feat-add-feature'
      };

      expect(isValidPRInfo(prInfo)).toBe(false);
    });

    it('should reject PR info with empty branch', () => {
      const prInfo = {
        number: 42,
        url: 'https://github.com/Jdubz/app-monitor/pull/42',
        branch: ''
      };

      expect(isValidPRInfo(prInfo)).toBe(false);
    });
  });

  describe('extractPRNumber', () => {
    it('should extract PR number from explicit format', () => {
      expect(extractPRNumber('PR_NUMBER: 42')).toBe(42);
    });

    it('should extract PR number from hash format', () => {
      expect(extractPRNumber('Fixed in #123')).toBe(123);
    });

    it('should extract PR number from URL', () => {
      expect(extractPRNumber('https://github.com/owner/repo/pull/99')).toBe(99);
    });

    it('should extract PR number from PR: format', () => {
      expect(extractPRNumber('PR: 456')).toBe(456);
    });

    it('should return null when no PR number found', () => {
      expect(extractPRNumber('No PR here')).toBeNull();
    });

    it('should return null for empty text', () => {
      expect(extractPRNumber('')).toBeNull();
    });
  });
});
