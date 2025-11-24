#!/bin/bash
#
# nginx-sync.sh - Synchronize nginx upstream with running backend service
#
# This script ensures nginx is always pointing to the correct backend port.
# It uses the running systemd service as the source of truth.
#
# Usage:
#   nginx-sync.sh           # Check and fix if needed
#   nginx-sync.sh --check   # Only check, don't fix (exit code indicates status)
#   nginx-sync.sh --force PORT  # Force nginx to use specified port
#
# Exit codes:
#   0 - In sync (or successfully fixed)
#   1 - Error occurred
#   2 - Out of sync (--check mode only)
#

set -euo pipefail

# Configuration
NGINX_CONFIG="/etc/nginx/sites-available/app-monitor"
SHARED_CONFIG_DIR="/opt/app-monitor/shared/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[SYNC]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[SYNC]${NC} $1"; }
log_error() { echo -e "${RED}[SYNC]${NC} $1"; }

# Get the currently running backend port from systemd (source of truth)
get_running_port() {
    if systemctl is-active --quiet app-monitor-backend@5001.service; then
        echo "5001"
    elif systemctl is-active --quiet app-monitor-backend@5002.service; then
        echo "5002"
    else
        echo "none"
    fi
}

# Get the port nginx is configured to use
get_nginx_port() {
    if [ ! -f "$NGINX_CONFIG" ]; then
        echo "none"
        return
    fi
    # Extract port from "server 127.0.0.1:PORT;" line
    grep -oP 'server 127\.0\.0\.1:\K[0-9]+' "$NGINX_CONFIG" 2>/dev/null | head -1 || echo "none"
}

# Update nginx upstream configuration
update_nginx_port() {
    local port=$1
    log_info "Updating nginx upstream to port ${port}..."

    # Update upstream in nginx config
    if ! sudo sed -i "s/server 127.0.0.1:[0-9]\+;/server 127.0.0.1:${port};/" "$NGINX_CONFIG"; then
        log_error "Failed to update nginx config"
        return 1
    fi

    # Test nginx config
    if ! sudo nginx -t 2>/dev/null; then
        log_error "Nginx configuration test failed!"
        return 1
    fi

    # Reload nginx
    if ! sudo systemctl reload nginx; then
        log_error "Failed to reload nginx"
        return 1
    fi

    # Update saved active port
    mkdir -p "$SHARED_CONFIG_DIR"
    echo "$port" > "$SHARED_CONFIG_DIR/active-port"

    log_info "Nginx successfully updated to port ${port}"
    return 0
}

# Verify sync by testing actual connectivity
verify_sync() {
    local port=$1

    # Test direct backend connection
    if ! curl -sf "http://127.0.0.1:${port}/api/health" > /dev/null 2>&1; then
        log_warn "Backend on port ${port} is not responding to health checks"
        return 1
    fi

    # Test through nginx
    if ! curl -sf "http://127.0.0.1/api/health" > /dev/null 2>&1; then
        log_warn "Nginx is not proxying correctly to backend"
        return 1
    fi

    return 0
}

# Main sync logic
main() {
    local mode="${1:-sync}"
    local force_port="${2:-}"

    # Handle --force mode
    if [ "$mode" = "--force" ] && [ -n "$force_port" ]; then
        log_info "Forcing nginx to port ${force_port}"
        update_nginx_port "$force_port"
        exit $?
    fi

    # Get current state
    local running_port=$(get_running_port)
    local nginx_port=$(get_nginx_port)

    log_info "Running backend port: ${running_port}"
    log_info "Nginx upstream port:  ${nginx_port}"

    # Check if any backend is running
    if [ "$running_port" = "none" ]; then
        log_error "No backend service is running!"
        log_error "Start a backend: sudo systemctl start app-monitor-backend@5001.service"
        exit 1
    fi

    # Check if in sync
    if [ "$running_port" = "$nginx_port" ]; then
        log_info "Nginx and backend are IN SYNC (port ${running_port})"

        # Verify actual connectivity
        if verify_sync "$running_port"; then
            log_info "Connectivity verified - all healthy"
            exit 0
        else
            log_warn "In sync but connectivity issues detected"
            exit 1
        fi
    fi

    # Out of sync
    log_warn "OUT OF SYNC: nginx=${nginx_port}, backend=${running_port}"

    # In check-only mode, just report
    if [ "$mode" = "--check" ]; then
        log_error "Run 'nginx-sync.sh' to fix"
        exit 2
    fi

    # Auto-fix by updating nginx
    log_info "Auto-fixing: updating nginx to match running backend..."
    if update_nginx_port "$running_port"; then
        log_info "Sync restored successfully"

        # Verify the fix worked
        if verify_sync "$running_port"; then
            log_info "Fix verified - all healthy"
            exit 0
        else
            log_warn "Sync restored but connectivity issues remain"
            exit 1
        fi
    else
        log_error "Failed to restore sync"
        exit 1
    fi
}

main "$@"
