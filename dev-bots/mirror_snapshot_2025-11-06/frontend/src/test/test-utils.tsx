import { ReactElement } from "react";
import { render, RenderOptions, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import userEvent from "@testing-library/user-event";

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
        listeners.set(
          event,
          handlers.filter((h) => h !== handler),
        );
      } else {
        listeners.delete(event);
      }
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    }),
    close: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    connected: false,
    _listeners: listeners, // For testing purposes
    _trigger: (event: string, ...args: any[]) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
  };
};

// Mock API Client
const API_CLIENT_SYMBOL = "__APP_MONITOR_API_CLIENT__";

export const createMockApiClient = () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  (globalThis as Record<string, unknown>)[API_CLIENT_SYMBOL] = mockApi;
  return mockApi;
};

// Mock WebSocket
export const createMockWebSocket = () => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: WebSocket.OPEN,
  CONNECTING: WebSocket.CONNECTING,
  OPEN: WebSocket.OPEN,
  CLOSING: WebSocket.CLOSING,
  CLOSED: WebSocket.CLOSED,
});

// Mock localStorage
export const createMockLocalStorage = () => {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    length: 0,
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};

// Mock sessionStorage
export const createMockSessionStorage = () => {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    length: 0,
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};

// Mock fetch
export const createMockFetch = (responses: Record<string, any> = {}) => {
  const mockFetch = vi.fn();

  Object.entries(responses).forEach(([, response]) => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
        status: 200,
        statusText: "OK",
      }),
    );
  });

  // Default response for unmatched URLs
  mockFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
      status: 200,
      statusText: "OK",
    }),
  );

  return mockFetch;
};

// Custom render function that can wrap with providers
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  // Add any provider options here if needed
  initialRoute?: string;
  mockSocket?: ReturnType<typeof createMockSocket>;
  mockApiClient?: ReturnType<typeof createMockApiClient>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions,
) {
  return render(ui, { ...options });
}

// Test data generators
export const generateMockService = (overrides: Partial<any> = {}) => ({
  id: "test-service-1",
  name: "test-service",
  status: "running",
  port: 3000,
  pid: 12345,
  startTime: "2025-01-27T14:00:00.000Z",
  restartCount: 0,
  lastRestart: null,
  health: {
    status: "healthy",
    lastCheck: "2025-01-27T14:13:57.000Z",
    responseTime: 50,
  },
  logs: {
    enabled: true,
    level: "info",
    lastEntry: "2025-01-27T14:13:57.000Z",
  },
  config: {
    autoRestart: true,
    maxRestarts: 3,
    restartDelay: 5000,
  },
  ...overrides,
});

export const generateMockLogEntry = (overrides: Partial<any> = {}) => ({
  id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  timestamp: new Date().toISOString(),
  level: "INFO",
  message: "Test log message",
  service: "test-service",
  source: "stdout",
  metadata: {},
  ...overrides,
});

export const generateMockPortInfo = (overrides: Partial<any> = {}) => ({
  port: 3000,
  pid: 12345,
  inUse: true,
  processName: "node",
  command: "node server.js",
  startTime: "2025-01-27T14:00:00.000Z",
  ...overrides,
});

// Test helpers
export const waitForElementToBeRemoved = async (element: HTMLElement) => {
  await waitFor(() => {
    expect(element).not.toBeInTheDocument();
  });
};

export const waitForTextToDisappear = async (text: string) => {
  await waitFor(() => {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });
};

export const waitForLoadingToFinish = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
};

// User event helpers
export const createUser = () => userEvent.setup();

export const clickElement = async (element: HTMLElement) => {
  const user = createUser();
  await user.click(element);
};

export const typeInElement = async (element: HTMLElement, text: string) => {
  const user = createUser();
  await user.type(element, text);
};

export const clearElement = async (element: HTMLElement) => {
  const user = createUser();
  await user.clear(element);
};

// Assertion helpers
export const expectElementToHaveText = (element: HTMLElement, text: string) => {
  expect(element).toHaveTextContent(text);
};

export const expectElementToHaveClass = (
  element: HTMLElement,
  className: string,
) => {
  expect(element).toHaveClass(className);
};

export const expectElementToHaveAttribute = (
  element: HTMLElement,
  attribute: string,
  value?: string,
) => {
  if (value) {
    expect(element).toHaveAttribute(attribute, value);
  } else {
    expect(element).toHaveAttribute(attribute);
  }
};

// Mock environment helpers
export const mockEnvironment = (env: Record<string, string>) => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...env };

  return () => {
    process.env = originalEnv;
  };
};

// Test cleanup helpers
export const cleanupMocks = () => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
};

// Re-export everything from @testing-library/react
export * from "@testing-library/react";
export { renderWithProviders as render };
