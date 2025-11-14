/**
 * Context Logger Tests
 *
 * Comprehensive test suite for ContextLogger
 * Tests logging functionality, level filtering, and formatting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextLogger, getContextLogger } from '../contextLogger.js';
import { spyOnConsole } from './helpers/testUtils.js';

describe('ContextLogger', () => {
  let consoleSpy: ReturnType<typeof spyOnConsole>;

  beforeEach(() => {
    consoleSpy = spyOnConsole();
  });

  afterEach(() => {
    consoleSpy.restore();
  });

  describe('Singleton pattern', () => {
    it('should return same instance from getInstance', () => {
      const logger1 = ContextLogger.getInstance();
      const logger2 = ContextLogger.getInstance();
      expect(logger1).toBe(logger2);
    });

    it('should return same instance from getContextLogger', () => {
      const logger1 = getContextLogger();
      const logger2 = getContextLogger();
      expect(logger1).toBe(logger2);
    });

    it('should match getInstance and getContextLogger instances', () => {
      const logger1 = ContextLogger.getInstance();
      const logger2 = getContextLogger();
      expect(logger1).toBe(logger2);
    });
  });

  describe('Log level filtering', () => {
    it('should log debug messages when level is debug', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('debug');
      logger.debug('Test debug message');
      expect(consoleSpy.logs).toHaveLength(1);
      expect(consoleSpy.logs[0]).toContain('DEBUG');
    });

    it('should not log debug messages when level is info', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.debug('Test debug message');
      expect(consoleSpy.logs).toHaveLength(0);
    });

    it('should log info messages when level is info', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test info message');
      expect(consoleSpy.logs).toHaveLength(1);
      expect(consoleSpy.logs[0]).toContain('INFO');
    });

    it('should log warn messages when level is warn', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('warn');
      logger.warn('Test warn message');
      expect(consoleSpy.warns).toHaveLength(1);
      expect(consoleSpy.warns[0]).toContain('WARN');
    });

    it('should not log info messages when level is warn', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('warn');
      logger.info('Test info message');
      expect(consoleSpy.logs).toHaveLength(0);
    });

    it('should log error messages when level is error', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('error');
      logger.error('Test error message');
      expect(consoleSpy.errors).toHaveLength(1);
      expect(consoleSpy.errors[0]).toContain('ERROR');
    });

    it('should not log warn messages when level is error', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('error');
      logger.warn('Test warn message');
      expect(consoleSpy.warns).toHaveLength(0);
    });
  });

  describe('Message formatting', () => {
    it('should include component in message', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test message', { component: 'TestComponent' });
      expect(consoleSpy.logs[0]).toContain('[TestComponent]');
    });

    it('should include operation in message', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test message', { component: 'TestComponent', operation: 'testOp' });
      expect(consoleSpy.logs[0]).toContain('<testOp>');
    });

    it('should include additional context as JSON', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test message', {
        component: 'TestComponent',
        cacheKey: 'abc123',
        profile: 'test-profile'
      });
      const logMessage = consoleSpy.logs[0];
      expect(logMessage).toContain('cacheKey');
      expect(logMessage).toContain('abc123');
      expect(logMessage).toContain('profile');
      expect(logMessage).toContain('test-profile');
    });

    it('should include error message when provided', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('error');
      const error = new Error('Test error');
      logger.error('Error occurred', { component: 'TestComponent' }, error);
      expect(consoleSpy.errors[0]).toContain('Error: Test error');
    });

    it('should include stack trace for error level', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('error');
      const error = new Error('Test error');
      logger.error('Error occurred', { component: 'TestComponent' }, error);
      expect(consoleSpy.errors[0]).toContain('Stack:');
    });

    it('should not include stack trace for warn level', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('warn');
      const error = new Error('Test error');
      logger.warn('Warning occurred', { component: 'TestComponent' }, error);
      expect(consoleSpy.warns[0]).not.toContain('Stack:');
    });
  });

  describe('Log level management', () => {
    it('should set and get log level', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('debug');
      expect(logger.getLogLevel()).toBe('debug');
      logger.setLogLevel('warn');
      expect(logger.getLogLevel()).toBe('warn');
    });

    it('should filter messages based on current level', () => {
      const logger = ContextLogger.getInstance();

      logger.setLogLevel('debug');
      logger.debug('Test');
      expect(consoleSpy.logs).toHaveLength(1);

      consoleSpy.logs.length = 0;

      logger.setLogLevel('error');
      logger.debug('Test');
      expect(consoleSpy.logs).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty context', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test message', {} as any);
      expect(consoleSpy.logs).toHaveLength(1);
      expect(consoleSpy.logs[0]).toContain('Test message');
    });

    it('should handle undefined context', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('info');
      logger.info('Test message');
      expect(consoleSpy.logs).toHaveLength(1);
      expect(consoleSpy.logs[0]).toContain('Test message');
    });

    it('should handle error without stack trace', () => {
      const logger = ContextLogger.getInstance();
      logger.setLogLevel('error');
      const error = new Error('Test error');
      delete (error as any).stack;
      logger.error('Error occurred', { component: 'TestComponent' }, error);
      expect(consoleSpy.errors[0]).toContain('Error: Test error');
      expect(consoleSpy.errors[0]).not.toContain('Stack:');
    });
  });
});
