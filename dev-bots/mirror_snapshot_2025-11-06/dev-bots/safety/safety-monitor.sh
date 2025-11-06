#!/bin/bash

# Safety Monitor for Claude Workers
# Monitors worker behavior and enforces safety limits

set -e

# Configuration
SAFETY_CONFIG="/home/jdubz/Development/job-finder-app-manager/claude-workers/safety/safety-config.json"
LOG_FILE="/home/jdubz/Development/job-finder-app-manager/claude-workers/safety/safety-monitor.log"

# Load safety configuration
if [ -f "$SAFETY_CONFIG" ]; then
    MAX_DURATION=$(jq -r '.safety.maxTaskDuration' "$SAFETY_CONFIG")
    MAX_FILE_SIZE=$(jq -r '.safety.maxFileSize' "$SAFETY_CONFIG")
    MAX_MEMORY=$(jq -r '.safety.resourceLimits.maxMemoryMB' "$SAFETY_CONFIG")
    MAX_CPU=$(jq -r '.safety.resourceLimits.maxCpuPercent' "$SAFETY_CONFIG")
    BLOCKED_PATHS=$(jq -r '.safety.blockedPaths[]' "$SAFETY_CONFIG")
    ALLOWED_PATHS=$(jq -r '.safety.allowedPaths[]' "$SAFETY_CONFIG")
else
    echo "Safety config not found, using defaults"
    MAX_DURATION=1800000
    MAX_FILE_SIZE=10485760
    MAX_MEMORY=1024
    MAX_CPU=50
fi

# Function to log safety events
log_safety() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SAFETY] $1" | tee -a "$LOG_FILE"
}

# Function to check if path is allowed
check_path_allowed() {
    local path="$1"
    
    # Check if path is in blocked paths
    for blocked in $BLOCKED_PATHS; do
        if [[ "$path" == "$blocked"* ]]; then
            log_safety "BLOCKED: Path $path is in blocked paths"
            return 1
        fi
    done
    
    # Check if path is in allowed paths
    for allowed in $ALLOWED_PATHS; do
        if [[ "$path" == "$allowed"* ]]; then
            return 0
        fi
    done
    
    log_safety "BLOCKED: Path $path is not in allowed paths"
    return 1
}

# Function to monitor worker processes
monitor_workers() {
    log_safety "Starting safety monitoring..."
    
    while true; do
        # Check for worker processes
        local worker_pids=$(pgrep -f "worker-[ab]\.sh" || true)
        
        for pid in $worker_pids; do
            # Check process duration
            local start_time=$(stat -c %Y /proc/$pid 2>/dev/null || echo "0")
            local current_time=$(date +%s)
            local duration=$((current_time - start_time))
            
            if [ $duration -gt $((MAX_DURATION / 1000)) ]; then
                log_safety "KILLING: Worker $pid exceeded max duration ($duration seconds)"
                kill -TERM $pid 2>/dev/null || true
                sleep 5
                kill -KILL $pid 2>/dev/null || true
            fi
            
            # Check memory usage
            local memory_kb=$(ps -o rss= -p $pid 2>/dev/null | tr -d ' ' || echo "0")
            local memory_mb=$((memory_kb / 1024))
            
            if [ $memory_mb -gt $MAX_MEMORY ]; then
                log_safety "KILLING: Worker $pid exceeded max memory (${memory_mb}MB)"
                kill -TERM $pid 2>/dev/null || true
                sleep 5
                kill -KILL $pid 2>/dev/null || true
            fi
            
            # Check CPU usage (simplified)
            local cpu_usage=$(ps -o %cpu= -p $pid 2>/dev/null | tr -d ' ' || echo "0")
            if (( $(echo "$cpu_usage > $MAX_CPU" | bc -l) )); then
                log_safety "WARNING: Worker $pid high CPU usage (${cpu_usage}%)"
            fi
        done
        
        # Wait before next check
        sleep 30
    done
}

# Function to validate file operations
validate_file_operation() {
    local operation="$1"
    local file_path="$2"
    
    # Check if path is allowed
    if ! check_path_allowed "$file_path"; then
        log_safety "BLOCKED: $operation on $file_path"
        return 1
    fi
    
    # Check file size if it's a write operation
    if [ "$operation" = "write" ] && [ -f "$file_path" ]; then
        local file_size=$(stat -c %s "$file_path" 2>/dev/null || echo "0")
        if [ $file_size -gt $MAX_FILE_SIZE ]; then
            log_safety "BLOCKED: File $file_path too large ($file_size bytes)"
            return 1
        fi
    fi
    
    return 0
}

# Function to start safety monitoring
start_monitoring() {
    log_safety "Safety monitor started"
    monitor_workers
}

# Main execution
case "${1:-start}" in
    "start")
        start_monitoring
        ;;
    "validate")
        validate_file_operation "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {start|validate}"
        echo "  start - Start safety monitoring"
        echo "  validate <operation> <path> - Validate file operation"
        exit 1
        ;;
esac
