import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

// Mock Socket.IO
export const createMockSocket = () => {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();

  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)?.push(handler);
    }),
    off: vi.fn((event: string, handler?: (...args: any[]) => void) => {
      if (handler) {
        const handlers = listeners.get(event) || [];
        listeners.set(event, handlers.filter(h => h !== handler));
      } else {
        listeners.delete(event);
      }
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach(handler => handler(...args));
    }),
    close: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    connected: false,
    _listeners: listeners, // For testing purposes
    _trigger: (event: string, ...args: any[]) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach(handler => handler(...args));
    }
  };
};

// Custom render function that can wrap with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add any provider options here if needed
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  return render(ui, { ...options });
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
export { renderWithProviders as render };
