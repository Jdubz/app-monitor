/**
 * PM2 Ecosystem Configuration
 * Production process management for app-monitor
 */

module.exports = {
  apps: [
    {
      name: 'app-monitor-backend',
      script: './dist/index.js',
      cwd: '/opt/app-monitor/current/backend',
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      
      // Logging
      error_file: '/opt/app-monitor/logs/pm2-error.log',
      out_file: '/opt/app-monitor/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Advanced features
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
    }
  ]
};
