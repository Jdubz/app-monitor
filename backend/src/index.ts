import { createApp } from './server.js';
import { config } from './config.js';

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

const server = createApp();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Dev Monitor Backend running on http://0.0.0.0:${config.port}`);
  console.log(`📡 CORS enabled for: ${config.corsOrigin}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔌 Socket.IO ready for connections`);
});
