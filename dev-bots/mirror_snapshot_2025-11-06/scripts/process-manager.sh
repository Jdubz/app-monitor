#!/bin/bash

# Process Manager for App Monitor
# Centralized process management with proper state tracking

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Configuration
BACKEND_PORT=5000
FRONTEND_PORT=5174
PID_DIR="./.pids"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

# Ensure PID directory exists
mkdir -p "$PID_DIR"

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is in use${RESET}"
        lsof -i:$port
        return 1
    fi
    return 0
}

# Function to check if process is running by PID
is_process_running() {
    local pid_file=$1
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            # PID file exists but process is dead, clean it up
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Function to get process info
get_process_info() {
    local port=$1
    local info=$(lsof -i:$port 2>/dev/null | tail -n +2)
    if [[ -n "$info" ]]; then
        echo "$info"
        return 0
    fi
    return 1
}

# Function to kill process by PID file
kill_by_pid_file() {
    local pid_file=$1
    local name=$2
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}Stopping $name (PID: $pid)...${RESET}"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            if ps -p "$pid" > /dev/null 2>&1; then
                echo -e "${YELLOW}Force killing $name (PID: $pid)...${RESET}"
                kill -KILL "$pid" 2>/dev/null || true
            fi
            rm -f "$pid_file"
            echo -e "${GREEN}✓ $name stopped${RESET}"
        else
            rm -f "$pid_file"
        fi
    fi
}

# Function to kill process by port
kill_by_port() {
    local port=$1
    local name=$2
    
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [[ -n "$pids" ]]; then
        echo -e "${YELLOW}Stopping $name on port $port...${RESET}"
        echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        local remaining=$(lsof -ti:$port 2>/dev/null)
        if [[ -n "$remaining" ]]; then
            echo -e "${YELLOW}Force killing $name on port $port...${RESET}"
            echo "$remaining" | xargs -r kill -KILL 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ $name stopped${RESET}"
    fi
}

# Function to show status
show_status() {
    echo -e "${BOLD}App Monitor Process Status${RESET}"
    echo "=========================="
    echo ""
    
    # Backend status
    echo -e "${CYAN}Backend (Port $BACKEND_PORT):${RESET}"
    if check_port $BACKEND_PORT; then
        echo -e "  ${GREEN}✓ Not running${RESET}"
    else
        get_process_info $BACKEND_PORT
    fi
    echo ""
    
    # Frontend status
    echo -e "${CYAN}Frontend (Port $FRONTEND_PORT):${RESET}"
    if check_port $FRONTEND_PORT; then
        echo -e "  ${GREEN}✓ Not running${RESET}"
    else
        get_process_info $FRONTEND_PORT
    fi
    echo ""
    
    # PID files
    echo -e "${CYAN}PID Files:${RESET}"
    if [[ -f "$BACKEND_PID_FILE" ]]; then
        local backend_pid=$(cat "$BACKEND_PID_FILE")
        if ps -p "$backend_pid" > /dev/null 2>&1; then
            echo -e "  Backend PID: ${GREEN}$backend_pid${RESET} (running)"
        else
            echo -e "  Backend PID: ${RED}$backend_pid${RESET} (stale, will be cleaned)"
        fi
    else
        echo -e "  Backend PID: ${GREEN}none${RESET}"
    fi
    
    if [[ -f "$FRONTEND_PID_FILE" ]]; then
        local frontend_pid=$(cat "$FRONTEND_PID_FILE")
        if ps -p "$frontend_pid" > /dev/null 2>&1; then
            echo -e "  Frontend PID: ${GREEN}$frontend_pid${RESET} (running)"
        else
            echo -e "  Frontend PID: ${RED}$frontend_pid${RESET} (stale, will be cleaned)"
        fi
    else
        echo -e "  Frontend PID: ${GREEN}none${RESET}"
    fi
}

# Function to stop all
stop_all() {
    echo -e "${BOLD}Stopping App Monitor...${RESET}"
    echo ""
    
    # Stop by PID files first (graceful)
    kill_by_pid_file "$BACKEND_PID_FILE" "Backend"
    kill_by_pid_file "$FRONTEND_PID_FILE" "Frontend"
    
    # Stop by ports (aggressive cleanup)
    kill_by_port $BACKEND_PORT "Backend"
    kill_by_port $FRONTEND_PORT "Frontend"
    
    # Clean up any remaining app-monitor processes
    local remaining=$(ps aux | grep -E "(app-monitor|dev-monitor)" | grep -v grep | awk '{print $2}')
    if [[ -n "$remaining" ]]; then
        echo -e "${YELLOW}Cleaning up remaining app-monitor processes...${RESET}"
        echo "$remaining" | xargs -r kill -TERM 2>/dev/null || true
        sleep 1
        echo "$remaining" | xargs -r kill -KILL 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ All processes stopped${RESET}"
}

# Function to start backend
start_backend() {
    if ! check_port $BACKEND_PORT; then
        echo -e "${RED}❌ Backend port $BACKEND_PORT is already in use${RESET}"
        return 1
    fi
    
    echo -e "${CYAN}Starting backend on port $BACKEND_PORT...${RESET}"
    cd backend
    nohup npm run dev > ../logs/backend.log 2>&1 &
    local pid=$!
    echo $pid > "../$BACKEND_PID_FILE"
    cd ..
    echo -e "${GREEN}✓ Backend started (PID: $pid)${RESET}"
}

# Function to start frontend
start_frontend() {
    if ! check_port $FRONTEND_PORT; then
        echo -e "${RED}❌ Frontend port $FRONTEND_PORT is already in use${RESET}"
        return 1
    fi
    
    echo -e "${CYAN}Starting frontend on port $FRONTEND_PORT...${RESET}"
    cd frontend
    nohup npm run dev > ../logs/frontend.log 2>&1 &
    local pid=$!
    echo $pid > "../$FRONTEND_PID_FILE"
    cd ..
    echo -e "${GREEN}✓ Frontend started (PID: $pid)${RESET}"
}

# Main command handling
case "$1" in
    "status")
        show_status
        ;;
    "stop")
        stop_all
        ;;
    "start-backend")
        start_backend
        ;;
    "start-frontend")
        start_frontend
        ;;
    "start")
        start_backend
        sleep 2
        start_frontend
        ;;
    "restart")
        stop_all
        sleep 2
        start_backend
        sleep 2
        start_frontend
        ;;
    *)
        echo "Usage: $0 {status|stop|start|start-backend|start-frontend|restart}"
        echo ""
        echo "Commands:"
        echo "  status        - Show current process status"
        echo "  stop          - Stop all processes"
        echo "  start         - Start both backend and frontend"
        echo "  start-backend - Start only backend"
        echo "  start-frontend- Start only frontend"
        echo "  restart       - Stop all and start fresh"
        exit 1
        ;;
esac