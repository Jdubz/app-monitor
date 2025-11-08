#!/bin/bash

# Dev Server Restart Script
# Gracefully stops and restarts the dev server

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}Restarting dev server...${RESET}"
echo "=================================="
echo ""

# Step 1: Stop existing server
echo -e "${YELLOW}Step 1: Stopping existing server${RESET}"
bash "$SCRIPT_DIR/stop-dev.sh"
echo ""

# Step 2: Wait a moment for cleanup
echo -e "${CYAN}Waiting for cleanup...${RESET}"
sleep 2
echo ""

# Step 3: Verify clean state
echo -e "${YELLOW}Step 2: Verifying clean state${RESET}"
if lsof -ti:5000 > /dev/null 2>&1; then
    echo -e "${RED}Error: Port 5000 is still in use!${RESET}"
    echo ""
    echo -e "${YELLOW}Processes on port 5000:${RESET}"
    lsof -i:5000
    echo ""
    echo -e "${RED}Cannot restart - port conflict detected${RESET}"
    exit 1
fi

if ps aux | grep -E "nodemon.*app-monitor|tsx.*src/index.ts" | grep -v grep > /dev/null 2>&1; then
    echo -e "${RED}Error: App monitor processes still running!${RESET}"
    echo ""
    echo -e "${YELLOW}Found processes:${RESET}"
    ps aux | grep -E "nodemon.*app-monitor|tsx.*src/index.ts" | grep -v grep
    echo ""
    echo -e "${RED}Cannot restart - process conflict detected${RESET}"
    exit 1
fi

echo -e "${GREEN}Clean state verified${RESET}"
echo ""

# Step 3: Start server
echo -e "${YELLOW}Step 3: Starting dev server${RESET}"
echo ""
exec bash "$SCRIPT_DIR/safe-dev.sh"
