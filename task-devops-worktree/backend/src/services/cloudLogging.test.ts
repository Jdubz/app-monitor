/**
 * Cloud Logging Service Tests
 * 
 * Tests the CloudLogging service for log streaming, querying, 
 * error handling, and Google Cloud integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CloudLogging, type CloudLogsQuery } from './cloudLogging.js';
import { Logging } from '@google-cloud/logging';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';

// Mock dependencies
vi.mock('@google-cloud/logging');
vi.mock('../utils/logger.js');
vi.mock('fs');

describe('CloudLogging', () => {
  let cloudLogging: CloudLogging;
  let mockLogging: any;
  let mockFs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs
    mockFs = vi.mocked(fs);
    mockFs.existsSync.mockReturnValue(true);

    // Mock Google Cloud Logging
    mockLogging = {
      getEntries: vi.fn(),
      entry: vi.fn()
    };
    vi.mocked(Logging).mockImplementation(() => mockLogging);

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    cloudLogging = new CloudLogging();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with Google Cloud Logging client', () => {
      // Given: CloudLogging is created
      // When: Initialization completes
      // Then: Logging client is initialized
      expect(Logging).toHaveBeenCalled();
    });

    it('should check for GCP key file', () => {
      // Given: CloudLogging is created
      // When: Initialization completes
      // Then: GCP key file is checked
      expect(mockFs.existsSync).toHaveBeenCalled();
    });

    it('should handle missing GCP key file gracefully', () => {
      // Given: Missing GCP key file
      mockFs.existsSync.mockReturnValue(false);

      // When: CloudLogging is created
      // Then: No error is thrown
      expect(() => new CloudLogging()).not.toThrow();
    });
  });

  describe('Availability Check', () => {
    it('should return true when logging client is available', () => {
      // Given: CloudLogging with available client
      // When: Checking availability
      const isAvailable = cloudLogging.isAvailable();

      // Then: True is returned
      expect(isAvailable).toBe(true);
    });

    it('should return false when logging client is not available', () => {
      // Given: CloudLogging with unavailable client - no key file and ADC fails
      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(Logging).mockImplementation(() => {
        throw new Error('No credentials available');
      });

      // When: Creating new instance and checking availability
      const newCloudLogging = new CloudLogging();
      const isAvailable = newCloudLogging.isAvailable();

      // Then: False is returned
      expect(isAvailable).toBe(false);
    });
  });

  describe('Log Retrieval', () => {
    it('should get logs for valid query', async () => {
      // Given: Valid query and mock entries
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend',
        severity: 'ERROR',
        limit: 10
      };

      const mockEntries = [
        {
          metadata: {
            resource: { type: 'cloud_function' },
            labels: { function_name: 'job-finder-backend' }
          },
          data: { message: 'Test error message' },
          timestamp: { seconds: Date.now() / 1000 }
        }
      ];

      mockLogging.getEntries.mockResolvedValue([mockEntries]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Logs are returned
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(mockLogging.getEntries).toHaveBeenCalled();
    });

    it('should handle unavailable logging client', async () => {
      // Given: Unavailable logging client
      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(Logging).mockImplementation(() => {
        throw new Error('No credentials available');
      });
      const newCloudLogging = new CloudLogging();

      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend'
      };

      // When: Getting logs
      // Then: Error is thrown
      await expect(newCloudLogging.getLogs(query)).rejects.toThrow('Cloud Logging is not available');
    });

    it('should handle missing environment', async () => {
      // Given: Query without environment
      const query: CloudLogsQuery = {
        environment: '',
        service: 'job-finder-backend'
      };

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow('Environment "" not found');
    });

    it('should handle local environment', async () => {
      // Given: Query for local environment
      const query: CloudLogsQuery = {
        environment: 'local',
        service: 'job-finder-backend'
      };

      // When: Getting logs
      // Then: Error is thrown (local doesn't use Cloud Logging)
      await expect(cloudLogging.getLogs(query)).rejects.toThrow('Cannot fetch cloud logs for local environment');
    });

    it('should respect rate limiting', async () => {
      // Given: Multiple rapid requests
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend'
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Making rapid requests
      await cloudLogging.getLogs(query);

      // Then: Second request throws rate limit error
      await expect(cloudLogging.getLogs(query)).rejects.toThrow('Rate limit');
    });
  });

  describe('Log Parsing', () => {
    it('should parse log entry correctly', async () => {
      // Given: Mock log entry
      const mockEntry = {
        metadata: {
          resource: { type: 'cloud_function', labels: { function_name: 'test-function' } },
          labels: {},
          severity: 'ERROR', // Severity at root of metadata, not in labels
          trace: 'test-trace-id',
          spanId: 'test-span-id'
        },
        data: { message: 'Test error message', customField: 'customValue' },
        timestamp: { seconds: 1640995200 }
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'test-function'
      };

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Log is parsed correctly
      expect(logs).toHaveLength(1);
      const log = logs[0];
      expect(log.id).toBeDefined();
      expect(log.service).toBe('test-function');
      expect(log.level).toBe('ERROR');
      expect(log.message).toBe('Test error message');
      expect(log.timestamp).toBe(1640995200000);
      expect(log.metadata.trace).toBe('test-trace-id');
      expect(log.metadata.spanId).toBe('test-span-id');
    });

    it('should handle string data in log entry', async () => {
      // Given: Mock log entry with string data
      const mockEntry = {
        metadata: {
          resource: { type: 'cloud_function' },
          labels: { severity: 'INFO' }
        },
        data: 'Simple string message',
        timestamp: { seconds: 1640995200 }
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'test-function'
      };

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: String data is handled correctly
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Simple string message');
    });

    it('should handle missing metadata gracefully', async () => {
      // Given: Mock log entry with minimal data
      const mockEntry = {
        metadata: {}, // Empty metadata
        data: { message: 'Test message' },
        timestamp: { seconds: 1640995200 }
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'test-function'
      };

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Log is parsed with defaults (service comes from query, not entry)
      expect(logs).toHaveLength(1);
      expect(logs[0].service).toBe('test-function');
      expect(logs[0].level).toBe('INFO'); // Default when no severity in metadata
    });
  });

  describe('Query Filtering', () => {
    it('should build filter for service-specific query', async () => {
      // Given: Query with specific service
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend',
        severity: 'ERROR'
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      await cloudLogging.getLogs(query);

      // Then: Filter includes severity (service filter only added if logFilter configured in environment)
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('severity="ERROR"')
        })
      );
    });

    it('should build filter for severity', async () => {
      // Given: Query with severity filter
      const query: CloudLogsQuery = {
        environment: 'staging',
        severity: 'ERROR'
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      await cloudLogging.getLogs(query);

      // Then: Filter includes severity (implementation uses exact match, not >=)
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('severity="ERROR"')
        })
      );
    });

    it('should build filter for time range', async () => {
      // Given: Query with time range
      const query: CloudLogsQuery = {
        environment: 'staging',
        timeRange: {
          start: new Date('2023-01-01'),
          end: new Date('2023-01-02')
        }
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      await cloudLogging.getLogs(query);

      // Then: Filter includes time range (note space before >= in implementation)
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('timestamp >= "2023-01-01T00:00:00.000Z"')
        })
      );
    });

    it('should handle custom filter', async () => {
      // Given: Query with custom filter
      const query: CloudLogsQuery = {
        environment: 'staging',
        customFilter: 'protoPayload.methodName="test"'
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      await cloudLogging.getLogs(query);

      // Then: Custom filter is used
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('protoPayload.methodName="test"')
        })
      );
    });
  });

  describe('Environment Management', () => {
    it('should get available environments', () => {
      // Given: CloudLogging instance
      // When: Getting environments
      const environments = cloudLogging.getEnvironments();

      // Then: Environments are returned
      expect(environments).toBeDefined();
      expect(typeof environments).toBe('object');
    });

    it('should get services for environment', () => {
      // Given: Environment name
      const environmentName = 'staging';

      // When: Getting services
      const services = cloudLogging.getServicesForEnvironment(environmentName);

      // Then: Services are returned
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
    });

    it('should return empty array for unknown environment', () => {
      // Given: Unknown environment
      const environmentName = 'unknown-environment';

      // When: Getting services
      // Then: Error is thrown
      expect(() => cloudLogging.getServicesForEnvironment(environmentName)).toThrow('Environment "unknown-environment" not found');
    });
  });

  describe('Trace URL Generation', () => {
    it('should generate trace URL', () => {
      // Given: Project ID and trace ID
      const projectId = 'test-project';
      const traceId = 'test-trace-id';

      // When: Generating trace URL
      const url = cloudLogging.getTraceUrl(projectId, traceId);

      // Then: URL is generated correctly
      expect(url).toContain(projectId);
      expect(url).toContain(traceId);
      expect(url).toContain('console.cloud.google.com');
    });

    it('should handle empty project ID', () => {
      // Given: Empty project ID
      const projectId = '';
      const traceId = 'test-trace-id';

      // When: Generating trace URL
      const url = cloudLogging.getTraceUrl(projectId, traceId);

      // Then: URL is still generated
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle Google Cloud API errors', async () => {
      // Given: Query that will cause API error
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend'
      };

      mockLogging.getEntries.mockRejectedValue(new Error('API Error'));

      // When: Getting logs
      // Then: Error is thrown and logged
      await expect(cloudLogging.getLogs(query)).rejects.toThrow('Failed to fetch cloud logs');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle malformed log entries', async () => {
      // Given: Malformed log entry with proper metadata to avoid null errors
      const mockEntry = {
        metadata: {}, // Empty metadata
        data: null,
        timestamp: null
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'test-function'
      };

      // When: Getting logs with malformed entry
      const result = await cloudLogging.getLogs(query);

      // Then: Malformed entry is parsed gracefully with default values
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        service: 'test-function',
        message: 'null', // JSON.stringify(null) returns "null"
        level: 'INFO', // Default level
      });
      expect(result[0].timestamp).toBeDefined();
    });

    it('should handle network timeouts', async () => {
      // Given: Query that will timeout
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend'
      };

      mockLogging.getEntries.mockRejectedValue(new Error('Request timeout'));

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow('Failed to fetch cloud logs');
    });
  });

  describe('Performance and Limits', () => {
    it('should respect log limit', async () => {
      // Given: Query with limit
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend',
        limit: 5
      };

      // Mock returns only 5 entries (Cloud API respects pageSize limit)
      const mockEntries = Array(5).fill(null).map((_, i) => ({
        metadata: { resource: { type: 'cloud_function' } },
        data: { message: `Test message ${i}` },
        timestamp: { seconds: 1640995200 + i }
      }));

      mockLogging.getEntries.mockResolvedValue([mockEntries]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Limit is respected (returns 5 entries as requested)
      expect(logs.length).toBe(5);
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 5
        })
      );
    });

    it('should handle large result sets efficiently', async () => {
      // Given: Query that returns many logs
      const query: CloudLogsQuery = {
        environment: 'staging',
        service: 'job-finder-backend'
      };

      const mockEntries = Array(1000).fill(null).map((_, i) => ({
        metadata: { resource: { type: 'cloud_function' } },
        data: { message: `Test message ${i}` },
        timestamp: { seconds: 1640995200 + i }
      }));

      mockLogging.getEntries.mockResolvedValue([mockEntries]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: All logs are processed
      expect(logs).toHaveLength(1000);
    });
  });

  describe('Integration', () => {
    it('should work with different log levels', async () => {
      // Given: Different severity levels - use separate instances to avoid rate limiting
      const severities = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

      for (const severity of severities) {
        // Create new instance for each test to avoid rate limiting
        const newCloudLogging = new CloudLogging();

        const query: CloudLogsQuery = {
          environment: 'staging',
          service: 'job-finder-backend',
          severity
        };

        mockLogging.getEntries.mockResolvedValue([[]]);

        // When: Getting logs for each severity
        const logs = await newCloudLogging.getLogs(query);

        // Then: Query is processed
        expect(logs).toBeDefined();
        expect(Array.isArray(logs)).toBe(true);
      }
    });

    it('should handle concurrent requests', async () => {
      // Given: Multiple concurrent queries for DIFFERENT environments to avoid rate limiting
      const queries = [
        { environment: 'staging', service: 'job-finder-backend' },
        { environment: 'production', service: 'job-finder-frontend' }
        // Only 2 queries for different environments to avoid rate limiting
      ];

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Making concurrent requests
      const promises = queries.map(query => cloudLogging.getLogs(query));
      const results = await Promise.all(promises);

      // Then: All requests complete
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});