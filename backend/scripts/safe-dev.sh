#!/bin/bash

# 🔒 SECURE Dev Server Wrapper - THE ONLY WAY TO START THE SERVER
# This is the single entry point for starting the dev server
# All safety checks are mandatory and cannot be bypassed

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${BOLD}🔒 SECURE Dev Server - Single Entry Point${RESET}"
echo "============================================="
echo ""
echo -e "${CYAN}This is the ONLY way to start the dev server safely.${RESET}"
echo -e "${CYAN}All safety checks are mandatory and cannot be bypassed.${RESET}"
echo ""

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${RED}❌ Server is already running on port $port!${RESET}"
        echo ""
        echo -e "${YELLOW}Port $port is already in use:${RESET}"
        lsof -i:$port
        return 1
    fi
    return 0
}

# Function to check for existing processes
check_processes() {
    if ps aux | grep -E "nodemon.*dev-monitor|tsx.*dev-monitor" | grep -v grep > /dev/null 2>&1; then
        echo -e "${RED}❌ Server is already running!${RESET}"
        echo ""
        echo -e "${YELLOW}Found existing dev-monitor processes:${RESET}"
        ps aux | grep -E "nodemon.*dev-monitor|tsx.*dev-monitor" | grep -v grep
        return 1
    fi
    return 0
}

# Function to show help
show_help() {
    echo -e "${CYAN}💡 Solutions:${RESET}"
    echo "  1. Stop existing processes: make dev-monitor-stop"
    echo "  2. Force clean everything: make dev-monitor-clean"
    echo "  3. Check what's running: make dev-monitor-status"
    echo ""
    echo -e "${RED}⚠️  There is NO unsafe mode - safety checks are mandatory!${RESET}"
    echo ""
}

# Main safety checks
echo -e "${YELLOW}🔍 Running MANDATORY safety checks...${RESET}"
echo ""

echo -e "${YELLOW}1. Checking for existing dev-monitor processes...${RESET}"
if ! check_processes; then
    echo ""
    show_help
    exit 1
fi
echo -e "${GREEN}✓ No existing dev-monitor processes${RESET}"
echo ""

echo -e "${YELLOW}2. Checking port 5000 availability...${RESET}"
if ! check_port 5000; then
    echo ""
    show_help
    exit 1
fi
echo -e "${GREEN}✓ Port 5000 is available${RESET}"
echo ""

echo -e "${GREEN}🚀 All safety checks passed! Starting dev server...${RESET}"
echo ""

# Run the actual dev command - NO BYPASS OPTIONS
exec nodemon --exec "npx tsx" src/index.ts
