/**
 * Integration Tests for Docker Operations
 *
 * These tests run only when a local Docker daemon is available. In CI and
 * other restricted environments the suite is skipped automatically.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { DockerManager } from '../../src/services/dockerManager.js';

const dockerManager = new DockerManager();
const dockerValidation = await dockerManager.validateDockerEnvironment().catch(() => ({
  isValid: false,
  message: 'Docker environment validation failed',
}));

const dockerAvailable = dockerValidation.isValid;

if (!dockerAvailable) {
  console.warn('Docker not available, skipping Docker integration tests');
}

const describeIfDocker = dockerAvailable ? describe : describe.skip;
const itIfDocker = dockerAvailable ? it : it.skip;

describeIfDocker('Docker Operations Integration', () => {
  const TEST_IMAGE = 'alpine:latest';
  const testContainers: string[] = [];

  afterAll(async () => {
    for (const containerId of testContainers) {
      try {
        await dockerManager.stopContainer(containerId, 1);
        await dockerManager.removeContainer(containerId, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 30000);

  itIfDocker('validates Docker environment', async () => {
    expect(dockerValidation.isValid).toBe(true);
  });

  itIfDocker('lists available containers', async () => {
    const containers = await dockerManager.listContainers({ all: true });
    expect(Array.isArray(containers)).toBe(true);
  });

  itIfDocker('creates, starts, and removes a container', async () => {
    const containerName = `dev-monitor-test-container-${randomUUID().slice(0, 8)}`;

    const container = await dockerManager.createContainer({
      Image: TEST_IMAGE,
      name: containerName,
      Cmd: ['sleep', '5'],
      Labels: { 'dev-monitor-test': 'true' },
    });

    expect(container.id).toBeDefined();
    testContainers.push(container.id);

    await dockerManager.startContainer(container.id);
    const inspect = await dockerManager.inspectContainer(container.id);
    expect(inspect?.State?.Running).toBe(true);

    await dockerManager.stopContainer(container.id, 1);
    await dockerManager.removeContainer(container.id);
    testContainers.splice(testContainers.indexOf(container.id), 1);

    await expect(dockerManager.inspectContainer(container.id)).resolves.toBeNull();
  }, 40000);
});
