/**
 * Branch Pattern Filtering Tests
 * 
 * Comprehensive tests for webhook branch pattern filtering and data recovery
 */

import { describe, it, expect } from 'vitest';

describe('Branch Pattern Matching', () => {
  // Helper function to simulate the branch pattern check
  function isDevBotManagedBranch(headRef: string, baseRef: string): boolean {
    const isTaskBranch = headRef.startsWith('task-') && 
                        (baseRef === 'main' || baseRef === 'staging');
    const isCopilotPR = headRef.startsWith('copilot/sub-pr-') && 
                       (baseRef.startsWith('task-') || baseRef === 'staging');
    return isTaskBranch || isCopilotPR;
  }

  describe('Valid Dev-Bot Patterns', () => {
    it('should match task-implementation-{uuid} -> main', () => {
      expect(isDevBotManagedBranch('task-implementation-abc123def456', 'main')).toBe(true);
    });

    it('should match task-fix-{uuid} -> main', () => {
      expect(isDevBotManagedBranch('task-fix-xyz789', 'main')).toBe(true);
    });

    it('should match task-bugfix-{uuid} -> staging', () => {
      expect(isDevBotManagedBranch('task-bugfix-abc123', 'staging')).toBe(true);
    });

    it('should match task-devops-{uuid} -> main', () => {
      expect(isDevBotManagedBranch('task-devops-7addb93b4ece', 'main')).toBe(true);
    });

    it('should match task-documentation-{uuid} -> staging', () => {
      expect(isDevBotManagedBranch('task-documentation-975fa12556ff', 'staging')).toBe(true);
    });

    it('should match copilot/sub-pr-{number} -> task-implementation-{uuid}', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-100', 'task-implementation-abc123')).toBe(true);
    });

    it('should match copilot/sub-pr-{number} -> task-fix-{uuid}', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-130', 'task-fix-xyz789')).toBe(true);
    });

    it('should match copilot/sub-pr-{number} -> staging', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-101', 'staging')).toBe(true);
    });
  });

  describe('Invalid Patterns (Should Be Filtered Out)', () => {
    it('should reject staging -> main', () => {
      expect(isDevBotManagedBranch('staging', 'main')).toBe(false);
    });

    it('should reject feature/* -> main', () => {
      expect(isDevBotManagedBranch('feature/new-ui', 'main')).toBe(false);
      expect(isDevBotManagedBranch('feature/minimalist-ui-redesign', 'staging')).toBe(false);
    });

    it('should reject fix/* -> main', () => {
      expect(isDevBotManagedBranch('fix/broken-link', 'main')).toBe(false);
      expect(isDevBotManagedBranch('fix/typescript-any-warnings', 'main')).toBe(false);
    });

    it('should reject refactor/* -> staging', () => {
      expect(isDevBotManagedBranch('refactor/cleanup', 'staging')).toBe(false);
      expect(isDevBotManagedBranch('refactor/frontend-phase-1', 'staging')).toBe(false);
    });

    it('should reject pr-{number} -> main', () => {
      expect(isDevBotManagedBranch('pr-123', 'main')).toBe(false);
      expect(isDevBotManagedBranch('pr-2', 'staging')).toBe(false);
    });

    it('should reject random branches', () => {
      expect(isDevBotManagedBranch('random-branch', 'main')).toBe(false);
      expect(isDevBotManagedBranch('dev', 'main')).toBe(false);
      expect(isDevBotManagedBranch('hotfix', 'main')).toBe(false);
    });

    it('should reject copilot PRs not targeting task branches or staging', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-100', 'main')).toBe(false);
      expect(isDevBotManagedBranch('copilot/sub-pr-100', 'feature/test')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle task branches with various types', () => {
      const taskTypes = [
        'implementation',
        'fix',
        'bugfix',
        'devops',
        'documentation',
        'investigation',
        'refactor-task',
      ];

      taskTypes.forEach(type => {
        expect(isDevBotManagedBranch(`task-${type}-abc123`, 'main')).toBe(true);
        expect(isDevBotManagedBranch(`task-${type}-abc123`, 'staging')).toBe(true);
      });
    });

    it('should handle copilot branches with various PR numbers', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-1', 'staging')).toBe(true);
      expect(isDevBotManagedBranch('copilot/sub-pr-999', 'staging')).toBe(true);
      expect(isDevBotManagedBranch('copilot/sub-pr-172', 'task-implementation-abc123')).toBe(true);
    });

    it('should reject task branches targeting non-main/staging', () => {
      expect(isDevBotManagedBranch('task-implementation-abc123', 'develop')).toBe(false);
      expect(isDevBotManagedBranch('task-fix-xyz789', 'feature/test')).toBe(false);
    });
  });

  describe('Real GitHub History Examples', () => {
    it('should match real dev-bot PRs', () => {
      expect(isDevBotManagedBranch('task-implementation-9a1e083aa455', 'staging')).toBe(true);
      expect(isDevBotManagedBranch('task-implementation-d8a8c375c4cb', 'main')).toBe(true);
      expect(isDevBotManagedBranch('task-bugfix-7addb93b4ece', 'main')).toBe(true);
    });

    it('should match real copilot PRs', () => {
      expect(isDevBotManagedBranch('copilot/sub-pr-130', 'task-implementation-9df9c9a87089')).toBe(true);
      expect(isDevBotManagedBranch('copilot/sub-pr-172', 'staging')).toBe(true);
    });

    it('should reject real manual PRs', () => {
      expect(isDevBotManagedBranch('staging', 'main')).toBe(false);
      expect(isDevBotManagedBranch('fix/typescript-any-warnings', 'main')).toBe(false);
      expect(isDevBotManagedBranch('refactor/frontend-phase-1', 'staging')).toBe(false);
    });
  });
});

