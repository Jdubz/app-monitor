import net from "net";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Check if a specific port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port, "0.0.0.0");
  });
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
      available: await isPortAvailable(port),
    })),
  );

  const busyPorts = results.filter((r) => !r.available).map((r) => r.port);

  return {
    available: busyPorts.length === 0,
    busyPorts,
  };
}

/**
 * Get the PID of the process using a specific port
 */
export async function getPortOwner(port: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get detailed information about what's using a port
 */
export async function getPortInfo(port: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port}`);
    return stdout.trim();
  } catch {
    return null;
  }
}
