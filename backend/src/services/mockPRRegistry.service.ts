/**
 * Mock PR Registry Service
 *
 * In-memory storage for mock PR data used by E2E tests.
 * Allows E2E tests to register mock PR statuses that the backend can retrieve.
 *
 * This service is ONLY used in test mode (NODE_ENV === 'test').
 */

import { logger } from '../utils/logger.js';
import type { PRStatus, PRCheckStatus, PRReview, PRComment } from './githubPR.service.js';

export interface MockPRData {
  number: number;
  url: string;
  html_url: string;
  head_ref: string;
  base_ref: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  mergeable_state: string; // 'clean', 'dirty', 'unstable', 'blocked', 'behind', 'unknown'
  checks: PRCheckStatus[];
  reviews: PRReview[];
  comments: PRComment[];
  commits?: Array<{ sha: string; message: string }>;
  files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

export class MockPRRegistryService {
  private mockPRs: Map<number, MockPRData> = new Map();

  /**
   * Register a mock PR for testing
   */
  registerMockPR(prData: MockPRData): void {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn({
        category: 'test',
        action: 'mock_pr_registration_blocked',
        message: 'Attempted to register mock PR outside of test mode'
      });
      return;
    }

    this.mockPRs.set(prData.number, prData);

    logger.info({
      category: 'test',
      action: 'mock_pr_registered',
      message: `Registered mock PR #${prData.number} for E2E testing`,
      details: {
        prNumber: prData.number,
        mergeable_state: prData.mergeable_state,
        checks: prData.checks.length,
        reviews: prData.reviews.length
      }
    });
  }

  /**
   * Get a registered mock PR
   */
  getMockPR(prNumber: number): MockPRData | undefined {
    return this.mockPRs.get(prNumber);
  }

  /**
   * Convert MockPRData to PRStatus format expected by backend
   */
  convertToPRStatus(mockData: MockPRData): PRStatus {
    return {
      number: mockData.number,
      url: mockData.url,
      html_url: mockData.html_url,
      head_ref: mockData.head_ref,
      base_ref: mockData.base_ref,
      state: mockData.state,
      mergeable: mockData.mergeable,
      mergeable_state: mockData.mergeable_state,
      checks: mockData.checks,
      reviews: mockData.reviews,
      comments: mockData.comments
    };
  }

  /**
   * Update a mock PR's status
   */
  updateMockPR(prNumber: number, updates: Partial<MockPRData>): void {
    const existing = this.mockPRs.get(prNumber);
    if (!existing) {
      logger.warn({
        category: 'test',
        action: 'mock_pr_update_failed',
        message: `Attempted to update non-existent mock PR #${prNumber}`
      });
      return;
    }

    this.mockPRs.set(prNumber, { ...existing, ...updates });

    logger.info({
      category: 'test',
      action: 'mock_pr_updated',
      message: `Updated mock PR #${prNumber}`,
      details: { prNumber, updates: Object.keys(updates) }
    });
  }

  /**
   * Remove a mock PR
   */
  removeMockPR(prNumber: number): void {
    this.mockPRs.delete(prNumber);
    logger.info({
      category: 'test',
      action: 'mock_pr_removed',
      message: `Removed mock PR #${prNumber}`
    });
  }

  /**
   * Clear all mock PRs (useful for test cleanup)
   */
  clearAll(): void {
    const count = this.mockPRs.size;
    this.mockPRs.clear();
    logger.info({
      category: 'test',
      action: 'mock_prs_cleared',
      message: `Cleared ${count} mock PRs from registry`
    });
  }

  /**
   * Get all registered mock PRs
   */
  getAllMockPRs(): MockPRData[] {
    return Array.from(this.mockPRs.values());
  }
}

// Singleton instance
let mockPRRegistryInstance: MockPRRegistryService | null = null;

/**
 * Get the singleton mock PR registry instance
 */
export function getMockPRRegistry(): MockPRRegistryService {
  if (!mockPRRegistryInstance) {
    mockPRRegistryInstance = new MockPRRegistryService();
  }
  return mockPRRegistryInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetMockPRRegistry(): void {
  mockPRRegistryInstance = null;
}