describe('Task ID Extraction', () => {
  // Helper function to simulate task ID extraction
  function extractTaskIdFromBranch(branchName: string): string | null {
    // Pattern: task-{type}-{uuid}
    let match = branchName.match(/task-(implementation|investigation|bugfix|feature|refactor|docs|fix|devops|documentation)-([a-f0-9-]{8,})/i);
    if (match) return `task-${match[1]}-${match[2]}`;
    
    // Pattern: task-{uuid}
    match = branchName.match(/task-([a-f0-9-]{36})\b/i);
    if (match) return `task-${match[1]}`;
    
    // Pattern: any branch with task-{type}-{shortid}
    match = branchName.match(/(task-[a-z]+-[a-f0-9-]{8,})/i);
    if (match) return match[1];
    
    return null;
  }

  it('should extract task ID from task-implementation-{uuid}', () => {
    expect(extractTaskIdFromBranch('task-implementation-abc123def456')).toBe('task-implementation-abc123def456');
  });

  it('should extract task ID from task-fix-{hex}', () => {
    // Note: ID must be at least 8 chars and all hex (a-f0-9)
    expect(extractTaskIdFromBranch('task-fix-abcd1234')).toBe('task-fix-abcd1234');
  });

  it('should extract task ID from task-bugfix-{uuid}', () => {
    expect(extractTaskIdFromBranch('task-bugfix-7addb93b4ece')).toBe('task-bugfix-7addb93b4ece');
  });

  it('should return null for non-task branches', () => {
    expect(extractTaskIdFromBranch('staging')).toBeNull();
    expect(extractTaskIdFromBranch('feature/new-ui')).toBeNull();
    expect(extractTaskIdFromBranch('copilot/sub-pr-100')).toBeNull();
  });

  it('should handle full UUID format', () => {
    const uuid = '9a1e083a-a455-4b2c-8d1a-123456789abc';
    expect(extractTaskIdFromBranch(`task-implementation-${uuid}`)).toBe(`task-implementation-${uuid}`);
  });

  it('should handle short hex IDs', () => {
    expect(extractTaskIdFromBranch('task-documentation-975fa125')).toBe('task-documentation-975fa125');
  });
});
