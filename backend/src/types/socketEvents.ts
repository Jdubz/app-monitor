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
  
  'docker:monitorContainer': (data: { containerId: string }) => void;
  
  'docker:stopMonitor': (data: { containerId: string }) => void;
  
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

  // Dev-Bots events
  'claude:taskAdded': (task: Record<string, unknown>) => void;
  'claude:taskAssigned': (task: Record<string, unknown>) => void;
  'claude:taskStarted': (task: Record<string, unknown>) => void;
  'claude:taskCompleted': (task: Record<string, unknown>) => void;
  'claude:taskFailed': (task: Record<string, unknown>) => void;
  'claude:systemStatusChange': (status: Record<string, unknown>) => void;
  'claude:coordinatorHealthChange': (isHealthy: boolean) => void;
  'claude:dockerError': (error: Error | { message: string; code?: string }) => void;
  'claude:dockerWarning': (warning: { message: string; details?: unknown }) => void;
  'claude:workerError': (error: Error | { message: string; code?: string }) => void;

  // Task events
  'task:created': (task: Record<string, unknown>) => void;
  'task:updated': (task: Record<string, unknown>) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:assigned': (task: Record<string, unknown>) => void;
  'task:started': (task: Record<string, unknown>) => void;
  'task:completed': (task: Record<string, unknown>) => void;
  'task:failed': (task: Record<string, unknown>) => void;
}

// ============================================================================
// Inter-server Events (for clusters)
// ============================================================================

export interface InterServerEvents {
  // Can be extended for multi-server setups
}

// ============================================================================
// Socket Data
// ============================================================================

export interface SocketData {
  userId?: string;
  monitorIntervals?: Record<string, NodeJS.Timeout>;
}
