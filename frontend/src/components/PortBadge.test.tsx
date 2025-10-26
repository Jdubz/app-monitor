import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../test/test-utils';
import userEvent from '@testing-library/user-event';
import PortBadge from './PortBadge';

describe('PortBadge', () => {
  const mockOnKillPort = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.confirm mock
    window.confirm = vi.fn();
  });

  describe('Port in use', () => {
    const portInfoInUse = {
      port: 3000,
      pid: 12345,
      inUse: true,
    };

    it('renders port number', () => {
      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);
      expect(screen.getByText('3000')).toBeInTheDocument();
    });

    it('displays kill button when port is in use', () => {
      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);
      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('applies correct styling for port in use', () => {
      const { container } = render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);
      const badge = container.querySelector('span[title*="Port 3000"]');
      expect(badge).toHaveStyle({
        backgroundColor: '#ffe0e0',
        color: '#c62828',
        cursor: 'pointer',
      });
    });

    it('has correct title/tooltip for port in use', () => {
      const { container } = render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);
      const badge = container.querySelector('span[title*="Port 3000"]');
      expect(badge).toHaveAttribute('title', 'Port 3000 IN USE (PID: 12345) - Click to stop');
    });

    it('calls onKillPort when kill button is clicked and confirmed', async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(true);
      mockOnKillPort.mockResolvedValue(undefined);

      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Stop process on port 3000')
      );
      await waitFor(() => {
        expect(mockOnKillPort).toHaveBeenCalledWith(3000);
      });
    });

    it('does not call onKillPort when kill is cancelled', async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(false);

      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnKillPort).not.toHaveBeenCalled();
    });

    it('shows loading state while killing port', async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(true);

      // Make the promise resolve slowly
      let resolveKill: () => void;
      const killPromise = new Promise<void>((resolve) => {
        resolveKill = resolve;
      });
      mockOnKillPort.mockReturnValue(killPromise);

      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('...')).toBeInTheDocument();
      });

      // Resolve the promise
      resolveKill!();
      await waitFor(() => {
        expect(screen.getByText('✕')).toBeInTheDocument();
      });
    });

    it('disables button while killing', async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(true);

      let resolveKill: () => void;
      const killPromise = new Promise<void>((resolve) => {
        resolveKill = resolve;
      });
      mockOnKillPort.mockReturnValue(killPromise);

      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      await waitFor(() => {
        const loadingButton = screen.getByText('...');
        expect(loadingButton).toBeDisabled();
      });

      resolveKill!();
    });

    it('handles kill errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(window.confirm).mockReturnValue(true);
      const error = new Error('Failed to kill port');
      mockOnKillPort.mockRejectedValue(error);

      render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to kill port 3000'),
          error
        );
      });

      // Should return to normal state
      expect(screen.getByText('✕')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('prevents event propagation when clicking kill button', async () => {
      const user = userEvent.setup();
      const parentClickHandler = vi.fn();
      vi.mocked(window.confirm).mockReturnValue(true);
      mockOnKillPort.mockResolvedValue(undefined);

      render(
        <div onClick={parentClickHandler}>
          <PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />
        </div>
      );

      const killButton = screen.getByText('✕');
      await user.click(killButton);

      // Parent click handler should not be called due to stopPropagation
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Port available (not in use)', () => {
    const portInfoAvailable = {
      port: 4000,
      pid: null,
      inUse: false,
    };

    it('renders port number', () => {
      render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);
      expect(screen.getByText('4000')).toBeInTheDocument();
    });

    it('does not display kill button when port is available', () => {
      render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);
      expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });

    it('applies correct styling for available port', () => {
      const { container } = render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);
      const badge = container.querySelector('span[title*="Port 4000"]');
      expect(badge).toHaveStyle({
        backgroundColor: '#e8f5e9',
        color: '#2e7d32',
        cursor: 'default',
      });
    });

    it('has correct title/tooltip for available port', () => {
      const { container } = render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);
      const badge = container.querySelector('span[title*="Port 4000"]');
      expect(badge).toHaveAttribute('title', 'Port 4000 available');
    });

    it('does not show hover effects for available ports', () => {
      const { container } = render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);
      const badge = container.querySelector('span[title*="Port 4000"]') as HTMLElement;

      // Trigger hover
      const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
      badge.dispatchEvent(mouseEnterEvent);

      // Background should remain the same (no hover effect since onMouseEnter only modifies if inUse)
      expect(badge).toHaveStyle({ backgroundColor: '#e8f5e9' });
    });
  });

  describe('Visual indicators', () => {
    it('shows red dot for port in use', () => {
      const portInfoInUse = { port: 3000, pid: 12345, inUse: true };
      const { container } = render(<PortBadge portInfo={portInfoInUse} onKillPort={mockOnKillPort} />);

      const badge = container.querySelector('span[title*="Port 3000"]');
      const dot = badge?.querySelector('span');
      expect(dot).toHaveStyle({
        backgroundColor: '#d32f2f',
        borderRadius: '50%',
      });
    });

    it('shows green dot for available port', () => {
      const portInfoAvailable = { port: 4000, pid: null, inUse: false };
      const { container } = render(<PortBadge portInfo={portInfoAvailable} onKillPort={mockOnKillPort} />);

      const badge = container.querySelector('span[title*="Port 4000"]');
      const dot = badge?.querySelector('span');
      expect(dot).toHaveStyle({
        backgroundColor: '#4caf50',
        borderRadius: '50%',
      });
    });
  });
});
