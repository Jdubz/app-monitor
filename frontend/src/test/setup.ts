import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { TextEncoder, TextDecoder } from 'util'
import { createConfiguredMockApiClient, installMockApiClient } from './api-mocks'

if (!(globalThis as { TextEncoder?: typeof TextEncoder }).TextEncoder) {
  (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder
}

if (!(globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder) {
  (globalThis as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder as unknown as typeof TextDecoder
}
// Mock Socket.IO
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    connected: false,
  })),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.alert
global.alert = vi.fn();

// Mock window.confirm
global.confirm = vi.fn();

// Mock window.prompt
global.prompt = vi.fn();

// Mock window.location with proper defaults for BrowserRouter
delete (window as unknown as { location?: unknown }).location;
(window as unknown as { location: Location }).location = {
  href: 'http://localhost:3000/',
  origin: 'http://localhost:3000',
  protocol: 'http:',
  host: 'localhost:3000',
  hostname: 'localhost',
  port: '3000',
  pathname: '/',
  search: '',
  hash: '',
  reload: vi.fn(),
  assign: vi.fn(),
  replace: vi.fn(),
  toString: () => 'http://localhost:3000/',
  ancestorOrigins: {} as DOMStringList,
} as Location;

// Mock window.history
Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock EventSource for SSE (Server-Sent Events)
class MockEventSource {
  url: string;
  withCredentials: boolean;
  readyState: number;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  constructor(url: string, config?: EventSourceInit) {
    this.url = url;
    this.withCredentials = config?.withCredentials ?? false;
    this.readyState = MockEventSource.CONNECTING;
    this.onmessage = null;
    this.onerror = null;
    this.onopen = null;
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockEventSource.CLOSED;
  });
  dispatchEvent = vi.fn();
}

global.EventSource = MockEventSource as unknown as typeof EventSource;

// Mock MutationObserver
global.MutationObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(),
}));

// Mock HTMLCanvasElement.getContext for xterm.js
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: [] })),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  font: '',
  textAlign: '',
  textBaseline: '',
  globalAlpha: 1,
  globalCompositeOperation: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: '',
  lineJoin: '',
  miterLimit: 0,
  shadowBlur: 0,
  shadowColor: '',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  canvas: null,
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0));
global.cancelAnimationFrame = vi.fn();

// Mock performance.now
Object.defineProperty(performance, 'now', {
  writable: true,
  value: vi.fn(() => Date.now()),
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock process.env for Vite
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE_URL: 'http://localhost:5000',
    VITE_FEATURE_DEV_BOTS_LAYOUT: 'true',
    VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB: 'true',
    NODE_ENV: 'test',
  },
  writable: true,
});

const resetGlobalApiClientMock = () => {
  installMockApiClient(createConfiguredMockApiClient())
}

resetGlobalApiClientMock()

// Setup test environment
beforeEach(() => {
  resetGlobalApiClientMock()
  // Clear all mocks before each test
  vi.clearAllMocks();
  
  // Reset localStorage and sessionStorage
  localStorageMock.clear();
  sessionStorageMock.clear();
  
  // Reset fetch mock
  vi.mocked(fetch).mockClear();
  
  // Reset console mocks
  vi.mocked(console.log).mockClear();
  vi.mocked(console.debug).mockClear();
  vi.mocked(console.info).mockClear();
  vi.mocked(console.warn).mockClear();
  vi.mocked(console.error).mockClear();
});

afterEach(() => {
  // Clean up after each test
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
