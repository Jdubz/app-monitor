export class LogStreamAccessTracker {
  private readonly maxPerKey: number;
  private readonly counts = new Map<string, number>();

  constructor(maxPerKey: number) {
    if (!Number.isFinite(maxPerKey) || maxPerKey < 1) {
      throw new Error('LogStreamAccessTracker requires a positive limit');
    }
    this.maxPerKey = Math.floor(maxPerKey);
  }

  tryAcquire(key: string): boolean {
    const current = this.counts.get(key) ?? 0;
    if (current >= this.maxPerKey) {
      return false;
    }
    this.counts.set(key, current + 1);
    return true;
  }

  release(key: string): void {
    const current = this.counts.get(key);
    if (!current) {
      return;
    }
    if (current === 1) {
      this.counts.delete(key);
    } else {
      this.counts.set(key, current - 1);
    }
  }

  getActiveCount(key: string): number {
    return this.counts.get(key) ?? 0;
  }
}
