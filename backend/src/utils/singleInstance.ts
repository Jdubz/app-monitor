import { logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Ensures only one instance of the backend runs on a given port
 * 
 * Uses PID file locking to prevent duplicate processes that would cause
 * port conflicts and break webhook processing.
 * 
 * @param port - The port this instance will run on
 * @throws Error if another instance is already running on this port
 */
export async function ensureSingleInstance(port: number): Promise<void> {
  const pidDir = process.env.NODE_ENV === 'production' 
    ? '/opt/app-monitor/shared/pids'
    : path.join(process.cwd(), '.pids');
    
  const pidFile = path.join(pidDir, `backend-${port}.pid`);
  
  // Create PID directory if needed
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }
  
  // Check for existing PID file
  if (fs.existsSync(pidFile)) {
    const pidContent = fs.readFileSync(pidFile, 'utf8').trim();
    const oldPid = parseInt(pidContent);
    
    if (isNaN(oldPid)) {
      logger.warn({
        category: 'system',
        action: 'invalid_pid_file',
        message: `Invalid PID file content: ${pidContent}`,
        details: { pidFile, content: pidContent }
      });
      fs.unlinkSync(pidFile);
    } else {
      // Check if process is still running
      try {
        process.kill(oldPid, 0); // Signal 0 just checks if process exists

        // Process exists - this is a duplicate!
        logger.error({
          category: 'system',
          action: 'duplicate_instance_detected',
          message: `Another instance is already running on port ${port}. Stop existing service: sudo systemctl stop app-monitor-backend@${port}.service`,
          details: {
            oldPid,
            currentPid: process.pid,
            port,
            pidFile
          }
        });

        throw new Error(`Duplicate instance detected on port ${port} (existing PID: ${oldPid})`);
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'ESRCH') {
          // Process doesn't exist - stale PID file
          logger.warn({
            category: 'system',
            action: 'stale_pid_file_removed',
            message: `Removed stale PID file (process ${oldPid} not running)`,
            details: { oldPid, pidFile }
          });
          fs.unlinkSync(pidFile);
        } else if (nodeErr.message && nodeErr.message.includes('Duplicate instance detected')) {
          // This is our thrown error, re-throw it
          throw err;
        } else {
          // Some other error checking process
          logger.error({
            category: 'system',
            action: 'pid_check_failed',
            message: 'Failed to check if process is running',
            error: err,
            details: { oldPid, pidFile }
          });
          throw err;
        }
      }
    }
  }
  
  // Write our PID
  fs.writeFileSync(pidFile, process.pid.toString());
  
  logger.info({
    category: 'system',
    action: 'pid_file_created',
    message: `Single instance lock acquired on port ${port}`,
    details: { pid: process.pid, port, pidFile }
  });
  
  // Clean up PID file on exit
  const cleanup = () => {
    try {
      if (fs.existsSync(pidFile)) {
        const currentPid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        if (currentPid === process.pid) {
          fs.unlinkSync(pidFile);
          logger.info({
            category: 'system',
            action: 'pid_file_removed',
            message: 'Single instance lock released',
            details: { pid: process.pid, port }
          });
        }
      }
    } catch (err) {
      logger.error({
        category: 'system',
        action: 'pid_cleanup_failed',
        message: 'Failed to clean up PID file on exit',
        error: err
      });
    }
  };
  
  process.once('exit', cleanup);
  process.once('SIGTERM', () => process.exit(0));
  process.once('SIGINT', () => process.exit(0));
}
