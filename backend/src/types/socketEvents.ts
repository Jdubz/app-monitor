/**
 * Socket.IO Event Types
 * 
 * Type-safe definitions for all Socket.IO events
 */

import type Docker from 'dockerode';

// ============================================================================
// Client -> Server Events
// ============================================================================

export interface ClientToServerEvents {
  // Docker events
  'docker:streamLogs': (data: {
    containerId: string;
    options?: {
      stdout?: boolean;
      stderr?: boolean;
      tail?: number;
      timestamps?: boolean;
    };
  }) => void;

  'docker:stopStream': (data: { containerId: string }) => void;

  'docker:startMonitor': (data: { containerId: string }) => void;

  'docker:stopMonitor': (data: { containerId: string }) => void;

  // Interactive terminal events
  'terminal:join': (data: { sessionId: string }) => void;

  'terminal:leave': (data: { sessionId: string }) => void;

  'terminal:input': (data: { sessionId: string; data: string }) => void;

  'terminal:signal': (data: { sessionId: string; signal: 'interrupt' | 'terminate' }) => void;

  'terminal:resize': (data: { sessionId: string; rows: number; cols: number }) => void;

  // Connection health events
  'ping': () => void;
}

// ============================================================================
// Server -> Client Events
// ============================================================================

export interface ServerToClientEvents {
  // Docker events
  'docker:log': (data: {
    containerId: string;
    log: string;
    timestamp: string;
  }) => void;
  
  'docker:streamStarted': (data: { containerId: string }) => void;
  
  'docker:streamStopped': (data: { containerId: string }) => void;
  
  'docker:streamError': (data: {
    containerId: string;
    error: string;
  }) => void;
  
  'docker:containerStatus': (data: {
    containerId: string;
    status: Docker.ContainerInspectInfo['State'];
    timestamp: string;
  }) => void;
  
  'docker:monitorStarted': (data: { containerId: string }) => void;
  
  'docker:monitorStopped': (data: { containerId: string }) => void;
  
  'docker:monitorError': (data: {
    containerId: string;
    error: string;
  }) => void;
  
  // Connection health events
  'pong': (data: { timestamp: number }) => void;
  
  'heartbeat': (data: {
    timestamp: number;
    healthy: boolean;
  }) => void;
  
  // Script events
  'script:started': (execution: Record<string, unknown>) => void;
  'script:output': (data: Record<string, unknown>) => void;
  'script:completed': (execution: Record<string, unknown>) => void;
  'script:failed': (execution: Record<string, unknown>) => void;
  'script:killed': (execution: Record<string, unknown>) => void;

  // NOTE: Dev-Bots task/system events migrated to SSE (Server-Sent Events)
  // See: backend/src/routes/sse.routes.ts for event definitions
  // Socket.IO retained only for bidirectional communication (terminal, logs)

  // Interactive terminal events
  'terminal:joined': (data: { sessionId: string }) => void;

  'terminal:output': (data: {
    sessionId: string;
    stream: 'stdout' | 'system';
    text: string;
    timestamp: string;
  }) => void;

  'terminal:status': (data: {
    sessionId: string;
    state: 'connected' | 'ended';
    reason?: string;
  }) => void;

  'terminal:error': (data: {
    sessionId: string;
    message: string;
  }) => void;
}

// ============================================================================
// Inter-server Events (for clusters)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {
  // Can be extended for multi-server setups
}

// ============================================================================
// Socket Data
// ============================================================================

export interface SocketData {
  userId?: string;
  monitorIntervals?: Record<string, NodeJS.Timeout>;
  terminalSessions?: Set<string>; // Track which terminal sessions this socket is subscribed to
}
