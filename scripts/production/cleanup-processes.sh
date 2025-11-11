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
# USAGE: sudo ./cleanup-processes.sh
#
# Requires sudo for systemctl operations.

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
APP_MONITOR_DIR="/opt/app-monitor/current/backend"
# Pattern matches: node <path>/dist/index.js
PROCESS_PATTERN="node.*dist/index.js"

log_info "Cleaning up duplicate app-monitor processes..."

# Step 1: Check current state
log_info "Step 1: Checking current process state"
PROCESS_COUNT=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | wc -l)
log_info "Found $PROCESS_COUNT node processes"

if [ "$PROCESS_COUNT" -eq 0 ]; then
    log_warn "No app-monitor processes running - will start service"
elif [ "$PROCESS_COUNT" -eq 1 ]; then
    log_info "✅ Only one process running (expected)"
    ps aux | grep "$PROCESS_PATTERN" | grep -v grep
    log_info "Nothing to clean up, exiting"
    exit 0
else
    log_warn "⚠️  Multiple processes detected ($PROCESS_COUNT)"
    ps aux | grep "$PROCESS_PATTERN" | grep -v grep | head -10
fi

# Step 2: Stop all systemd services
log_info "Step 2: Stopping all systemd services"
for port in 5001 5002; do
    if systemctl is-active --quiet "app-monitor-backend@${port}.service" 2>/dev/null; then
        log_info "Stopping app-monitor-backend@${port}.service"
        systemctl stop "app-monitor-backend@${port}.service"
    fi
done

# Step 3: Kill any remaining manual processes (only those from app-monitor directory)
log_info "Step 3: Cleaning up manual processes"
sleep 2  # Give systemd-managed processes time to stop

REMAINING=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    log_warn "Found $REMAINING remaining processes, checking working directory..."
    
    # Only kill processes running from app-monitor directory
    PIDS=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | awk '{print $2}')
    KILLED_COUNT=0
    
    for PID in $PIDS; do
        if [ -d "/proc/$PID" ]; then
            CWD=$(readlink "/proc/$PID/cwd" 2>/dev/null || echo "")
            CMDLINE=$(cat "/proc/$PID/cmdline" 2>/dev/null | tr '\0' ' ' || echo "")
            if [[ "$CWD" == *"app-monitor"* ]] && [[ "$CMDLINE" == *"dist/index.js"* ]]; then
                log_info "Terminating app-monitor process PID $PID (cwd: $CWD, cmd: ${CMDLINE:0:60})"
                kill "$PID" 2>/dev/null || true
                KILLED_COUNT=$((KILLED_COUNT + 1))
            else
                log_info "Skipping PID $PID (not app-monitor: $CWD)"
            fi
        fi
    done
    
    if [ "$KILLED_COUNT" -gt 0 ]; then
        sleep 2
        
        # Force kill if still running
        STILL_RUNNING=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | awk '{print $2}')
        for PID in $STILL_RUNNING; do
            if [ -d "/proc/$PID" ]; then
                CWD=$(readlink "/proc/$PID/cwd" 2>/dev/null || echo "")
                CMDLINE=$(cat "/proc/$PID/cmdline" 2>/dev/null | tr '\0' ' ' || echo "")
                if [[ "$CWD" == *"app-monitor"* ]] && [[ "$CMDLINE" == *"dist/index.js"* ]]; then
                    log_warn "Force killing PID $PID (cwd: $CWD)"
                    kill -9 "$PID" 2>/dev/null || true
                fi
            fi
        done
    fi
fi

# Verify all stopped
FINAL_COUNT=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | wc -l)
if [ "$FINAL_COUNT" -gt 0 ]; then
    log_error "Failed to stop all processes!"
    ps aux | grep "$PROCESS_PATTERN" | grep -v grep
    log_error "Verify these are app-monitor processes before manually killing them"
    exit 1
fi

log_info "✅ All processes stopped"

# Step 4: Determine correct port to start
log_info "Step 4: Determining active port"

if [ -f "$ACTIVE_PORT_FILE" ]; then
    ACTIVE_PORT=$(cat "$ACTIVE_PORT_FILE" | tr -d '[:space:]')
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

if ! systemctl start "app-monitor-backend@${ACTIVE_PORT}.service"; then
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
NEW_COUNT=$(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | wc -l)
if [ "$NEW_COUNT" -ne 1 ]; then
    log_error "Expected 1 process, found $NEW_COUNT"
    ps aux | grep "$PROCESS_PATTERN" | grep -v grep
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
log_info "Process count: $(ps aux | grep "$PROCESS_PATTERN" | grep -v grep | wc -l)"
echo ""

log_info "Monitoring commands:"
log_info "  systemctl status app-monitor-backend@${ACTIVE_PORT}.service"
log_info "  journalctl -u app-monitor-backend@${ACTIVE_PORT}.service -f"
log_info "  curl http://localhost:${ACTIVE_PORT}/api/health"
echo ""

