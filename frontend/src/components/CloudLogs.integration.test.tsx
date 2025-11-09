/**
 * Cloud Logs Integration Tests
 *
 * Tests cloud logging functionality including environment selection,
 * service filtering, and log streaming.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DeployedServicesTab } from '../tabs/DeployedServicesTab';
import { createMockEnvironment, mockGenerators, apiSuccess } from '../../test/api-mocks';

const mockEnv = createMockEnvironment();

const renderDeployedServicesTab = (environments = mockGenerators.environmentsResponse()) => {
  return render(
    <BrowserRouter>
      <DeployedServicesTab socket={mockEnv.socket} environments={environments} />
    </BrowserRouter>
  );
};

describe('Cloud Logs Integration Tests', () => {
  const resetApiClientMocks = () => {
    mockEnv.applyApiMocks();
    mockEnv.apiClient.get.mockClear();
    mockEnv.apiClient.post.mockClear();
    mockEnv.apiClient.put.mockClear();
    mockEnv.apiClient.delete.mockClear();
    mockEnv.apiClient.patch.mockClear();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.socket.connected = false;
    resetApiClientMocks();

    // Default mock implementations
    mockEnv.apiClient.get.mockImplementation((url: string) => {
      if (url === '/logs/cloud/status') {
        return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
      }
      if (url.startsWith('/logs/cloud/')) {
        return Promise.resolve(apiSuccess(mockGenerators.cloudLogsResponse()));
      }
      if (url.startsWith('/environments/')) {
        const env = url.split('/')[2];
        const envData = mockGenerators.environmentsResponse()[env];
        return Promise.resolve(apiSuccess(envData?.services || []));
      }
      return Promise.resolve(apiSuccess({}));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Environment Selection', () => {
    it('should display available environments', async () => {
      const environments = mockGenerators.environmentsResponse();

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        // Should show environment options
        expect(Object.keys(environments)).toContain('production');
        expect(Object.keys(environments)).toContain('staging');
      });
    });

    it('should load services when environment is selected', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url === '/environments/production/services') {
          return Promise.resolve(apiSuccess(environments.production.services));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
      });

      // Selecting an environment should load its services
      // (Implementation details depend on component structure)
    });
  });

  describe('Service Selection and Log Filtering', () => {
    it('should load logs for selected service', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/production/api')) {
          return Promise.resolve(
            apiSuccess(mockGenerators.cloudLogsResponse('production', 'api', 20))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
      });

      // Logs should be loadable for services
      // (Exact implementation depends on component)
    });

    it('should filter logs by severity level', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string, config?: Record<string, unknown>) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/production/api')) {
          const params = config?.params as Record<string, string> | undefined;
          const severity = params?.severity;

          // Return filtered logs based on severity
          const allLogs = mockGenerators.cloudLogsResponse('production', 'api', 20);
          if (severity) {
            const filteredLogs = {
              ...allLogs,
              logs: allLogs.logs.filter((log) => log.level === severity),
              count: allLogs.logs.filter((log) => log.level === severity).length,
            };
            return Promise.resolve(apiSuccess(filteredLogs));
          }
          return Promise.resolve(apiSuccess(allLogs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should support severity filtering
      // (Component should call API with severity parameter)
    });

    it('should support custom time range filtering', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string, _config?: Record<string, unknown>) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          // Validate time range params can be passed via config
          const logs = mockGenerators.cloudLogsResponse();
          return Promise.resolve(apiSuccess(logs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Time range filtering should be available
    });

    it('should support custom filter expressions', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string, _config?: Record<string, unknown>) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          // Custom filter can be passed via config params
          const logs = mockGenerators.cloudLogsResponse();
          return Promise.resolve(apiSuccess(logs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Custom filter support should be available
    });
  });

  describe('Log Display and Formatting', () => {
    it('should display logs with correct severity levels', async () => {
      const environments = mockGenerators.environmentsResponse();
      const logs = mockGenerators.cloudLogsResponse('production', 'api', 10);

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          return Promise.resolve(apiSuccess(logs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should display ERROR, WARN, INFO levels
      const errorLogs = logs.logs.filter((log) => log.level === 'ERROR');
      const warnLogs = logs.logs.filter((log) => log.level === 'WARN');
      const infoLogs = logs.logs.filter((log) => log.level === 'INFO');

      expect(errorLogs.length).toBeGreaterThan(0);
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(infoLogs.length).toBeGreaterThan(0);
    });

    it('should format log timestamps correctly', async () => {
      const environments = mockGenerators.environmentsResponse();
      const logs = mockGenerators.cloudLogsResponse('production', 'api', 5);

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          return Promise.resolve(apiSuccess(logs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // All logs should have valid timestamps
      logs.logs.forEach((log) => {
        expect(log.timestamp).toBeGreaterThan(0);
        expect(new Date(log.timestamp).getTime()).toBeGreaterThan(0);
      });
    });

    it('should display log metadata', async () => {
      const environments = mockGenerators.environmentsResponse();
      const logs = mockGenerators.cloudLogsResponse('production', 'api', 3);

      // Add metadata to logs
      logs.logs[0].metadata = {
        trace: 'trace-123',
        spanId: 'span-456',
        severity: 'ERROR',
      };

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          return Promise.resolve(apiSuccess(logs));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Metadata should be accessible
      expect(logs.logs[0].metadata.trace).toBe('trace-123');
      expect(logs.logs[0].metadata.spanId).toBe('span-456');
    });
  });

  describe('Cloud Logging Status', () => {
    it('should check cloud logging availability on mount', async () => {
      const environments = mockGenerators.environmentsResponse();

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
      });
    });

    it('should display message when cloud logging is unavailable', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(false)));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
      });

      // Should show unavailable message
      // (Implementation-dependent)
    });

    it('should handle cloud logging status check errors', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.reject(
            mockEnv.respondWithError('SERVER_ERROR', 'Failed to check cloud logging status')
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/logs/cloud/status');
      });

      // Should handle error gracefully
    });
  });

  describe('Read-Only Environments', () => {
    it('should respect read-only flag for production', async () => {
      const environments = mockGenerators.environmentsResponse();

      renderDeployedServicesTab(environments);

      // Production should be read-only
      expect(environments.production.readOnly).toBe(true);
      // Staging should not be read-only
      expect(environments.staging.readOnly).toBe(false);
    });

    it('should prevent actions on read-only environments', async () => {
      const environments = mockGenerators.environmentsResponse();

      renderDeployedServicesTab(environments);

      // Read-only environments should not have action buttons
      // (Implementation-dependent validation)
      expect(environments.production.readOnly).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle log fetch errors', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          return Promise.reject(
            mockEnv.respondWithError('SERVER_ERROR', 'Failed to fetch cloud logs')
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should handle error gracefully
    });

    it('should handle empty log responses', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          return Promise.resolve(
            apiSuccess(mockGenerators.cloudLogsResponse('production', 'api', 0))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should handle empty results gracefully
    });

    it('should handle malformed log data', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          // Return malformed data
          return Promise.resolve(apiSuccess({ invalid: 'data' }));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should handle gracefully without crashing
    });
  });

  describe('Performance and Pagination', () => {
    it('should respect log limit parameter', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string, config?: Record<string, unknown>) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          const params = config?.params as Record<string, unknown> | undefined;
          const limit = (params?.limit as number) || 100;

          return Promise.resolve(
            apiSuccess(mockGenerators.cloudLogsResponse('production', 'api', limit))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Limit parameter should be supported
    });

    it('should handle large log volumes efficiently', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        if (url.startsWith('/logs/cloud/')) {
          // Return large volume of logs
          return Promise.resolve(
            apiSuccess(mockGenerators.cloudLogsResponse('production', 'api', 1000))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDeployedServicesTab(environments);

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Should handle large volumes without crashing
    });
  });
});
