export class BoundedLogBuffer<T> {
  private readonly capacity: number;
  private values: Array<T | undefined>;
  private head = 0;
  private length = 0;

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('BoundedLogBuffer capacity must be a positive number');
    }
    this.capacity = Math.floor(capacity);
    this.values = new Array(this.capacity);
  }

  push(value: T): void {
    const insertIndex = (this.head + this.length) % this.capacity;
    this.values[insertIndex] = value;

    if (this.length < this.capacity) {
      this.length += 1;
      return;
    }

    this.head = (this.head + 1) % this.capacity;
  }

  clear(): void {
    this.values = new Array(this.capacity);
    this.head = 0;
    this.length = 0;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.length; i += 1) {
      const index = (this.head + i) % this.capacity;
      const value = this.values[index];
      if (value !== undefined) {
        result.push(value);
      }
    }
    return result;
  }

  size(): number {
    return this.length;
  }
}
