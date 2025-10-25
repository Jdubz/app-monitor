/**
 * Integration Tests for Socket.IO Real-time Updates
 * 
 * Tests real-time communication via Socket.IO for process events,
 * Docker events, and task updates.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as SocketClient, Socket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import { sleep, waitFor, generateTestId } from '../test-utils.js';

describe('Socket.IO Real-time Updates Integration', () => {
  let httpServer: HttpServer;
  let socketServer: SocketServer;
  let serverPort: number;
  let clientSocket: Socket;

  beforeAll(async () => {
    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.IO server
    socketServer = new SocketServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Find available port and start server
    serverPort = 3010;
    await new Promise<void>((resolve) => {
      httpServer.listen(serverPort, () => {
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    
    if (socketServer) {
      socketServer.close();
    }
    
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  }, 10000);

  beforeEach(async () => {
    // Clean up any existing client connection
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    // Create new client for each test
    clientSocket = SocketClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    // Wait for connection
    await waitFor(
      () => clientSocket.connected,
      { timeout: 5000, message: 'Client failed to connect' }
    );
  });

  describe('Connection Management', () => {
    it('should establish connection successfully', async () => {
      expect(clientSocket.connected).toBe(true);
      expect(clientSocket.id).toBeDefined();
    });

    it('should handle connection with custom query params', async () => {
      const customClient = SocketClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        query: {
          clientType: 'test',
          version: '1.0.0',
        },
      });

      await waitFor(
        () => customClient.connected,
        { timeout: 5000 }
      );

      expect(customClient.connected).toBe(true);
      
      customClient.disconnect();
    });

    it('should handle disconnection gracefully', async () => {
      const wasConnected = clientSocket.connected;
      
      clientSocket.disconnect();
      
      await waitFor(
        () => !clientSocket.connected,
        { timeout: 2000, message: 'Client failed to disconnect' }
      );

      expect(wasConnected).toBe(true);
      expect(clientSocket.connected).toBe(false);
    });

    it('should support reconnection', async () => {
      clientSocket.disconnect();
      await sleep(500);
      
      clientSocket.connect();
      
      await waitFor(
        () => clientSocket.connected,
        { timeout: 5000, message: 'Client failed to reconnect' }
      );

      expect(clientSocket.connected).toBe(true);
    });
  });

  describe('Process Events', () => {
    it('should emit and receive process:started event', async () => {
      const processId = generateTestId('process');
      const receivedEvents: any[] = [];

      clientSocket.on('process:started', (data) => {
        receivedEvents.push(data);
      });

      // Server emits event
      socketServer.emit('process:started', {
        processId,
        name: 'Test Process',
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000, message: 'process:started event not received' }
      );

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].processId).toBe(processId);
    });

    it('should emit and receive process:stopped event', async () => {
      const processId = generateTestId('process');
      const receivedEvents: any[] = [];

      clientSocket.on('process:stopped', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('process:stopped', {
        processId,
        exitCode: 0,
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].processId).toBe(processId);
      expect(receivedEvents[0].exitCode).toBe(0);
    });

    it('should emit and receive process:log event', async () => {
      const processId = generateTestId('process');
      const logMessage = 'Test log message';
      const receivedLogs: any[] = [];

      clientSocket.on('process:log', (data) => {
        receivedLogs.push(data);
      });

      socketServer.emit('process:log', {
        processId,
        message: logMessage,
        level: 'info',
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedLogs.length > 0,
        { timeout: 2000 }
      );

      expect(receivedLogs[0].processId).toBe(processId);
      expect(receivedLogs[0].message).toBe(logMessage);
    });

    it('should handle multiple process events in sequence', async () => {
      const processId = generateTestId('process');
      const events: string[] = [];

      clientSocket.on('process:started', () => events.push('started'));
      clientSocket.on('process:log', () => events.push('log'));
      clientSocket.on('process:stopped', () => events.push('stopped'));

      socketServer.emit('process:started', { processId });
      await sleep(100);
      socketServer.emit('process:log', { processId, message: 'log' });
      await sleep(100);
      socketServer.emit('process:stopped', { processId });

      await waitFor(
        () => events.length === 3,
        { timeout: 2000, message: 'Not all events received' }
      );

      expect(events).toEqual(['started', 'log', 'stopped']);
    });
  });

  describe('Container Events', () => {
    it('should emit and receive container:status event', async () => {
      const containerId = generateTestId('container');
      const receivedEvents: any[] = [];

      clientSocket.on('container:status', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('container:status', {
        containerId,
        status: 'running',
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].containerId).toBe(containerId);
      expect(receivedEvents[0].status).toBe('running');
    });

    it('should emit and receive container:created event', async () => {
      const containerId = generateTestId('container');
      const receivedEvents: any[] = [];

      clientSocket.on('container:created', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('container:created', {
        containerId,
        name: 'test-container',
        image: 'alpine:latest',
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].containerId).toBe(containerId);
    });
  });

  describe('Task Events', () => {
    it('should emit and receive task:updated event', async () => {
      const taskId = generateTestId('task');
      const receivedEvents: any[] = [];

      clientSocket.on('task:updated', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('task:updated', {
        taskId,
        status: 'completed',
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].taskId).toBe(taskId);
      expect(receivedEvents[0].status).toBe('completed');
    });

    it('should emit and receive task:assigned event', async () => {
      const taskId = generateTestId('task');
      const receivedEvents: any[] = [];

      clientSocket.on('task:assigned', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('task:assigned', {
        taskId,
        workerId: 'worker-1',
        timestamp: Date.now(),
      });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].taskId).toBe(taskId);
      expect(receivedEvents[0].workerId).toBe('worker-1');
    });
  });

  describe('Client-to-Server Communication', () => {
    it('should handle custom event from client', async () => {
      const receivedOnServer: any[] = [];

      socketServer.on('connection', (socket) => {
        socket.on('test:custom-event', (data) => {
          receivedOnServer.push(data);
        });
      });

      const testData = { message: 'Hello from client' };
      clientSocket.emit('test:custom-event', testData);

      await waitFor(
        () => receivedOnServer.length > 0,
        { timeout: 2000 }
      );

      expect(receivedOnServer[0]).toEqual(testData);
    });

    it('should handle request-response pattern', async () => {
      socketServer.on('connection', (socket) => {
        socket.on('test:request', (data, callback) => {
          callback({ success: true, echo: data });
        });
      });

      const response = await new Promise<any>((resolve) => {
        clientSocket.emit('test:request', { value: 42 }, (res: any) => {
          resolve(res);
        });
      });

      expect(response.success).toBe(true);
      expect(response.echo.value).toBe(42);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all connected clients', async () => {
      const client2 = SocketClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
      });

      await waitFor(() => client2.connected, { timeout: 5000 });

      const receivedBy1: any[] = [];
      const receivedBy2: any[] = [];

      clientSocket.on('broadcast:test', (data) => receivedBy1.push(data));
      client2.on('broadcast:test', (data) => receivedBy2.push(data));

      socketServer.emit('broadcast:test', { message: 'Hello all' });

      await waitFor(
        () => receivedBy1.length > 0 && receivedBy2.length > 0,
        { timeout: 2000, message: 'Broadcast not received by all clients' }
      );

      expect(receivedBy1[0].message).toBe('Hello all');
      expect(receivedBy2[0].message).toBe('Hello all');

      client2.disconnect();
    });

    it('should support rooms/namespaces', async () => {
      let roomSocket: Socket | null = null;

      socketServer.on('connection', (socket) => {
        socket.on('join:room', (room: string) => {
          socket.join(room);
          roomSocket = socket;
        });
      });

      const receivedEvents: any[] = [];
      clientSocket.on('room:message', (data) => receivedEvents.push(data));

      // Join room
      clientSocket.emit('join:room', 'test-room');
      await sleep(500);

      // Emit to room
      socketServer.to('test-room').emit('room:message', { text: 'Room message' });

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].text).toBe('Room message');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const badClient = SocketClient('http://localhost:9999', {
        transports: ['websocket'],
        timeout: 1000,
      });

      const errors: Error[] = [];
      badClient.on('connect_error', (error) => {
        errors.push(error);
      });

      await sleep(2000);

      expect(errors.length).toBeGreaterThan(0);
      
      badClient.disconnect();
    });

    it('should handle malformed event data', async () => {
      const receivedEvents: any[] = [];
      const errors: Error[] = [];

      clientSocket.on('test:malformed', (data) => {
        try {
          if (typeof data !== 'object') {
            throw new Error('Invalid data format');
          }
          receivedEvents.push(data);
        } catch (error) {
          errors.push(error as Error);
        }
      });

      // Send malformed data
      socketServer.emit('test:malformed', 'not an object');

      await sleep(500);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle rapid event emissions', async () => {
      const receivedEvents: any[] = [];
      const eventCount = 100;

      clientSocket.on('perf:test', (data) => {
        receivedEvents.push(data);
      });

      // Emit many events rapidly
      for (let i = 0; i < eventCount; i++) {
        socketServer.emit('perf:test', { index: i });
      }

      await waitFor(
        () => receivedEvents.length === eventCount,
        { timeout: 5000, message: `Only received ${receivedEvents.length}/${eventCount} events` }
      );

      expect(receivedEvents.length).toBe(eventCount);
      expect(receivedEvents[0].index).toBe(0);
      expect(receivedEvents[eventCount - 1].index).toBe(eventCount - 1);
    });

    it('should handle large payloads', async () => {
      const receivedEvents: any[] = [];
      const largeData = {
        array: Array(1000).fill('test'),
        nested: {
          deep: {
            object: {
              with: {
                many: {
                  levels: 'value',
                },
              },
            },
          },
        },
      };

      clientSocket.on('perf:large', (data) => {
        receivedEvents.push(data);
      });

      socketServer.emit('perf:large', largeData);

      await waitFor(
        () => receivedEvents.length > 0,
        { timeout: 2000 }
      );

      expect(receivedEvents[0].array.length).toBe(1000);
      expect(receivedEvents[0].nested.deep.object.with.many.levels).toBe('value');
    });
  });
});
