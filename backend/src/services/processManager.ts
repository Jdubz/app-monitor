import { ChildProcess, spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { services, ServiceConfig } from '../config.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  isPortInUse,
  stopDockerContainer,
  getDockerContainerInfo,
} from '../utils/portManager.js';
import { checkPortsAvailable, getPortInfo } from '../utils/portCheck.js';
import {
  ProcessLifecycle,
  ProcessEventManager,
  PortConflictResolver,
  DockerContainerHelper,
} from './processManager/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const PLAIN_LOGS_DIR = path.join(ROOT_DIR, 'logs/plain');

export interface ProcessInfo {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  pid?: number;
  ports?: number[];
  uptime?: number;
  error?: string;
  startedAt?: number;
  dockerContainer?: {
    name: string;
    status: 'running' | 'stopped' | 'exited' | 'unknown';
    workerStatus?: 'running' | 'idle' | 'stopped' | 'unknown';
    containerId?: string;
  };
}

interface ManagedProcess {
  process: ChildProcess;
  config: ServiceConfig;
  startedAt: number;
  logs: string[];
  logFilePath?: string;
  logFileStream?: fs.WriteStream;
  status: ProcessInfo['status'];
  error?: string;
  lifecycle: ProcessLifecycle;
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();
  private maxLogLines = 1000;
  private eventManager = new ProcessEventManager();

  constructor() {
    super();
    logger.info({
      category: 'system',
      action: 'initialized',
      message: 'ProcessManager initialized',
    });

    // Cleanup on exit
    process.on('SIGTERM', () => this.cleanupAll());
    process.on('SIGINT', () => this.cleanupAll());
  }

