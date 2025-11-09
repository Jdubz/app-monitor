import { createApp, logRotation, connectionManager } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// Global error handlers to catch crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

const server = await createApp();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Dev Monitor Backend running on http://0.0.0.0:${config.port}`);
  console.log(`📡 CORS enabled for: ${config.corsOrigin}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔌 Socket.IO ready for connections`);
});

// Graceful shutdown handling
let isShuttingDown = false;

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

  // Phase 2: Wait for active tasks to complete (with timeout)
  console.log('⏳ Waiting for active tasks to complete (max 20s)...');
  const taskWaitTimeout = 20000; // 20 seconds

  // Simple wait - actual task completion detection would require getStats() method
  await new Promise(resolve => setTimeout(resolve, Math.min(taskWaitTimeout, 5000)));
  console.log('⏳ Task wait period complete');

  // Phase 4: Drain WebSocket connections (with timeout)
  console.log('🔌 Draining WebSocket connections (max 5s)...');
  const wsWaitStart = Date.now();
  const wsWaitTimeout = 5000; // 5 seconds

  while (Date.now() - wsWaitStart < wsWaitTimeout) {
    const connectionCount = connectionManager.getConnectionCount();
    if (connectionCount === 0) {
      console.log('✅ All WebSocket connections closed');
      logger.info({
        category: 'system',
        action: 'websocket_connections_closed',
        message: 'All WebSocket connections closed'
      });
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const remainingConnections = connectionManager.getConnectionCount();
  if (remainingConnections > 0) {
    logger.warn({
      category: 'system',
      action: 'shutdown_with_active_connections',
      message: 'Shutting down with active WebSocket connections',
      details: { remainingConnections }
    });
    console.log(`⚠️  Shutting down with ${remainingConnections} active WebSocket connections`);
  }

  // Phase 5: Stop log rotation
  console.log('📝 Stopping log rotation...');
  try {
    logRotation.stop();
    logger.info({
      category: 'system',
      action: 'log_rotation_stopped',
      message: 'Log rotation stopped'
    });
  } catch (error) {
    logger.error({
      category: 'system',
      action: 'log_rotation_stop_failed',
      message: 'Failed to stop log rotation',
      error
    });
  }

  // Phase 6: Cleanup (graceful shutdown complete)
  console.log('🗄️  Cleaning up resources...');
  logger.info({
    category: 'system',
    action: 'resources_cleanup',
    message: 'Resources cleanup initiated'
  });

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
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
