import { exec } from 'child_process';
import { promisify } from 'util';
import type { PortInfo as ContractPortInfo } from '@app-monitor/api-contracts';

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

    console.log(`[PORT] Killing process ${pid} on port ${port}`);

    // Try graceful SIGTERM first
    try {
      process.kill(pid, 'SIGTERM');

      // Wait 2 seconds for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if process is still alive
      const stillRunning = await isPortInUse(port);

      if (!stillRunning) {
        console.log(`[PORT] Process ${pid} stopped gracefully`);
        return true;
      }
    } catch (error) {
      // Process might already be dead
    }

    // Force kill with SIGKILL
    try {
      await execAsync(`kill -9 ${pid}`);
      console.log(`[PORT] Process ${pid} force killed`);

      // Wait a moment for port to be released
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    } catch (error) {
      console.error(`[PORT] Failed to kill process ${pid}:`, error);
      return false;
    }
  } catch (error) {
    console.error(`[PORT] Error killing port ${port}:`, error);
    return false;
  }
}

/**
 * Kill all processes on multiple ports
 */
export async function killMultiplePorts(ports: number[]): Promise<void> {
  console.log(`[PORT] Killing processes on ports: ${ports.join(', ')}`);

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

    console.log(`[DOCKER] Stopping container: ${containerName}`);
    await execAsync(`docker stop ${containerName}`);

    console.log(`[DOCKER] Container stopped: ${containerName}`);
    return true;
  } catch (error) {
    console.error(`[DOCKER] Failed to stop container ${containerName}:`, error);
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
    console.error(`[DOCKER] Failed to get container info for ${containerName}:`, error);
    return {
      running: false,
      pid: null,
      startedAt: null,
      containerId: null,
    };
  }
}
