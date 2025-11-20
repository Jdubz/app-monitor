/**
 * AdminBotChat Component Unit Tests
 *
 * Tests for the Admin Bot chat UI component.
 * Covers UI rendering, user interactions, session management, and message handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminBotChat } from './AdminBotChat';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock useAdminBotSSE hook
vi.mock('@/hooks/useAdminBotSSE', () => ({
  useAdminBotSSE: vi.fn(() => ({
    close: vi.fn(),
    isConnected: false,
  })),
}));

// Mock API base path
vi.mock('@/utils/apiBaseUrl', () => ({
  getApiBasePath: () => 'http://localhost:5000/api',
}));

describe('AdminBotChat', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    // Mock environment variable
    import.meta.env.VITE_API_KEY = mockApiKey;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render with no active session', () => {
    render(<AdminBotChat />);

    expect(screen.getByText('Admin Bot Chat')).toBeInTheDocument();
    expect(screen.getByText(/Interactive chat with Codex CLI/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
  });

  it('should display empty state when no session', () => {
    render(<AdminBotChat />);

    expect(screen.getByText(/No active session/i)).toBeInTheDocument();
    expect(screen.getByText(/Start a session to begin chatting/i)).toBeInTheDocument();
  });

  it('should start session when Start Session button clicked', async () => {
    const user = userEvent.setup();

    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5000/api/admin-bot/chat/start',
        {},
        expect.objectContaining({
          headers: {
            'X-API-Key': mockApiKey,
          },
        })
      );
    });

    // Should show system message
    await waitFor(() => {
      expect(screen.getByText(/Admin bot session started/i)).toBeInTheDocument();
    });

    // Should show Active badge
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should show error when session start fails', async () => {
    const user = userEvent.setup();

    (axios.post as any).mockRejectedValue(new Error('Session already running'));

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/Session already running/i)).toBeInTheDocument();
    });
  });

  it('should stop session when Stop Session button clicked', async () => {
    const user = userEvent.setup();

    // Start session first
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop session/i })).toBeInTheDocument();
    });

    // Stop session
    const stopButton = screen.getByRole('button', { name: /stop session/i });
    await user.click(stopButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5000/api/admin-bot/chat/stop',
        {},
        expect.objectContaining({
          headers: {
            'X-API-Key': mockApiKey,
          },
        })
      );
    });

    // Should show stopped message
    await waitFor(() => {
      expect(screen.getByText(/Admin bot session stopped/i)).toBeInTheDocument();
    });
  });

  it('should disable input when no session active', () => {
    render(<AdminBotChat />);

    const textarea = screen.getByPlaceholderText(/Start a session to send messages/i);
    expect(textarea).toBeDisabled();

    const sendButton = screen.getByRole('button', { name: '', description: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('should enable input when session active', async () => {
    const user = userEvent.setup();

    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Type your message/i);
      expect(textarea).not.toBeDisabled();
    });
  });

  it('should send message when Send button clicked', async () => {
    const user = userEvent.setup();

    // Start session
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).not.toBeDisabled();
    });

    // Type message
    const textarea = screen.getByPlaceholderText(/Type your message/i);
    await user.type(textarea, 'Hello, bot!');

    // Click send button
    const sendButton = screen.getAllByRole('button').find((btn) =>
      btn.querySelector('svg')
    );
    await user.click(sendButton!);

    // Should send message
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5000/api/admin-bot/chat/message',
        { message: 'Hello, bot!' },
        expect.objectContaining({
          headers: {
            'X-API-Key': mockApiKey,
          },
        })
      );
    });

    // Should display user message
    expect(screen.getByText('Hello, bot!')).toBeInTheDocument();

    // Should clear input
    expect(textarea).toHaveValue('');
  });

  it('should send message on Enter key', async () => {
    const user = userEvent.setup();

    // Start session
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).not.toBeDisabled();
    });

    // Type message and press Enter
    const textarea = screen.getByPlaceholderText(/Type your message/i);
    await user.type(textarea, 'Test message{Enter}');

    // Should send message
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5000/api/admin-bot/chat/message',
        { message: 'Test message' },
        expect.any(Object)
      );
    });
  });

  it('should not send message on Shift+Enter', async () => {
    const user = userEvent.setup();

    // Start session
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).not.toBeDisabled();
    });

    // Type message and press Shift+Enter
    const textarea = screen.getByPlaceholderText(/Type your message/i);
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2');

    // Should not send message (would need 2 calls if sent)
    await waitFor(() => {
      // Only the initial start session call should have been made
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    // Should have newline in textarea
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });

  it('should not send empty messages', async () => {
    const user = userEvent.setup();

    // Start session
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).not.toBeDisabled();
    });

    // Try to send empty message
    const textarea = screen.getByPlaceholderText(/Type your message/i);
    await user.type(textarea, '{Enter}');

    // Should not send message (only start session call)
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('should display loading state when starting session', async () => {
    const user = userEvent.setup();

    // Delay the response
    (axios.post as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { data: { sessionId: 'test' } } }), 100))
    );

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    // Should show loading spinner
    expect(screen.getByRole('button').querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('should display error message inline', async () => {
    const user = userEvent.setup();

    (axios.post as any).mockRejectedValue(new Error('Network error'));

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    // Error should be in red background
    const errorElement = screen.getByText(/Network error/i).closest('div');
    expect(errorElement).toHaveClass('bg-red-500/10');
  });

  it('should clear error when new operation succeeds', async () => {
    const user = userEvent.setup();

    // First call fails
    (axios.post as any).mockRejectedValueOnce(new Error('First error'));

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/First error/i)).toBeInTheDocument();
    });

    // Second call succeeds
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    await user.click(startButton);

    await waitFor(() => {
      expect(screen.queryByText(/First error/i)).not.toBeInTheDocument();
    });
  });

  it('should display message timestamps', async () => {
    const user = userEvent.setup();

    // Start session
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    // Find the system message's timestamp
    const messageElements = screen.getAllByText(/:\d{2}:\d{2}/);
    expect(messageElements.length).toBeGreaterThan(0);
  });

  it('should display different styles for user vs assistant messages', async () => {
    const user = userEvent.setup();

    // Start session and send message
    (axios.post as any).mockResolvedValue({
      data: {
        data: {
          sessionId: 'test-session-123',
        },
      },
    });

    render(<AdminBotChat />);

    const startButton = screen.getByRole('button', { name: /start session/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).not.toBeDisabled();
    });

    // Send a user message
    const textarea = screen.getByPlaceholderText(/Type your message/i);
    await user.type(textarea, 'User message{Enter}');

    await waitFor(() => {
      const userMessage = screen.getByText('User message').closest('div');
      expect(userMessage).toHaveClass('bg-blue-500');
    });
  });
});
