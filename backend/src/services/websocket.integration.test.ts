import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogStreamer } from './logStreamer.js';
import { ProcessManager } from './processManager.js';
import { CloudLogging } from './cloudLogging.js';
import { logger } from '../utils/logger.js';
import { TestSocketIOServer, TestClientSocket } from '../../tests/helpers/fake-socket-server.js';

vi.mock('../utils/logger.js');

describe('LogStreamer socket integration (in-process)', () => {
  let io: TestSocketIOServer;
  let processManager: ProcessManager;
  let cloudLogging: CloudLogging;
  let logStreamer: LogStreamer;

  beforeEach(() => {
    io = new TestSocketIOServer();

    processManager = {
      on: vi.fn(),
      emit: vi.fn(),
      getAllStatuses: vi.fn().mockReturnValue([{ name: 'job-finder-backend', status: 'running' }]),
      getServiceStatus: vi.fn().mockReturnValue({ name: 'job-finder-backend', status: 'running' }),
      startService: vi.fn(),
      stopService: vi.fn(),
    } as unknown as ProcessManager;

    cloudLogging = {
      getLogs: vi.fn().mockResolvedValue([]),
      streamLogs: vi.fn(),
      getEnvironments: vi.fn().mockReturnValue(['local']),
      isAvailable: vi.fn().mockReturnValue(true),
    } as unknown as CloudLogging;

    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    logStreamer = new LogStreamer(io as unknown as any, processManager, cloudLogging);
  });

  it('sends initial status payloads when a client connects', () => {
    const client = new TestClientSocket();
    const received: any[] = [];
    client.clientOn('initial_statuses', (payload) => received.push(payload));

    io.connect(client);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([{ name: 'job-finder-backend', status: 'running' }]);
  });

  it('broadcasts process status changes to all connected clients', () => {
    const clientA = new TestClientSocket('client-a');
    const clientB = new TestClientSocket('client-b');
    const seenA: any[] = [];
    const seenB: any[] = [];

    clientA.clientOn('status_change', (data) => seenA.push(data));
    clientB.clientOn('status_change', (data) => seenB.push(data));

    io.connect(clientA);
    io.connect(clientB);

    const payload = { serviceName: 'job-finder-backend', status: 'starting' };
    (logStreamer as any).broadcastStatusChange(payload);

    expect(seenA).toContainEqual(payload);
    expect(seenB).toContainEqual(payload);
  });

  it('tracks log room subscriptions for clients', async () => {
    const client = new TestClientSocket();
    io.connect(client);

    await client.clientEmit('subscribe_logs', 'backend');
    expect(client.rooms.has('logs:backend')).toBe(true);

    await client.clientEmit('unsubscribe_logs', 'backend');
    expect(client.rooms.has('logs:backend')).toBe(false);
  });

  it('returns log history when requested by the client', async () => {
    const client = new TestClientSocket();
    const histories: any[] = [];
    client.clientOn('log_history', (payload) => histories.push(payload));

    const mockLogs = [
      { service: 'backend', timestamp: Date.now(), level: 'INFO', message: 'Hello', raw: 'Hello' },
    ];
    (logStreamer as any).logWatcher.getRecentLogs = vi.fn().mockReturnValue(mockLogs);

    io.connect(client);
    await client.clientEmit('get_history', { serviceName: 'backend', lines: 5 });

    expect(histories).toHaveLength(1);
    expect(histories[0].serviceName).toBe('backend');
    expect(histories[0].logs).toHaveLength(1);
  });

  it('handles cloud logging failures gracefully and notifies client', async () => {
    const client = new TestClientSocket();
    const errors: any[] = [];
    client.clientOn('error', (payload) => errors.push(payload));

    vi.mocked(cloudLogging.getLogs).mockRejectedValueOnce(new Error('boom'));

    io.connect(client);
    await client.clientEmit('refresh_cloud_logs', { environment: 'staging', service: 'api' });

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Failed to refresh cloud logs');
  });
});
