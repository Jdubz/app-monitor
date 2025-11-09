#!/bin/bash
#
# Blue-Green Deployment Script for App Monitor
# Deploys to /opt/app-monitor with zero-downtime strategy
#
# Usage: deploy.sh [SOURCE_DIR]
#   SOURCE_DIR: Directory containing the app-monitor source code (defaults to current directory)
#

set -euo pipefail

# Accept source directory as parameter, default to current directory
SOURCE_DIR="${1:-.}"

# Configuration
DEPLOY_DIR="/opt/app-monitor"
SHARED_DIR="${DEPLOY_DIR}/shared"
RELEASES_DIR="${DEPLOY_DIR}/releases"
CURRENT_LINK="${DEPLOY_DIR}/current"
SCRIPTS_DIR="${DEPLOY_DIR}/scripts"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="${RELEASES_DIR}/${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Determine current active port
get_active_port() {
    if systemctl is-active --quiet app-monitor-backend@5001.service; then
        echo "5001"
    elif systemctl is-active --quiet app-monitor-backend@5002.service; then
        echo "5002"
    else
        echo "none"
    fi
}

# Determine target port (opposite of active)
get_target_port() {
    local active_port=$1
    if [ "$active_port" == "5001" ]; then
        echo "5002"
    elif [ "$active_port" == "5002" ]; then
        echo "5001"
    else
        # No active service, default to 5001
        echo "5001"
    fi
}

# Update nginx upstream configuration
update_nginx_upstream() {
    local port=$1
    log_info "Updating nginx to use backend on port ${port}..."

    # Update upstream in nginx config (match only numeric ports)
    sudo sed -i "s/server 127.0.0.1:[0-9]\+;/server 127.0.0.1:${port};/" \
        /etc/nginx/sites-available/app-monitor

    # Test nginx config
    if sudo nginx -t; then
        sudo systemctl reload nginx
        log_info "Nginx reloaded successfully"
    else
        log_error "Nginx configuration test failed"
        return 1
    fi
}

# Main deployment flow
main() {
    log_info "Starting deployment at ${TIMESTAMP}"

    # Phase 1: Pre-deployment checks
    log_info "Phase 1: Pre-deployment checks"

    if [ ! -d "${DEPLOY_DIR}" ]; then
        log_error "Deployment directory ${DEPLOY_DIR} does not exist. Run setup first."
        exit 1
    fi

    # Determine active and target ports
    ACTIVE_PORT=$(get_active_port)
    TARGET_PORT=$(get_target_port "$ACTIVE_PORT")

    log_info "Active port: ${ACTIVE_PORT}"
    log_info "Target port: ${TARGET_PORT}"

    # Phase 2: Update production scripts
    log_info "Phase 2: Updating production scripts"
    if [ -d "${SOURCE_DIR}/scripts/production" ]; then
        log_info "Copying updated scripts from source to ${SCRIPTS_DIR}..."
        sudo cp -f "${SOURCE_DIR}/scripts/production/"*.sh "${SCRIPTS_DIR}/"
        sudo chmod +x "${SCRIPTS_DIR}/"*.sh
        log_info "Production scripts updated successfully"
    else
        log_warn "No scripts/production directory found in source, skipping script update"
    fi

    # Phase 3: Database backup
    log_info "Phase 3: Creating database backup"
    if ! "${SCRIPTS_DIR}/backup-db.sh"; then
        log_error "Database backup failed"
        exit 1
    fi

    # Phase 4: Create new release
    log_info "Phase 4: Creating new release in ${RELEASE_DIR}"
    log_info "Source directory: ${SOURCE_DIR}"
    mkdir -p "${RELEASE_DIR}"

    # Copy repository to release directory
    rsync -av --delete \
              --exclude='node_modules' \
              --exclude='.git' \
              --exclude='backend/data' \
              --exclude='frontend/dist' \
              --exclude='frontend/node_modules' \
              "${SOURCE_DIR}/" "${RELEASE_DIR}/"

    # Create symlinks to shared directories
    ln -sf "${SHARED_DIR}/backend/data" "${RELEASE_DIR}/backend/data"
    ln -sf "${SHARED_DIR}/logs" "${RELEASE_DIR}/logs"

    # Phase 5: Build and prepare
    log_info "Phase 5: Building application"

    # Backend build
    cd "${RELEASE_DIR}/backend"
    npm ci --production=false
    # Clean stale build cache to prevent missing file issues
    rm -f tsconfig.build.tsbuildinfo
    npm run build

    # Frontend build
    cd "${RELEASE_DIR}/frontend"
    npm ci
    npm run build

    # Phase 6: Deploy to target port
    log_info "Phase 6: Deploying to target port ${TARGET_PORT}"

    # Stop target port service if running
    if systemctl is-active --quiet "app-monitor-backend@${TARGET_PORT}.service"; then
        log_info "Stopping existing service on port ${TARGET_PORT}..."
        sudo systemctl stop "app-monitor-backend@${TARGET_PORT}.service"
    fi

    # Update current symlink
    ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

    # Start service on target port
    log_info "Starting service on port ${TARGET_PORT}..."
    if ! sudo systemctl start "app-monitor-backend@${TARGET_PORT}.service"; then
        log_error "Failed to start service on port ${TARGET_PORT}"
        log_info "Starting rollback..."
        "${SCRIPTS_DIR}/rollback.sh" "${ACTIVE_PORT}"
        exit 1
    fi

    # Wait for service to be ready
    sleep 5

    # Phase 7: Health checks
    log_info "Phase 7: Running health checks"
    if ! PORT=${TARGET_PORT} "${SCRIPTS_DIR}/health-check.sh"; then
        log_error "Health checks failed on port ${TARGET_PORT}"
        log_info "Starting rollback..."
        "${SCRIPTS_DIR}/rollback.sh" "${ACTIVE_PORT}"
        exit 1
    fi

    log_info "Health checks passed!"

    # Phase 8: Switch traffic
    if [ "$ACTIVE_PORT" != "none" ]; then
        log_info "Phase 8: Switching traffic from ${ACTIVE_PORT} to ${TARGET_PORT}"
        update_nginx_upstream "${TARGET_PORT}"

        # Graceful shutdown of old service
        log_info "Gracefully stopping old service on port ${ACTIVE_PORT}..."
        sudo systemctl stop "app-monitor-backend@${ACTIVE_PORT}.service"
    else
        log_info "Phase 8: Configuring nginx for port ${TARGET_PORT}"
        update_nginx_upstream "${TARGET_PORT}"
    fi

    # Phase 9: Cleanup old releases (keep last 5)
    log_info "Phase 9: Cleaning up old releases"
    cd "${RELEASES_DIR}"
    # Sort by filename (timestamp) in reverse order, skip first 5, delete rest
    ls -1 | grep -E '^[0-9]{8}_[0-9]{6}$' | sort -r | tail -n +6 | xargs -r rm -rf

    log_info "Deployment completed successfully!"
    log_info "Application is now running on port ${TARGET_PORT}"
}

# Run main deployment
main "$@"
