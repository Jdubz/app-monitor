/**
 * Port conflict detection and resolution
 */

import { logger } from "../../utils/logger.js";
import { isPortInUse, killPortProcess } from "../../utils/portManager.js";

export class PortConflictResolver {
  /**
   * Check and free ports if they're in use
   * @returns true if any ports were freed
   */
  static async checkAndFreePorts(
    serviceName: string,
    ports: number[],
  ): Promise<boolean> {
    logger.info({
      category: "process",
      action: "port_check",
      message: `Checking ports for ${serviceName}`,
      details: { ports },
    });

    let portsFreed = false;

    for (const port of ports) {
      const inUse = await isPortInUse(port);

      if (inUse) {
        logger.warn({
          category: "process",
          action: "port_conflict",
          message: `Port ${port} in use, stopping conflicting process`,
          details: { port, serviceName },
        });

        const killed = await killPortProcess(port);

        if (!killed) {
          throw new Error(`Port ${port} is occupied and could not be freed`);
        }

        logger.info({
          category: "process",
          action: "port_freed",
          message: `Port ${port} freed successfully`,
          details: { port },
        });

        portsFreed = true;
      }
    }

    // If we freed any ports, wait for processes to fully terminate
    if (portsFreed) {
      logger.info({
        category: "process",
        action: "wait_termination",
        message: "Waiting for processes to fully terminate",
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    return portsFreed;
  }
}
