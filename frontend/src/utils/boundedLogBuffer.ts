export class BoundedLogBuffer<T = string> {
  private buffer: T[] = [];
  private readonly capacity: number;

  constructor(maxEntries: number = 2000) {
    if (maxEntries <= 0) {
      throw new Error('BoundedLogBuffer maxEntries must be greater than zero');
    }
    this.capacity = maxEntries;
  }

  append(entry: T | T[]): T[] {
    const entries = Array.isArray(entry) ? entry : [entry];
    for (const item of entries) {
      this.buffer.push(item);
    }
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    return this.toArray();
  }

  toArray(): T[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }

  get maxSize(): number {
    return this.capacity;
  }
}
