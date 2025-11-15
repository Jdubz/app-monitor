#!/bin/bash
#
# Deployment Lock Manager
# Provides deadlock detection, automatic cleanup, and lock health monitoring
#
# Usage:
#   deployment-lock-manager.sh check      # Check for stale locks
#   deployment-lock-manager.sh cleanup    # Force cleanup of stale locks
#   deployment-lock-manager.sh monitor    # Monitor lock health (for cron/systemd timer)
#

set -euo pipefail

# Configuration
DEPLOY_DIR="/opt/app-monitor"
SHARED_DIR="${DEPLOY_DIR}/shared"
LOCK_FILE="${SHARED_DIR}/deploy.lock"
MAX_LOCK_AGE_SECONDS=1800  # 30 minutes - deployments should never take this long
MONITOR_LOG="/var/log/app-monitor/deployment-lock-monitor.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "${MONITOR_LOG}" 2>/dev/null || echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "${MONITOR_LOG}" 2>/dev/null || echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${MONITOR_LOG}" 2>/dev/null || echo -e "${RED}[ERROR]${NC} $1"
}

# Parse lock file to get PID and timestamp
parse_lock_file() {
    if [ ! -f "${LOCK_FILE}" ]; then
        return 1
    fi
    
    local lock_content=$(cat "${LOCK_FILE}")
    
    # Expected format: "PID:TIMESTAMP"
    if [[ $lock_content =~ ^([0-9]+):([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"
        return 0
    else
        log_warn "Lock file has unexpected format: ${lock_content}"
        return 1
    fi
}

# Check if process is still running
is_process_running() {
    local pid=$1
    
    if [ -z "$pid" ]; then
        return 1
    fi
    
    # Check if process exists
    if ! ps -p "$pid" > /dev/null 2>&1; then
        return 1
    fi
    
    # Check if it's actually a deployment script (not just reused PID)
    local cmd=$(ps -p "$pid" -o cmd= 2>/dev/null || echo "")
    if [[ $cmd == *"deploy.sh"* ]]; then
        return 0
    else
        log_warn "PID $pid exists but is not a deployment script: $cmd"
        return 1
    fi
}

# Calculate lock age in seconds
get_lock_age() {
    local lock_timestamp=$1
    local current_timestamp=$(date +%s)
    echo $((current_timestamp - lock_timestamp))
}

# Check lock health
check_lock() {
    if [ ! -f "${LOCK_FILE}" ]; then
        log_info "No deployment lock found - system healthy"
        return 0
    fi
    
    log_warn "Deployment lock file exists: ${LOCK_FILE}"
    
    local lock_info
    if ! lock_info=$(parse_lock_file); then
        log_error "Failed to parse lock file"
        return 1
    fi
    
    local lock_pid=$(echo "$lock_info" | awk '{print $1}')
    local lock_timestamp=$(echo "$lock_info" | awk '{print $2}')
    local lock_age=$(get_lock_age "$lock_timestamp")
    local lock_age_minutes=$((lock_age / 60))
    
    log_info "Lock details:"
    log_info "  PID: ${lock_pid}"
    log_info "  Age: ${lock_age_minutes} minutes (${lock_age} seconds)"
    log_info "  Created: $(date -d @${lock_timestamp} '+%Y-%m-%d %H:%M:%S')"
    
    # Check if process is running
    if is_process_running "$lock_pid"; then
        log_info "Process ${lock_pid} is running"
        
        # Check if lock is too old (possible deadlock)
        if [ $lock_age -gt $MAX_LOCK_AGE_SECONDS ]; then
            log_error "⚠️  DEADLOCK DETECTED: Deployment has been running for ${lock_age_minutes} minutes"
            log_error "Maximum expected deployment time: $((MAX_LOCK_AGE_SECONDS / 60)) minutes"
            log_error ""
            log_error "Process tree:"
            pstree -ap "${lock_pid}" 2>/dev/null || ps -p "${lock_pid}" -o cmd=
            log_error ""
            log_error "Recommended action:"
            log_error "  1. Check journalctl -u app-monitor-deploy-agent.service -n 100"
            log_error "  2. If deployment is truly stuck, run: $0 cleanup"
            return 2  # Exit code 2 = deadlock detected
        else
            log_info "Process is healthy (running for ${lock_age_minutes} minutes)"
            return 0
        fi
    else
        log_error "⚠️  STALE LOCK DETECTED: Process ${lock_pid} is not running"
        log_error "Lock age: ${lock_age_minutes} minutes"
        log_error ""
        log_error "This indicates a previous deployment crashed without cleanup"
        log_error "Recommended action: Run '$0 cleanup' to remove stale lock"
        return 3  # Exit code 3 = stale lock detected
    fi
}

# Force cleanup of stale locks
cleanup_lock() {
    if [ ! -f "${LOCK_FILE}" ]; then
        log_info "No lock file to clean up"
        return 0
    fi
    
    log_warn "Attempting to clean up deployment lock..."
    
    local lock_info
    if lock_info=$(parse_lock_file); then
        local lock_pid=$(echo "$lock_info" | awk '{print $1}')
        local lock_timestamp=$(echo "$lock_info" | awk '{print $2}')
        local lock_age=$(get_lock_age "$lock_timestamp")
        
        # Safety check: only cleanup if process is not running OR lock is very old
        if is_process_running "$lock_pid"; then
            if [ $lock_age -lt $MAX_LOCK_AGE_SECONDS ]; then
                log_error "Cannot cleanup: deployment process ${lock_pid} is still running"
                log_error "Lock age: $((lock_age / 60)) minutes (threshold: $((MAX_LOCK_AGE_SECONDS / 60)) minutes)"
                log_error "If you're certain the deployment is stuck, you can:"
                log_error "  1. Kill the process: kill -9 ${lock_pid}"
                log_error "  2. Then re-run cleanup: $0 cleanup"
                return 1
            else
                log_warn "Lock is very old (${lock_age}s), assuming deployment is deadlocked"
                log_warn "Attempting to kill process ${lock_pid}..."
                
                # Try graceful kill first
                if kill -TERM "$lock_pid" 2>/dev/null; then
                    log_info "Sent SIGTERM to process ${lock_pid}, waiting 5 seconds..."
                    sleep 5
                    
                    # Check if still running
                    if is_process_running "$lock_pid"; then
                        log_warn "Process still running, sending SIGKILL..."
                        kill -9 "$lock_pid" 2>/dev/null || true
                        sleep 2
                    fi
                fi
                
                # Verify process is dead
                if is_process_running "$lock_pid"; then
                    log_error "Failed to kill process ${lock_pid}"
                    return 1
                fi
                
                log_info "Process ${lock_pid} terminated"
            fi
        fi
    fi
    
    # Remove lock file
    log_info "Removing lock file: ${LOCK_FILE}"
    rm -f "${LOCK_FILE}"
    
    # Verify removal
    if [ -f "${LOCK_FILE}" ]; then
        log_error "Failed to remove lock file"
        return 1
    fi
    
    log_info "✅ Lock file successfully removed"
    
    # Log cleanup event
    logger -t app-monitor-deployment "Stale deployment lock cleaned up automatically"
    
    return 0
}

# Monitor lock health (for periodic checks via cron/systemd timer)
monitor_lock() {
    # Ensure log directory exists
    mkdir -p "$(dirname "${MONITOR_LOG}")"
    
    log_info "=== Deployment Lock Health Check - $(date) ==="
    
    local check_result
    check_lock
    check_result=$?
    
    case $check_result in
        0)
            # Healthy or no lock
            ;;
        2)
            # Deadlock detected
            log_error "Deadlock detected! Sending alert..."
            logger -t app-monitor-deployment -p user.err "DEADLOCK: Deployment stuck for over $((MAX_LOCK_AGE_SECONDS / 60)) minutes"
            
            # Optional: Send notification (email, Slack, etc.)
            # /usr/local/bin/send-alert "App Monitor deployment deadlock detected"
            ;;
        3)
            # Stale lock detected - auto-cleanup
            log_warn "Stale lock detected - attempting automatic cleanup..."
            if cleanup_lock; then
                log_info "✅ Automatic cleanup successful"
                logger -t app-monitor-deployment "Auto-recovered from stale deployment lock"
            else
                log_error "❌ Automatic cleanup failed - manual intervention required"
                logger -t app-monitor-deployment -p user.err "Failed to auto-cleanup stale deployment lock"
            fi
            ;;
        *)
            log_error "Unknown check result: $check_result"
            ;;
    esac
    
    log_info "=== End Health Check ==="
    echo ""  # Blank line for readability in logs
}

# Main command dispatcher
main() {
    local command="${1:-check}"
    
    case "$command" in
        check)
            check_lock
            exit $?
            ;;
        cleanup)
            cleanup_lock
            exit $?
            ;;
        monitor)
            monitor_lock
            exit 0
            ;;
        *)
            echo "Usage: $0 {check|cleanup|monitor}"
            echo ""
            echo "Commands:"
            echo "  check    - Check for stale or deadlocked deployment locks"
            echo "  cleanup  - Force cleanup of stale deployment locks"
            echo "  monitor  - Health check with automatic recovery (for cron/systemd timer)"
            echo ""
            echo "Examples:"
            echo "  $0 check               # Quick health check"
            echo "  $0 cleanup             # Clean up after failed deployment"
            echo "  $0 monitor             # Automated monitoring (logs to ${MONITOR_LOG})"
            exit 1
            ;;
    esac
}

main "$@"
