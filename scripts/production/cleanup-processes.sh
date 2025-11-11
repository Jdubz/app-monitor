#!/bin/bash
#
# ONE-TIME CLEANUP SCRIPT
# 
# This script fixes the immediate duplicate process issue.
# After deploying the PID-based single instance enforcement,
# this script is no longer needed for ongoing operation.
#
# The new backend automatically prevents duplicates on startup.
# This script is only for cleaning up existing duplicates.
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
ACTIVE_PORT_FILE="/opt/app-monitor/shared/config/active-port"
EXPECTED_PROCESS_COUNT=1

log_info "Cleaning up duplicate app-monitor processes..."

# Step 1: Check current state
log_info "Step 1: Checking current process state"
PROCESS_COUNT=$(ps aux | grep "[n]ode.*dist/index.js" | wc -l)
log_info "Found $PROCESS_COUNT node processes"

if [ "$PROCESS_COUNT" -eq 0 ]; then
    log_warn "No app-monitor processes running!"
elif [ "$PROCESS_COUNT" -eq 1 ]; then
    log_info "✅ Only one process running (expected)"
    ps aux | grep "[n]ode.*dist/index.js"
    exit 0
else
    log_warn "⚠️  Multiple processes detected ($PROCESS_COUNT)"
    ps aux | grep "[n]ode.*dist/index.js" | head -10
fi

# Step 2: Stop all systemd services
log_info "Step 2: Stopping all systemd services"
for port in 5001 5002; do
    if systemctl is-active --quiet "app-monitor-backend@${port}.service" 2>/dev/null; then
        log_info "Stopping app-monitor-backend@${port}.service"
        sudo systemctl stop "app-monitor-backend@${port}.service"
    fi
done

# Step 3: Kill any remaining manual processes
log_info "Step 3: Cleaning up manual processes"
sleep 2  # Give systemd-managed processes time to stop

REMAINING=$(ps aux | grep "[n]ode.*dist/index.js" | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    log_warn "Found $REMAINING manual processes, terminating..."
    pkill -f "node.*dist/index.js" || true
    sleep 2
    
    # Force kill if still running
    if ps aux | grep -q "[n]ode.*dist/index.js"; then
        log_warn "Processes still running, force killing..."
        pkill -9 -f "node.*dist/index.js" || true
    fi
fi

# Verify all stopped
FINAL_COUNT=$(ps aux | grep "[n]ode.*dist/index.js" | wc -l)
if [ "$FINAL_COUNT" -gt 0 ]; then
    log_error "Failed to stop all processes!"
    ps aux | grep "[n]ode.*dist/index.js"
    exit 1
fi

log_info "✅ All processes stopped"

# Step 4: Determine correct port to start
log_info "Step 4: Determining active port"

if [ -f "$ACTIVE_PORT_FILE" ]; then
    ACTIVE_PORT=$(cat "$ACTIVE_PORT_FILE")
    log_info "Active port from config: $ACTIVE_PORT"
else
    ACTIVE_PORT="5001"
    log_warn "No active port file found, defaulting to $ACTIVE_PORT"
fi

# Validate port
if [ "$ACTIVE_PORT" != "5001" ] && [ "$ACTIVE_PORT" != "5002" ]; then
    log_error "Invalid active port: $ACTIVE_PORT (expected 5001 or 5002)"
    ACTIVE_PORT="5001"
    log_warn "Using default port: $ACTIVE_PORT"
fi

# Step 5: Start correct service
log_info "Step 5: Starting app-monitor-backend@${ACTIVE_PORT}.service"

if ! sudo systemctl start "app-monitor-backend@${ACTIVE_PORT}.service"; then
    log_error "Failed to start service!"
    journalctl -u "app-monitor-backend@${ACTIVE_PORT}.service" -n 50 --no-pager
    exit 1
fi

# Step 6: Verify service started
log_info "Step 6: Verifying service health"

sleep 3  # Give service time to start

if ! systemctl is-active --quiet "app-monitor-backend@${ACTIVE_PORT}.service"; then
    log_error "Service not active!"
    systemctl status "app-monitor-backend@${ACTIVE_PORT}.service" --no-pager
    exit 1
fi

# Check process count
NEW_COUNT=$(ps aux | grep "[n]ode.*dist/index.js" | wc -l)
if [ "$NEW_COUNT" -ne 1 ]; then
    log_error "Expected 1 process, found $NEW_COUNT"
    ps aux | grep "[n]ode.*dist/index.js"
    exit 1
fi

# Check health endpoint
log_info "Checking health endpoint..."
if curl -sf "http://localhost:${ACTIVE_PORT}/api/health" > /dev/null; then
    log_info "✅ Health check passed"
else
    log_warn "⚠️  Health check failed (may still be starting)"
fi

# Step 7: Verify nginx can reach backend
log_info "Step 7: Verifying nginx connectivity"

if curl -sf "http://localhost/api/health" > /dev/null; then
    log_info "✅ Nginx → Backend communication OK"
else
    log_warn "⚠️  Cannot reach backend through nginx"
    log_warn "Check nginx configuration:"
    log_warn "  sudo nginx -t"
    log_warn "  cat /etc/nginx/sites-available/app-monitor | grep 'server 127.0.0.1:'"
fi

# Summary
echo ""
log_info "=========================================="
log_info "✅ CLEANUP COMPLETE"
log_info "=========================================="
log_info "Service: app-monitor-backend@${ACTIVE_PORT}.service"
log_info "Status: $(systemctl is-active app-monitor-backend@${ACTIVE_PORT}.service)"
log_info "Process count: $(ps aux | grep "[n]ode.*dist/index.js" | wc -l)"
echo ""
log_info "Monitoring commands:"
log_info "  systemctl status app-monitor-backend@${ACTIVE_PORT}.service"
log_info "  journalctl -u app-monitor-backend@${ACTIVE_PORT}.service -f"
log_info "  curl http://localhost:${ACTIVE_PORT}/api/health"
echo ""
