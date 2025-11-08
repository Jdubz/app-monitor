#!/bin/bash
#
# Health Check Script for App Monitor
# Verifies backend service is healthy before switching traffic
#

set -euo pipefail

# Configuration
PORT=${PORT:-5001}
MAX_RETRIES=30
RETRY_DELAY=2

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check 1: Service is running
check_service_running() {
    log_info "Checking if service is running on port ${PORT}..."
    if systemctl is-active --quiet "app-monitor-backend@${PORT}.service"; then
        log_info "✓ Service is running"
        return 0
    else
        log_error "✗ Service is not running"
        return 1
    fi
}

# Check 2: Port is listening
check_port_listening() {
    log_info "Checking if port ${PORT} is listening..."
    if lsof -i ":${PORT}" > /dev/null 2>&1; then
        log_info "✓ Port ${PORT} is listening"
        return 0
    else
        log_error "✗ Port ${PORT} is not listening"
        return 1
    fi
}

# Check 3: HTTP health endpoint
check_http_health() {
    log_info "Checking HTTP health endpoint..."
    local url="http://localhost:${PORT}/api/health"

    for i in $(seq 1 $MAX_RETRIES); do
        if curl -sf "${url}" > /dev/null; then
            log_info "✓ HTTP health check passed"
            return 0
        fi

        if [ $i -lt $MAX_RETRIES ]; then
            log_info "Attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done

    log_error "✗ HTTP health check failed after $MAX_RETRIES attempts"
    return 1
}

# Check 4: Database connectivity
check_database() {
    log_info "Checking database connectivity..."
    local url="http://localhost:${PORT}/api/tasks?limit=1"

    if curl -sf "${url}" > /dev/null; then
        log_info "✓ Database connectivity verified"
        return 0
    else
        log_error "✗ Database connectivity check failed"
        return 1
    fi
}

# Check 5: Docker connectivity
check_docker() {
    log_info "Checking Docker connectivity..."
    local url="http://localhost:${PORT}/api/workers"

    if curl -sf "${url}" > /dev/null; then
        log_info "✓ Docker connectivity verified"
        return 0
    else
        log_error "✗ Docker connectivity check failed"
        return 1
    fi
}

# Check 6: WebSocket connectivity
check_websocket() {
    log_info "Checking WebSocket connectivity..."

    # Use websocat or wscat if available, otherwise skip
    if command -v websocat > /dev/null; then
        if timeout 5 websocat -n1 "ws://localhost:${PORT}" 2>&1 | grep -q "WebSocket"; then
            log_info "✓ WebSocket connectivity verified"
            return 0
        fi
    elif command -v wscat > /dev/null; then
        if timeout 5 wscat -c "ws://localhost:${PORT}" 2>&1 | grep -q "connected"; then
            log_info "✓ WebSocket connectivity verified"
            return 0
        fi
    else
        log_info "⊘ WebSocket check skipped (websocat/wscat not available)"
        return 0
    fi

    log_error "✗ WebSocket connectivity check failed"
    return 1
}

# Main health check flow
main() {
    log_info "Starting health checks for port ${PORT}..."

    local failed=0

    check_service_running || ((failed++))
    check_port_listening || ((failed++))
    check_http_health || ((failed++))
    check_database || ((failed++))
    check_docker || ((failed++))
    check_websocket || ((failed++))

    if [ $failed -eq 0 ]; then
        log_info "All health checks passed! ✓"
        return 0
    else
        log_error "Health checks failed: ${failed} check(s) failed"
        return 1
    fi
}

main "$@"
