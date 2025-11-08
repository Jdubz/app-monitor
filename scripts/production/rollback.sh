#!/bin/bash
#
# Rollback Script for App Monitor
# Rolls back to previous release and restores traffic
#

set -euo pipefail

# Configuration
DEPLOY_DIR="/opt/app-monitor"
RELEASES_DIR="${DEPLOY_DIR}/releases"
CURRENT_LINK="${DEPLOY_DIR}/current"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Get the previous release directory
get_previous_release() {
    cd "${RELEASES_DIR}"
    # Get second most recent release (most recent is the failed one)
    ls -t | sed -n '2p'
}

# Update nginx upstream
update_nginx_upstream() {
    local port=$1
    log_info "Updating nginx to use backend on port ${port}..."

    sudo sed -i "s/server 127.0.0.1:[0-9]\+;/server 127.0.0.1:${port};/" \
        /etc/nginx/sites-available/app-monitor

    if sudo nginx -t; then
        sudo systemctl reload nginx
        log_info "Nginx reloaded successfully"
    else
        log_error "Nginx configuration test failed"
        return 1
    fi
}

# Main rollback flow
main() {
    local rollback_port=${1:-}

    if [ -z "$rollback_port" ]; then
        log_error "Usage: $0 <port_to_rollback_to>"
        exit 1
    fi

    log_warn "Starting rollback to port ${rollback_port}..."

    # Get previous release
    PREV_RELEASE=$(get_previous_release)

    if [ -z "$PREV_RELEASE" ]; then
        log_error "No previous release found to rollback to"
        exit 1
    fi

    log_info "Previous release: ${PREV_RELEASE}"

    # Update current symlink to previous release
    log_info "Updating current symlink to previous release..."
    ln -sfn "${RELEASES_DIR}/${PREV_RELEASE}" "${CURRENT_LINK}"

    # Restart service on rollback port
    log_info "Restarting service on port ${rollback_port}..."
    sudo systemctl restart "app-monitor-backend@${rollback_port}.service"

    # Wait for service
    sleep 3

    # Update nginx to point to rollback port
    update_nginx_upstream "${rollback_port}"

    log_info "Rollback completed successfully"
    log_info "Application is now running on port ${rollback_port} with release ${PREV_RELEASE}"
}

main "$@"
