#!/bin/bash

# Dev Server Stop Script
# Stops all dev server processes gracefully

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PORT=5000
MAX_WAIT=10

echo -e "${BOLD}Stopping dev server...${RESET}"
echo ""

# Function to find processes by pattern
find_processes() {
    ps aux | grep -E "nodemon.*app-monitor|tsx.*src/index.ts" | grep -v grep | awk '{print $2}' || true
}

# Function to find processes on port
find_port_processes() {
    lsof -ti:$PORT 2>/dev/null || true
}

# Find all relevant processes
PROCESS_PIDS=$(find_processes)
PORT_PIDS=$(find_port_processes)

# Combine and deduplicate PIDs
ALL_PIDS=$(echo "$PROCESS_PIDS $PORT_PIDS" | tr ' ' '\n' | sort -u | grep -v '^$' || true)

if [ -z "$ALL_PIDS" ]; then
    echo -e "${GREEN}No running dev server processes found${RESET}"
    exit 0
fi

echo -e "${YELLOW}Found processes to stop:${RESET}"
for pid in $ALL_PIDS; do
    ps -p $pid -o pid,cmd --no-headers 2>/dev/null || echo "  PID $pid (no longer running)"
done
echo ""

# Try graceful shutdown first (SIGTERM)
echo -e "${CYAN}Attempting graceful shutdown (SIGTERM)...${RESET}"
for pid in $ALL_PIDS; do
    kill -TERM $pid 2>/dev/null || true
done

# Wait for processes to exit
echo -e "${CYAN}Waiting for processes to exit (max ${MAX_WAIT}s)...${RESET}"
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    REMAINING_PIDS=""
    for pid in $ALL_PIDS; do
        if ps -p $pid > /dev/null 2>&1; then
            REMAINING_PIDS="$REMAINING_PIDS $pid"
        fi
    done

    if [ -z "$REMAINING_PIDS" ]; then
        break
    fi

    sleep 1
    WAITED=$((WAITED + 1))
    echo -n "."
done
echo ""

# Force kill any remaining processes
REMAINING_PIDS=$(for pid in $ALL_PIDS; do ps -p $pid > /dev/null 2>&1 && echo $pid; done)
if [ ! -z "$REMAINING_PIDS" ]; then
    echo -e "${YELLOW}Force killing remaining processes (SIGKILL)...${RESET}"
    for pid in $REMAINING_PIDS; do
        kill -9 $pid 2>/dev/null || true
    done
    sleep 1
fi

# Verify port is free
echo -e "${CYAN}Verifying port ${PORT} is free...${RESET}"
sleep 2

# Double check and force kill anything on the port if needed
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "${YELLOW}Port still occupied, force killing...${RESET}"
    lsof -ti:$PORT | xargs -r kill -9 2>/dev/null || true
    sleep 1
fi

# Final verification
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "${RED}Error: Port ${PORT} is still in use!${RESET}"
    echo ""
    echo -e "${YELLOW}Processes on port ${PORT}:${RESET}"
    lsof -i:$PORT
    exit 1
fi

echo ""
echo -e "${GREEN}Successfully stopped all dev server processes${RESET}"
echo -e "${GREEN}Port ${PORT} is now free${RESET}"
