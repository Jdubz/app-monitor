import { describe, it, expect } from 'vitest';
import {
  parseLogEntry,
  parseLogEntries,
  filterByLevel,
  filterByService,
  filterByTimeRange,
  searchLogEntries,
  sortLogEntries,
  getLogLevelStats,
  getServiceStats,
  extractErrorDetails,
  containsSensitiveInfo,
  sanitizeLogEntry
} from './logParser';

describe('Log Parser Utilities', () => {
  const mockRawEntry = {
    id: 'log-1',
    timestamp: '2025-01-27T14:13:57.000Z',
    level: 'INFO',
    message: 'Test log message',
    service: 'test-service',
    source: 'stdout',
    metadata: { requestId: 'req-123' }
  };

  const mockRawEntries = [
    mockRawEntry,
    {
      id: 'log-2',
      timestamp: '2025-01-27T14:13:58.000Z',
      level: 'ERROR',
      message: 'Error occurred',
      service: 'test-service',
      source: 'stderr',
      metadata: { error: 'TypeError', stack: 'Error stack...' }
    },
    {
      id: 'log-3',
      timestamp: '2025-01-27T14:13:59.000Z',
      level: 'WARN',
      message: 'Warning message',
      service: 'another-service',
      source: 'stdout',
      metadata: { warning: 'Deprecated API' }
    }
  ];

  describe('parseLogEntry', () => {
    it('should parse a raw log entry correctly', () => {
      const parsed = parseLogEntry(mockRawEntry);

      expect(parsed.id).toBe('log-1');
      expect(parsed.timestamp).toBe('2025-01-27T14:13:57.000Z');
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Test log message');
      expect(parsed.service).toBe('test-service');
      expect(parsed.source).toBe('stdout');
      expect(parsed.metadata).toEqual({ requestId: 'req-123' });
      expect(parsed.parsedTimestamp).toBeInstanceOf(Date);
      expect(parsed.formattedTime).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}/);
      expect(parsed.isError).toBe(false);
      expect(parsed.isWarning).toBe(false);
      expect(parsed.isInfo).toBe(true);
      expect(parsed.isDebug).toBe(false);
    });

    it('should handle missing fields with defaults', () => {
      const minimalEntry = { message: 'Test' };
      const parsed = parseLogEntry(minimalEntry);

      expect(parsed.id).toMatch(/^log-\d+-/);
      expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(parsed.level).toBe('INFO');
      expect(parsed.service).toBe('unknown');
      expect(parsed.source).toBe('stdout');
      expect(parsed.metadata).toEqual({});
    });

    it('should correctly identify error level', () => {
      const errorEntry = { ...mockRawEntry, level: 'ERROR' };
      const parsed = parseLogEntry(errorEntry);

      expect(parsed.isError).toBe(true);
      expect(parsed.isWarning).toBe(false);
      expect(parsed.isInfo).toBe(false);
      expect(parsed.isDebug).toBe(false);
    });

    it('should correctly identify warning level', () => {
      const warnEntry = { ...mockRawEntry, level: 'WARN' };
      const parsed = parseLogEntry(warnEntry);

      expect(parsed.isError).toBe(false);
      expect(parsed.isWarning).toBe(true);
      expect(parsed.isInfo).toBe(false);
      expect(parsed.isDebug).toBe(false);
    });
  });

  describe('parseLogEntries', () => {
    it('should parse multiple log entries', () => {
      const parsed = parseLogEntries(mockRawEntries);

      expect(parsed).toHaveLength(3);
      expect(parsed[0].level).toBe('INFO');
      expect(parsed[1].level).toBe('ERROR');
      expect(parsed[2].level).toBe('WARN');
    });
  });

  describe('filterByLevel', () => {
    it('should filter entries by level', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const errorEntries = filterByLevel(parsed, 'ERROR');

      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0].level).toBe('ERROR');
    });
  });

  describe('filterByService', () => {
    it('should filter entries by service', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const testServiceEntries = filterByService(parsed, 'test-service');

      expect(testServiceEntries).toHaveLength(2);
      expect(testServiceEntries.every(entry => entry.service === 'test-service')).toBe(true);
    });
  });

  describe('filterByTimeRange', () => {
    it('should filter entries by time range', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const startTime = new Date('2025-01-27T14:13:57.000Z');
      const endTime = new Date('2025-01-27T14:13:58.000Z');
      const filtered = filterByTimeRange(parsed, startTime, endTime);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('searchLogEntries', () => {
    it('should search entries by message content', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const errorEntries = searchLogEntries(parsed, 'Error');

      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0].message).toContain('Error');
    });

    it('should search entries by service name', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const testServiceEntries = searchLogEntries(parsed, 'test-service');

      expect(testServiceEntries).toHaveLength(2);
    });
  });

  describe('sortLogEntries', () => {
    it('should sort entries by timestamp ascending', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const sorted = sortLogEntries(parsed, true);

      expect(sorted[0].timestamp).toBe('2025-01-27T14:13:57.000Z');
      expect(sorted[1].timestamp).toBe('2025-01-27T14:13:58.000Z');
      expect(sorted[2].timestamp).toBe('2025-01-27T14:13:59.000Z');
    });

    it('should sort entries by timestamp descending', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const sorted = sortLogEntries(parsed, false);

      expect(sorted[0].timestamp).toBe('2025-01-27T14:13:59.000Z');
      expect(sorted[1].timestamp).toBe('2025-01-27T14:13:58.000Z');
      expect(sorted[2].timestamp).toBe('2025-01-27T14:13:57.000Z');
    });
  });

  describe('getLogLevelStats', () => {
    it('should calculate log level statistics', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const stats = getLogLevelStats(parsed);

      expect(stats.ERROR).toBe(1);
      expect(stats.WARN).toBe(1);
      expect(stats.INFO).toBe(1);
      expect(stats.DEBUG).toBe(0);
      expect(stats.TRACE).toBe(0);
    });
  });

  describe('getServiceStats', () => {
    it('should calculate service statistics', () => {
      const parsed = parseLogEntries(mockRawEntries);
      const stats = getServiceStats(parsed);

      expect(stats['test-service']).toBe(2);
      expect(stats['another-service']).toBe(1);
    });
  });

  describe('extractErrorDetails', () => {
    it('should extract error details from error entries', () => {
      const errorEntry = parseLogEntry({
        ...mockRawEntry,
        level: 'ERROR',
        message: 'Something went wrong',
        metadata: { error: 'TypeError', stack: 'Error stack...', code: 'E001' }
      });

      const details = extractErrorDetails(errorEntry);

      expect(details.error).toBe('TypeError');
      expect(details.stack).toBe('Error stack...');
      expect(details.code).toBe('E001');
    });

    it('should return null for non-error entries', () => {
      const infoEntry = parseLogEntry({ ...mockRawEntry, level: 'INFO' });
      const details = extractErrorDetails(infoEntry);

      expect(details.error).toBeNull();
      expect(details.stack).toBeNull();
      expect(details.code).toBeNull();
    });
  });

  describe('containsSensitiveInfo', () => {
    it('should detect sensitive information in message', () => {
      const sensitiveEntry = parseLogEntry({
        ...mockRawEntry,
        message: 'User password: secret123'
      });

      expect(containsSensitiveInfo(sensitiveEntry)).toBe(true);
    });

    it('should detect sensitive information in metadata', () => {
      const sensitiveEntry = parseLogEntry({
        ...mockRawEntry,
        metadata: { authToken: 'abc123' }
      });

      expect(containsSensitiveInfo(sensitiveEntry)).toBe(true);
    });

    it('should not detect sensitive information in normal messages', () => {
      const normalEntry = parseLogEntry({
        ...mockRawEntry,
        message: 'User logged in successfully'
      });

      expect(containsSensitiveInfo(normalEntry)).toBe(false);
    });
  });

  describe('sanitizeLogEntry', () => {
    it('should sanitize sensitive information', () => {
      const sensitiveEntry = parseLogEntry({
        ...mockRawEntry,
        message: 'User password: secret123',
        metadata: { authToken: 'abc123', userId: 'user-456' }
      });

      const sanitized = sanitizeLogEntry(sensitiveEntry);

      expect(sanitized.message).toContain('[REDACTED]');
      expect(sanitized.metadata?.authToken).toBe('[REDACTED]');
      expect(sanitized.metadata?.userId).toBe('user-456'); // Not sensitive
    });

    it('should return original entry if no sensitive info', () => {
      const normalEntry = parseLogEntry(mockRawEntry);
      const sanitized = sanitizeLogEntry(normalEntry);

      expect(sanitized).toEqual(normalEntry);
    });
  });
});

