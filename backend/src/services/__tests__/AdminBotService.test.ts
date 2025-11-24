/**
 * AdminBotService Unit Tests
 *
 * Tests for the admin bot session management service.
 * Covers session lifecycle, message sending, streaming, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { EventEmitter } from 'events';
import { AdminBotService } from '../AdminBotService';
import { spawn } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminBotService', () => {
  let service: AdminBotService;
  let mockProcess: any;

  function createMockProcess() {
    const proc = new EventEmitter() as any;
    proc.pid = 12345;
    proc.killed = false;
    proc.stdin = new EventEmitter();
    proc.stdin.write = vi.fn().mockReturnValue(true);
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn((signal?: string) => {
      proc.killed = true;
      setTimeout(() => proc.emit('exit', signal === 'SIGTERM' ? 0 : 137), 10);
    });
    return proc;
  }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock child process
    mockProcess = createMockProcess();
    (spawn as Mock).mockReturnValue(mockProcess);

    // Create service instance
    service = new AdminBotService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(service).toBeDefined();
    });
  });

  describe('startSession', () => {
    it('should start a new session and spawn codex with initial greeting', async () => {
      const sessionId = await service.startSession();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      // startSession now spawns a codex process with initial greeting
      expect(spawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining([
          'exec',
          '--dangerously-bypass-approvals-and-sandbox',
          '--skip-git-repo-check',
          '--cd',
          expect.any(String),
          '--json',
          expect.stringContaining('admin bot')
        ]),
        expect.any(Object)
      );
      expect(service.isSessionRunning()).toBe(true);
    });

    it('should throw error if session already running', async () => {
      await service.startSession();

      await expect(service.startSession()).rejects.toThrow(
        'Session already running'
      );
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.startSession();
      // Simulate thread ID capture from initial greeting
      const session = service.getSession();
      if (session) {
        session.codexThreadId = 'test-thread-id-123';
      }
      // Reset spawn mock to check sendMessage call
      vi.clearAllMocks();
      mockProcess = createMockProcess();
      (spawn as Mock).mockReturnValue(mockProcess);
    });

    it('should spawn codex exec resume with thread ID for subsequent messages', async () => {
      await service.sendMessage('test message');

      // Note: exec resume has limited flags - session config persists from initial exec
      expect(spawn).toHaveBeenCalledWith(
        'codex',
        [
          'exec',
          'resume',
          'test-thread-id-123',
          'test message'
        ],
        expect.any(Object)
      );
    });

    it('should add message to session history', async () => {
      await service.sendMessage('test message');

      const session = service.getSession();
      expect(session?.messages).toHaveLength(1);
      expect(session?.messages[0].content).toBe('test message');
      expect(session?.messages[0].role).toBe('user');
    });

    it('should throw error if no active session', async () => {
      await service.stopSession();

      await expect(service.sendMessage('test')).rejects.toThrow(
        'No active session'
      );
    });

    it('should throw error if session is not running', async () => {
      const session = service.getSession();
      if (session) {
        session.status = 'error';
      }

      await expect(service.sendMessage('test')).rejects.toThrow(
        'Session is error'
      );
    });

    it('should emit output events from stdout', async () => {
      const outputHandler = vi.fn();
      service.on('output', outputHandler);

      await service.sendMessage('test');

      // Non-JSON output is emitted with newline appended
      mockProcess.stdout.emit('data', Buffer.from('test output'));

      expect(outputHandler).toHaveBeenCalledWith('test output\n');
    });

    it('should emit error events from stderr', async () => {
      const errorHandler = vi.fn();
      service.on('error', errorHandler);

      await service.sendMessage('test');

      mockProcess.stderr.emit('data', Buffer.from('test error'));

      expect(errorHandler).toHaveBeenCalledWith('test error');
    });

    it('should emit exit events when process exits', async () => {
      const exitHandler = vi.fn();
      service.on('exit', exitHandler);

      await service.sendMessage('test');

      mockProcess.emit('exit', 0);

      expect(exitHandler).toHaveBeenCalledWith(0);
    });

    it('should fallback to new thread if no thread ID available', async () => {
      // Clear the thread ID
      const session = service.getSession();
      if (session) {
        session.codexThreadId = null;
      }

      await service.sendMessage('test message');

      // Should spawn regular exec without resume
      expect(spawn).toHaveBeenCalledWith(
        'codex',
        [
          'exec',
          '--dangerously-bypass-approvals-and-sandbox',
          '--skip-git-repo-check',
          '--cd', expect.any(String),
          '--json',
          'test message'
        ],
        expect.any(Object)
      );
    });
  });

  describe('stopSession', () => {
    beforeEach(async () => {
      await service.startSession();
    });

    it('should stop session and clear reference', async () => {
      await service.stopSession();

      expect(service.getSession()).toBeNull();
      expect(service.isSessionRunning()).toBe(false);
    });

    it('should kill running process if present', async () => {
      // The process from startSession should be present
      await service.stopSession();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(service.getSession()).toBeNull();
    });

    it('should handle stop when no session exists', async () => {
      await service.stopSession();

      // Should not throw
      await expect(service.stopSession()).resolves.toBeUndefined();
    });

    it('should clear session reference', async () => {
      expect(service.getSession()).not.toBeNull();

      await service.stopSession();

      expect(service.getSession()).toBeNull();
    });
  });

  describe('getSession', () => {
    it('should return null when no session exists', () => {
      expect(service.getSession()).toBeNull();
    });

    it('should return session when active', async () => {
      await service.startSession();

      const session = service.getSession();
      expect(session).not.toBeNull();
      expect(session?.status).toBe('running');
      expect(session?.id).toBeDefined();
    });

    it('should return session with correct message history', async () => {
      await service.startSession();

      // Set thread ID for resume
      const session = service.getSession();
      if (session) {
        session.codexThreadId = 'test-thread-id';
      }

      // Reset mock for message sends
      vi.clearAllMocks();
      mockProcess = createMockProcess();
      (spawn as Mock).mockReturnValue(mockProcess);

      await service.sendMessage('message 1');

      // Reset mock between calls
      vi.clearAllMocks();
      mockProcess = createMockProcess();
      (spawn as Mock).mockReturnValue(mockProcess);

      await service.sendMessage('message 2');

      const updatedSession = service.getSession();
      expect(updatedSession?.messages).toHaveLength(2);
      expect(updatedSession?.messages[0].content).toBe('message 1');
      expect(updatedSession?.messages[1].content).toBe('message 2');
    });
  });

  describe('isSessionRunning', () => {
    it('should return false when no session exists', () => {
      expect(service.isSessionRunning()).toBe(false);
    });

    it('should return true when session is running', async () => {
      await service.startSession();

      expect(service.isSessionRunning()).toBe(true);
    });

    it('should return false when session is stopped', async () => {
      await service.startSession();
      await service.stopSession();

      expect(service.isSessionRunning()).toBe(false);
    });

    it('should return false when session has error status', async () => {
      await service.startSession();

      const session = service.getSession();
      if (session) {
        session.status = 'error';
      }

      expect(service.isSessionRunning()).toBe(false);
    });
  });

  describe('thread ID capture', () => {
    it('should capture thread ID from JSON output', async () => {
      await service.startSession();

      // Simulate JSON output with thread.started event
      const threadStartedEvent = JSON.stringify({
        type: 'thread.started',
        thread_id: 'captured-thread-123'
      });

      mockProcess.stdout.emit('data', Buffer.from(threadStartedEvent + '\n'));

      const session = service.getSession();
      expect(session?.codexThreadId).toBe('captured-thread-123');
    });

    it('should emit formatted output for agent messages', async () => {
      await service.startSession();

      const outputHandler = vi.fn();
      service.on('output', outputHandler);

      const agentMessage = JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Hello, I am the admin bot' }
      });

      mockProcess.stdout.emit('data', Buffer.from(agentMessage + '\n'));

      expect(outputHandler).toHaveBeenCalledWith('Hello, I am the admin bot\n');
    });
  });

  describe('edge cases', () => {
    it('should handle rapid start/stop cycles', async () => {
      await service.startSession();
      await service.stopSession();
      await service.startSession();
      await service.stopSession();

      expect(service.getSession()).toBeNull();
    });

    it('should handle message sending with newlines', async () => {
      await service.startSession();
      const session = service.getSession();
      if (session) {
        session.codexThreadId = 'test-thread';
      }

      vi.clearAllMocks();
      mockProcess = createMockProcess();
      (spawn as Mock).mockReturnValue(mockProcess);

      await service.sendMessage('line 1\nline 2\nline 3');

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['line 1\nline 2\nline 3']),
        expect.any(Object)
      );
    });

    it('should handle empty message sending', async () => {
      await service.startSession();
      const session = service.getSession();
      if (session) {
        session.codexThreadId = 'test-thread';
      }

      vi.clearAllMocks();
      mockProcess = createMockProcess();
      (spawn as Mock).mockReturnValue(mockProcess);

      await service.sendMessage('');

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['']),
        expect.any(Object)
      );
    });

    it('should handle process exit with null code', async () => {
      const exitHandler = vi.fn();
      service.on('exit', exitHandler);

      await service.startSession();

      mockProcess.emit('exit', null);

      expect(exitHandler).toHaveBeenCalledWith(null);
    });

    it('should handle large stdout chunks', async () => {
      const outputHandler = vi.fn();
      service.on('output', outputHandler);

      await service.startSession();

      // Large non-JSON output is emitted with newline appended
      const largeOutput = 'x'.repeat(1000000);
      mockProcess.stdout.emit('data', Buffer.from(largeOutput));

      expect(outputHandler).toHaveBeenCalledWith(largeOutput + '\n');
    });
  });
});
