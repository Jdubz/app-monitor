import { describe, it, expect } from 'vitest';
import { WorkerLogLocator } from '../taskLogLocator.js';

describe('WorkerLogLocator buildMatcher', () => {
  const locator = new WorkerLogLocator({} as any);

  const getMatcher = (pattern: string) =>
    (locator as unknown as { buildMatcher: (p: string, taskId: string) => (value: string) => boolean })
      .buildMatcher(pattern, 'task-123');

  it('matches exact filenames when pattern lacks wildcard', () => {
    const matcher = getMatcher('{taskId}-stdout.log');
    expect(matcher('task-123-stdout.log')).toBe(true);
    expect(matcher('task-123-stderr.log')).toBe(false);
  });

  it('supports multiple wildcards within the pattern', () => {
    const matcher = getMatcher('{taskId}-*-worker-*.log');
    expect(matcher('task-123-001-worker-agent.log')).toBe(true);
    expect(matcher('task-123-worker.log')).toBe(false);
  });

  it('escapes regex special characters within static segments', () => {
    const matcher = getMatcher('{taskId}.trace.*.log');
    expect(matcher('task-123.trace.1.log')).toBe(true);
    expect(matcher('task-123-trace-1.log')).toBe(false);
  });
});
