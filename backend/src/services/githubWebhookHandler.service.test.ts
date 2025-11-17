// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { GitHubWebhookHandler } from './githubWebhookHandler.service.js';
import { BaseWebhookHandler } from './webhookHandlers/baseHandler.js';

// Test wrapper to access protected method
class TestableBaseHandler extends BaseWebhookHandler {
  public testExtractTaskId(branchName: string, title: string): string | null {
    return this.extractTaskIdFromBranchOrTitle(branchName, title);
  }
}

describe('GitHubWebhookHandler', () => {
  describe('Task ID Extraction from PR Titles', () => {
    const handler = new TestableBaseHandler();
    
    it('should extract task ID from branch name with full format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(handler.testExtractTaskId(`task-implementation-${uuid}`, '')).toBe(`task-implementation-${uuid}`);
      expect(handler.testExtractTaskId(`task-bugfix-${uuid}`, '')).toBe(`task-bugfix-${uuid}`);
    });

    it('should extract task ID from branch name with UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(handler.testExtractTaskId(`task-${uuid}`, '')).toBe(`task-${uuid}`);
    });

    it('should extract task ID from branch name with short ID', () => {
      expect(handler.testExtractTaskId('task-feature-abcd1234', '')).toBe('task-feature-abcd1234');
      expect(handler.testExtractTaskId('task-bugfix-12345678', '')).toBe('task-bugfix-12345678');
    });

    it('should extract task ID from title when branch has no match', () => {
      expect(handler.testExtractTaskId('feature-branch', 'Task: task-impl-abcd1234')).toBe('task-impl-abcd1234');
      expect(handler.testExtractTaskId('', '[task-bugfix-12345678] Fix bug')).toBe('task-bugfix-12345678');
      expect(handler.testExtractTaskId('', '(task-feature-abcdef01) Add feature')).toBe('task-feature-abcdef01');
    });

    it('should extract full UUID format task IDs from title', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(handler.testExtractTaskId('', `Task: task-${uuid}`)).toBe(`task-${uuid}`);
      expect(handler.testExtractTaskId('', `[task-${uuid}] Fix bug`)).toBe(`task-${uuid}`);
      expect(handler.testExtractTaskId('', `Fix bug (task-${uuid})`)).toBe(`task-${uuid}`);
    });

    it('should return null when no task ID is found', () => {
      expect(handler.testExtractTaskId('', 'Just a regular PR title')).toBeNull();
      expect(handler.testExtractTaskId('feature-branch', 'Fix: authentication issue')).toBeNull();
      expect(handler.testExtractTaskId('', '[feature] Add new capability')).toBeNull();
    });

    it('should prioritize branch name over title', () => {
      expect(handler.testExtractTaskId('task-impl-aaaaaaaa', 'Task: task-bugfix-bbbbbbbb'))
        .toBe('task-impl-aaaaaaaa');
    });

    it('should handle task IDs with minimum 8 character hex', () => {
      expect(handler.testExtractTaskId('task-feature-abcd1234', '')).toBe('task-feature-abcd1234');
      expect(handler.testExtractTaskId('task-feature-abc123', '')).toBeNull(); // Too short
    });
  });

  describe('Webhook Statistics', () => {
    it('should initialize with zero stats', () => {
      const newHandler = new GitHubWebhookHandler();
      const stats = newHandler.getStats();
      
      expect(stats.pr_events_received).toBe(0);
      expect(stats.push_events_received).toBe(0);
      expect(stats.task_ids_extracted).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should increment PR events counter', async () => {
      const newHandler = new GitHubWebhookHandler();
      
      await newHandler.handlePullRequest({
        action: 'opened',
        number: 123,
        pull_request: {
          number: 123,
          title: 'Task: abc12345 - Test PR',
          state: 'open',
          html_url: 'https://github.com/test/repo/pull/123',
          user: { login: 'testuser', type: 'User' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main' },
          draft: false,
          merged: false,
          merged_at: null
        },
        repository: { full_name: 'test/repo' }
      });

      const stats = newHandler.getStats();
      expect(stats.pr_events_received).toBe(1);
      // NOTE: task_ids_extracted tracking removed during handler modularization
    });
  });
});
