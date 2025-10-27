import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenTrackingService, getTokenTrackingService, resetTokenTrackingService, TokenBudget } from './tokenTracking.js';
import { DevBotsDatabase, getDatabase, TokenUsage } from './database.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'token-tracking-test.db');

describe('TokenTrackingService', () => {
  let service: TokenTrackingService;
  let db: DevBotsDatabase;

  beforeEach(() => {
    // Clean up any existing test db
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create test database
    db = new DevBotsDatabase(TEST_DB_PATH);

    // Reset singleton and create new service
    resetTokenTrackingService();
    service = new TokenTrackingService({ database: db });
  });

  afterEach(() => {
    resetTokenTrackingService();
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Budget Management', () => {
    it('should initialize with default budgets', () => {
      const claudeBudget = service.getBudget('claude');
      expect(claudeBudget).toBeDefined();
      expect(claudeBudget?.provider).toBe('claude');
      expect(claudeBudget?.dailyLimit).toBeGreaterThan(0);
    });

    it('should allow setting custom budgets', () => {
      const customBudget: TokenBudget = {
        provider: 'custom-provider',
        dailyLimit: 100000,
        costPerMillionInput: 5.0,
        costPerMillionOutput: 10.0,
        warningThreshold: 75
      };

      service.setBudget(customBudget);
      const retrieved = service.getBudget('custom-provider');

      expect(retrieved).toEqual(customBudget);
    });

    it('should update existing budget', () => {
      const originalBudget = service.getBudget('claude');
      expect(originalBudget).toBeDefined();

      const updatedBudget: TokenBudget = {
        provider: 'claude',
        dailyLimit: 2000000,
        costPerMillionInput: 4.0,
        costPerMillionOutput: 20.0,
        warningThreshold: 90
      };

      service.setBudget(updatedBudget);
      const retrieved = service.getBudget('claude');

      expect(retrieved?.dailyLimit).toBe(2000000);
      expect(retrieved?.warningThreshold).toBe(90);
    });
  });

  describe('Usage Recording', () => {
    it('should record token usage', () => {
      const usage: TokenUsage = {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000,
        outputTokens: 500
      };

      service.recordUsage(usage);

      const summary = service.getDailySummary('claude');
      expect(summary.totalInput).toBe(1000);
      expect(summary.totalOutput).toBe(500);
      expect(summary.totalTokens).toBe(1500);
      expect(summary.requestCount).toBe(1);
    });

    it('should calculate cost estimate', () => {
      const usage: TokenUsage = {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 100000, // 0.1M tokens
        outputTokens: 50000  // 0.05M tokens
      };

      service.recordUsage(usage);

      const summary = service.getDailySummary('claude');
      // $3 per 1M input = $0.30, $15 per 1M output = $0.75 = $1.05 total
      expect(summary.estimatedCost).toBeCloseTo(1.05, 2);
    });

    it('should accumulate multiple usage records', () => {
      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000,
        outputTokens: 500
      });

      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-2',
        inputTokens: 2000,
        outputTokens: 1000
      });

      const summary = service.getDailySummary('claude');
      expect(summary.totalInput).toBe(3000);
      expect(summary.totalOutput).toBe(1500);
      expect(summary.totalTokens).toBe(4500);
      expect(summary.requestCount).toBe(2);
    });
  });

  describe('Budget Monitoring', () => {
    it('should calculate percent used', () => {
      // Set low budget for testing
      service.setBudget({
        provider: 'test-provider',
        dailyLimit: 10000,
        costPerMillionInput: 1.0,
        costPerMillionOutput: 1.0,
        warningThreshold: 80
      });

      service.recordUsage({
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: 3000,
        outputTokens: 2000
      });

      const summary = service.getDailySummary('test-provider');
      expect(summary.percentUsed).toBe(50); // 5000 / 10000 = 50%
    });

    it('should trigger warning at threshold', async () => {
      // Set low budget for testing
      service.setBudget({
        provider: 'test-provider',
        dailyLimit: 10000,
        costPerMillionInput: 1.0,
        costPerMillionOutput: 1.0,
        warningThreshold: 80
      });

      const warningReceived = new Promise<void>((resolve) => {
        service.once('budget_warning', (summary) => {
          expect(summary.provider).toBe('test-provider');
          expect(summary.warningTriggered).toBe(true);
          expect(summary.limitExceeded).toBe(false);
          resolve();
        });
      });

      // Use 85% of budget (should trigger warning at 80%)
      service.recordUsage({
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: 5000,
        outputTokens: 3500
      });

      await warningReceived;
    });

    it('should trigger budget exceeded', async () => {
      // Set low budget for testing
      service.setBudget({
        provider: 'test-provider',
        dailyLimit: 10000,
        costPerMillionInput: 1.0,
        costPerMillionOutput: 1.0,
        warningThreshold: 80
      });

      const exceededReceived = new Promise<void>((resolve) => {
        service.once('budget_exceeded', (summary) => {
          expect(summary.provider).toBe('test-provider');
          expect(summary.limitExceeded).toBe(true);
          resolve();
        });
      });

      // Use 110% of budget (should trigger exceeded)
      service.recordUsage({
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: 6000,
        outputTokens: 5000
      });

      await exceededReceived;
    });

    it('should check if provider can be used', () => {
      // Set low budget
      service.setBudget({
        provider: 'test-provider',
        dailyLimit: 10000,
        costPerMillionInput: 1.0,
        costPerMillionOutput: 1.0,
        warningThreshold: 80
      });

      // Initially should be usable
      expect(service.canUseProvider('test-provider')).toBe(true);

      // Use all budget
      service.recordUsage({
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: 6000,
        outputTokens: 5000
      });

      // Should not be usable
      expect(service.canUseProvider('test-provider')).toBe(false);
    });

    it('should calculate remaining tokens', () => {
      service.setBudget({
        provider: 'test-provider',
        dailyLimit: 10000,
        costPerMillionInput: 1.0,
        costPerMillionOutput: 1.0,
        warningThreshold: 80
      });

      service.recordUsage({
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: 3000,
        outputTokens: 2000
      });

      const remaining = service.getRemainingTokens('test-provider');
      expect(remaining).toBe(5000); // 10000 - 5000 = 5000
    });
  });

  describe('Usage Summaries', () => {
    it('should get summary for single provider', () => {
      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000,
        outputTokens: 500
      });

      const summary = service.getDailySummary('claude');

      expect(summary.provider).toBe('claude');
      expect(summary.totalInput).toBe(1000);
      expect(summary.totalOutput).toBe(500);
      expect(summary.totalTokens).toBe(1500);
      expect(summary.requestCount).toBe(1);
      expect(summary.estimatedCost).toBeGreaterThan(0);
    });

    it('should get summaries for all providers', () => {
      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000,
        outputTokens: 500
      });

      service.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        taskId: 'task-2',
        inputTokens: 2000,
        outputTokens: 1000
      });

      const summaries = service.getAllSummaries();

      expect(summaries.length).toBeGreaterThan(0);
      const claudeSummary = summaries.find(s => s.provider === 'claude');
      const openaiSummary = summaries.find(s => s.provider === 'openai');

      expect(claudeSummary).toBeDefined();
      expect(claudeSummary?.totalTokens).toBe(1500);

      expect(openaiSummary).toBeDefined();
      expect(openaiSummary?.totalTokens).toBe(3000);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getTokenTrackingService({ database: db });
      const instance2 = getTokenTrackingService();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getTokenTrackingService({ database: db });
      resetTokenTrackingService();
      const instance2 = getTokenTrackingService({ database: db });

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Cost Calculation', () => {
    it('should handle zero tokens', () => {
      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 0,
        outputTokens: 0
      });

      const summary = service.getDailySummary('claude');
      expect(summary.estimatedCost).toBe(0);
    });

    it('should calculate cost for different providers', () => {
      // Claude: $3 input, $15 output per 1M
      service.recordUsage({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000000, // 1M
        outputTokens: 1000000  // 1M
      });

      const claudeSummary = service.getDailySummary('claude');
      expect(claudeSummary.estimatedCost).toBe(18.0); // $3 + $15 = $18

      // OpenAI: $10 input, $30 output per 1M
      service.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        taskId: 'task-2',
        inputTokens: 1000000, // 1M
        outputTokens: 1000000  // 1M
      });

      const openaiSummary = service.getDailySummary('openai');
      expect(openaiSummary.estimatedCost).toBe(40.0); // $10 + $30 = $40
    });
  });
});
