import { describe, it, expect } from 'vitest';
import { BoundedLogBuffer } from './boundedLogBuffer';

describe('BoundedLogBuffer', () => {
  it('stores entries up to capacity and discards oldest when full', () => {
    const buffer = new BoundedLogBuffer<string>(3);
    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    expect(buffer.toArray()).toEqual(['a', 'b', 'c']);
    expect(buffer.size()).toBe(3);

    buffer.push('d');
    expect(buffer.toArray()).toEqual(['b', 'c', 'd']);
  });

  it('clears stored entries', () => {
    const buffer = new BoundedLogBuffer<number>(2);
    buffer.push(1);
    buffer.push(2);
    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(buffer.toArray()).toEqual([]);
  });

  it('handles wrap-around inserts correctly', () => {
    const buffer = new BoundedLogBuffer<string>(2);
    buffer.push('first');
    buffer.push('second');
    buffer.push('third');
    buffer.push('fourth');

    expect(buffer.toArray()).toEqual(['third', 'fourth']);
  });

  it('throws when initialized with non-positive capacity', () => {
    expect(() => new BoundedLogBuffer(0)).toThrow();
    expect(() => new BoundedLogBuffer(-1)).toThrow();
  });
});
