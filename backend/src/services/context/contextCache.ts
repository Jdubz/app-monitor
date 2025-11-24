/**
 * Context Bundle Cache
 *
 * LRU cache for context bundles with git commit hash-based invalidation.
 * Persists cache entries to SQLite for cross-session reuse.
 */

import * as crypto from 'crypto';
import { DevBotsDatabase } from '../database.js';
import { getContextLogger } from './contextLogger.js';
import { MS_PER_HOUR } from '../../constants/timeouts.js';
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
  db?: DevBotsDatabase; // Allow injecting database for testing
}

interface DbCacheRow {
  bundle_id: string;
  cache_key: string;
  task_type: string;
  profiles: string; // JSON string
  mount_path: string;
  size_bytes: number;
  created_at: string;
  expires_at: string | null;
  hit_count: number;
  last_accessed_at: string;
  bundle_data: string; // JSON string
}

export class ContextCache {
  private cache: Map<string, BundleCacheEntry> = new Map();
  private bundleData: Map<string, ContextBundle> = new Map();
  private db!: DevBotsDatabase;
  private maxEntries: number;
  private maxTotalBytes: number;
  private persistToDb: boolean;
  private cleanupInterval?: NodeJS.Timeout;
  private cleanupInProgress = false;
  private logger = getContextLogger();
  private accessSequence = 0; // For stable LRU ordering

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

