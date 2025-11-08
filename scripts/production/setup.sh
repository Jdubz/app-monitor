#!/bin/bash
#
# Initial Production Setup Script for App Monitor
# Run this once to set up the production environment
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as correct user
if [ "$USER" != "jdubz" ]; then
    log_error "This script should be run as user 'jdubz'"
    exit 1
fi

log_info "Starting production environment setup..."

# 1. Create directory structure
log_info "Creating directory structure..."
sudo mkdir -p /opt/app-monitor/{releases,shared/{backend/data,logs,backups/database},scripts}
sudo chown -R jdubz:jdubz /opt/app-monitor

# 2. Copy deployment scripts
log_info "Copying deployment scripts..."
mkdir -p /opt/app-monitor/scripts/production
mkdir -p /opt/app-monitor/scripts/systemd
cp scripts/production/*.sh /opt/app-monitor/scripts/production/
cp scripts/systemd/* /opt/app-monitor/scripts/systemd/
chmod +x /opt/app-monitor/scripts/production/*.sh

# 3. Install systemd services
log_info "Installing systemd services..."
sudo cp scripts/systemd/app-monitor-backend@.service /etc/systemd/system/
sudo systemctl daemon-reload

# 4. Configure nginx
log_info "Configuring nginx..."
if [ ! -f /etc/nginx/sites-available/app-monitor ]; then
    sudo cp scripts/systemd/app-monitor-nginx.conf /etc/nginx/sites-available/app-monitor

    # Enable site if not already enabled
    if [ ! -L /etc/nginx/sites-enabled/app-monitor ]; then
        sudo ln -s /etc/nginx/sites-available/app-monitor /etc/nginx/sites-enabled/
    fi

    # Test nginx configuration
    if sudo nginx -t; then
        log_info "Nginx configuration is valid"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
else
    log_warn "Nginx configuration already exists, skipping..."
fi

# 5. Initialize database with WAL mode
log_info "Checking database configuration..."
DB_PATH="/opt/app-monitor/shared/backend/data/dev-bots.db"

if [ -f "$DB_PATH" ]; then
    log_info "Database already exists, verifying WAL mode..."
    JOURNAL_MODE=$(sqlite3 "$DB_PATH" 'PRAGMA journal_mode;' 2>/dev/null || echo "unknown")

    if [ "$JOURNAL_MODE" != "wal" ]; then
        log_info "Enabling WAL mode on database..."
        sqlite3 "$DB_PATH" 'PRAGMA journal_mode=WAL;'
    else
        log_info "Database already in WAL mode"
    fi
else
    log_info "Database will be created on first deployment"
fi

# 6. Check Docker
log_info "Verifying Docker installation..."
if command -v docker > /dev/null; then
    if docker ps > /dev/null 2>&1; then
        log_info "✓ Docker is running"
    else
        log_error "Docker is installed but not running"
        log_info "Start Docker with: sudo systemctl start docker"
        exit 1
    fi
else
    log_error "Docker is not installed"
    log_info "Install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

# 7. Check Node.js
log_info "Verifying Node.js installation..."
if command -v node > /dev/null; then
    NODE_VERSION=$(node -v)
    log_info "✓ Node.js is installed: ${NODE_VERSION}"
else
    log_error "Node.js is not installed"
    log_info "Install Node.js 18+: https://nodejs.org/"
    exit 1
fi

# 8. Enable services (but don't start yet - first deployment will do that)
log_info "Enabling systemd services..."
sudo systemctl enable app-monitor-backend@5001.service
sudo systemctl enable app-monitor-backend@5002.service

log_info ""
log_info "============================================"
log_info "✅ Production environment setup completed!"
log_info "============================================"
log_info ""
log_info "Next steps:"
log_info "  1. Review nginx configuration: /etc/nginx/sites-available/app-monitor"
log_info "  2. Reload nginx: sudo systemctl reload nginx"
log_info "  3. Run first deployment: ./scripts/production/deploy.sh"
log_info ""
log_info "Useful commands:"
log_info "  - Deploy: ./scripts/production/deploy.sh"
log_info "  - Rollback: /opt/app-monitor/scripts/production/rollback.sh <port>"
log_info "  - View logs: sudo journalctl -u 'app-monitor-backend@*' -f"
log_info "  - Service status: systemctl status app-monitor-backend@5001.service"
log_info ""
