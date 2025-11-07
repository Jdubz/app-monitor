import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi, expectTypeOf } from 'vitest';
import { createEnvironmentsRoutes } from '../../src/routes/environments.routes.js';
import { createPortsRoutes } from '../../src/routes/ports.routes.js';
import { createLogsRoutes } from '../../src/routes/logs.routes.js';
import type { CloudLogging } from '../../src/services/cloudLogging.js';
import type { LogRotation } from '../../src/services/logRotation.js';
import type { LogStreamer } from '../../src/services/logStreamer.js';
import type { ProcessManager } from '../../src/services/processManager.js';
import type { ServiceConfig } from '../../src/config.js';
import type {
  EnvironmentsResponse,
  EnvironmentServicesResponse,
  PortStatusMap,
  PortKillResponse,
  ServiceLogsResponse,
} from '@app-monitor/api-contracts';

vi.mock('../../src/utils/portManager.js', () => ({
  getPortInfo: vi.fn(),
  killPortProcess: vi.fn(),
}));

const portManagerModule = await import('../../src/utils/portManager.js');
const mockedGetPortInfo = portManagerModule.getPortInfo as ReturnType<typeof vi.fn>;
const mockedKillPortProcess = portManagerModule.killPortProcess as ReturnType<typeof vi.fn>;

describe('API contract alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns shared contract payloads for environments endpoints', async () => {
    const cloudLogging = {
      getEnvironments: () => ({
        staging: {
          name: 'staging',
          displayName: 'Staging',
          projectId: 'example-project',
          services: [
            {
              name: 'api',
              displayName: 'API',
              description: 'Edge functions',
              logFilter: 'resource.type=cloud_function',
            },
          ],
          readOnly: true,
        },
      }),
      getServicesForEnvironment: () => ([
        {
          name: 'api',
          displayName: 'API',
          description: 'Edge functions',
          logFilter: 'resource.type=cloud_function',
        },
      ]),
    } as unknown as CloudLogging;

    const app = express();
    app.use('/environments', createEnvironmentsRoutes({ cloudLogging }));

    const envRes = await request(app).get('/environments');
    expect(envRes.status).toBe(200);
    expectTypeOf(envRes.body).toMatchTypeOf<EnvironmentsResponse>();
    expect(envRes.body.staging.displayName).toBe('Staging');

    const servicesRes = await request(app).get('/environments/staging/services');
    expect(servicesRes.status).toBe(200);
    expectTypeOf(servicesRes.body).toMatchTypeOf<EnvironmentServicesResponse>();
    expect(Array.isArray(servicesRes.body)).toBe(true);
  });

  it('returns shared contract payloads for port status + kill endpoints', async () => {
    const services: Record<string, ServiceConfig> = {
      'test-service': {
        name: 'test-service',
        displayName: 'Test Service',
        description: 'Contract smoke test',
        command: 'node',
        args: ['index.js'],
        cwd: process.cwd(),
        ports: [3000],
      },
    };

    mockedGetPortInfo.mockResolvedValue({ port: 3000, pid: 1234, inUse: true });
    mockedKillPortProcess.mockResolvedValue(true);

    const app = express();
    app.use(express.json());
    app.use('/ports', createPortsRoutes({ services }));

    const statusRes = await request(app).get('/ports/status');
    expect(statusRes.status).toBe(200);
    expectTypeOf(statusRes.body).toMatchTypeOf<PortStatusMap>();
    expect(statusRes.body['test-service'][0].inUse).toBe(true);

    const killRes = await request(app).post('/ports/3000/kill');
    expect(killRes.status).toBe(200);
    expectTypeOf(killRes.body).toMatchTypeOf<PortKillResponse>();
    expect(killRes.body.wasInUse).toBe(true);
  });

  it('returns shared contract payloads for service log requests', async () => {
    const processManager = {
      getLogWatcher: () => ({
        getRecentLogs: (_serviceName: string, lines: number) =>
          Array.from({ length: lines }, (_, idx) => 'log-' + (idx + 1)),
      }),
    } as unknown as ProcessManager;

    const logRotation = {} as LogRotation;
    const cloudLogging = {
      isAvailable: () => false,
    } as unknown as CloudLogging;
    const logStreamer = {
      getLogWatcher: () => ({
        getAvailableSources: () => [],
      }),
    } as unknown as LogStreamer;

    const app = express();
    app.use(
      '/logs',
      createLogsRoutes({ logRotation, cloudLogging, logStreamer, processManager })
    );

    const logsRes = await request(app).get('/logs/services/api/logs?lines=2');
    expect(logsRes.status).toBe(200);
    expectTypeOf(logsRes.body).toMatchTypeOf<ServiceLogsResponse>();
    expect(logsRes.body.logs).toHaveLength(2);
  });
});
