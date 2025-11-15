/**
 * Context Collector
 *
 * Automatically captures environmental context for log entries.
 * Singleton pattern ensures consistent context across the application.
 */

import type { LogContext, LogMetadata } from './types';

export class ContextCollector {
  private static instance: ContextCollector;
  private sessionId: string;
  private tabId: string;
  private customContext: Record<string, unknown> = {};

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.tabId = this.generateTabId();
    this.initializeContextTracking();
  }

  static getInstance(): ContextCollector {
    if (!ContextCollector.instance) {
      ContextCollector.instance = new ContextCollector();
    }
    return ContextCollector.instance;
  }

  /**
   * Generate a unique session ID (persists across page reloads)
   */
  private generateSessionId(): string {
    const storageKey = 'app-monitor:session-id';
    let sessionId = sessionStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
  }

  /**
   * Generate a unique tab ID (unique per tab/window)
   */
  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize context tracking (route changes, etc.)
   */
  private initializeContextTracking(): void {
    // Track route changes
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.customContext.previousRoute = this.customContext.route;
        this.customContext.route = window.location.pathname;
      });
    }
  }

  /**
   * Collect current context for a log entry
   */
  collect(): LogContext {
    const route = typeof window !== 'undefined' ? window.location.pathname : '';
    const queryParams = typeof window !== 'undefined' ? this.parseQueryParams() : {};
    const hash = typeof window !== 'undefined' ? window.location.hash : '';

    return {
      sessionId: this.sessionId,
      tabId: this.tabId,
      route,
      previousRoute: this.customContext.previousRoute as string | undefined,
      queryParams,
      hash: hash || undefined,
      ...this.customContext,
    };
  }

  /**
   * Collect metadata about the environment
   */
  collectMetadata(): LogMetadata {
    const metadata: LogMetadata = {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      viewport: this.getViewport(),
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    };

    // Add memory info if available (Chrome only)
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }).memory;

      if (memory) {
        metadata.memory = {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
        };
      }
    }

    // Add performance timing if available
    if (typeof performance !== 'undefined' && performance.timing) {
      const timing = performance.timing;
      metadata.performance = {
        navigationStart: timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      };
    }

    // Add build info from environment
    if (import.meta.env.VITE_BUILD_TIMESTAMP) {
      metadata.buildTimestamp = import.meta.env.VITE_BUILD_TIMESTAMP as string;
    }
    if (import.meta.env.VITE_COMMIT_HASH) {
      metadata.commitHash = import.meta.env.VITE_COMMIT_HASH as string;
    }
    if (import.meta.env.VITE_APP_VERSION) {
      metadata.version = import.meta.env.VITE_APP_VERSION as string;
    }

    return metadata;
  }

  /**
   * Set custom context that will be included in all future logs
   */
  setContext(key: string, value: unknown): void {
    this.customContext[key] = value;
  }

  /**
   * Remove custom context
   */
  removeContext(key: string): void {
    delete this.customContext[key];
  }

  /**
   * Clear all custom context
   */
  clearContext(): void {
    this.customContext = {};
  }

  /**
   * Get current route
   */
  getCurrentRoute(): string {
    return typeof window !== 'undefined' ? window.location.pathname : '';
  }

  /**
   * Set user information
   */
  setUser(userId?: string, userEmail?: string): void {
    if (userId) {
      this.customContext.userId = userId;
    }
    if (userEmail) {
      this.customContext.userEmail = userEmail;
    }
  }

  /**
   * Clear user information
   */
  clearUser(): void {
    delete this.customContext.userId;
    delete this.customContext.userEmail;
  }

  /**
   * Set store state snapshot (called by store middleware)
   */
  setStoreState(state: Record<string, unknown>): void {
    this.customContext.storeState = this.sanitizeState(state);
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get tab ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Parse query parameters from URL
   */
  private parseQueryParams(): Record<string, string> {
    if (typeof window === 'undefined') {
      return {};
    }

    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(window.location.search);

    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return params;
  }

  /**
   * Get viewport dimensions
   */
  private getViewport(): { width: number; height: number } {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * Sanitize state to remove sensitive data and circular references
   */
  private sanitizeState(state: Record<string, unknown>): Record<string, unknown> {
    try {
      // Create a shallow copy and remove sensitive fields
      const sanitized = { ...state };

      // Remove common sensitive field names
      const sensitiveKeys = [
        'password',
        'token',
        'apiKey',
        'secret',
        'authorization',
        'credential',
        'ssn',
        'creditCard',
      ];

      const removeSensitive = (obj: Record<string, unknown>): void => {
        Object.keys(obj).forEach((key) => {
          const lowerKey = key.toLowerCase();
          if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
            obj[key] = '[REDACTED]';
            return;
          }

          // Recursively sanitize nested objects (but limit depth to prevent performance issues)
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            removeSensitive(obj[key] as Record<string, unknown>);
          }
        });
      };

      removeSensitive(sanitized);
      return sanitized;
    } catch {
      return { error: 'Failed to sanitize state' };
    }
  }
}
