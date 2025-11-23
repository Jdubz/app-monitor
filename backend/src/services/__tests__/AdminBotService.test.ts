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
import * as fs from 'fs';
import * as path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
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

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup fs mocks
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue('template {{MCP_START_PATH}} {{DATABASE_PATH}}');

    // Setup mock child process
    mockProcess = new EventEmitter();
    mockProcess.pid = 12345;
    mockProcess.killed = false;
    mockProcess.stdin = new EventEmitter();
    mockProcess.stdin.write = vi.fn().mockReturnValue(true);
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn((signal?: string) => {
      mockProcess.killed = true;
      setTimeout(() => mockProcess.emit('exit', signal === 'SIGTERM' ? 0 : 137), 10);
    });

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
      expect(fs.readFileSync).not.toHaveBeenCalled(); // Config not generated until startSession
    });
  });

  describe('startSession', () => {
    it('should start a new session successfully', async () => {
      const sessionId = await service.startSession();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      // startSession no longer spawns a process - it just creates the session
      expect(spawn).not.toHaveBeenCalled();
      expect(service.isSessionRunning()).toBe(true);
    });

    it('should throw error if session already running', async () => {
      await service.startSession();

      await expect(service.startSession()).rejects.toThrow(
        'Session already running'
      );
    });

    it('should generate runtime config with absolute paths', async () => {
      await service.startSession();

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('codex-admin-bot-runtime.toml'),
        expect.not.stringContaining('{{'),
        'utf-8'
      );
    });

    it('should create data directory if it does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.startSession();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        { recursive: true }
      );
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.startSession();
    });

    it('should spawn codex exec for message', async () => {
      await service.sendMessage('test message');

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--cd', expect.any(String), 'test message'],
        expect.objectContaining({
          env: expect.objectContaining({
            APP_MONITOR_MCP_USER_ROLE: 'admin',
          }),
          stdio: ['pipe', 'pipe', 'pipe'],
        })
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

      mockProcess.stdout.emit('data', Buffer.from('test output'));

      expect(outputHandler).toHaveBeenCalledWith('test output');
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
      // Send a message to create a process
      await service.sendMessage('test');

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
      await service.sendMessage('message 1');

      // Reset mock between calls so each sendMessage creates fresh mock
      vi.clearAllMocks();
      mockProcess = new EventEmitter();
      mockProcess.pid = 12346;
      mockProcess.killed = false;
      mockProcess.stdin = new EventEmitter();
      mockProcess.stdin.write = vi.fn().mockReturnValue(true);
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();
      (spawn as Mock).mockReturnValue(mockProcess);

      await service.sendMessage('message 2');

      const session = service.getSession();
      expect(session?.messages).toHaveLength(2);
      expect(session?.messages[0].content).toBe('message 1');
      expect(session?.messages[1].content).toBe('message 2');
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

  describe('runtime config generation', () => {
    it('should replace placeholders with absolute paths', async () => {
      const templateContent = `
[mcp_servers.app-monitor]
args = ["--loader", "tsx", "{{MCP_START_PATH}}"]
[mcp_servers.app-monitor.env]
DATABASE_PATH = "{{DATABASE_PATH}}"
`;

      (fs.readFileSync as Mock).mockReturnValue(templateContent);

      await service.startSession();

      const writeCall = (fs.writeFileSync as Mock).mock.calls[0];
      const writtenContent = writeCall[1];

      // Check that MCP_START_PATH was replaced
      expect(writtenContent).toMatch(/args = \["--loader", "tsx", ".*\/backend\/(src|dist)\/mcp\/start\.(ts|js)"\]/);

      // Check that DATABASE_PATH was replaced (may be :memory: in tests)
      expect(writtenContent).toMatch(/DATABASE_PATH = ".*"/);
      expect(writtenContent).not.toContain('{{MCP_START_PATH}}');
      expect(writtenContent).not.toContain('{{DATABASE_PATH}}');
    });

    it('should handle template read errors', async () => {
      (fs.readFileSync as Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(service.startSession()).rejects.toThrow();
    });

    it('should handle template write errors', async () => {
      (fs.writeFileSync as Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(service.startSession()).rejects.toThrow();
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

      await service.sendMessage('line 1\nline 2\nline 3');

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--cd', expect.any(String), 'line 1\nline 2\nline 3'],
        expect.any(Object)
      );
    });

    it('should handle empty message sending', async () => {
      await service.startSession();

      await service.sendMessage('');

      expect(spawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--cd', expect.any(String), ''],
        expect.any(Object)
      );
    });

    it('should handle process exit with null code', async () => {
      const exitHandler = vi.fn();
      service.on('exit', exitHandler);

      await service.startSession();
      await service.sendMessage('test');

      mockProcess.emit('exit', null);

      expect(exitHandler).toHaveBeenCalledWith(null);
    });

    it('should handle large stdout chunks', async () => {
      const outputHandler = vi.fn();
      service.on('output', outputHandler);

      await service.startSession();
      await service.sendMessage('test');

      const largeOutput = 'x'.repeat(1000000);
      mockProcess.stdout.emit('data', Buffer.from(largeOutput));

      expect(outputHandler).toHaveBeenCalledWith(largeOutput);
    });
  });
});
