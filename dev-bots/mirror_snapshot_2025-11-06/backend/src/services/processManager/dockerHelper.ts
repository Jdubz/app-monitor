/**
 * Docker container detection and management helpers
 */

import { logger } from "../../utils/logger.js";
import { getDockerContainerInfo } from "../../utils/portManager.js";
import { ProcessInfo } from "../processManager.js";

export class DockerContainerHelper {
  private static readonly CONTAINER_NAMES = [
    "job-finder-local-dev",
    "job-finder-dev",
  ];

  /**
   * Check if Docker container is already running
   * @returns Container info if running, null otherwise
   */
  static async checkExistingContainer(_serviceName: string): Promise<{
    running: boolean;
    pid: number | null;
    startedAt: number | null;
    containerId: string | null;
    containerName: string | null;
  } | null> {
    logger.info({
      category: "process",
      action: "docker_check",
      message: "Checking for existing Docker container",
    });

    for (const name of this.CONTAINER_NAMES) {
      const info = await getDockerContainerInfo(name);

      if (info.running) {
        logger.info({
          category: "process",
          action: "docker_found",
          message: `Found running container: ${name}`,
          details: { containerName: name, pid: info.pid },
        });

        return {
          running: info.running,
          pid: info.pid,
          startedAt: info.startedAt,
          containerId: info.containerId,
          containerName: name,
        };
      }
    }

    logger.info({
      category: "process",
      action: "docker_not_found",
      message: "No running container found",
    });

    return null;
  }

  /**
   * Get worker status from Docker container
   */
  static async getWorkerStatus(
    containerName: string,
  ): Promise<"running" | "idle" | "stopped" | "unknown"> {
    // This would check actual worker status
    // For now, return a simple implementation
    const info = await getDockerContainerInfo(containerName);
    return info.running ? "running" : "stopped";
  }

  /**
   * Create ProcessInfo for running Docker container
   */
  static createDockerProcessInfo(
    serviceName: string,
    displayName: string,
    ports: number[] | undefined,
    containerInfo: {
      running: boolean;
      pid: number | null;
      startedAt: number | null;
      containerId: string | null;
      containerName: string | null;
    },
  ): ProcessInfo {
    const uptime = containerInfo.startedAt
      ? Date.now() - containerInfo.startedAt
      : undefined;

    return {
      name: serviceName,
      displayName,
      status: "running",
      pid: containerInfo.pid || undefined,
      ports,
      uptime,
      startedAt: containerInfo.startedAt || undefined,
      dockerContainer: {
        name: containerInfo.containerName || "unknown",
        status: "running",
        containerId: containerInfo.containerId || undefined,
      },
    };
  }
}
