/**
 * Context Bundle Cache
 *
 * LRU cache for context bundles with git commit hash-based invalidation.
 * Persists cache entries to SQLite for cross-session reuse.
 */

import * as crypto from 'crypto';
import type {
  ContextBundle,
  BundleCacheEntry,
  BundleCacheStats,
  BundleGenerationOptions
} from '../../types/contextBundle.js';

interface CacheOptions {
  maxEntries?: number;
  maxTotalBytes?: number;
  persistToDb?: boolean;
}

export class ContextCache {
  private cache: Map<string, BundleCacheEntry> = new Map();
  private maxEntries: number;
  private maxTotalBytes: number;
  private persistToDb: boolean;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.maxTotalBytes = options.maxTotalBytes ?? 100 * 1024 * 1024; // 100MB default
    this.persistToDb = options.persistToDb ?? true;
  }

  /**
   * Generate cache key from bundle generation options and git commit
   */
  async generateCacheKey(
    options: BundleGenerationOptions,
    gitCommitHash?: string
  ): Promise<string> {
    const commit = gitCommitHash ?? await this.getCurrentGitCommit();
    const optionsHash = this.hashObject({
      taskType: options.taskType,
      profiles: options.profiles?.sort() ?? [],
      targetFiles: options.targetFiles?.sort() ?? []
    });

    return `${commit}-${optionsHash}`;
  }

  /**
   * Get bundle from cache
   */
  async get(cacheKey: string): Promise<ContextBundle | null> {
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.stats.misses++;

      // Try loading from database if persistence enabled
      if (this.persistToDb) {
        const dbEntry = await this.loadFromDb(cacheKey);
        if (dbEntry) {
          this.cache.set(cacheKey, dbEntry);
          this.updateAccessTime(cacheKey);
          this.stats.hits++;
          return this.entryToBundle(dbEntry);
        }
      }

      return null;
    }

    // Check if entry is expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    this.updateAccessTime(cacheKey);
    this.stats.hits++;

    return this.entryToBundle(entry);
  }

  /**
   * Store bundle in cache
   */
  async set(
    cacheKey: string,
    bundle: ContextBundle,
    ttl?: number
  ): Promise<void> {
    const sizeBytes = this.calculateBundleSize(bundle);
    const now = new Date();

    const entry: BundleCacheEntry = {
      bundleId: bundle.id,
      cacheKey,
      taskType: bundle.metadata.taskType,
      profiles: bundle.metadata.profiles,
      mountPath: bundle.mountPath,
      sizeBytes,
      createdAt: now,
      expiresAt: ttl !== undefined ? new Date(now.getTime() + ttl * 1000) : undefined,
      hitCount: 0,
      lastAccessedAt: now
    };

    // Evict entries if needed
    await this.evictIfNeeded(sizeBytes);

    // Store in memory cache
    this.cache.set(cacheKey, entry);

    // Persist to database if enabled
    if (this.persistToDb) {
      await this.saveToDb(entry, bundle);
    }
  }

  /**
   * Check if cache has entry
   */
  has(cacheKey: string): boolean {
    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(cacheKey: string): boolean {
    return this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): BundleCacheStats {
    const totalBytes = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.sizeBytes, 0);

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      totalEntries: this.cache.size,
      totalBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate
    };
  }

  /**
   * Evict entries if cache limits exceeded
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    // Check total bytes limit
    const currentBytes = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.sizeBytes, 0);

    if (currentBytes + newEntrySize > this.maxTotalBytes) {
      await this.evictLRU(newEntrySize);
    }

    // Check entry count limit
    if (this.cache.size >= this.maxEntries) {
      await this.evictLRU(0);
    }
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(bytesNeeded: number): Promise<void> {
    // Sort entries by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime());

    let freedBytes = 0;

    for (const [key, entry] of entries) {
      this.cache.delete(key);
      this.stats.evictions++;
      freedBytes += entry.sizeBytes;

      // Stop when we've freed enough space
      if (freedBytes >= bytesNeeded && this.cache.size < this.maxEntries) {
        break;
      }
    }
  }

  /**
   * Update entry access time
   */
  private updateAccessTime(cacheKey: string): void {
    const entry = this.cache.get(cacheKey);
    if (entry) {
      entry.lastAccessedAt = new Date();
      entry.hitCount++;
    }
  }

  /**
   * Calculate bundle size in bytes
   */
  private calculateBundleSize(bundle: ContextBundle): number {
    let totalSize = 0;

    for (const profile of Object.values(bundle.profileContents)) {
      totalSize += profile.sizeBytes;
    }

    return totalSize;
  }

  /**
   * Convert cache entry back to bundle
   */
  private entryToBundle(entry: BundleCacheEntry): ContextBundle {
    // This is a placeholder - actual implementation will load bundle data
    // from the database or filesystem
    return {
      id: entry.bundleId,
      profileContents: {},
      metadata: {
        bundleId: entry.bundleId,
        taskType: entry.taskType,
        profiles: entry.profiles,
        totalBytes: entry.sizeBytes,
        cacheKey: entry.cacheKey,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt
      },
      mountPath: entry.mountPath,
      cacheKey: entry.cacheKey
    };
  }

  /**
   * Get current git commit hash
   */
  private async getCurrentGitCommit(): Promise<string> {
    try {
      const { execSync } = await import('child_process');
      const hash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      return hash;
    } catch {
      // Fallback to timestamp if git not available
      return `timestamp-${Date.now()}`;
    }
  }

  /**
   * Hash object to string
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  /**
   * Load cache entry from database (placeholder)
   */
  private async loadFromDb(_cacheKey: string): Promise<BundleCacheEntry | null> {
    // TODO: Implement database loading in next milestone
    return null;
  }

  /**
   * Save cache entry to database (placeholder)
   */
  private async saveToDb(_entry: BundleCacheEntry, _bundle: ContextBundle): Promise<void> {
    // TODO: Implement database persistence in next milestone
  }
}
