module.exports = {
  apps: [{
    name: 'app-monitor-backend',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    wait_ready: true,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      LOGS_DIR: process.env.LOGS_DIR || '/opt/app-monitor/shared/backend/data/logs'
    },
    error_file: process.env.LOGS_DIR ? `${process.env.LOGS_DIR}/pm2-error.log` : '/opt/app-monitor/shared/backend/data/logs/pm2-error.log',
    out_file: process.env.LOGS_DIR ? `${process.env.LOGS_DIR}/pm2-out.log` : '/opt/app-monitor/shared/backend/data/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    min_uptime: '10s',
    // Increased resilience: 30 restarts with 10s delay (~5 min total) for transient failures
    max_restarts: 30,
    restart_delay: 10000,
    // Graceful shutdown can take up to 91s (1s notifications, 60s tasks, 30s WebSocket drain)
    kill_timeout: 95000
  }]
};
