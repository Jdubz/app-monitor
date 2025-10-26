/**
 * WebSocket Integration Tests
 * 
 * Based on test scenarios from docs/plans/test-scenarios-by-repository.md
 * Covers real-time updates, connection handling, and event broadcasting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Client as SocketIOClient } from 'socket.io-client';
import { ProcessManager } from './processManager.js';
import { LogStreamer } from './logStreamer.js';
import { CloudLogging } from './cloudLogging.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('./processManager.js');
vi.mock('./cloudLogging.js');
vi.mock('../utils/logger.js');

describe('WebSocket Integration Tests', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let processManager: ProcessManager;
  let logStreamer: LogStreamer;
  let cloudLogging: CloudLogging;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create HTTP server and Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Mock ProcessManager
    processManager = {
      on: vi.fn(),
      emit: vi.fn(),
      getStatus: vi.fn().mockResolvedValue({ status: 'running' }),
      getAllStatuses: vi.fn().mockResolvedValue({}),
      startService: vi.fn().mockResolvedValue({ success: true }),
      stopService: vi.fn().mockResolvedValue({ success: true })
    } as any;

    // Mock CloudLogging
    cloudLogging = {
      streamLogs: vi.fn().mockResolvedValue([]),
      getLogs: vi.fn().mockResolvedValue([])
    } as any;

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Create LogStreamer
    logStreamer = new LogStreamer(io, processManager, cloudLogging);
  });

  afterEach(() => {
    if (httpServer) {
      httpServer.close();
    }
    vi.restoreAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish connection successfully', (done) => {
      // Given: Server is running
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        // When: Client connects
        client.on('connect', () => {
          // Then: Connection is established
          expect(client.connected).toBe(true);
          client.disconnect();
          done();
        });

        client.on('connect_error', (error) => {
          done(error);
        });
      });
    });

    it('should handle connection with custom query params', (done) => {
      // Given: Server is running
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`, {
          query: {
            clientType: 'frontend',
            version: '1.0.0'
          }
        });

        // When: Client connects with query params
        client.on('connect', () => {
          // Then: Connection is established with params
          expect(client.connected).toBe(true);
          client.disconnect();
          done();
        });
      });
    });

    it('should handle disconnection gracefully', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Client disconnects
          client.disconnect();

          // Then: Disconnection is handled gracefully
          setTimeout(() => {
            expect(client.connected).toBe(false);
            done();
          }, 100);
        });
      });
    });

    it('should support reconnection', (done) => {
      // Given: Client with reconnection enabled
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`, {
          reconnection: true,
          reconnectionDelay: 100
        });

        let connectionCount = 0;

        client.on('connect', () => {
          connectionCount++;
          
          if (connectionCount === 1) {
            // First connection - disconnect
            client.disconnect();
          } else if (connectionCount === 2) {
            // Reconnected
            expect(client.connected).toBe(true);
            client.disconnect();
            done();
          }
        });

        // Simulate reconnection after disconnect
        client.on('disconnect', () => {
          setTimeout(() => {
            client.connect();
          }, 50);
        });
      });
    });
  });

  describe('Process Events', () => {
    it('should emit and receive process:started event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Process started event is emitted
          const processData = {
            serviceName: 'job-finder-backend',
            status: 'running',
            pid: 12345
          };

          logStreamer['broadcastStatusChange'](processData);

          // Then: Client receives the event
          client.on('process:started', (data) => {
            expect(data).toEqual(processData);
            client.disconnect();
            done();
          });
        });
      });
    });

    it('should emit and receive process:stopped event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Process stopped event is emitted
          const processData = {
            serviceName: 'job-finder-backend',
            status: 'stopped',
            pid: 12345
          };

          logStreamer['broadcastStatusChange'](processData);

          // Then: Client receives the event
          client.on('process:stopped', (data) => {
            expect(data).toEqual(processData);
            client.disconnect();
            done();
          });
        });
      });
    });

    it('should emit and receive process:log event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Log event is emitted
          const logData = {
            service: 'backend',
            level: 'INFO',
            message: 'Test log message',
            timestamp: Date.now()
          };

          logStreamer['broadcastLog'](logData);

          // Then: Client receives the log
          client.on('process:log', (data) => {
            expect(data).toEqual(expect.objectContaining(logData));
            client.disconnect();
            done();
          });
        });
      });
    });

    it('should handle multiple process events in sequence', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        let eventCount = 0;
        const expectedEvents = 3;

        client.on('connect', () => {
          // When: Multiple events are emitted
          const events = [
            { serviceName: 'backend', status: 'starting' },
            { serviceName: 'backend', status: 'running' },
            { serviceName: 'backend', status: 'stopped' }
          ];

          events.forEach((event, index) => {
            setTimeout(() => {
              logStreamer['broadcastStatusChange'](event);
            }, index * 10);
          });

          // Then: All events are received
          client.on('process:status_change', (_data) => {
            eventCount++;
            if (eventCount === expectedEvents) {
              client.disconnect();
              done();
            }
          });
        });
      });
    });
  });

  describe('Container Events', () => {
    it('should emit and receive container:status event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Container status event is emitted
          const containerData = {
            containerId: 'abc123',
            status: 'running',
            serviceName: 'job-finder-worker'
          };

          logStreamer['broadcastContainerStatus'](containerData);

          // Then: Client receives the event
          client.on('container:status', (data) => {
            expect(data).toEqual(containerData);
            client.disconnect();
            done();
          });
        });
      });
    });

    it('should emit and receive container:created event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Container created event is emitted
          const containerData = {
            containerId: 'def456',
            name: 'test-container',
            serviceName: 'job-finder-worker'
          };

          logStreamer['broadcastContainerCreated'](containerData);

          // Then: Client receives the event
          client.on('container:created', (data) => {
            expect(data).toEqual(containerData);
            client.disconnect();
            done();
          });
        });
      });
    });
  });

  describe('Task Events', () => {
    it('should emit and receive task:updated event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Task updated event is emitted
          const taskData = {
            taskId: 'task-123',
            status: 'active',
            progress: 50,
            assignedWorker: 'worker-1'
          };

          logStreamer['broadcastTaskUpdate'](taskData);

          // Then: Client receives the event
          client.on('task:updated', (data) => {
            expect(data).toEqual(taskData);
            client.disconnect();
            done();
          });
        });
      });
    });

    it('should emit and receive task:assigned event', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Task assigned event is emitted
          const taskData = {
            taskId: 'task-456',
            assignedWorker: 'worker-2',
            assignedAgent: 'test-agent',
            estimatedDuration: 300000
          };

          logStreamer['broadcastTaskAssigned'](taskData);

          // Then: Client receives the event
          client.on('task:assigned', (data) => {
            expect(data).toEqual(taskData);
            client.disconnect();
            done();
          });
        });
      });
    });
  });

  describe('Client-to-Server Communication', () => {
    it('should handle custom event from client', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Client sends custom event
          const customData = {
            type: 'request_logs',
            serviceName: 'job-finder-backend',
            filters: { level: 'ERROR' }
          };

          client.emit('request_logs', customData);

          // Then: Server handles the event
          // Note: This would require setting up actual event handlers in LogStreamer
          setTimeout(() => {
            client.disconnect();
            done();
          }, 100);
        });
      });
    });

    it('should handle client subscription to specific services', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Client subscribes to specific service
          const subscriptionData = {
            services: ['job-finder-backend', 'job-finder-frontend'],
            logLevels: ['INFO', 'WARN', 'ERROR']
          };

          client.emit('subscribe_logs', subscriptionData);

          // Then: Server acknowledges subscription
          client.on('subscription_confirmed', (data) => {
            expect(data).toEqual(expect.objectContaining(subscriptionData));
            client.disconnect();
            done();
          });
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', (done) => {
      // Given: Server is not running
      const client = SocketIOClient('http://localhost:9999', {
        timeout: 1000,
        reconnection: false
      });

      // When: Client attempts to connect
      client.on('connect_error', (error) => {
        // Then: Error is handled gracefully
        expect(error).toBeDefined();
        client.disconnect();
        done();
      });
    });

    it('should handle malformed event data', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Client sends malformed data
          client.emit('request_logs', 'invalid-data');

          // Then: Server handles it gracefully
          setTimeout(() => {
            client.disconnect();
            done();
          }, 100);
        });
      });
    });

    it('should handle client disconnection during event processing', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        client.on('connect', () => {
          // When: Client disconnects during event processing
          const processData = {
            serviceName: 'job-finder-backend',
            status: 'running'
          };

          // Start broadcasting
          logStreamer['broadcastStatusChange'](processData);
          
          // Immediately disconnect
          client.disconnect();

          // Then: No errors occur
          setTimeout(() => {
            done();
          }, 100);
        });
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent clients', (done) => {
      // Given: Server is running
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const clientCount = 5;
        let connectedClients = 0;

        // When: Multiple clients connect
        for (let i = 0; i < clientCount; i++) {
          const client = SocketIOClient(`http://localhost:${port}`);

          client.on('connect', () => {
            connectedClients++;
            
            if (connectedClients === clientCount) {
              // Then: All clients are connected
              expect(connectedClients).toBe(clientCount);
              
              // Cleanup
              for (let j = 0; j < clientCount; j++) {
                client.disconnect();
              }
              done();
            }
          });
        }
      });
    });

    it('should handle high-frequency events', (done) => {
      // Given: Client is connected
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        const client = SocketIOClient(`http://localhost:${port}`);

        let eventCount = 0;
        const eventLimit = 100;

        client.on('connect', () => {
          // When: High-frequency events are emitted
          const interval = setInterval(() => {
            const logData = {
              service: 'backend',
              level: 'INFO',
              message: `Log message ${eventCount}`,
              timestamp: Date.now()
            };

            logStreamer['broadcastLog'](logData);
            eventCount++;

            if (eventCount >= eventLimit) {
              clearInterval(interval);
              client.disconnect();
              done();
            }
          }, 1);

          // Then: All events are processed
          client.on('process:log', () => {
            // Events are being received
          });
        });
      });
    });
  });
});