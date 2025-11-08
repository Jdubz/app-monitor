import { describe, it, expect, beforeEach } from 'vitest';
import { TestSocketIOServer, TestClientSocket } from '../helpers/fake-socket-server.js';
import { generateTestId } from '../test-utils.js';

describe('Socket.IO event broadcasts (in-process)', () => {
  let io: TestSocketIOServer;
  let client: TestClientSocket;

  beforeEach(() => {
    io = new TestSocketIOServer();
    client = new TestClientSocket();
    io.connect(client);
  });

  it('delivers process lifecycle events to connected clients', () => {
    const events: string[] = [];
    const processId = generateTestId('process');

    client.clientOn('process:started', (data) => events.push(`started:${data.processId}`));
    client.clientOn('process:log', (data) => events.push(`log:${data.processId}`));
    client.clientOn('process:stopped', (data) => events.push(`stopped:${data.processId}`));

    io.emit('process:started', { processId });
    io.emit('process:log', { processId, message: 'running' });
    io.emit('process:stopped', { processId });

    expect(events).toEqual([
      `started:${processId}`,
      `log:${processId}`,
      `stopped:${processId}`,
    ]);
  });

  it('delivers container events', () => {
    const containerId = generateTestId('container');
    let receivedStatus: any;
    let receivedCreated: any;

    client.clientOn('container:status', (payload) => {
      receivedStatus = payload;
    });
    client.clientOn('container:created', (payload) => {
      receivedCreated = payload;
    });

    io.emit('container:status', { containerId, status: 'running' });
    io.emit('container:created', { containerId, name: 'worker' });

    expect(receivedStatus).toMatchObject({ containerId, status: 'running' });
    expect(receivedCreated).toMatchObject({ containerId, name: 'worker' });
  });

  it('delivers task updates and assignments', () => {
    const taskId = generateTestId('task');
    let updatePayload: any;
    let assignmentPayload: any;

    client.clientOn('task:updated', (payload) => {
      updatePayload = payload;
    });
    client.clientOn('task:assigned', (payload) => {
      assignmentPayload = payload;
    });

    io.emit('task:updated', { taskId, status: 'in-progress' });
    io.emit('task:assigned', { taskId, workerId: 'worker-1' });

    expect(updatePayload).toMatchObject({ taskId, status: 'in-progress' });
    expect(assignmentPayload).toMatchObject({ taskId, workerId: 'worker-1' });
  });
});
