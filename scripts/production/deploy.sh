#!/bin/bash
#
# Blue-Green Deployment Script for App Monitor
# Deploys to /opt/app-monitor with zero-downtime strategy
#
# Usage: deploy.sh [SOURCE_DIR]
#   SOURCE_DIR: Directory containing the app-monitor source code (defaults to current directory)
#

set -euo pipefail

# Enhanced error handling
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_number=$2
    log_error "Deployment failed at line $line_number with exit code $exit_code"
    log_error "Rolling back..."

    # Cleanup and rollback if possible
    if [ -n "${TARGET_PORT:-}" ] && [ -n "${ACTIVE_PORT:-}" ] && [ "$ACTIVE_PORT" != "none" ]; then
        "${SCRIPTS_DIR}/rollback.sh" "${ACTIVE_PORT}" 2>&1 || log_error "Rollback script failed"
    fi

    # Release lock
    release_lock

    exit $exit_code
}

# Accept source directory as parameter, default to current directory
SOURCE_DIR="${1:-.}"

# Configuration
DEPLOY_DIR="/opt/app-monitor"
SHARED_DIR="${DEPLOY_DIR}/shared"
RELEASES_DIR="${DEPLOY_DIR}/releases"
CURRENT_LINK="${DEPLOY_DIR}/current"
SCRIPTS_DIR="${DEPLOY_DIR}/scripts"
LOCK_FILE="${SHARED_DIR}/deploy.lock"
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

# Deployment lock management with deadlock detection
acquire_lock() {
    # Try to acquire lock with enhanced deadlock detection
    local wait_time=0
    local max_wait=60  # Increased to 60 seconds
    local lock_check_interval=10

    while [ -f "${LOCK_FILE}" ]; do
        if [ $wait_time -ge $max_wait ]; then
            log_error "Another deployment is in progress (lock file exists: ${LOCK_FILE})"
            log_error ""
            
            # Use lock manager to diagnose the issue
            if [ -f "${SCRIPTS_DIR}/deployment-lock-manager.sh" ]; then
                log_info "Running lock diagnostics..."
                "${SCRIPTS_DIR}/deployment-lock-manager.sh" check
                local check_result=$?
                
                if [ $check_result -eq 3 ]; then
                    # Stale lock detected
                    log_warn "Stale lock detected - attempting automatic cleanup..."
                    if "${SCRIPTS_DIR}/deployment-lock-manager.sh" cleanup; then
                        log_info "Lock cleaned up successfully, retrying acquisition..."
                        # Don't exit - loop will retry
                        wait_time=0
                        continue
                    fi
                elif [ $check_result -eq 2 ]; then
                    # Deadlock detected
                    log_error "Deadlock detected - deployment has been running too long"
                    log_error "Manual intervention required:"
                    log_error "  1. Check logs: journalctl -u app-monitor-deploy-agent.service -n 100"
                    log_error "  2. Force cleanup: ${SCRIPTS_DIR}/deployment-lock-manager.sh cleanup"
                fi
            else
                log_error "Manual cleanup required: rm ${LOCK_FILE}"
            fi
            
            exit 1
        fi
        
        log_warn "Waiting for existing deployment to complete... (${wait_time}/${max_wait}s)"
        sleep $lock_check_interval
        wait_time=$((wait_time + lock_check_interval))
    done

    # Create lock file with PID and timestamp
    echo "$$:$(date +%s)" > "${LOCK_FILE}"
    log_info "Deployment lock acquired (PID: $$)"
}

release_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        rm -f "${LOCK_FILE}"
        log_info "Deployment lock released"
    fi
}

# Ensure lock is released on exit
trap release_lock EXIT INT TERM

