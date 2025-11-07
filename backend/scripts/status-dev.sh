#!/bin/bash

# Dev Server Status Script
# Shows current status of dev server processes and ports

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PORT=5000

echo -e "${BOLD}Dev Server Status${RESET}"
echo "=================================="
echo ""

# Check for nodemon processes
echo -e "${CYAN}Checking for app-monitor processes...${RESET}"
NODEMON_PROCESSES=$(ps aux | grep -E "nodemon.*app-monitor" | grep -v grep || true)
TSX_PROCESSES=$(ps aux | grep -E "tsx.*src/index.ts" | grep -v grep || true)

if [ -z "$NODEMON_PROCESSES" ] && [ -z "$TSX_PROCESSES" ]; then
    echo -e "${YELLOW}No app-monitor processes running${RESET}"
else
    echo -e "${GREEN}Found app-monitor processes:${RESET}"
    if [ ! -z "$NODEMON_PROCESSES" ]; then
        echo "$NODEMON_PROCESSES" | while IFS= read -r line; do
            PID=$(echo "$line" | awk '{print $2}')
            CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "}')
            echo -e "  ${GREEN}PID $PID:${RESET} $CMD"
        done
    fi
    if [ ! -z "$TSX_PROCESSES" ]; then
        echo "$TSX_PROCESSES" | while IFS= read -r line; do
            PID=$(echo "$line" | awk '{print $2}')
            CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "}')
            echo -e "  ${GREEN}PID $PID:${RESET} $CMD"
        done
    fi
fi
echo ""

# Check port 5000
echo -e "${CYAN}Checking port ${PORT}...${RESET}"
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "${GREEN}Port ${PORT} is IN USE:${RESET}"
    lsof -i:$PORT | head -n 1
    lsof -i:$PORT | tail -n +2 | while IFS= read -r line; do
        echo -e "  ${GREEN}$line${RESET}"
    done
else
    echo -e "${YELLOW}Port ${PORT} is FREE${RESET}"
fi
echo ""

# Check for any stale node processes
echo -e "${CYAN}Checking for other node/nodemon processes...${RESET}"
OTHER_PROCESSES=$(ps aux | grep -E "node.*nodemon|nodemon" | grep -v grep | grep -v "app-monitor" || true)
if [ -z "$OTHER_PROCESSES" ]; then
    echo -e "${GREEN}No other nodemon processes found${RESET}"
else
    echo -e "${YELLOW}Found other nodemon processes:${RESET}"
    echo "$OTHER_PROCESSES" | while IFS= read -r line; do
        PID=$(echo "$line" | awk '{print $2}')
        CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}')
        echo -e "  ${YELLOW}PID $PID:${RESET} $CMD"
    done
fi
echo ""

# Summary
echo -e "${BOLD}Summary:${RESET}"
if [ ! -z "$NODEMON_PROCESSES" ] || [ ! -z "$TSX_PROCESSES" ]; then
    echo -e "  ${GREEN}Server Status: RUNNING${RESET}"
else
    echo -e "  ${YELLOW}Server Status: STOPPED${RESET}"
fi

if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "  ${GREEN}Port ${PORT}: IN USE${RESET}"
else
    echo -e "  ${YELLOW}Port ${PORT}: FREE${RESET}"
fi
echo ""

# Show helpful commands
echo -e "${CYAN}Available commands:${RESET}"
echo "  make dev      - Start dev server"
echo "  make restart  - Restart dev server"
echo "  make stop     - Stop dev server"
echo "  make status   - Show this status"
