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
  'script:started': (execution: any) => void;
  'script:output': (data: any) => void;
  'script:completed': (execution: any) => void;
  'script:failed': (execution: any) => void;
  'script:killed': (execution: any) => void;
  
  // Dev-Bots events
  'claude:taskAdded': (task: any) => void;
  'claude:taskAssigned': (task: any) => void;
  'claude:taskStarted': (task: any) => void;
  'claude:taskCompleted': (task: any) => void;
  'claude:taskFailed': (task: any) => void;
  'claude:systemStatusChange': (status: any) => void;
  'claude:coordinatorHealthChange': (isHealthy: boolean) => void;
  'claude:dockerError': (error: any) => void;
  'claude:dockerWarning': (warning: any) => void;
  'claude:workerError': (error: any) => void;
  
  // Task events
  'task:created': (task: any) => void;
  'task:updated': (task: any) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:assigned': (task: any) => void;
  'task:started': (task: any) => void;
  'task:completed': (task: any) => void;
  'task:failed': (task: any) => void;
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
