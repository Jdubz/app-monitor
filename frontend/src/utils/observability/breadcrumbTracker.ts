/**
 * Breadcrumb Tracker
 *
 * Automatically tracks user actions and events to provide context
 * for debugging. Maintains a rolling buffer of breadcrumbs.
 */

import type { Breadcrumb } from './types';

const MAX_BREADCRUMBS = 100;

export class BreadcrumbTracker {
  private static instance: BreadcrumbTracker;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number = MAX_BREADCRUMBS;

  private constructor() {
    this.initializeTracking();
  }

  static getInstance(): BreadcrumbTracker {
    if (!BreadcrumbTracker.instance) {
      BreadcrumbTracker.instance = new BreadcrumbTracker();
    }
    return BreadcrumbTracker.instance;
  }

  /**
   * Initialize automatic breadcrumb tracking
   */
  private initializeTracking(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Track navigation
    this.trackNavigation();

    // Track clicks
    this.trackClicks();

    // Track console logs (wrap console methods)
    this.trackConsole();

    // Track fetch/XHR
    this.trackNetworkRequests();

    // Track errors
    this.trackErrors();
  }

  /**
   * Add a manual breadcrumb
   */
  add(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    const fullBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    };

    this.breadcrumbs.push(fullBreadcrumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Get recent breadcrumbs (last N)
   */
  getRecent(count: number = 10): Breadcrumb[] {
    return this.breadcrumbs.slice(-count);
  }

  /**
   * Get all breadcrumbs
   */
  getAll(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear all breadcrumbs
   */
  clear(): void {
    this.breadcrumbs = [];
  }

  /**
   * Set maximum breadcrumbs to keep
   */
  setMaxBreadcrumbs(max: number): void {
    this.maxBreadcrumbs = max;
    if (this.breadcrumbs.length > max) {
      this.breadcrumbs = this.breadcrumbs.slice(-max);
    }
  }

  /**
   * Track navigation events
   */
  private trackNavigation(): void {
    // Track initial page load
    this.add({
      category: 'navigation',
      message: `Page loaded: ${window.location.pathname}`,
      data: {
        url: window.location.href,
        referrer: document.referrer,
      },
    });

    // Track popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      this.add({
        category: 'navigation',
        message: `Navigated to: ${window.location.pathname}`,
        data: {
          url: window.location.href,
          trigger: 'popstate',
        },
      });
    });

    // Track hash changes
    window.addEventListener('hashchange', (event) => {
      this.add({
        category: 'navigation',
        message: 'Hash changed',
        data: {
          oldURL: event.oldURL,
          newURL: event.newURL,
        },
      });
    });
  }

  /**
   * Track click events
   */
  private trackClicks(): void {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const elementPath = this.getElementPath(target);
        const elementText = this.getElementText(target);

        this.add({
          category: 'click',
          message: `Clicked: ${elementPath}`,
          data: {
            tag: target.tagName.toLowerCase(),
            id: target.id || undefined,
            class: target.className || undefined,
            text: elementText,
            x: event.clientX,
            y: event.clientY,
          },
        });
      },
      { capture: true, passive: true }
    );
  }

  /**
   * Track console logs
   */
  private trackConsole(): void {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    console.log = (...args: unknown[]) => {
      this.add({
        category: 'console',
        message: `console.log: ${this.formatArgs(args)}`,
        level: 'debug',
        data: { args },
      });
      originalConsole.log(...args);
    };

    console.warn = (...args: unknown[]) => {
      this.add({
        category: 'console',
        message: `console.warn: ${this.formatArgs(args)}`,
        level: 'warn',
        data: { args },
      });
      originalConsole.warn(...args);
    };

    console.error = (...args: unknown[]) => {
      this.add({
        category: 'console',
        message: `console.error: ${this.formatArgs(args)}`,
        level: 'error',
        data: { args },
      });
      originalConsole.error(...args);
    };
  }

  /**
   * Track network requests
   */
  private trackNetworkRequests(): void {
    // Wrap fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = config?.method || 'GET';

      const startTime = Date.now();

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;

        this.add({
          category: 'api',
          message: `${method} ${url} → ${response.status}`,
          level: response.ok ? 'info' : 'warn',
          data: {
            url,
            method,
            status: response.status,
            statusText: response.statusText,
            duration,
          },
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;

        this.add({
          category: 'api',
          message: `${method} ${url} → Failed`,
          level: 'error',
          data: {
            url,
            method,
            duration,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        throw error;
      }
    };

    // Wrap XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string, ...args: unknown[]) {
      (this as XMLHttpRequest & { _breadcrumbData?: { method: string; url: string; startTime: number } })._breadcrumbData = {
        method,
        url,
        startTime: Date.now(),
      };
      return originalOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function (...args: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhr = this;
      const breadcrumbData = (xhr as XMLHttpRequest & {
        _breadcrumbData?: { method: string; url: string; startTime: number };
      })._breadcrumbData;

      if (breadcrumbData) {
        xhr.addEventListener('load', () => {
          const duration = Date.now() - breadcrumbData.startTime;

          BreadcrumbTracker.getInstance().add({
            category: 'api',
            message: `${breadcrumbData.method} ${breadcrumbData.url} → ${xhr.status}`,
            level: xhr.status >= 200 && xhr.status < 300 ? 'info' : 'warn',
            data: {
              url: breadcrumbData.url,
              method: breadcrumbData.method,
              status: xhr.status,
              statusText: xhr.statusText,
              duration,
            },
          });
        });

        xhr.addEventListener('error', () => {
          const duration = Date.now() - breadcrumbData.startTime;

          BreadcrumbTracker.getInstance().add({
            category: 'api',
            message: `${breadcrumbData.method} ${breadcrumbData.url} → Failed`,
            level: 'error',
            data: {
              url: breadcrumbData.url,
              method: breadcrumbData.method,
              duration,
            },
          });
        });
      }

      return originalSend.apply(xhr, args);
    };
  }

  /**
   * Track unhandled errors
   */
  private trackErrors(): void {
    window.addEventListener('error', (event) => {
      this.add({
        category: 'console',
        message: `Unhandled error: ${event.message}`,
        level: 'error',
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack,
          } : undefined,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.add({
        category: 'console',
        message: `Unhandled promise rejection: ${event.reason}`,
        level: 'error',
        data: {
          reason: event.reason instanceof Error ? {
            name: event.reason.name,
            message: event.reason.message,
            stack: event.reason.stack,
          } : event.reason,
        },
      });
    });
  }

  /**
   * Get element path (CSS selector-like string)
   */
  private getElementPath(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break; // ID is unique, no need to go further
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2);
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Get truncated text content from element
   */
  private getElementText(element: HTMLElement): string | undefined {
    const text = element.textContent?.trim();
    if (!text) {
      return undefined;
    }

    const maxLength = 50;
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }

  /**
   * Format console arguments for breadcrumb message
   */
  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') {
          return arg;
        }
        if (arg instanceof Error) {
          return arg.message;
        }
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ')
      .substring(0, 100); // Truncate to avoid huge breadcrumb messages
  }
}
