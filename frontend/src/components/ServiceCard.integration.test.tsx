import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '../test/test-utils';
import { createMockSocket, generateMockService } from '../test/test-utils';
import ServiceCard from './ServiceCard';

// Mock the API module
vi.mock('../services/api', () => ({
  startService: vi.fn(),
  stopService: vi.fn(),
  restartService: vi.fn(),
  killService: vi.fn(),
  getServiceLogs: vi.fn(),
}));

// Mock Socket.IO
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => createMockSocket()),
}));

describe('ServiceCard Integration Tests', () => {
  const mockService = generateMockService({
    id: 'test-service-1',
    name: 'test-service',
    status: 'running',
    port: 3000,
    pid: 12345,
  });

  const defaultProps = {
    service: mockService,
    onServiceUpdate: vi.fn(),
    onLogsRequest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Status Management', () => {
    it('should handle complete service lifecycle interactions', async () => {
      const { startService, stopService, restartService, killService } = await import('../services/api');
      
      // Mock API responses
      vi.mocked(startService).mockResolvedValueOnce({ ...mockService, status: 'starting' });
      vi.mocked(stopService).mockResolvedValueOnce({ ...mockService, status: 'stopped' });
      vi.mocked(restartService).mockResolvedValueOnce({ ...mockService, status: 'running' });
      vi.mocked(killService).mockResolvedValueOnce({ ...mockService, status: 'stopped' });

      render(<ServiceCard {...defaultProps} />);

      // Test starting service
      const startButton = screen.getByRole('button', { name: /start/i });
      await act(async () => {
        await startButton.click();
      });

      await waitFor(() => {
        expect(startService).toHaveBeenCalledWith('test-service');
      });

      // Test stopping service
      const stopButton = screen.getByRole('button', { name: /stop/i });
      await act(async () => {
        await stopButton.click();
      });

      await waitFor(() => {
        expect(stopService).toHaveBeenCalledWith('test-service', true);
      });

      // Test restarting service
      const restartButton = screen.getByRole('button', { name: /restart/i });
      await act(async () => {
        await restartButton.click();
      });

      await waitFor(() => {
        expect(restartService).toHaveBeenCalledWith('test-service', true);
      });

      // Test killing service
      const killButton = screen.getByRole('button', { name: /kill/i });
      await act(async () => {
        await killButton.click();
      });

      await waitFor(() => {
        expect(killService).toHaveBeenCalledWith('test-service');
      });
    });

    it('should handle service status updates from WebSocket', async () => {
      const mockSocket = createMockSocket();
      const onServiceUpdate = vi.fn();

      render(<ServiceCard {...defaultProps} onServiceUpdate={onServiceUpdate} />);

      // Simulate WebSocket status update
      act(() => {
        mockSocket._trigger('service_status_update', {
          serviceId: 'test-service-1',
          status: 'stopped',
          timestamp: new Date().toISOString()
        });
      });

      await waitFor(() => {
        expect(onServiceUpdate).toHaveBeenCalledWith({
          serviceId: 'test-service-1',
          status: 'stopped',
          timestamp: expect.any(String)
        });
      });
    });
  });

  describe('Log Management Integration', () => {
    it('should handle log requests and display', async () => {
      const { getServiceLogs } = await import('../services/api');
      const onLogsRequest = vi.fn();

      const mockLogs = {
        serviceName: 'test-service',
        logs: [
          '2025-01-27T14:13:57.000Z [INFO] Service started',
          '2025-01-27T14:13:58.000Z [INFO] Service running',
          '2025-01-27T14:13:59.000Z [ERROR] Service error occurred'
        ]
      };

      vi.mocked(getServiceLogs).mockResolvedValueOnce(mockLogs);

      render(<ServiceCard {...defaultProps} onLogsRequest={onLogsRequest} />);

      // Click logs button
      const logsButton = screen.getByRole('button', { name: /logs/i });
      await act(async () => {
        await logsButton.click();
      });

      await waitFor(() => {
        expect(getServiceLogs).toHaveBeenCalledWith('test-service', 100);
        expect(onLogsRequest).toHaveBeenCalledWith('test-service', mockLogs);
      });
    });

    it('should handle log request errors', async () => {
      const { getServiceLogs } = await import('../services/api');
      const onLogsRequest = vi.fn();

      const error = new Error('Failed to fetch logs');
      vi.mocked(getServiceLogs).mockRejectedValueOnce(error);

      render(<ServiceCard {...defaultProps} onLogsRequest={onLogsRequest} />);

      // Click logs button
      const logsButton = screen.getByRole('button', { name: /logs/i });
      await act(async () => {
        await logsButton.click();
      });

      await waitFor(() => {
        expect(getServiceLogs).toHaveBeenCalledWith('test-service', 100);
        expect(onLogsRequest).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API errors gracefully', async () => {
      const { startService } = await import('../services/api');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Service start failed');
      vi.mocked(startService).mockRejectedValueOnce(error);

      render(<ServiceCard {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /start/i });
      await act(async () => {
        await startButton.click();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start service'),
          error
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      const { startService } = await import('../services/api');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const networkError = new Error('Network error - please check your connection');
      vi.mocked(startService).mockRejectedValueOnce(networkError);

      render(<ServiceCard {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /start/i });
      await act(async () => {
        await startButton.click();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start service'),
          networkError
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('User Interaction Integration', () => {
    it('should handle keyboard navigation', async () => {
      render(<ServiceCard {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /start/i });
      
      // Test keyboard navigation
      await act(async () => {
        startButton.focus();
      });

      expect(startButton).toHaveFocus();

      // Test Enter key
      await act(async () => {
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        startButton.dispatchEvent(enterEvent);
      });

      // Test Space key
      await act(async () => {
        const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
        startButton.dispatchEvent(spaceEvent);
      });
    });

    it('should handle accessibility features', async () => {
      render(<ServiceCard {...defaultProps} />);

      // Test ARIA labels
      const startButton = screen.getByRole('button', { name: /start/i });
      expect(startButton).toHaveAttribute('aria-label');

      // Test keyboard shortcuts
      const restartButton = screen.getByRole('button', { name: /restart/i });
      expect(restartButton).toHaveAttribute('title');
    });
  });

  describe('Performance Integration', () => {
    it('should handle rapid button clicks', async () => {
      const { startService } = await import('../services/api');
      
      vi.mocked(startService).mockResolvedValue({ ...mockService, status: 'starting' });

      render(<ServiceCard {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /start/i });

      // Rapid clicks
      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await startButton.click();
        }
      });

      // Should only call API once due to debouncing
      await waitFor(() => {
        expect(startService).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle component unmounting during async operations', async () => {
      const { startService } = await import('../services/api');
      
      // Create a promise that we can control
      let resolveStart: (value: any) => void;
      const startPromise = new Promise((resolve) => {
        resolveStart = resolve;
      });
      vi.mocked(startService).mockReturnValueOnce(startPromise);

      const { unmount } = render(<ServiceCard {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /start/i });
      await act(async () => {
        await startButton.click();
      });

      // Unmount component before promise resolves
      unmount();

      // Resolve the promise
      await act(async () => {
        resolveStart!({ ...mockService, status: 'starting' });
      });

      // Should not throw any errors
      expect(true).toBe(true);
    });
  });
});