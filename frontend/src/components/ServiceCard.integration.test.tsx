import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '../test/test-utils';
import { generateMockService } from '../test/test-utils';
import ServiceCard from './ServiceCard';

describe('ServiceCard Integration Tests', () => {
  let mockOnStart: ReturnType<typeof vi.fn>;
  let mockOnStop: ReturnType<typeof vi.fn>;
  let mockOnRestart: ReturnType<typeof vi.fn>;
  let mockOnKill: ReturnType<typeof vi.fn>;
  let mockService: ReturnType<typeof generateMockService>;
  let defaultProps: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = generateMockService({
      id: 'test-service-1',
      name: 'test-service',
      status: 'running',
      port: 3000,
      pid: 12345,
    });

    mockOnStart = vi.fn().mockResolvedValue(undefined);
    mockOnStop = vi.fn().mockResolvedValue(undefined);
    mockOnRestart = vi.fn().mockResolvedValue(undefined);
    mockOnKill = vi.fn().mockResolvedValue(undefined);

    defaultProps = {
      service: mockService,
      onStart: mockOnStart,
      onStop: mockOnStop,
      onRestart: mockOnRestart,
      onKill: mockOnKill,
    };
  });

  afterEach(() => {
    cleanup();
  });

  describe('Service Status Management', () => {
    it('should handle complete service lifecycle interactions', async () => {
      // Test starting service - use stopped status
      const stoppedService = generateMockService({
        ...mockService,
        status: 'stopped'
      });

      render(<ServiceCard {...defaultProps} service={stoppedService} />);

      const startButton = screen.getByRole('button', { name: /^start$/i });
      await act(async () => {
        startButton.click();
      });

      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalledTimes(1);
      });

      // Rerender with running status for other buttons
      const runningService = generateMockService({
        ...mockService,
        status: 'running'
      });

      cleanup();
      render(<ServiceCard {...defaultProps} service={runningService} />);

      // Test stopping service
      const stopButton = screen.getByRole('button', { name: /^stop$/i });
      await act(async () => {
        stopButton.click();
      });

      await waitFor(() => {
        expect(mockOnStop).toHaveBeenCalledTimes(1);
      });

      // Test restarting service
      const restartButton = screen.getByRole('button', { name: /^restart$/i });
      await act(async () => {
        restartButton.click();
      });

      await waitFor(() => {
        expect(mockOnRestart).toHaveBeenCalledTimes(1);
      });

      // Test killing service - need to click twice for confirmation
      const killButton = screen.getByRole('button', { name: /^kill$/i });

      // First click - shows confirmation
      await act(async () => {
        killButton.click();
      });

      // Second click - confirms kill
      await act(async () => {
        killButton.click();
      });

      await waitFor(() => {
        expect(mockOnKill).toHaveBeenCalledTimes(1);
      });
    });

  });

  describe('Error Handling Integration', () => {
    it('should handle action errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const error = new Error('Service start failed');
      const mockOnStartWithError = vi.fn().mockRejectedValueOnce(error);

      // Use stopped status so Start button is enabled
      const stoppedService = generateMockService({
        ...mockService,
        status: 'stopped'
      });

      render(<ServiceCard {...defaultProps} service={stoppedService} onStart={mockOnStartWithError} />);

      const startButton = screen.getByRole('button', { name: /^start$/i });
      await act(async () => {
        startButton.click();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start'),
          error
        );
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to start')
        );
      });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const networkError = new Error('Network error - please check your connection');
      const mockOnStopWithError = vi.fn().mockRejectedValueOnce(networkError);

      render(<ServiceCard {...defaultProps} onStop={mockOnStopWithError} />);

      const stopButton = screen.getByRole('button', { name: /^stop$/i });
      await act(async () => {
        stopButton.click();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to stop'),
          networkError
        );
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to stop')
        );
      });

      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });

  describe('User Interaction Integration', () => {
    it('should handle keyboard navigation', async () => {
      // Use stopped status so Start button is enabled and focusable
      const stoppedService = generateMockService({
        ...mockService,
        status: 'stopped'
      });

      render(<ServiceCard {...defaultProps} service={stoppedService} />);

      const startButton = screen.getByRole('button', { name: /^start$/i });

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

      // Test titles (not ARIA labels - buttons use title attribute)
      const startButton = screen.getByRole('button', { name: /^start$/i });
      expect(startButton).toHaveAttribute('title');

      // Test keyboard shortcuts
      const restartButton = screen.getByRole('button', { name: /^restart$/i });
      expect(restartButton).toHaveAttribute('title');
    });
  });

  describe('Performance Integration', () => {
    it('should handle rapid button clicks', async () => {
      // Use stopped status so Start button is enabled
      const stoppedService = generateMockService({
        ...mockService,
        status: 'stopped'
      });

      // Use a slow mock to test loading state properly
      const slowMockOnStart = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<ServiceCard {...defaultProps} service={stoppedService} onStart={slowMockOnStart} />);

      const startButton = screen.getByRole('button', { name: /^start$/i });

      // First click
      await act(async () => {
        startButton.click();
      });

      // Try to click again while loading - should be disabled
      await act(async () => {
        startButton.click();
        startButton.click();
      });

      // Wait for the promise to resolve
      await waitFor(() => {
        expect(slowMockOnStart).toHaveBeenCalledTimes(1);
      }, { timeout: 200 });
    });

    it('should handle component unmounting during async operations', async () => {
      // Create a promise that we can control
      let resolveStart: (value: any) => void;
      const startPromise = new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
      const mockOnStartDelayed = vi.fn().mockReturnValueOnce(startPromise);

      // Use stopped status so Start button is enabled
      const stoppedService = generateMockService({
        ...mockService,
        status: 'stopped'
      });

      const { unmount } = render(<ServiceCard {...defaultProps} service={stoppedService} onStart={mockOnStartDelayed} />);

      const startButton = screen.getByRole('button', { name: /^start$/i });
      await act(async () => {
        startButton.click();
      });

      // Unmount component before promise resolves
      unmount();

      // Resolve the promise
      await act(async () => {
        resolveStart!();
      });

      // Should not throw any errors
      expect(mockOnStartDelayed).toHaveBeenCalledTimes(1);
    });
  });
});