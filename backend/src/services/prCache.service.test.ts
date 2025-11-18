/**
 * PR Cache Service Tests
 *
 * Comprehensive test suite for PRCacheService
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PRCacheService, getPRStatusCache, resetPRStatusCache } from './prCache.service.js';

interface TestPRData {
  number: number;
  title: string;
  status: string;
}

describe('PRCacheService', () => {
  let cache: PRCacheService<TestPRData>;
  
  beforeEach(() => {
    cache = new PRCacheService<TestPRData>({ ttlMs: 1000, debug: false });
  });
  
  afterEach(() => {
    cache.clear();
    cache.removeAllListeners();
  });
  
  describe('Basic Operations', () => {
    it('should cache and retrieve data', () => {
      const prData: TestPRData = { number: 123, title: 'Test PR', status: 'open' };
      
      cache.set(123, prData);
      const retrieved = cache.get(123);
      
      expect(retrieved).toEqual(prData);
    });
    
    it('should return null for non-existent entry', () => {
      const result = cache.get(999);
      expect(result).toBeNull();
    });
    
    it('should invalidate specific entry', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      expect(cache.has(123)).toBe(true);
      
      cache.invalidate(123);
      expect(cache.has(123)).toBe(false);
    });
    
    it('should clear all entries', () => {
      cache.set(123, { number: 123, title: 'Test 1', status: 'open' });
      cache.set(456, { number: 456, title: 'Test 2', status: 'closed' });
      
      expect(cache.size()).toBe(2);
      
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });
  
  describe('TTL and Expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new PRCacheService<TestPRData>({ ttlMs: 50 });
      
      shortTtlCache.set(123, { number: 123, title: 'Test', status: 'open' });
      expect(shortTtlCache.has(123)).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(shortTtlCache.has(123)).toBe(false);
      shortTtlCache.clear();
    });
    
    it('should not return expired entries', async () => {
      const shortTtlCache = new PRCacheService<TestPRData>({ ttlMs: 50 });
      
      shortTtlCache.set(123, { number: 123, title: 'Test', status: 'open' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = shortTtlCache.get(123);
      expect(result).toBeNull();
      shortTtlCache.clear();
    });
    
    it('should cleanup expired entries', async () => {
      const shortTtlCache = new PRCacheService<TestPRData>({ ttlMs: 50 });
      
      shortTtlCache.set(123, { number: 123, title: 'Test 1', status: 'open' });
      shortTtlCache.set(456, { number: 456, title: 'Test 2', status: 'open' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const removed = shortTtlCache.cleanup();
      expect(removed).toBe(2);
      expect(shortTtlCache.size()).toBe(0);
      shortTtlCache.clear();
    });
  });
  
  describe('getOrFetch', () => {
    it('should fetch on cache miss', async () => {
      const fetchFn = vi.fn(async () => ({
        number: 123,
        title: 'Fetched PR',
        status: 'open'
      }));
      
      const result = await cache.getOrFetch(123, fetchFn);
      
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result.title).toBe('Fetched PR');
    });
    
    it('should not fetch on cache hit', async () => {
      cache.set(123, { number: 123, title: 'Cached PR', status: 'open' });
      
      const fetchFn = vi.fn(async () => ({
        number: 123,
        title: 'Fetched PR',
        status: 'open'
      }));
      
      const result = await cache.getOrFetch(123, fetchFn);
      
      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.title).toBe('Cached PR');
    });
    
    it('should cache fetched data', async () => {
      const fetchFn = async () => ({
        number: 123,
        title: 'Fetched PR',
        status: 'open'
      });
      
      await cache.getOrFetch(123, fetchFn);
      
      expect(cache.has(123)).toBe(true);
      const cached = cache.get(123);
      expect(cached?.title).toBe('Fetched PR');
    });
  });
  
  describe('LRU Eviction', () => {
    it('should evict oldest entry when maxEntries reached', () => {
      const smallCache = new PRCacheService<TestPRData>({ maxEntries: 2 });
      
      smallCache.set(1, { number: 1, title: 'PR 1', status: 'open' });
      smallCache.set(2, { number: 2, title: 'PR 2', status: 'open' });
      smallCache.set(3, { number: 3, title: 'PR 3', status: 'open' });
      
      expect(smallCache.size()).toBe(2);
      expect(smallCache.has(1)).toBe(false); // Oldest evicted
      expect(smallCache.has(2)).toBe(true);
      expect(smallCache.has(3)).toBe(true);
      smallCache.clear();
    });
  });
  
  describe('Statistics', () => {
    it('should track cache hits', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      
      cache.get(123);
      cache.get(123);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });
    
    it('should track cache misses', () => {
      cache.get(999);
      cache.get(888);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
    });
    
    it('should calculate hit rate', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      
      cache.get(123); // hit
      cache.get(123); // hit
      cache.get(999); // miss
      
      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });
    
    it('should reset statistics', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      cache.get(123);
      cache.get(999);
      
      cache.resetStats();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
  
  describe('Events', () => {
    it('should emit "hit" event on cache hit', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      
      return new Promise<void>((resolve) => {
        cache.on('hit', (prNumber) => {
          expect(prNumber).toBe(123);
          resolve();
        });
        
        cache.get(123);
      });
    });
    
    it('should emit "miss" event on cache miss', () => {
      return new Promise<void>((resolve) => {
        cache.on('miss', (prNumber) => {
          expect(prNumber).toBe(999);
          resolve();
        });
        
        cache.get(999);
      });
    });
    
    it('should emit "set" event when entry is cached', () => {
      return new Promise<void>((resolve) => {
        cache.on('set', (prNumber) => {
          expect(prNumber).toBe(123);
          resolve();
        });
        
        cache.set(123, { number: 123, title: 'Test', status: 'open' });
      });
    });
    
    it('should emit "invalidated" event on invalidation', () => {
      cache.set(123, { number: 123, title: 'Test', status: 'open' });
      
      return new Promise<void>((resolve) => {
        cache.on('invalidated', (prNumber) => {
          expect(prNumber).toBe(123);
          resolve();
        });
        
        cache.invalidate(123);
      });
    });
    
    it('should emit "cleared" event on clear', () => {
      cache.set(123, { number: 123, title: 'Test 1', status: 'open' });
      cache.set(456, { number: 456, title: 'Test 2', status: 'open' });
      
      return new Promise<void>((resolve) => {
        const listener = (count: number) => {
          expect(count).toBe(2);
          cache.off('cleared', listener);
          resolve();
        };
        cache.on('cleared', listener);
        
        cache.clear();
      });
    });
  });
  
  describe('invalidateMany', () => {
    it('should invalidate multiple entries at once', () => {
      cache.set(1, { number: 1, title: 'PR 1', status: 'open' });
      cache.set(2, { number: 2, title: 'PR 2', status: 'open' });
      cache.set(3, { number: 3, title: 'PR 3', status: 'open' });
      
      cache.invalidateMany([1, 3]);
      
      expect(cache.has(1)).toBe(false);
      expect(cache.has(2)).toBe(true);
      expect(cache.has(3)).toBe(false);
    });
  });
  
  describe('Singleton Pattern', () => {
    afterEach(() => {
      resetPRStatusCache();
    });
    
    it('should return same instance on multiple calls', () => {
      const instance1 = getPRStatusCache();
      const instance2 = getPRStatusCache();
      
      expect(instance1).toBe(instance2);
    });
    
    it('should share state across instances', () => {
      const instance1 = getPRStatusCache();
      instance1.set(123, { number: 123, title: 'Test', status: 'open' });
      
      const instance2 = getPRStatusCache();
      expect(instance2.has(123)).toBe(true);
    });
    
    it('should reset singleton instance', () => {
      const instance1 = getPRStatusCache();
      instance1.set(123, { number: 123, title: 'Test', status: 'open' });
      
      resetPRStatusCache();
      
      const instance2 = getPRStatusCache();
      expect(instance2.has(123)).toBe(false);
      expect(instance2).not.toBe(instance1);
    });
  });
});
