import { createApp } from '../../src/server.js';
import type { CreateAppOptions } from '../../src/server.js';
import { buildMockServerDependencies } from './mockServerDependencies.js';

export async function createApiTestServer() {
  const deps = buildMockServerDependencies();

  const app = await createApp({
    overrides: {
      processManager: deps.processManager,
      cloudLogging: deps.cloudLogging,
      devBotsManager: deps.devBotsManager,
      logRotation: deps.logRotation,
      logStreamer: deps.logStreamer,
      logSourceManager: deps.logSourceManager,
      services: deps.services,
    },
  } satisfies CreateAppOptions);

  return { server: app, deps };
}
