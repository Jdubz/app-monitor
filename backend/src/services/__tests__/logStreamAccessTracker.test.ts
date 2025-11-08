import { describe, it, expect } from 'vitest';
import { LogStreamAccessTracker } from '../logStreamAccessTracker.js';

describe('LogStreamAccessTracker', () => {
  it('limits concurrent acquisitions per key', () => {
    const tracker = new LogStreamAccessTracker(2);
    expect(tracker.tryAcquire('stdout.log')).toBe(true);
    expect(tracker.tryAcquire('stdout.log')).toBe(true);
    expect(tracker.tryAcquire('stdout.log')).toBe(false);
    expect(tracker.getActiveCount('stdout.log')).toBe(2);
  });

  it('allows reuse after releasing slots', () => {
    const tracker = new LogStreamAccessTracker(1);
    tracker.tryAcquire('stderr.log');
    tracker.release('stderr.log');
    expect(tracker.tryAcquire('stderr.log')).toBe(true);
    expect(tracker.getActiveCount('stderr.log')).toBe(1);
  });

  it('ignores releases for unknown keys without throwing', () => {
    const tracker = new LogStreamAccessTracker(1);
    expect(() => tracker.release('missing.log')).not.toThrow();
    expect(tracker.getActiveCount('missing.log')).toBe(0);
  });
});
