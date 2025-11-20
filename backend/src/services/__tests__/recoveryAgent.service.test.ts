/**
 * Recovery Agent Service Unit Tests
 *
 * Tests the RecoveryAgentService for:
 * - Diagnosis of validation failures
 * - Recovery action generation
 * - Recovery execution and verification
 * - Integration with validation system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecoveryAgentService } from '../recoveryAgent.service.js';
import type { ValidationResult } from '../phaseValidation/index.js';
import type { Task } from '../taskQueue.sqlite.js';
import { selectAgentCliTypeForTask } from '../agentCliSelection.js';
import type { AgentCliCommandBuilder } from '../agentCliCommandBuilder.js';
import type { AgentSelector } from '../agentSelector.js';

vi.mock('../agentCliSelection.js', () => ({
  selectAgentCliTypeForTask: vi.fn().mockResolvedValue('claude')
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('dockerode', () => ({
  default: vi.fn(() => ({
    getContainer: vi.fn(() => ({
      exec: vi.fn(() => Promise.resolve({
        start: vi.fn(() => Promise.resolve({
          on: vi.fn((event, callback) => {
            if (event === 'end') callback();
          })
        }))
      }))
    }))
  }))
}));

describe('RecoveryAgentService', () => {
  let service: RecoveryAgentService;
  let cliBuilderMock: AgentCliCommandBuilder;
  const mockAgentSelector = {} as AgentSelector;
  const selectAgentCliTypeForTaskMock = vi.mocked(selectAgentCliTypeForTask);

  beforeEach(() => {
    vi.clearAllMocks();
    cliBuilderMock = {
      buildCommand: vi.fn().mockReturnValue(
        'printf \'{"category":"retry","diagnosis":"ok","recovery_action":"retry","success":true}\''
      )
    } as unknown as AgentCliCommandBuilder;
    selectAgentCliTypeForTaskMock.mockResolvedValue('claude');
    service = new RecoveryAgentService({
      agentSelector: mockAgentSelector,
      cliCommandBuilder: cliBuilderMock
    });
  });

  const createMockTask = (overrides?: Partial<Task>): Task => ({
    id: 'test-task-123',
    title: 'Test Task',
    type: 'bug',
    status: 'active',
    phase_index: 2,
    phase_name: 'Implementation',
    phase_status: 'running',
    phase_attempts: 1,
    created_at: Date.now(),
    ...overrides
  } as Task);

  describe('executeRecovery', () => {
    it('should successfully recover from network timeout error', async () => {
      // Given: Validation failure due to network timeout
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['Network timeout error occurred'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery
      const result = await service.executeRecovery(task, containerId, validationResult, 1);

      // Then: Should diagnose as retry
      expect(result.success).toBe(true);
      expect(result.category).toBe('retry');
      expect(result.shouldRetry).toBe(true);
      expect(result.diagnosis).toContain('timeout');
    });

    it('should diagnose rate limit errors', async () => {
      // Given: Rate limit error
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['Rate limit exceeded: 429'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery
      const result = await service.executeRecovery(task, containerId, validationResult, 1);

      // Then: Should diagnose as retry
      expect(result.success).toBe(true);
      expect(result.category).toBe('retry');
      expect(result.shouldRetry).toBe(true);
      expect(result.diagnosis).toContain('Rate limit');
    });

    it('should track recovery attempts and limit them', async () => {
      // Given: A task that keeps failing
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['Persistent error'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery 5 times (exceeds max of 4)
      const result = await service.executeRecovery(task, containerId, validationResult, 5);

      // Then: Should fail due to attempt limit
      expect(result.success).toBe(false);
      expect(result.category).toBe('chain_blocked');
      expect(result.shouldRetry).toBe(false);
      expect(result.diagnosis).toContain('after 4 attempts');
    });

    it('should handle Docker execution with recovery agent', async () => {
      // Given: Error that cannot be programmatically diagnosed
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['Some error that needs recovery agent'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery (will try to call Docker which is mocked)
      const result = await service.executeRecovery(task, containerId, validationResult, 1);

      // Then: Mock Docker will execute and parse response
      // Since we mock it to succeed, result should show retry
      expect(result).toBeDefined();
      expect(result.category).toBe('retry'); // Mock returns empty, parsed as retry
      expect(result.diagnosis).toBeDefined();
    });

    it('should respect shouldAttemptRecovery checks', () => {
      // Test validation passed - no recovery needed
      const passedResult: ValidationResult = {
        passed: true,
        errors: [],
      };
      expect(service.shouldAttemptRecovery(passedResult)).toBe(false);

      // Test validation failed with errors - recovery needed
      const failedResult: ValidationResult = {
        passed: false,
        errors: ['Some error'],
      };
      expect(service.shouldAttemptRecovery(failedResult)).toBe(true);

      // Test validation failed but no errors - no recovery needed
      const noErrorsResult: ValidationResult = {
        passed: false,
        errors: [],
      };
      expect(service.shouldAttemptRecovery(noErrorsResult)).toBe(false);
    });

    it('should detect ECONNREFUSED errors', async () => {
      // Given: Connection refused error
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['Connection failed: ECONNREFUSED'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery
      const result = await service.executeRecovery(task, containerId, validationResult, 1);

      // Then: Should diagnose as retry
      expect(result.success).toBe(true);
      expect(result.category).toBe('retry');
      expect(result.shouldRetry).toBe(true);
    });

    it('should detect ENOTFOUND errors', async () => {
      // Given: DNS resolution error
      const task = createMockTask();
      const validationResult: ValidationResult = {
        passed: false,
        errors: ['DNS lookup failed: ENOTFOUND'],
      };
      const containerId = 'test-container-123';

      // When: Attempting recovery
      const result = await service.executeRecovery(task, containerId, validationResult, 1);

      // Then: Should diagnose as retry
      expect(result.success).toBe(true);
      expect(result.category).toBe('retry');
      expect(result.shouldRetry).toBe(true);
    });
  });
});