    try {
      // Use provided database or create new one
      this.db = options.db ?? new DevBotsDatabase();
      // Verify database connection
      this.db.getConnection().prepare('SELECT 1').get();

      // Start cleanup interval (every hour)
      if (this.persistToDb) {
        this.cleanupInterval = setInterval(async () => {
          // Prevent overlapping cleanup operations
          if (this.cleanupInProgress) {
            return;
          }
          this.cleanupInProgress = true;
          try {
            await this.cleanupExpiredEntries();
          } catch (err) {
            this.logger.error('Failed to cleanup expired entries', { component: 'ContextCache', operation: 'cleanupInterval' }, err instanceof Error ? err : undefined);
          } finally {
            this.cleanupInProgress = false;
          }
        }, MS_PER_HOUR);
      }
    } catch (error) {
      this.logger.error('Failed to initialize database connection', { component: 'ContextCache', operation: 'constructor' }, error instanceof Error ? error : new Error(String(error)));
      // Disable persistence if DB fails
      this.persistToDb = false;
    }
  }

  /**
   * Generate cache key from bundle generation options and git commit
   */
  async generateCacheKey(
    options: BundleGenerationOptions,
    gitCommitHash?: string
  ): Promise<string> {
    // Validate task type
    const validTaskTypes = ['implementation', 'fix', 'review', 'pr-follow-up', 'analysis'];
    if (!validTaskTypes.includes(options.taskType)) {
      throw new Error(`Invalid task type: ${options.taskType}`);
    }

    const commit = gitCommitHash ?? await this.getCurrentGitCommit();

    // Sanitize commit hash (should be alphanumeric and hyphens only)
    const sanitizedCommit = commit.replace(/[^a-zA-Z0-9-]/g, '');

    const optionsHash = this.hashObject({
      taskType: options.taskType,
      profiles: this.sortedCopy(options.profiles),
      targetFiles: this.sortedCopy(options.targetFiles)
    });

    const cacheKey = `${sanitizedCommit}-${optionsHash}`;

    // Validate final cache key format and length
    if (!/^[a-zA-Z0-9-]+$/.test(cacheKey) || cacheKey.length > 255) {
      throw new Error('Invalid cache key format');
    }

    return cacheKey;
  }

  /**
   * Get bundle from cache
   */
  async get(cacheKey: string): Promise<ContextBundle | null> {
    // Check memory cache first
    let entry = this.cache.get(cacheKey);
    let bundle = this.bundleData.get(cacheKey);

    if (!entry || !bundle) {
      this.stats.misses++;

      // Try loading from database if persistence enabled
      if (this.persistToDb) {
        const dbResult = await this.loadFromDb(cacheKey);
        if (dbResult) {
          entry = dbResult.entry;
          bundle = dbResult.bundle;

          // Store in memory caches
          this.cache.set(cacheKey, entry);
          this.bundleData.set(cacheKey, bundle);
          this.updateAccessTime(cacheKey);
          this.stats.hits++;
          return bundle;
        }
      }

      return null;
    }

    // Check if entry is expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(cacheKey);
      this.bundleData.delete(cacheKey);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    this.updateAccessTime(cacheKey);
    this.stats.hits++;

    return bundle;
  }

  /**
   * Store bundle in cache
   */
  async set(
    cacheKey: string,
    bundle: ContextBundle,
    ttl?: number
  ): Promise<void> {
    // Don't cache if max entries is 0
    if (this.maxEntries === 0) {
      return;
    }

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
      lastAccessedAt: now,
      accessSequence: ++this.accessSequence
    } as BundleCacheEntry;

    // Evict entries if needed
    await this.evictIfNeeded(sizeBytes);

    // Store in memory caches
    this.cache.set(cacheKey, entry);
    this.bundleData.set(cacheKey, bundle);

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
      this.bundleData.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(cacheKey: string): boolean {
    let removed = false;

    if (this.cache.delete(cacheKey) || this.bundleData.delete(cacheKey)) {
      removed = true;
    }

    // Also delete from database (even if not in memory)
    if (this.persistToDb && this.db) {
      try {
        const result = this.db.getConnection().prepare(
          'DELETE FROM context_bundle_cache WHERE cache_key = ?'
        ).run(cacheKey);
        if (result.changes > 0) {
          removed = true;
        }
      } catch (error) {
        this.logger.warn(
          'Failed to delete cache entry from database',
          { component: 'ContextCache', operation: 'delete', cacheKey },
          error instanceof Error ? error : undefined
        );
      }
    }

    return removed;
  }

  /**
   * Delete entries by bundleId (used when cleaning up materialized bundles)
   */
  deleteByBundleId(bundleId: string): boolean {
    let removed = false;

    // Remove from memory cache
    for (const [key, entry] of this.cache) {
      if (entry.bundleId === bundleId) {
        this.cache.delete(key);
        this.bundleData.delete(key);
        removed = true;
        break; // bundle_id is unique
      }
    }

    // Always attempt to delete matching rows from database, even if not in memory
    if (this.persistToDb && this.db) {
      try {
        const result = this.db.getConnection().prepare(
          'DELETE FROM context_bundle_cache WHERE bundle_id = ?'
        ).run(bundleId);
        if (result.changes > 0) {
          removed = true;
        }
      } catch (error) {
        this.logger.warn(
          'Failed to delete bundle by id from database',
          { component: 'ContextCache', operation: 'deleteByBundleId', bundleId },
          error instanceof Error ? error : undefined
        );
      }
    }

    return removed;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.bundleData.clear();
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
    // Sort entries by access sequence (oldest first) for stable LRU ordering
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => {
        const seqA = a[1].accessSequence || 0;
        const seqB = b[1].accessSequence || 0;
        return seqA - seqB;
      });

    let freedBytes = 0;

    for (const [key, entry] of entries) {
      this.cache.delete(key);
      this.bundleData.delete(key);
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
      entry.accessSequence = ++this.accessSequence;

      // Update database if persistence is enabled
      if (this.persistToDb && this.db) {
        try {
          this.db.getConnection().prepare(`
            UPDATE context_bundle_cache
            SET hit_count = hit_count + 1,
                last_accessed_at = ?
            WHERE cache_key = ?
          `).run(entry.lastAccessedAt.toISOString(), cacheKey);
        } catch (error) {
          this.logger.warn('Failed to update access time in database', { component: 'ContextCache', operation: 'updateAccessTime', cacheKey }, error instanceof Error ? error : undefined);
        }
      }
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
   * Get current git commit hash
   */
  private async getCurrentGitCommit(): Promise<string> {
    try {
      const { execSync } = await import('child_process');

      // Use strict options with timeout and safe working directory
      const hash = execSync('git rev-parse HEAD', {
        encoding: 'utf-8',
        timeout: 5000, // 5 second timeout
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 1024, // Limit output size
        stdio: ['ignore', 'pipe', 'pipe'] // Don't inherit stdio
      }).trim();

      // Validate git hash format (40 hex characters or 7+ for short hash)
      if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
        this.logger.warn('Invalid git hash format received, using timestamp fallback', { component: 'ContextCache', operation: 'getCurrentGitCommit' });
        return `timestamp-${Date.now()}`;
      }

      return hash;
    } catch (error) {
      this.logger.warn('Failed to get git commit hash', { component: 'ContextCache', operation: 'getCurrentGitCommit' }, error instanceof Error ? error : undefined);
      // Fallback to timestamp if git not available
      return `timestamp-${Date.now()}`;
    }
  }

  /**
   * Create a sorted copy of an array without mutating the original
   * Optimized to check if already sorted first
   */
  private sortedCopy(arr?: string[]): string[] {
    if (!arr || arr.length === 0) {
      return [];
    }

    // Check if already sorted
    let isSorted = true;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) {
        isSorted = false;
        break;
      }
    }

    // Return copy if already sorted, otherwise sort a copy
    return isSorted ? [...arr] : [...arr].sort();
  }

  /**
   * Hash object to string
   * Uses SHA-256 with 32 hex characters (128 bits) for collision resistance
   */
  private hashObject(obj: unknown): string {
    const str = JSON.stringify(obj);
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 32);
  }

  /**
   * Load cache entry and bundle from database
   */
  private async loadFromDb(cacheKey: string): Promise<{ entry: BundleCacheEntry; bundle: ContextBundle } | null> {
    // Check if database is available
    if (!this.persistToDb || !this.db) {
      return null;
    }

    try {
      // Validate cache key before use to prevent SQL injection
      if (!/^[a-zA-Z0-9-]+$/.test(cacheKey) || cacheKey.length > 255) {
        this.logger.warn('Invalid cache key format in loadFromDb', { component: 'ContextCache', operation: 'loadFromDb', cacheKey });
        return null;
      }

      const row = this.db.getConnection().prepare(`
        SELECT
          bundle_id,
          cache_key,
          task_type,
          profiles,
          mount_path,
          size_bytes,
          created_at,
          expires_at,
          hit_count,
          last_accessed_at,
          bundle_data
        FROM context_bundle_cache
        WHERE cache_key = ?
      `).get(cacheKey) as DbCacheRow | undefined;

      if (!row) {
        return null;
      }

      // Check if entry is expired
      const expiresAt = row.expires_at ? new Date(row.expires_at) : undefined;
      if (expiresAt && expiresAt < new Date()) {
        // Delete expired entry
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      // Parse profiles JSON with validation
      let profiles: string[];
      try {
        profiles = JSON.parse(row.profiles);
        if (!Array.isArray(profiles)) {
          throw new Error('Profiles must be an array');
        }
      } catch (parseError) {
        this.logger.error('Failed to parse profiles JSON from database', { component: 'ContextCache', operation: 'loadFromDb', cacheKey }, parseError instanceof Error ? parseError : undefined);
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      // Parse stored data
      const entry: BundleCacheEntry = {
        bundleId: row.bundle_id,
        cacheKey: row.cache_key,
        taskType: row.task_type,
        profiles,
        mountPath: row.mount_path,
        sizeBytes: row.size_bytes,
        createdAt: new Date(row.created_at),
        expiresAt,
        hitCount: row.hit_count,
        lastAccessedAt: new Date(row.last_accessed_at),
        accessSequence: ++this.accessSequence
      } as BundleCacheEntry;

      // Parse and validate bundle data
      let bundle: unknown;
      try {
        bundle = JSON.parse(row.bundle_data);
      } catch (parseError) {
        this.logger.error('Failed to parse bundle JSON from database', { component: 'ContextCache', operation: 'loadFromDb', cacheKey }, parseError instanceof Error ? parseError : undefined);
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      // Validate bundle structure with type guard
      if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
        this.logger.error('Invalid bundle structure in database', { component: 'ContextCache', operation: 'loadFromDb', cacheKey });
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      const bundleObj = bundle as Record<string, unknown>;
      if (!bundleObj.id || !bundleObj.metadata || !bundleObj.profileContents) {
        this.logger.error('Invalid bundle structure in database', { component: 'ContextCache', operation: 'loadFromDb', cacheKey });
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      // Validate metadata
      const metadata = bundleObj.metadata as Record<string, unknown>;
      if (!metadata.bundleId || !metadata.taskType ||
          !Array.isArray(metadata.profiles)) {
        this.logger.error('Invalid bundle metadata', { component: 'ContextCache', operation: 'loadFromDb', cacheKey });
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      // Convert date strings back to Date objects with validation
      try {
        metadata.createdAt = new Date(metadata.createdAt as string);
        if (isNaN((metadata.createdAt as Date).getTime())) {
          throw new Error('Invalid createdAt date');
        }

        if (metadata.expiresAt) {
          metadata.expiresAt = new Date(metadata.expiresAt as string);
          if (isNaN((metadata.expiresAt as Date).getTime())) {
            throw new Error('Invalid expiresAt date');
          }
        }

        const profileContents = bundleObj.profileContents as Record<string, unknown>;
        for (const [profileName, profileContent] of Object.entries(profileContents)) {
          const content = profileContent as Record<string, unknown>;
          if (!content.generatedAt) {
            throw new Error(`Missing generatedAt for profile ${profileName}`);
          }
          content.generatedAt = new Date(content.generatedAt as string);
          if (isNaN((content.generatedAt as Date).getTime())) {
            throw new Error(`Invalid generatedAt for profile ${profileName}`);
          }
        }
      } catch (dateError) {
        this.logger.error('Failed to parse dates from bundle', { component: 'ContextCache', operation: 'loadFromDb', cacheKey }, dateError instanceof Error ? dateError : undefined);
        this.db.getConnection().prepare('DELETE FROM context_bundle_cache WHERE cache_key = ?').run(cacheKey);
        return null;
      }

      return { entry, bundle: bundleObj as unknown as ContextBundle };
    } catch (error) {
      this.logger.error('Failed to load bundle from database', { component: 'ContextCache', operation: 'loadFromDb', cacheKey }, error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Save cache entry and bundle to database
   */
  private async saveToDb(entry: BundleCacheEntry, bundle: ContextBundle): Promise<void> {
    // Check if database is available
    if (!this.persistToDb || !this.db) {
      return;
    }

    try {
      const stmt = this.db.getConnection().prepare(`
        INSERT OR REPLACE INTO context_bundle_cache (
          bundle_id,
          cache_key,
          task_type,
          profiles,
          mount_path,
          size_bytes,
          created_at,
          expires_at,
          hit_count,
          last_accessed_at,
          bundle_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.bundleId,
        entry.cacheKey,
        entry.taskType,
        JSON.stringify(entry.profiles),
        entry.mountPath,
        entry.sizeBytes,
        entry.createdAt.toISOString(),
        entry.expiresAt?.toISOString() ?? null,
        entry.hitCount,
        entry.lastAccessedAt.toISOString(),
        JSON.stringify(bundle)
      );
    } catch (error) {
      this.logger.error('Failed to save bundle to database', { component: 'ContextCache', operation: 'saveToDb', cacheKey: entry.cacheKey }, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Clean up expired entries from database
   */
  async cleanupExpiredEntries(): Promise<number> {
    // Check if database is available
    if (!this.persistToDb || !this.db) {
      return 0;
    }

    try {
      const result = this.db.getConnection().prepare(`
        DELETE FROM context_bundle_cache
        WHERE expires_at IS NOT NULL AND expires_at < ?
      `).run(new Date().toISOString());

      if (result.changes > 0) {
        this.logger.info(`Cleaned up ${result.changes} expired cache entries`, { component: 'ContextCache', operation: 'cleanupExpiredEntries', deletedCount: result.changes });
      }

      return result.changes;
    } catch (error) {
      this.logger.error('Failed to cleanup expired entries', { component: 'ContextCache', operation: 'cleanupExpiredEntries' }, error instanceof Error ? error : undefined);
      return 0;
    }
  }

  /**
   * Shutdown cleanup and close resources
   * Waits for any in-progress cleanup to complete before clearing
   */
  async destroy(): Promise<void> {
    // Stop the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Wait for any in-progress cleanup to finish
    while (this.cleanupInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear all caches
    this.clear();
  }
}