  /**
   * Start a service by name
   */
  async startService(serviceName: string): Promise<ProcessInfo> {
    const config = services[serviceName];
    if (!config) {
      throw new Error(`Service "${serviceName}" not found in configuration`);
    }

    // Check if already running
    const existing = this.processes.get(serviceName);
    if (existing && existing.status === 'running') {
      logger.warn({
        category: 'process',
        action: 'start_attempt',
        message: `Service "${serviceName}" is already running`,
      });
      return this.getServiceStatus(serviceName);
    }

    logger.info({
      category: 'process',
      action: 'start',
      message: `Starting service: ${serviceName}`,
    });

    try {
      // Set status to starting
      if (existing) {
        existing.status = 'starting';
      }

      // STRICT PORT CHECK: If requirePorts is true, fail if ports are busy
      if (config.requirePorts && config.ports && config.ports.length > 0) {
        const { available, busyPorts } = await checkPortsAvailable(config.ports);
        
        if (!available) {
          const portDetails = await Promise.all(
            busyPorts.map(async (port) => {
              const info = await getPortInfo(port);
              return `Port ${port}:\n${info || 'Unknown process'}`;
            })
          );
          
          const errorMessage = 
            `Cannot start ${config.displayName}. Required ports are in use:\n\n` +
            portDetails.join('\n\n') +
            `\n\nFix:\n` +
            `  1. Stop conflicting services: make monitor-stop\n` +
            `  2. Or kill processes manually: lsof -ti:${busyPorts.join(',')} | xargs kill`;
          
          logger.error({
            category: 'process',
            action: 'port_conflict',
            message: errorMessage,
            details: { service: serviceName, busyPorts },
          });
          
          throw new Error(errorMessage);
        }
        
        logger.info({
          category: 'process',
          action: 'ports_available',
          message: `All required ports available for ${config.displayName}`,
          details: { ports: config.ports },
        });
      }
      // Legacy behavior: Try to free ports automatically
      else if (config.ports && config.ports.length > 0) {
        await PortConflictResolver.checkAndFreePorts(serviceName, config.ports);
      }

      // For Docker services, check for running containers
      if (config.command === 'docker' && serviceName === 'python-worker') {
        const containerInfo = await DockerContainerHelper.checkExistingContainer(serviceName);

        if (containerInfo && containerInfo.running) {
          logger.info({
            category: 'process',
            action: 'docker_running',
            message: `Docker container already running (PID: ${containerInfo.pid})`,
          });
          logger.info({
            category: 'process',
            action: 'docker_monitoring',
            message: 'Container running - logs monitored via LogWatcher from worker.log',
          });

          return DockerContainerHelper.createDockerProcessInfo(
            config.name,
            config.displayName,
            config.ports,
            containerInfo
          );
        } else {
          logger.info({
            category: 'process',
            action: 'docker_start_new',
            message: 'No running container found, starting new container',
          });
        }
      }

      // Spawn the process
      const childProcess = spawn(config.command, config.args, {
        cwd: config.cwd,
        env: config.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        detached: true, // Create new process group for proper signal handling
      });

      // Create log file in /logs/plain/ directory
      const logFileName = `${serviceName}.log`;
      const logFilePath = path.join(PLAIN_LOGS_DIR, logFileName);

      // Ensure plain logs directory exists
      if (!fs.existsSync(PLAIN_LOGS_DIR)) {
        fs.mkdirSync(PLAIN_LOGS_DIR, { recursive: true });
      }

      // Create write stream for log file
      const logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      const lifecycle = new ProcessLifecycle();
      lifecycle.transitionTo('starting');

      const managedProcess: ManagedProcess = {
        process: childProcess,
        config,
        startedAt: Date.now(),
        logs: [],
        logFilePath,
        logFileStream,
        status: 'starting',
        lifecycle,
      };

      this.processes.set(serviceName, managedProcess);

      // Setup process event handlers using the new event manager
      this.eventManager.attach(
        serviceName,
        childProcess,
        logFileStream,
        managedProcess.logs,
        this.maxLogLines,
        this
      );

      // Handle state transitions from events
      this.on('exit', ({ serviceName: exitedService, code, signal }) => {
        if (exitedService === serviceName) {
          const managed = this.processes.get(serviceName);
          if (managed) {
            if (managed.status !== 'stopping') {
              // Unexpected exit (crash)
              managed.lifecycle.forceTransition('error');
              managed.status = 'error';
              managed.error = `Process exited unexpectedly (code: ${code}, signal: ${signal})`;
              this.emit('status_change', { serviceName, status: 'error', error: managed.error });
            } else {
              managed.lifecycle.transitionTo('stopped');
              managed.status = 'stopped';
              this.emit('status_change', { serviceName, status: 'stopped' });
            }
          }
        }
      });

      this.on('process_error', ({ serviceName: errorService, error }) => {
        if (errorService === serviceName) {
          const managed = this.processes.get(serviceName);
          if (managed) {
            managed.lifecycle.forceTransition('error');
            managed.status = 'error';
            managed.error = error;
            this.emit('status_change', { serviceName, status: 'error', error });
          }
        }
      });

      // When we get log output, consider process running
      this.once('log', ({ serviceName: logService }) => {
        if (logService === serviceName) {
          const managed = this.processes.get(serviceName);
          if (managed && managed.status === 'starting') {
            managed.lifecycle.transitionTo('running');
            managed.status = 'running';
            this.emit('status_change', { serviceName, status: 'running' });
          }
        }
      });

      // Wait a bit to see if it starts successfully
      await this.waitForProcessStart(serviceName, 2000);

      return this.getServiceStatus(serviceName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
      category: 'api',
      action: 'failed_to_start_service_servicename_errormessage',
      message: `Failed to start service "${serviceName}": ${errorMessage}`,
      error
    });

      const managed = this.processes.get(serviceName);
      if (managed) {
        managed.status = 'error';
        managed.error = errorMessage;
      }

      throw error;
    }
  }

  /**
   * Stop a service gracefully (SIGTERM) or forcefully (SIGKILL)
   */
  async stopService(serviceName: string, graceful: boolean = true): Promise<ProcessInfo> {
    const managed = this.processes.get(serviceName);

    if (!managed || managed.status === 'stopped') {
      logger.warn({
      category: 'process',
      action: 'service_servicename_is_not_running',
      message: `Service "${serviceName}" is not running`
    });
      return this.getServiceStatus(serviceName);
    }

    logger.info({
      category: 'api',
      action: 'stopping_service_servicename_graceful_graceful',
      message: `Stopping service "${serviceName}" (graceful: ${graceful})`
    });
    managed.status = 'stopping';
    this.emit('status_change', { serviceName, status: 'stopping' });

    try {
      if (graceful) {
        await this.gracefulStop(serviceName, managed);
      } else {
        await this.forceKill(serviceName, managed);
      }

      // Cleanup event handlers
      this.eventManager.detach(serviceName);

      // Close log file stream
      if (managed.logFileStream) {
        managed.logFileStream.end();
        managed.logFileStream = undefined;
      }

      // Update lifecycle
      if (managed.lifecycle.canTransitionTo('stopped')) {
        managed.lifecycle.transitionTo('stopped');
      } else {
        managed.lifecycle.forceTransition('stopped');
      }
      
      managed.status = 'stopped';
      this.emit('status_change', { serviceName, status: 'stopped' });

      return this.getServiceStatus(serviceName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
      category: 'api',
      action: 'failed_to_stop_service_servicename_errormessage',
      message: `Failed to stop service "${serviceName}": ${errorMessage}`,
      error
    });
      managed.status = 'error';
      managed.error = errorMessage;
      if (managed.lifecycle) {
        managed.lifecycle.forceTransition('error');
      }
      throw error;
    }
  }

  /**
   * Restart a service
   */
  async restartService(serviceName: string, graceful: boolean = true): Promise<ProcessInfo> {
    logger.info({
      category: 'api',
      action: 'restarting_service_servicename',
      message: `Restarting service "${serviceName}"`
    });

    const managed = this.processes.get(serviceName);
    if (managed && managed.status !== 'stopped') {
      await this.stopService(serviceName, graceful);
    }

    return await this.startService(serviceName);
  }

  /**
   * Kill a service forcefully
   */
  async killService(serviceName: string): Promise<ProcessInfo> {
    return await this.stopService(serviceName, false);
  }

  /**
   * Get status of a specific service
   */
  async getServiceStatus(serviceName: string): Promise<ProcessInfo> {
    const config = services[serviceName];
    if (!config) {
      throw new Error(`Service "${serviceName}" not found in configuration`);
    }

    const managed = this.processes.get(serviceName);

    const baseInfo: ProcessInfo = {
      name: config.name,
      displayName: config.displayName,
      status: 'stopped',
      ports: config.ports,
    };

    if (!managed) {
      // Check for docker container even if not managed (legacy Docker mode)
      if (serviceName === 'python-worker' && services[serviceName]?.command === 'docker') {
        const containerNames = ['job-finder-local-dev', 'job-finder-dev'];
        for (const name of containerNames) {
          const containerInfo = await getDockerContainerInfo(name);
          if (containerInfo.running || containerInfo.pid) {
            const workerStatus = await this.getDockerWorkerStatus(name);
            baseInfo.dockerContainer = {
              name,
              status: containerInfo.running ? 'running' : 'stopped',
              workerStatus,
              containerId: containerInfo.containerId || undefined,
            };
            // Update service status to running if container is running
            if (containerInfo.running) {
              baseInfo.status = 'running';
              baseInfo.pid = containerInfo.pid || undefined;
              baseInfo.startedAt = containerInfo.startedAt || undefined;
              baseInfo.uptime = containerInfo.startedAt ? Date.now() - containerInfo.startedAt : undefined;
            }
            break;
          }
        }

        // If no container found
        if (!baseInfo.dockerContainer) {
          baseInfo.dockerContainer = {
            name: 'job-finder-local-dev',
            status: 'stopped',
            workerStatus: 'stopped',
          };
        }
      }

      // Check for Firebase emulators by port usage even if not managed
      if (serviceName === 'firebase-emulators' && config.ports && config.ports.length > 0) {
        // Check if any of the Firebase ports are in use
        const portsInUse = await Promise.all(
          config.ports.map(port => isPortInUse(port))
        );
        const anyPortInUse = portsInUse.some(inUse => inUse);

        if (anyPortInUse) {
          baseInfo.status = 'running';
          logger.info({
      category: 'api',
      action: 'firebase_emulators_detected_running_on_ports_not_managed_by_dev_monitor',
      message: `Firebase emulators detected running on ports (not managed by dev-monitor)`
    });
        }
      }

      return baseInfo;
    }

    const uptime = managed.startedAt ? Date.now() - managed.startedAt : undefined;

    const status: ProcessInfo = {
      ...baseInfo,
      status: managed.status,
      pid: managed.process.pid,
      uptime,
      error: managed.error,
      startedAt: managed.startedAt,
    };

    // Add docker container info for python-worker (legacy Docker mode)
    if (serviceName === 'python-worker' && services[serviceName]?.command === 'docker') {
      const containerNames = ['job-finder-local-dev', 'job-finder-dev'];
      for (const name of containerNames) {
        const containerInfo = await getDockerContainerInfo(name);
        if (containerInfo.running || containerInfo.pid) {
          const workerStatus = await this.getDockerWorkerStatus(name);
          status.dockerContainer = {
            name,
            status: containerInfo.running ? 'running' : 'stopped',
            workerStatus,
            containerId: containerInfo.containerId || undefined,
          };
          break;
        }
      }

      // If no container found
      if (!status.dockerContainer) {
        status.dockerContainer = {
          name: 'job-finder-local-dev',
          status: 'stopped',
          workerStatus: 'stopped',
        };
      }
    }

    // Verify Firebase emulators status by checking ports
    if (serviceName === 'firebase-emulators' && config.ports && config.ports.length > 0) {
      const portsInUse = await Promise.all(
        config.ports.map(port => isPortInUse(port))
      );
      const anyPortInUse = portsInUse.some(inUse => inUse);

      // Update status based on actual port usage
      if (!anyPortInUse && (status.status === 'running' || status.status === 'starting')) {
        // Ports are not in use but status says running - process must have exited
        status.status = 'stopped';
        managed.status = 'stopped';
        logger.warn({
      category: 'process',
      action: 'firebase_emulators_marked_as_status_status_but_ports_not_in_use_updating_to_stopped',
      message: `Firebase emulators marked as ${status.status} but ports not in use - updating to stopped`
    });
      } else if (anyPortInUse && status.status === 'stopped') {
        // Ports are in use but status says stopped - process is running
        status.status = 'running';
        managed.status = 'running';
        logger.info({
      category: 'api',
      action: 'firebase_emulators_running_on_ports_updating_status_to_running',
      message: `Firebase emulators running on ports - updating status to running`
    });
      }
    }

    return status;
  }

  /**
   * Get status of all services
   */
  async getAllStatuses(): Promise<ProcessInfo[]> {
    const serviceNames = Object.keys(services);
    const statuses = await Promise.all(
      serviceNames.map(serviceName => this.getServiceStatus(serviceName))
    );
    return statuses;
  }

  // Note: getServiceLogs removed - logs are now read from files via LogWatcher
  
  /**
   * Get the LogWatcher instance for file-based log reading
   */
  public getLogWatcher(): any {
    // This will be injected by the LogStreamer
    return (this as any).logWatcher;
  }

  /**
   * Check if worker process is running inside docker container
   * Checks the queue_worker.log file for recent activity
   */
  private async getDockerWorkerStatus(containerName: string): Promise<'running' | 'idle' | 'stopped' | 'unknown'> {
    try {
      // Check if queue_worker.py process is running in container
      const { execAsync } = await import('../utils/portManager.js');
      const { stdout } = await execAsync(
        `docker exec ${containerName} ps aux | grep -v grep | grep queue_worker.py`
      );

      if (stdout.trim()) {
        // Process exists, check if it's actively processing
        // Look at recent log entries (last 30 seconds)
        const logFile = path.join(ROOT_DIR, 'logs/queue_worker.log');
        if (fs.existsSync(logFile)) {
          const stats = fs.statSync(logFile);
          const lastModified = stats.mtime.getTime();
          const now = Date.now();

          // If log was updated in last 30 seconds, worker is active
          if (now - lastModified < 30000) {
            return 'running';
          } else {
            return 'idle';
          }
        }
        return 'running';
      }
      return 'stopped';
    } catch (error) {
      logger.error({
      category: 'api',
      action: 'failed_to_check_docker_worker_status_error',
      message: `Failed to check docker worker status: ${error}`,
      error
    });
      return 'unknown';
    }
  }

  /**
   * Setup event handlers for a child process
   */
  /**
   * Wait for a process to start successfully
   */
  private async waitForProcessStart(serviceName: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const managed = this.processes.get(serviceName);
      if (!managed) {
        reject(new Error('Process not found'));
        return;
      }

      const timer = setTimeout(() => {
        if (managed.status === 'starting') {
          managed.status = 'running';
          this.emit('status_change', { serviceName, status: 'running' });
        }
        resolve();
      }, timeout);

      // Listen for early errors
      const errorHandler = () => {
        clearTimeout(timer);
        reject(new Error(managed.error || 'Process failed to start'));
      };

      managed.process.once('error', errorHandler);
      managed.process.once('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      // Cleanup listeners
      setTimeout(() => {
        managed.process.removeListener('error', errorHandler);
      }, timeout);
    });
  }

  /**
   * Gracefully stop a process with timeout
   */
  private async gracefulStop(serviceName: string, managed: ManagedProcess): Promise<void> {
    const { process: childProcess, config } = managed;

    // Determine timeout based on service type
    const timeout = serviceName === 'firebase-emulators' ? 30000 : 10000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        logger.warn({
      category: 'process',
      action: 'service_servicename_did_not_stop_gracefully_forcing_kill',
      message: `Service "${serviceName}" did not stop gracefully, forcing kill`
    });
        this.forceKill(serviceName, managed).then(resolve).catch(reject);
      }, timeout);

      childProcess.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      // Send SIGTERM
      if (config.command === 'docker') {
        // Use docker compose stop for graceful shutdown
        spawn('docker', ['compose', '-f', 'docker-compose.dev.yml', 'stop'], {
          cwd: config.cwd,
          shell: true,
        });
      } else {
        // Kill process group to ensure child processes receive the signal
        // Negative PID kills the process group
        try {
          if (childProcess.pid) {
            process.kill(-childProcess.pid, 'SIGTERM');
            logger.info({
      category: 'api',
      action: 'sent_sigterm_to_process_group_childprocess_pid',
      message: `Sent SIGTERM to process group ${-childProcess.pid}`
    });
          }
        } catch (error) {
          // If process group kill fails, fall back to regular kill
          logger.warn({
      category: 'process',
      action: 'failed_to_kill_process_group_trying_regular_kill_error',
      message: `Failed to kill process group, trying regular kill: ${error}`
    });
          childProcess.kill('SIGTERM');
        }
      }
    });
  }

  /**
   * Forcefully kill a process
   */
  private async forceKill(serviceName: string, managed: ManagedProcess): Promise<void> {
    const { process: childProcess, config } = managed;

    return new Promise((resolve) => {
      childProcess.once('exit', () => {
        resolve();
      });

      if (config.command === 'docker') {
        spawn('docker', ['compose', '-f', 'docker-compose.dev.yml', 'kill'], {
          cwd: config.cwd,
          shell: true,
        });
      } else {
        // Kill process group to ensure child processes are killed
        try {
          if (childProcess.pid) {
            process.kill(-childProcess.pid, 'SIGKILL');
            logger.info({
      category: 'api',
      action: 'sent_sigkill_to_process_group_childprocess_pid',
      message: `Sent SIGKILL to process group ${-childProcess.pid}`
    });
          }
        } catch (error) {
          // If process group kill fails, fall back to regular kill
          logger.warn({
      category: 'process',
      action: 'failed_to_kill_process_group_trying_regular_kill_error',
      message: `Failed to kill process group, trying regular kill: ${error}`
    });
          childProcess.kill('SIGKILL');
        }
      }

      // Force resolve after 5 seconds
      setTimeout(resolve, 5000);
    });
  }

  /**
   * Cleanup all processes on shutdown
   */
  private async cleanupAll(): Promise<void> {
    logger.info({
      category: 'process',
      action: 'cleanup',
      message: 'Cleaning up all processes...',
    });

    // Stop all managed processes
    const promises = Array.from(this.processes.keys()).map(serviceName =>
      this.stopService(serviceName, true).catch(err =>
        logger.error({
          category: 'process',
          action: 'cleanup_error',
          message: `Failed to stop ${serviceName}: ${err.message}`,
        })
      )
    );

    await Promise.all(promises);

    // Cleanup all event handlers
    this.eventManager.cleanupAll();

    // Only cleanup Docker containers if we're actually using Docker
    // Check if any service is configured to use Docker
    const usingDocker = Object.values(services).some(service => service.command === 'docker');
    
    if (usingDocker) {
      logger.info({
        category: 'process',
        action: 'docker_cleanup',
        message: 'Stopping any remaining Docker containers...',
      });
      const containerNames = ['job-finder-local-dev', 'job-finder-dev', 'job-finder-staging-local'];
      for (const name of containerNames) {
        try {
          await stopDockerContainer(name);
          logger.info({
            category: 'process',
            action: 'docker_stopped',
            message: `Docker container ${name} stopped`,
          });
        } catch (error) {
          // Container might not exist or already be stopped, log but continue
          logger.warn({
            category: 'process',
            action: 'docker_stop_failed',
            message: `Could not stop container ${name}: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    } else {
      logger.info({
        category: 'process',
        action: 'cleanup_complete',
        message: 'All processes cleaned up (no Docker containers to stop)',
      });
    }
    process.exit(0);
  }
}
