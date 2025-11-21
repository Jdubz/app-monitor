import { describe, it, expect } from 'vitest';

const sanitizeWorkerId = (workerId: string): string =>
  workerId.replace(/[^a-zA-Z0-9-_]/g, '_');

describe('Worker Logging Helpers', () => {
  it('sanitizes worker IDs for log file usage', () => {
    const workerId = 'bot-backend-specialist@123';
    const sanitized = sanitizeWorkerId(workerId);

    expect(sanitized).toBe('bot-backend-specialist_123');
  });

  it('produces deterministic log file paths for workers', () => {
    const workerId = 'bot-frontend-specialist-456';
    const sanitized = sanitizeWorkerId(workerId);
    const logFilePath = `/tmp/devbot-worker-logs/${sanitized}.log`;

    expect(logFilePath).toBe('/tmp/devbot-worker-logs/bot-frontend-specialist-456.log');
  });

  it('supports worker IDs with uppercase characters', () => {
    const workerId = 'BOT-DBA-1';
    const sanitized = sanitizeWorkerId(workerId);
    const logFilePath = `/tmp/devbot-worker-logs/${sanitized}.log`;

    expect(logFilePath).toBe('/tmp/devbot-worker-logs/BOT-DBA-1.log');
  });
});
