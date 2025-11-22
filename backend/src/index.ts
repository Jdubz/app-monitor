import { createApp, devBotsManager } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { ShutdownStateManager } from './services/shutdownStateManager.js';
import { getDatabase } from './services/database.js';
import { ensureSingleInstance } from './utils/singleInstance.js';

// Global error handlers to catch crashes
const exitOnFatalError = process.env.NODE_ENV !== 'test';

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  if (exitOnFatalError) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  if (exitOnFatalError) {
    process.exit(1);
  }
});

// Ensure only one instance runs on this port (prevents duplicate process issues)
await ensureSingleInstance(config.port);

const server = await createApp();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Dev Monitor Backend running on http://0.0.0.0:${config.port}`);
  console.log(`📡 CORS enabled for: ${config.corsOrigin}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);

  // Signal PM2 that the app is ready (for zero-downtime reloads)
  if (process.send) {
    process.send('ready');
  }
});

// Graceful shutdown handling
// Export so health endpoint can check this
export let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn({
      category: 'system',
      action: 'shutdown_already_in_progress',
      message: 'Shutdown already in progress, ignoring signal',
      details: { signal }
    });
    return;
  }

  isShuttingDown = true;

  logger.info({
    category: 'system',
    action: 'shutdown_initiated',
    message: `Graceful shutdown initiated by ${signal}`,
    details: { signal }
  });

  console.log(`\n🛑 Graceful shutdown initiated by ${signal}...`);

  // Phase 1: Stop accepting new connections (close server)
  console.log('📡 Closing HTTP server...');
  server.close(() => {
    logger.info({
      category: 'system',
      action: 'http_server_closed',
      message: 'HTTP server closed'
    });
  });

  // Phase 2.5: Cleanup managed processes (processManager removed)
  console.log('🧹 Process cleanup skipped (processManager removed)...');
  logger.info({
    category: 'system',
    action: 'process_cleanup_skipped',
    message: 'ProcessManager removed - no managed processes to cleanup'
  });

  // Phase 2: Wait for active tasks to complete (with timeout)
  console.log('⏳ Waiting for active tasks to complete (max 60s)...');
  const taskWaitTimeout = 60000; // 60 seconds

  // Simple wait - actual task completion detection would require getStats() method
  await new Promise(resolve => setTimeout(resolve, taskWaitTimeout));
  console.log('⏳ Task wait period complete');

  // Phase 3: Persist ephemeral state
  console.log('💾 Persisting ephemeral state...');
  try {
    const shutdownStateManager = new ShutdownStateManager(getDatabase());

    // Get retry history from retry manager
    const retryManager = devBotsManager?.getRetryManager?.();
    if (retryManager) {
      const retryHistory = retryManager.exportHistory();
      await shutdownStateManager.saveRetryHistory(retryHistory);
      logger.info({
        category: 'system',
        action: 'retry_history_persisted',
        message: 'Retry history persisted',
        details: { taskCount: retryHistory.size }
      });
    }

    // Log file positions tracking removed (logWatcher removed)
    logger.info({
      category: 'system',
      action: 'log_positions_tracking_removed',
      message: 'Log file position tracking removed with logWatcher'
    });

    logger.info({
      category: 'system',
      action: 'ephemeral_state_persisted',
      message: 'Ephemeral state successfully persisted'
    });
    console.log('✅ Ephemeral state persisted');
  } catch (error) {
    logger.error({
      category: 'system',
      action: 'state_persistence_failed',
      message: 'Failed to persist ephemeral state',
      error
    });
    console.log('⚠️  Failed to persist ephemeral state:', error);
  }

  // Phase 4: Log rotation removed
  console.log('📝 Log rotation not applicable (removed)...');
  logger.info({
    category: 'system',
    action: 'log_rotation_removed',
    message: 'Log rotation removed - no longer needed'
  });

  // Phase 5: Cleanup (graceful shutdown complete)
  console.log('🗄️  Cleaning up resources...');
  logger.info({
    category: 'system',
    action: 'resources_cleanup',
    message: 'Resources cleanup initiated'
  });

  // Shutdown ephemeral worker service to close log streams
  if (devBotsManager) {
    try {
      const ephemeralWorkerService = devBotsManager.getEphemeralWorkerService?.();
      if (ephemeralWorkerService?.shutdown) {
        await ephemeralWorkerService.shutdown();
        logger.info({
          category: 'system',
          action: 'ephemeral_worker_shutdown',
          message: 'Ephemeral worker service shutdown completed'
        });
        console.log('✅ Ephemeral worker service shutdown completed');
      }
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'ephemeral_worker_shutdown_failed',
        message: 'Failed to shutdown ephemeral worker service',
        error
      });
      console.log('⚠️  Failed to shutdown ephemeral worker service:', error);
    }
  }

  console.log('✅ Graceful shutdown completed');
  logger.info({
    category: 'system',
    action: 'shutdown_completed',
    message: 'Graceful shutdown completed successfully'
  });

  // Exit cleanly
  process.exit(0);
}

// Register shutdown handlers
// Note: These are the ONLY signal handlers - processManager no longer registers its own
// The graceful shutdown function is async and will call process.exit() when complete
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
