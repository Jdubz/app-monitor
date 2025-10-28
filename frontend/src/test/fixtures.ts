// Test fixtures for frontend tests
import type { Service, PortStatus, Script, ScriptExecution, ScriptExecutionSummary, HealthCheckResponse } from '@jsdubzw/job-finder-shared-types';

export const mockHealthCheckResponse: HealthCheckResponse = {
  status: 'healthy',
  timestamp: '2025-01-27T14:13:57.000Z',
  uptime: 3600
};

export const mockServices: Service[] = [
  {
    id: 'test-service-1',
    name: 'test-service',
    status: 'running',
    port: 3000,
    pid: 12345,
    startTime: '2025-01-27T14:00:00.000Z',
    restartCount: 0,
    lastRestart: null,
    health: {
      status: 'healthy',
      lastCheck: '2025-01-27T14:13:57.000Z',
      responseTime: 50
    },
    logs: {
      enabled: true,
      level: 'info',
      lastEntry: '2025-01-27T14:13:57.000Z'
    },
    config: {
      autoRestart: true,
      maxRestarts: 3,
      restartDelay: 5000
    }
  },
  {
    id: 'test-service-2',
    name: 'another-service',
    status: 'stopped',
    port: 3001,
    pid: null,
    startTime: null,
    restartCount: 2,
    lastRestart: '2025-01-27T14:10:00.000Z',
    health: {
      status: 'unhealthy',
      lastCheck: '2025-01-27T14:10:00.000Z',
      responseTime: null
    },
    logs: {
      enabled: true,
      level: 'error',
      lastEntry: '2025-01-27T14:10:00.000Z'
    },
    config: {
      autoRestart: false,
      maxRestarts: 5,
      restartDelay: 10000
    }
  }
];

export const mockPortStatuses: PortStatus[] = [
  {
    port: 3000,
    pid: 12345,
    inUse: true,
    processName: 'node',
    command: 'node server.js',
    startTime: '2025-01-27T14:00:00.000Z'
  },
  {
    port: 3001,
    pid: null,
    inUse: false,
    processName: null,
    command: null,
    startTime: null
  },
  {
    port: 3002,
    pid: 67890,
    inUse: true,
    processName: 'python',
    command: 'python app.py',
    startTime: '2025-01-27T13:30:00.000Z'
  }
];

export const mockScript: Script = {
  id: 'script-1',
  name: 'test-script',
  description: 'A test script for demonstration',
  command: 'echo "Hello World"',
  workingDirectory: '/app',
  environment: {
    NODE_ENV: 'test',
    DEBUG: 'true'
  },
  timeout: 30000,
  retries: 3,
  tags: ['test', 'demo'],
  createdAt: '2025-01-27T14:00:00.000Z',
  updatedAt: '2025-01-27T14:00:00.000Z',
  createdBy: 'test-user',
  isActive: true
};

export const mockScriptExecution: ScriptExecution = {
  id: 'exec-1',
  scriptId: 'script-1',
  status: 'completed',
  startTime: '2025-01-27T14:13:00.000Z',
  endTime: '2025-01-27T14:13:05.000Z',
  duration: 5000,
  exitCode: 0,
  output: 'Hello World\n',
  error: null,
  environment: {
    NODE_ENV: 'test',
    DEBUG: 'true'
  },
  workingDirectory: '/app',
  command: 'echo "Hello World"',
  pid: 12345,
  retryCount: 0,
  maxRetries: 3,
  timeout: 30000,
  tags: ['test', 'demo'],
  createdAt: '2025-01-27T14:13:00.000Z',
  updatedAt: '2025-01-27T14:13:05.000Z'
};

export const mockScriptExecutionSummary: ScriptExecutionSummary = {
  id: 'exec-1',
  scriptId: 'script-1',
  scriptName: 'test-script',
  status: 'completed',
  startTime: '2025-01-27T14:13:00.000Z',
  endTime: '2025-01-27T14:13:05.000Z',
  duration: 5000,
  exitCode: 0,
  retryCount: 0,
  tags: ['test', 'demo'],
  createdAt: '2025-01-27T14:13:00.000Z'
};

// Mock data for component tests
export const mockLogEntry = {
  id: 'log-1',
  timestamp: '2025-01-27T14:13:57.000Z',
  level: 'INFO',
  message: 'Test log message',
  service: 'test-service',
  source: 'stdout',
  metadata: {
    requestId: 'req-123',
    userId: 'user-456'
  }
};

export const mockLogEntries = [
  mockLogEntry,
  {
    id: 'log-2',
    timestamp: '2025-01-27T14:13:58.000Z',
    level: 'ERROR',
    message: 'Error occurred',
    service: 'test-service',
    source: 'stderr',
    metadata: {
      error: 'TypeError: Cannot read property of undefined',
      stack: 'Error stack trace...'
    }
  },
  {
    id: 'log-3',
    timestamp: '2025-01-27T14:13:59.000Z',
    level: 'WARN',
    message: 'Warning message',
    service: 'test-service',
    source: 'stdout',
    metadata: {
      warning: 'Deprecated API usage'
    }
  }
];

// Mock WebSocket events
export const mockWebSocketEvents = {
  serviceStatusUpdate: {
    type: 'service_status_update',
    data: {
      serviceId: 'test-service-1',
      status: 'running',
      timestamp: '2025-01-27T14:13:57.000Z'
    }
  },
  logEntry: {
    type: 'log_entry',
    data: mockLogEntry
  },
  portStatusUpdate: {
    type: 'port_status_update',
    data: {
      port: 3000,
      inUse: true,
      pid: 12345,
      timestamp: '2025-01-27T14:13:57.000Z'
    }
  },
  scriptExecutionUpdate: {
    type: 'script_execution_update',
    data: {
      executionId: 'exec-1',
      status: 'running',
      timestamp: '2025-01-27T14:13:57.000Z'
    }
  }
};

// Mock user interactions
export const mockUserInteractions = {
  click: {
    button: 'button',
    element: 'div[data-testid="test-element"]',
    coordinates: { x: 100, y: 200 }
  },
  keyboard: {
    key: 'Enter',
    keyCode: 13,
    ctrlKey: false,
    shiftKey: false,
    altKey: false
  },
  form: {
    input: {
      name: 'test-input',
      value: 'test value',
      type: 'text'
    },
    select: {
      name: 'test-select',
      value: 'option1',
      options: ['option1', 'option2', 'option3']
    }
  }
};

// Mock API responses
export const mockApiResponses = {
  success: {
    status: 200,
    data: { success: true, message: 'Operation successful' }
  },
  error: {
    status: 400,
    data: { error: 'Bad Request', message: 'Invalid input' }
  },
  notFound: {
    status: 404,
    data: { error: 'Not Found', message: 'Resource not found' }
  },
  serverError: {
    status: 500,
    data: { error: 'Internal Server Error', message: 'Something went wrong' }
  }
};

// Mock configuration
export const mockConfig = {
  api: {
    baseUrl: 'http://localhost:3001',
    timeout: 10000,
    retries: 3
  },
  websocket: {
    url: 'ws://localhost:3001',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
  },
  ui: {
    theme: 'light',
    language: 'en',
    autoRefresh: true,
    refreshInterval: 5000
  },
  logging: {
    level: 'info',
    maxEntries: 1000,
    retentionDays: 7
  }
};
