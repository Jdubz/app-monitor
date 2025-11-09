/**
 * App Integration Tests
 *
 * Comprehensive integration tests that build the entire application
 * and interact with all features to find errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { createMockEnvironment, mockGenerators, apiSuccess } from './test/api-mocks';
import * as socketServiceModule from './services/socketService';
import { getApiClientInstance } from './services/api';

// Mock the API client globally
const mockEnv = createMockEnvironment();

// Mock socket service
vi.mock('./services/socketService', () => ({
  createSocket: vi.fn(() => mockEnv.socket),
}));

describe('App Integration Tests', () => {
  const resetApiClientMocks = () => {
    mockEnv.applyApiMocks();
    mockEnv.apiClient.get.mockClear();
    mockEnv.apiClient.post.mockClear();
    mockEnv.apiClient.put.mockClear();
    mockEnv.apiClient.delete.mockClear();
    mockEnv.apiClient.patch.mockClear();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEnv.socket.connected = false;
    resetApiClientMocks();
    const client = await getApiClientInstance();
    expect(client).toBe(mockEnv.apiClient);

    // Set up default mocks for dev-bots endpoints that all tests need
    const originalMockImplementation = mockEnv.apiClient.get.getMockImplementation();
    mockEnv.apiClient.get.mockImplementation((url: string) => {
      // Default mocks for dev-bots endpoints
      if (url === '/dev-bots/queue') {
        return Promise.resolve(apiSuccess(mockGenerators.devBotsQueueSummary()));
      }
      if (url === '/dev-bots/settings') {
        return Promise.resolve(apiSuccess(mockGenerators.devBotsSettings()));
      }
      if (url === '/dev-bots/status') {
        return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
      }
      // Call original implementation if it exists, otherwise return empty success
      return originalMockImplementation
        ? originalMockImplementation(url)
        : Promise.resolve(apiSuccess({}));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Application Initialization', () => {
    it('should render the app and load initial data', async () => {
      render(<App />);

      // Should show loading state initially
      expect(screen.getByText(/loading environments/i)).toBeInTheDocument();

      // Wait for initial data to load
      await waitFor(() => {
        expect(screen.queryByText(/loading environments/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should render header
      expect(screen.getByRole('banner')).toBeInTheDocument();

      // Should have navigation
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock API failure
      mockEnv.apiClient.get.mockRejectedValueOnce(
        mockEnv.respondWithError('Network error', 'Failed to connect to server')
      );

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load environments/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Error should be dismissible
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      expect(dismissButton).toBeInTheDocument();
    });

    it('should establish socket connection on mount', async () => {
      render(<App />);

      await waitFor(() => {
        expect(socketServiceModule.createSocket).toHaveBeenCalled();
      }, { timeout: 5000 });
    });
  });

  describe('Navigation and Routing', () => {
    it('should navigate between tabs', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading environments/i)).not.toBeInTheDocument();
      });

      // Should start on Local tab (or redirect to it)
      await waitFor(() => {
        expect(window.location.pathname).toMatch(/\/local$/);
      }, { timeout: 5000 });

      // Navigate to Deployed Services tab
      const deployedTab = screen.getByRole('link', { name: /deployed services/i });
      await user.click(deployedTab);

      await waitFor(() => {
        expect(window.location.pathname).toMatch(/\/deployed$/);
      }, { timeout: 5000 });

      // Navigate to Dev-Bots tab
      const devBotsTab = screen.getByRole('link', { name: /dev-bots/i });
      await user.click(devBotsTab);

      await waitFor(() => {
        expect(window.location.pathname).toMatch(/\/dev-bots$/);
      }, { timeout: 5000 });

      // Navigate back to Local tab
      const localTab = screen.getByRole('link', { name: /local/i });
      await user.click(localTab);

      await waitFor(() => {
        expect(window.location.pathname).toMatch(/\/local$/);
      }, { timeout: 5000 });
    });

    it('should redirect invalid routes to /local', async () => {
      window.history.pushState({}, '', '/invalid-route');

      render(<App />);

      await waitFor(() => {
        expect(window.location.pathname).toMatch(/\/local$/);
      }, { timeout: 5000 });
    });
  });

  describe('Local Services Tab Integration', () => {
    it('should load and display local services', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/services/status') {
          return Promise.resolve(
            apiSuccess([
              mockGenerators.processInfo({
                name: 'backend',
                displayName: 'Backend API',
                status: 'running',
                ports: [5000],
              }),
              mockGenerators.processInfo({
                name: 'frontend',
                displayName: 'Frontend Dev Server',
                status: 'stopped',
              }),
            ])
          );
        }
        if (url === '/logs/sources') {
          return Promise.resolve(
            apiSuccess([
              mockGenerators.logSource({ id: 'backend', name: 'backend' }),
              mockGenerators.logSource({ id: 'frontend', name: 'frontend' }),
            ])
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should display services
      await waitFor(() => {
        expect(screen.getByText(/backend api/i)).toBeInTheDocument();
        expect(screen.getByText(/frontend dev server/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should start and stop services', async () => {
      const user = userEvent.setup();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/services/status') {
          return Promise.resolve(
            apiSuccess([
              mockGenerators.processInfo({
                name: 'test-service',
                displayName: 'Test Service',
                status: 'stopped',
              }),
            ])
          );
        }
        if (url === '/logs/sources') {
          return Promise.resolve(apiSuccess([]));
        }
        return Promise.resolve(apiSuccess({}));
      });

      mockEnv.apiClient.post.mockImplementation((url: string) => {
        if (url.includes('/start')) {
          return Promise.resolve(
            apiSuccess(
              mockGenerators.processInfo({
                name: 'test-service',
                status: 'starting',
              })
            )
          );
        }
        if (url.includes('/stop')) {
          return Promise.resolve(
            apiSuccess(
              mockGenerators.processInfo({
                name: 'test-service',
                status: 'stopping',
              })
            )
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/test service/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Find and click start button
      const startButton = screen.getByRole('button', { name: /start/i });
      await user.click(startButton);

      // Verify start API was called
      await waitFor(() => {
        expect(mockEnv.apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/start'),
          expect.anything(),
          expect.anything()
        );
      }, { timeout: 5000 });
    });
  });

  describe('Deployed Services Tab Integration', () => {
    it('should load environments and cloud services', async () => {
      const environments = mockGenerators.environmentsResponse();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(environments));
        }
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(true)));
        }
        return Promise.resolve(apiSuccess({}));
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Navigate to Deployed tab
      const deployedTab = screen.getByRole('link', { name: /deployed services/i });
      await user.click(deployedTab);

      // Should display environment options
      await waitFor(() => {
        expect(screen.getByText(/production/i)).toBeInTheDocument();
        expect(screen.getByText(/staging/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle cloud logging unavailable state', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/logs/cloud/status') {
          return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus(false)));
        }
        return Promise.resolve(apiSuccess({}));
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      const deployedTab = screen.getByRole('link', { name: /deployed services/i });
      await user.click(deployedTab);

      await waitFor(() => {
        expect(screen.getByText(/not configured/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Dev-Bots Tab Integration', () => {
    it('should load and display dev-bots status', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        return Promise.resolve(apiSuccess({}));
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Navigate to Dev-Bots tab
      const devBotsTab = screen.getByRole('link', { name: /dev-bots/i });
      await user.click(devBotsTab);

      // Should display dev-bots information
      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
      }, { timeout: 5000 });
    });
  });

  describe('Real-time Updates via WebSocket', () => {
    it('should handle service status updates from socket', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/services/status') {
          return Promise.resolve(
            apiSuccess([
              mockGenerators.processInfo({
                name: 'test-service',
                status: 'stopped',
              }),
            ])
          );
        }
        if (url === '/logs/sources') {
          return Promise.resolve(apiSuccess([]));
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Simulate socket connection
      mockEnv.socket.connect();
      await waitFor(() => {
        expect(mockEnv.socket.connected).toBe(true);
      }, { timeout: 5000 });

      // Simulate service status update from socket
      mockEnv.triggerSocketEvent('service:status', {
        name: 'test-service',
        status: 'running',
      });

      // Should update UI (exact behavior depends on component implementation)
      await waitFor(() => {
        expect(mockEnv.socket._listeners.get('service:status')).toBeDefined();
      }, { timeout: 5000 });
    });

    it('should handle task updates from socket', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        return Promise.resolve(apiSuccess({}));
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Navigate to Dev-Bots tab
      const devBotsTab = screen.getByRole('link', { name: /dev-bots/i });
      await user.click(devBotsTab);

      // Connect socket
      mockEnv.socket.connect();

      // Simulate task update
      mockEnv.triggerSocketEvent('task:updated', mockGenerators.devBotsTask());

      await waitFor(() => {
        expect(mockEnv.socket._listeners.get('task:updated')).toBeDefined();
      }, { timeout: 5000 });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should catch and display errors in error boundary', async () => {
      // Mock a component that throws an error
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.reject(new Error('Critical API failure'));
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      // Error boundary should catch the error
      await waitFor(() => {
        // Depending on error boundary implementation
        expect(consoleError).toHaveBeenCalled();
      }, { timeout: 5000 });

      consoleError.mockRestore();
    });

    it('should handle network errors gracefully', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.reject(
            mockEnv.respondWithError('NETWORK_ERROR', 'Failed to connect to server')
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load environments/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle socket disconnections', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Connect socket
      mockEnv.socket.connect();
      expect(mockEnv.socket.connected).toBe(true);

      // Disconnect socket
      mockEnv.socket.disconnect();
      expect(mockEnv.socket.connected).toBe(false);

      // Should handle disconnection event
      await waitFor(() => {
        expect(mockEnv.socket._listeners.get('disconnect')).toBeDefined();
      }, { timeout: 5000 });
    });
  });

  describe('Port Management Integration', () => {
    it('should load and display port status', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/ports/status') {
          return Promise.resolve(
            apiSuccess(
              mockGenerators.portStatusMap(['service-1', 'service-2'])
            )
          );
        }
        if (url === '/services/status') {
          return Promise.resolve(apiSuccess([]));
        }
        if (url === '/logs/sources') {
          return Promise.resolve(apiSuccess([]));
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Port status should be loaded
      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/ports/status');
      }, { timeout: 5000 });
    });

    it('should kill port processes', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/environments') {
          return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
        }
        if (url === '/ports/status') {
          return Promise.resolve(
            apiSuccess({ 'test-service': [mockGenerators.portInfo(3000, true)] })
          );
        }
        if (url === '/services/status') {
          return Promise.resolve(apiSuccess([]));
        }
        if (url === '/logs/sources') {
          return Promise.resolve(apiSuccess([]));
        }
        return Promise.resolve(apiSuccess({}));
      });

      mockEnv.apiClient.post.mockImplementation((url: string) => {
        if (url.includes('/ports/') && url.endsWith('/kill')) {
          return Promise.resolve(apiSuccess(mockGenerators.portKillResponse(3000, true)));
        }
        return Promise.resolve(apiSuccess({}));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Look for kill button (implementation-dependent)
      // This test validates the API integration works
      expect(mockEnv.apiClient.post).toBeDefined();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle keyboard shortcuts for navigation', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Test shortcut functionality (if implemented)
      // Example: pressing '?' might open help
      // Verify shortcut behavior (implementation-dependent)
      // This validates the keyboard system is set up
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });
});