# Validate prerequisites before starting
validate_prerequisites() {
    log_info "Validating deployment prerequisites..."

    # Check required commands
    local required_cmds=("node" "npm" "rsync" "lsof" "systemctl" "nginx")
    for cmd in "${required_cmds[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check source directory
    if [ ! -f "${SOURCE_DIR}/package.json" ]; then
        log_error "Invalid source directory: ${SOURCE_DIR} (no package.json found)"
        exit 1
    fi

    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version 18+ required, found: $(node --version)"
        exit 1
    fi

    log_info "Prerequisites validated"
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

    # Acquire deployment lock to prevent concurrent deployments
    acquire_lock

    # Validate prerequisites
    validate_prerequisites

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

    # Backend build with strict error checking
    log_info "Building backend..."
    cd "${RELEASE_DIR}/backend"

    # Temporarily remove root package.json to prevent workspace resolution
    if [ -f "${RELEASE_DIR}/package.json" ]; then
        mv "${RELEASE_DIR}/package.json" "${RELEASE_DIR}/package.json.bak"
    fi

    # Install dependencies with validation
    log_info "Installing backend dependencies..."
    if ! npm ci 2>&1 | tee /tmp/npm-ci-backend.log; then
        log_error "Backend npm ci failed"
        log_error "Last 10 lines of npm output:"
        tail -10 /tmp/npm-ci-backend.log

        # Check for common issues
        if grep -q "package-lock.json.*out of sync" /tmp/npm-ci-backend.log; then
            log_error "DIAGNOSIS: package-lock.json out of sync with package.json"
            log_error "FIX: Run 'cd backend && npm install' and commit the lock file"
        fi

        # Restore root package.json
        [ -f "${RELEASE_DIR}/package.json.bak" ] && \
            mv "${RELEASE_DIR}/package.json.bak" "${RELEASE_DIR}/package.json"

        exit 1
    fi

    # Restore root package.json
    [ -f "${RELEASE_DIR}/package.json.bak" ] && \
        mv "${RELEASE_DIR}/package.json.bak" "${RELEASE_DIR}/package.json"

    # Verify node_modules exists and has critical packages
    log_info "Validating installed dependencies..."
    if [ ! -d "node_modules" ]; then
        log_error "node_modules directory not created after npm ci"
        exit 1
    fi

    # Check for critical dependencies
    CRITICAL_DEPS=("express" "socket.io" "better-sqlite3" "dockerode")
    for dep in "${CRITICAL_DEPS[@]}"; do
        if [ ! -d "node_modules/${dep}" ]; then
            log_error "Critical dependency missing: ${dep}"
            exit 1
        fi
    done

    # Clean stale build cache
    rm -f tsconfig.build.tsbuildinfo

    # Build TypeScript
    log_info "Compiling TypeScript..."
    if ! npm run build 2>&1 | tee /tmp/npm-build-backend.log; then
        log_error "Backend build failed"
        tail -20 /tmp/npm-build-backend.log
        exit 1
    fi

    # Verify build output
    if [ ! -f "dist/index.js" ]; then
        log_error "Build output missing: dist/index.js not created"
        exit 1
    fi

    # Remove devDependencies
    log_info "Pruning dev dependencies..."
    if ! npm prune --production; then
        log_error "Backend npm prune failed"
        exit 1
    fi

    # Final verification
    log_info "Verifying production build..."
    node -e "
        const critical = ['express', 'socket.io', 'better-sqlite3'];
        const missing = critical.filter(pkg => {
            try { require.resolve(pkg); return false; }
            catch { return true; }
        });
        if (missing.length) {
            console.error('Missing after prune:', missing);
            process.exit(1);
        }
    " || {
        log_error "Production dependencies verification failed"
        exit 1
    }

    log_info "Backend build complete and verified"

    # Frontend build
    cd "${RELEASE_DIR}/frontend"
    # Temporarily remove root package.json to prevent workspace resolution
    mv "${RELEASE_DIR}/package.json" "${RELEASE_DIR}/package.json.bak" 2>/dev/null || true
    # Install dependencies locally (force devDependencies so build tools exist)
    NPM_CONFIG_PRODUCTION=false npm ci --include=dev

    # Load environment variables from shared config if available
    if [ -f "${SHARED_DIR}/config/.env.production" ]; then
        log_info "Loading production environment variables..."
        set -a
        source "${SHARED_DIR}/config/.env.production"
        set +a
    else
        log_warn "No production environment file found at ${SHARED_DIR}/config/.env.production"
        log_warn "Frontend may use default values. Create this file with VITE_PASSWORD=your-password"
    fi

    NODE_ENV=production npm run build

    # Remove devDependencies after build (frontend doesn't run on server)
    NPM_CONFIG_WORKSPACES=false npm prune --production
    # Restore root package.json
    mv "${RELEASE_DIR}/package.json.bak" "${RELEASE_DIR}/package.json" 2>/dev/null || true

    # Fix ownership of build artifacts (prevent 403 errors from nginx)
    sudo chown -R jdubz:jdubz dist/

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

    # Wait for service to be ready with smart polling
    log_info "Waiting for service to be ready..."
    local max_wait=30
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if systemctl is-active --quiet "app-monitor-backend@${TARGET_PORT}.service"; then
            # Service is active, check if port is listening
            if lsof -i ":${TARGET_PORT}" > /dev/null 2>&1; then
                log_info "Service ready after ${elapsed} seconds"
                break
            fi
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if [ $elapsed -ge $max_wait ]; then
        log_warn "Service startup timeout (${max_wait}s), proceeding to health checks..."
    fi

    # Phase 7: Health checks
    log_info "Phase 7: Running health checks"
    if ! PORT=${TARGET_PORT} "${SCRIPTS_DIR}/health-check.sh"; then
        log_error "Health checks failed on port ${TARGET_PORT}"
        log_info "Starting rollback..."
        "${SCRIPTS_DIR}/rollback.sh" "${ACTIVE_PORT}"
        exit 1
    fi

    log_info "Health checks passed!"

    # Phase 8: Switch traffic with connection drain period
    if [ "$ACTIVE_PORT" != "none" ]; then
        log_info "Phase 8: Switching traffic from ${ACTIVE_PORT} to ${TARGET_PORT}"
        update_nginx_upstream "${TARGET_PORT}"

        # Connection drain period - keep old service running
        # This allows:
        # - Existing WebSocket connections to complete naturally
        # - Active tasks to finish
        # - Clients to reconnect to new instance
        # Reduced from 60s to 30s - graceful shutdown provides additional 120s drain
        log_info "Connection drain period: keeping old service running for 30 seconds..."
        log_info "New connections → ${TARGET_PORT}, existing connections → ${ACTIVE_PORT}"
        sleep 30

        # Now gracefully stop old service
        log_info "Gracefully stopping old service on port ${ACTIVE_PORT}..."
        sudo systemctl stop "app-monitor-backend@${ACTIVE_PORT}.service"

        log_info "Waiting for old service to fully stop..."
        local stop_wait=0
        while systemctl is-active --quiet "app-monitor-backend@${ACTIVE_PORT}.service"; do
            if [ $stop_wait -ge 120 ]; then
                log_warn "Old service taking longer than 30s to stop, continuing anyway..."
                break
            fi
            sleep 2
            stop_wait=$((stop_wait + 2))
        done

        log_info "Old service stopped after ${stop_wait} seconds"
    else
        log_info "Phase 8: Configuring nginx for port ${TARGET_PORT}"
        update_nginx_upstream "${TARGET_PORT}"
    fi

    # Save active port to config for reference
    mkdir -p "${SHARED_DIR}/config"
    echo "${TARGET_PORT}" > "${SHARED_DIR}/config/active-port"
    log_info "Active port saved: ${TARGET_PORT}"

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
