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
    const captureStream = async (
      trigger: () => void,
      stopWhen: (data: string) => boolean,
      delay = 50,
    ) => {
      return new Promise<string>((resolve, reject) => {
        let body = '';

        request(app)
          .get('/api/sse/events')
          .buffer(true)
          .parse((res, callback) => {
            res.on('data', (chunk) => {
              body += chunk.toString();
              if (stopWhen(body)) {
                res.destroy();
                callback(null, body);
              }
            });
          })
          .end((err) => {
            if (err) return reject(err);
            resolve(body);
          });

        setTimeout(trigger, delay);
      });
    };

    it('establishes SSE connection with correct headers', async () => {
      const headers = await new Promise<Record<string, string | undefined>>((resolve, reject) => {
        request(app)
          .get('/api/sse/events')
          .buffer(true)
          .parse((res, callback) => {
            // Capture headers then tear down the stream immediately
            resolve(res.headers as Record<string, string | undefined>);
            res.destroy();
            callback(null, '');
          })
          .end((err) => (err ? reject(err) : undefined));
      });

      expect(headers['content-type']).toBe('text/event-stream');
      expect(headers['cache-control']).toBe('no-cache');
      expect(headers['connection']).toBe('keep-alive');
      expect(headers['x-accel-buffering']).toBe('no');
    });

    it('sends initial connection message', async () => {
      const body = await captureStream(
        () => {
          // no-op trigger; the initial event is sent immediately
        },
        (data) => data.includes('{"type":"connected"}'),
        0,
      );

      expect(body).toContain('data: {"type":"connected"}');
    });

    it('broadcasts taskAdded event to connected clients', async () => {
      const testTask = { id: 'task-123', status: 'pending', type: 'test' };
      const body = await captureStream(
        () => devBotsManager.emit('taskAdded', testTask),
        (data) => data.includes('task:added'),
      );

      expect(body).toContain('event: task:added');
      expect(body).toContain(JSON.stringify(testTask));
    });

    it('broadcasts taskCompleted event', async () => {
      const testTask = { id: 'task-456', status: 'completed', type: 'test' };
      const body = await captureStream(
        () => devBotsManager.emit('taskCompleted', testTask),
        (data) => data.includes('task:completed'),
      );

      expect(body).toContain('event: task:completed');
      expect(body).toContain('"status":"completed"');
    });

    it('broadcasts system status changes', async () => {
      const status = { workerCount: 2, maxWorkers: 4 };
      const body = await captureStream(
        () => devBotsManager.emit('systemStatusChange', status),
        (data) => data.includes('system:status'),
      );

      expect(body).toContain('event: system:status');
      expect(body).toContain('"workerCount":2');
    });

    it('broadcasts to multiple connected clients', async () => {
      const testTask = { id: 'task-789', status: 'active' };
      const listenForTaskStarted = () =>
        captureStream(() => {}, (data) => data.includes('task:started'));

      const [body1, body2] = await Promise.all([
        listenForTaskStarted(),
        listenForTaskStarted(),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            devBotsManager.emit('taskStarted', testTask);
            resolve();
          }, 20),
        ),
      ]).then(([a, b]) => [a, b]);

      expect(body1).toContain('event: task:started');
      expect(body2).toContain('event: task:started');
    });

    it('handles all task lifecycle events', async () => {
      const events = [
        { name: 'taskAdded', data: { id: 't1', status: 'pending' } },
        { name: 'taskAssigned', data: { id: 't2', agent: 'a1' } },
        { name: 'taskStarted', data: { id: 't3', status: 'active' } },
        { name: 'taskFailed', data: { id: 't4', error: 'test' } },
      ];

      const body = await captureStream(
        () => {
          events.forEach((evt, idx) => {
            setTimeout(() => {
              devBotsManager.emit(evt.name, evt.data);
            }, idx * 20);
          });
        },
        (data) => (data.match(/event: task:/g) || []).length === events.length,
      );

      expect(body).toContain('event: task:added');
      expect(body).toContain('event: task:assigned');
      expect(body).toContain('event: task:started');
      expect(body).toContain('event: task:failed');
    });

    it('handles docker error events', async () => {
      const error = { message: 'Container failed', code: 'E_DOCKER' };
      const body = await captureStream(
        () => devBotsManager.emit('dockerError', error),
        (data) => data.includes('docker:error'),
      );

      expect(body).toContain('event: docker:error');
      expect(body).toContain('Container failed');
    });
  });
});
