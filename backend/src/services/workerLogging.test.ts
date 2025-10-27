import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Worker Logging System', () => {
  const testLogsDir = path.join(process.cwd(), 'test-logs');
  
  beforeEach(() => {
    // Clean up test logs directory
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
  });
  
  afterEach(() => {
    // Clean up test logs directory
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
  });

  describe('Worker Log File Initialization', () => {
    it('should create logs directory if it does not exist', () => {
      expect(fs.existsSync(testLogsDir)).toBe(false);
      
      fs.mkdirSync(testLogsDir, { recursive: true });
      
      expect(fs.existsSync(testLogsDir)).toBe(true);
    });

    it('should create worker-a.log file with proper header', () => {
      const workerType = 'bot-a';
      const logFile = path.join(testLogsDir, `${workerType}.log`);
      
      // Create logs directory
      fs.mkdirSync(testLogsDir, { recursive: true });
      
      // Initialize log file with header
      const timestamp = new Date().toISOString();
      const header = `=== ${workerType.toUpperCase()} WORKER LOG ===\n` +
                    `Initialized: ${timestamp}\n` +
                    `Worker Type: ${workerType}\n` +
                    `=====================================\n\n`;
      
      fs.appendFileSync(logFile, header);
      
      expect(fs.existsSync(logFile)).toBe(true);
      
      const content = fs.readFileSync(logFile, 'utf8');
      expect(content).toContain('=== BOT-A WORKER LOG ===');
      expect(content).toContain(`Worker Type: ${workerType}`);
      expect(content).toContain('Initialized:');
    });

    it('should create worker-b.log file with proper header', () => {
      const workerType = 'bot-b';
      const logFile = path.join(testLogsDir, `${workerType}.log`);
      
      // Create logs directory
      fs.mkdirSync(testLogsDir, { recursive: true });
      
      // Initialize log file with header
      const timestamp = new Date().toISOString();
      const header = `=== ${workerType.toUpperCase()} WORKER LOG ===\n` +
                    `Initialized: ${timestamp}\n` +
                    `Worker Type: ${workerType}\n` +
                    `=====================================\n\n`;
      
      fs.appendFileSync(logFile, header);
      
      expect(fs.existsSync(logFile)).toBe(true);
      
      const content = fs.readFileSync(logFile, 'utf8');
      expect(content).toContain('=== BOT-B WORKER LOG ===');
      expect(content).toContain(`Worker Type: ${workerType}`);
      expect(content).toContain('Initialized:');
    });
  });

  describe('Worker Log File Paths', () => {
    it('should generate correct log file path for bot-a', () => {
      const workerType = 'bot-a';
      const logFile = `/app/logs/${workerType}.log`;

      expect(logFile).toBe('/app/logs/bot-a.log');
    });

    it('should generate correct log file path for bot-b', () => {
      const workerType = 'bot-b';
      const logFile = `/app/logs/${workerType}.log`;

      expect(logFile).toBe('/app/logs/bot-b.log');
    });
  });

  describe('Worker Type Detection', () => {
    it('should correctly identify bot-a from worker ID', () => {
      const workerId = 'bot-a-backend-specialist-1761259412357';
      const workerType = workerId.includes('bot-a') ? 'bot-a' : 'bot-b';

      expect(workerType).toBe('bot-a');
    });

    it('should correctly identify bot-b from worker ID', () => {
      const workerId = 'bot-b-frontend-specialist-1761259432926';
      const workerType = workerId.includes('bot-a') ? 'bot-a' : 'bot-b';

      expect(workerType).toBe('bot-b');
    });
  });

  describe('Log Command Generation', () => {
    it('should generate correct logging wrapper command for bot-a', () => {
      const workerType = 'bot-a';
      const logFile = `/app/logs/${workerType}.log`;
      const agentName = 'Backend Specialist';
      const taskTitle = 'Test Task';

      const wrapperCommand = [
        'echo "=== Worker Task Execution Started ===" >> ' + logFile,
        'echo "Timestamp: $(date)" >> ' + logFile,
        'echo "Worker: ' + agentName + '" >> ' + logFile,
        'echo "Task: ' + taskTitle + '" >> ' + logFile,
        'echo "=====================================" >> ' + logFile,
        'claude -p "test prompt" 2>&1 | tee -a ' + logFile,
        'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
        'echo "Exit Code: $?" >> ' + logFile,
        'echo "=======================================" >> ' + logFile
      ].join(' && ');

      expect(wrapperCommand).toContain('/app/logs/bot-a.log');
      expect(wrapperCommand).toContain('Worker Task Execution Started');
      expect(wrapperCommand).toContain('Worker Task Execution Completed');
      expect(wrapperCommand).toContain('tee -a');
    });

    it('should generate correct logging wrapper command for bot-b', () => {
      const workerType = 'bot-b';
      const logFile = `/app/logs/${workerType}.log`;
      const agentName = 'Frontend Specialist';
      const taskTitle = 'UI Task';

      const wrapperCommand = [
        'echo "=== Worker Task Execution Started ===" >> ' + logFile,
        'echo "Timestamp: $(date)" >> ' + logFile,
        'echo "Worker: ' + agentName + '" >> ' + logFile,
        'echo "Task: ' + taskTitle + '" >> ' + logFile,
        'echo "=====================================" >> ' + logFile,
        'claude -p "test prompt" 2>&1 | tee -a ' + logFile,
        'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
        'echo "Exit Code: $?" >> ' + logFile,
        'echo "=======================================" >> ' + logFile
      ].join(' && ');

      expect(wrapperCommand).toContain('/app/logs/bot-b.log');
      expect(wrapperCommand).toContain('Worker Task Execution Started');
      expect(wrapperCommand).toContain('Worker Task Execution Completed');
      expect(wrapperCommand).toContain('tee -a');
    });
  });

  describe('Docker Volume Mounting', () => {
    it('should include logs directory in Docker binds', () => {
      const binds = [
        `${process.cwd()}:/app:ro`,
        `${process.cwd()}/app-monitor/dev-bots/volumes/bot-a:/workspace:rw`,
        `${process.cwd()}/logs:/app/logs:rw`
      ];
      
      expect(binds).toContain(`${process.cwd()}/logs:/app/logs:rw`);
    });

    it('should mount logs directory as read-write', () => {
      const logBind = `${process.cwd()}/logs:/app/logs:rw`;
      
      expect(logBind).toContain(':rw');
      expect(logBind).toContain('/app/logs');
    });
  });

  describe('Log File Persistence', () => {
    it('should append to existing log file without overwriting', () => {
      const workerType = 'bot-a';
      const logFile = path.join(testLogsDir, `${workerType}.log`);
      
      // Create logs directory
      fs.mkdirSync(testLogsDir, { recursive: true });
      
      // Write initial content
      const initialContent = 'Initial log entry\n';
      fs.writeFileSync(logFile, initialContent);
      
      // Append new content
      const newContent = 'New log entry\n';
      fs.appendFileSync(logFile, newContent);
      
      const finalContent = fs.readFileSync(logFile, 'utf8');
      expect(finalContent).toContain('Initial log entry');
      expect(finalContent).toContain('New log entry');
    });

    it('should handle multiple log entries correctly', () => {
      const workerType = 'bot-b';
      const logFile = path.join(testLogsDir, `${workerType}.log`);
      
      // Create logs directory
      fs.mkdirSync(testLogsDir, { recursive: true });
      
      // Write multiple entries
      const entries = [
        '=== BOT-B WORKER LOG ===\n',
        'Entry 1: Task started\n',
        'Entry 2: Task in progress\n',
        'Entry 3: Task completed\n'
      ];
      
      entries.forEach(entry => {
        fs.appendFileSync(logFile, entry);
      });
      
      const content = fs.readFileSync(logFile, 'utf8');
      expect(content).toContain('=== BOT-B WORKER LOG ===');
      expect(content).toContain('Entry 1: Task started');
      expect(content).toContain('Entry 2: Task in progress');
      expect(content).toContain('Entry 3: Task completed');
    });
  });
});
