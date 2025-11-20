import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { EventEmitter } from 'events';
import { createSSERoutes } from '../../src/routes/sse.routes.js';

// Mock DevBotsManager as EventEmitter
class MockDevBotsManager extends EventEmitter {
  // Add any methods needed for type compatibility
}

describe('SSE Routes', () => {
  let app: Express;
  let devBotsManager: MockDevBotsManager;

  beforeEach(() => {
    app = express();
    devBotsManager = new MockDevBotsManager();

    // Register SSE routes
    app.use('/api/sse', createSSERoutes(devBotsManager as any));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /events', () => {
    it('establishes SSE connection with correct headers', (done) => {
      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          // Check headers immediately and close connection
          expect(res.headers['content-type']).toBe('text/event-stream');
          expect(res.headers['cache-control']).toBe('no-cache');
          expect(res.headers['connection']).toBe('keep-alive');
          expect(res.headers['x-accel-buffering']).toBe('no');
          res.destroy();
          callback(null, '');
        })
        .end((err) => {
          expect(err).toBeNull();
          done();
        });
    });

    it('sends initial connection message', (done) => {
      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            // Check for connection message
            if (data.includes('{"type":"connected"}')) {
              res.destroy();
              callback(null, data);
            }
          });
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('data: {"type":"connected"}');
          done();
        });
    });

    it('broadcasts taskAdded event to connected clients', (done) => {
      const testTask = { id: 'task-123', status: 'pending', type: 'test' };

      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            // Wait for task event
            if (data.includes('task:added')) {
              res.destroy();
              callback(null, data);
            }
          });

          // Emit event after connection established
          setTimeout(() => {
            devBotsManager.emit('taskAdded', testTask);
          }, 50);
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: task:added');
          expect(res.text).toContain(JSON.stringify(testTask));
          done();
        });
    });

    it('broadcasts taskCompleted event', (done) => {
      const testTask = { id: 'task-456', status: 'completed', type: 'test' };

      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('task:completed')) {
              res.destroy();
              callback(null, data);
            }
          });

          setTimeout(() => {
            devBotsManager.emit('taskCompleted', testTask);
          }, 50);
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: task:completed');
          expect(res.text).toContain('"status":"completed"');
          done();
        });
    });

    it('broadcasts system status changes', (done) => {
      const status = { workerCount: 2, maxWorkers: 4 };

      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('system:status')) {
              res.destroy();
              callback(null, data);
            }
          });

          setTimeout(() => {
            devBotsManager.emit('systemStatusChange', status);
          }, 50);
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: system:status');
          expect(res.text).toContain('"workerCount":2');
          done();
        });
    });

    it('broadcasts to multiple connected clients', (done) => {
      const testTask = { id: 'task-789', status: 'active' };
      let clientsReceived = 0;

      const checkComplete = () => {
        clientsReceived++;
        if (clientsReceived === 2) {
          done();
        }
      };

      // Client 1
      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('task:started')) {
              res.destroy();
              callback(null, data);
            }
          });
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: task:started');
          checkComplete();
        });

      // Client 2
      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('task:started')) {
              res.destroy();
              callback(null, data);
            }
          });
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: task:started');
          checkComplete();
        });

      // Emit after both clients connect
      setTimeout(() => {
        devBotsManager.emit('taskStarted', testTask);
      }, 100);
    });

    it('handles all task lifecycle events', (done) => {
      const events = [
        { name: 'taskAdded', data: { id: 't1', status: 'pending' } },
        { name: 'taskAssigned', data: { id: 't2', agent: 'a1' } },
        { name: 'taskStarted', data: { id: 't3', status: 'active' } },
        { name: 'taskFailed', data: { id: 't4', error: 'test' } },
      ];

      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          let eventCount = 0;

          res.on('data', (chunk) => {
            data += chunk.toString();

            // Count received events (exclude connection message)
            const matches = data.match(/event: task:/g);
            if (matches) {
              eventCount = matches.length;
            }

            if (eventCount === events.length) {
              res.destroy();
              callback(null, data);
            }
          });

          // Emit all events
          setTimeout(() => {
            events.forEach((evt, idx) => {
              setTimeout(() => {
                devBotsManager.emit(evt.name, evt.data);
              }, idx * 20);
            });
          }, 50);
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: task:added');
          expect(res.text).toContain('event: task:assigned');
          expect(res.text).toContain('event: task:started');
          expect(res.text).toContain('event: task:failed');
          done();
        });
    });

    it('handles docker error events', (done) => {
      const error = { message: 'Container failed', code: 'E_DOCKER' };

      request(app)
        .get('/api/sse/events')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('docker:error')) {
              res.destroy();
              callback(null, data);
            }
          });

          setTimeout(() => {
            devBotsManager.emit('dockerError', error);
          }, 50);
        })
        .end((err, res) => {
          expect(err).toBeNull();
          expect(res.text).toContain('event: docker:error');
          expect(res.text).toContain('Container failed');
          done();
        });
    });
  });
});
