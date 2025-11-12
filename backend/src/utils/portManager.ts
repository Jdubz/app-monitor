import { exec } from 'child_process';
import { promisify } from 'util';
import type { PortInfo as ContractPortInfo } from '@app-monitor/api-contracts';
import { logger } from './logger.js';

export const execAsync = promisify(exec);

export type PortInfo = ContractPortInfo;

/**
 * Check if a port is in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    return stdout.trim().length > 0;
  } catch (error) {
    // lsof returns non-zero exit code if port is not in use
    return false;
  }
}

/**
 * Get the PID of the process using a port
 */
export async function getPortPid(port: number): Promise<number | null> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pid = parseInt(stdout.trim().split('\n')[0]);
    return isNaN(pid) ? null : pid;
  } catch (error) {
    return null;
  }
}

/**
 * Get detailed port information
 */
export async function getPortInfo(port: number): Promise<PortInfo> {
  const inUse = await isPortInUse(port);
  const pid = inUse ? await getPortPid(port) : null;

  return {
    port,
    pid,
    inUse,
  };
}

/**
 * Check if multiple ports are available
 */
export async function checkPortsAvailable(ports: number[]): Promise<{
  available: boolean;
  busyPorts: number[];
}> {
  const results = await Promise.all(
    ports.map(async (port) => ({
      port,
      available: !(await isPortInUse(port)),
    }))
  );

  const busyPorts = results
    .filter((r) => !r.available)
    .map((r) => r.port);

  return {
    available: busyPorts.length === 0,
    busyPorts,
  };
}

/**
 * Kill process using a port (graceful SIGTERM first, then SIGKILL)
 */
export async function killPortProcess(port: number): Promise<boolean> {
  try {
    const pid = await getPortPid(port);

    if (!pid) {
      return true; // Port not in use
    }

    logger.info({
      category: 'port-manager',
      action: 'kill_process_start',
      message: `Killing process ${pid} on port ${port}`,
      details: { pid, port }
    });

    // Try graceful SIGTERM first
    try {
      process.kill(pid, 'SIGTERM');

      // Wait 2 seconds for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if process is still alive
      const stillRunning = await isPortInUse(port);

      if (!stillRunning) {
        logger.info({
          category: 'port-manager',
          action: 'process_stopped_gracefully',
          message: `Process ${pid} stopped gracefully`,
          details: { pid, port }
        });
        return true;
      }
    } catch (error) {
      // Process might already be dead
    }

    // Force kill with SIGKILL
    try {
      await execAsync(`kill -9 ${pid}`);
      logger.info({
        category: 'port-manager',
        action: 'process_force_killed',
        message: `Process ${pid} force killed`,
        details: { pid, port }
      });

      // Wait a moment for port to be released
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    } catch (error) {
      logger.error({
        category: 'port-manager',
        action: 'kill_process_failed',
        message: `Failed to kill process ${pid}`,
        details: { pid, port, error }
      });
      return false;
    }
  } catch (error) {
    logger.error({
      category: 'port-manager',
      action: 'kill_port_error',
      message: `Error killing port ${port}`,
      details: { port, error }
    });
    return false;
  }
}

/**
 * Kill all processes on multiple ports
 */
export async function killMultiplePorts(ports: number[]): Promise<void> {
  logger.info({
    category: 'port-manager',
    action: 'kill_multiple_ports',
    message: 'Killing processes on multiple ports',
    details: { ports }
  });

  await Promise.all(ports.map(port => killPortProcess(port)));
}

/**
 * Wait for a port to become available
 */
export async function waitForPortFree(port: number, timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const inUse = await isPortInUse(port);

    if (!inUse) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return false;
}

/**
 * Check if Docker container is running
 */
export async function isDockerContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "name=${containerName}" --filter "status=running" --format "{{.Names}}"`
    );
    return stdout.trim().includes(containerName);
  } catch (error) {
    return false;
  }
}

/**
 * Stop Docker container
 */
export async function stopDockerContainer(containerName: string): Promise<boolean> {
  try {
    const isRunning = await isDockerContainerRunning(containerName);

    if (!isRunning) {
      return true;
    }

    logger.info({
      category: 'docker',
      action: 'stopping_container',
      message: `Stopping container: ${containerName}`,
      details: { containerName }
    });
    await execAsync(`docker stop ${containerName}`);

    logger.info({
      category: 'docker',
      action: 'container_stopped',
      message: `Container stopped: ${containerName}`,
      details: { containerName }
    });
    return true;
  } catch (error) {
    logger.error({
      category: 'docker',
      action: 'stop_container_failed',
      message: `Failed to stop container ${containerName}`,
      details: { containerName, error }
    });
    return false;
  }
}

/**
 * Get Docker container PID (host process ID)
 */
export async function getDockerContainerPid(containerName: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Pid}}' ${containerName}`
    );
    const pid = parseInt(stdout.trim());
    return isNaN(pid) || pid === 0 ? null : pid;
  } catch (error) {
    return null;
  }
}

/**
 * Get Docker container info (running status, PID, uptime, container ID)
 */
export async function getDockerContainerInfo(containerName: string): Promise<{
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  containerId: string | null;
}> {
  try {
    const isRunning = await isDockerContainerRunning(containerName);

    if (!isRunning) {
      return {
        running: false,
        pid: null,
        startedAt: null,
        containerId: null,
      };
    }

    const pid = await getDockerContainerPid(containerName);

    // Get container start time
    const { stdout: startTimeStr } = await execAsync(
      `docker inspect --format='{{.State.StartedAt}}' ${containerName}`
    );
    const startedAt = startTimeStr.trim() ? new Date(startTimeStr.trim()).getTime() : null;

    // Get container ID
    const { stdout: containerIdStr } = await execAsync(
      `docker inspect --format='{{.Id}}' ${containerName}`
    );
    const containerId = containerIdStr.trim() || null;

    return {
      running: true,
      pid,
      startedAt,
      containerId,
    };
  } catch (error) {
    logger.error({
      category: 'docker',
      action: 'get_container_info_failed',
      message: `Failed to get container info for ${containerName}`,
      details: { containerName, error }
    });
    return {
      running: false,
      pid: null,
      startedAt: null,
      containerId: null,
    };
  }
}
