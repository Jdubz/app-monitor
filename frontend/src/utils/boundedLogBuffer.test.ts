import { describe, expect, it } from 'vitest';

import { BoundedLogBuffer } from './boundedLogBuffer';

describe('BoundedLogBuffer', () => {
  it('appends entries and preserves order', () => {
    const buffer = new BoundedLogBuffer<number>(5);
    buffer.append(1);
    buffer.append([2, 3]);
    expect(buffer.toArray()).toEqual([1, 2, 3]);
    expect(buffer.size).toBe(3);
  });

  it('enforces the configured capacity', () => {
    const buffer = new BoundedLogBuffer<number>(3);
    buffer.append([1, 2, 3, 4, 5]);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it('clears all entries', () => {
    const buffer = new BoundedLogBuffer<string>(2);
    buffer.append('a');
    buffer.append('b');
    buffer.clear();
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.size).toBe(0);
  });

  it('throws when constructed with invalid capacity', () => {
    expect(() => new BoundedLogBuffer(0)).toThrow();
    expect(() => new BoundedLogBuffer(-1)).toThrow();
  });
});
