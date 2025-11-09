#!/bin/bash
#
# Manual Script Update Helper
# Run this to manually update production scripts to break the deployment catch-22
#
# Usage: sudo ./scripts/manual-update-scripts.sh
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[INFO]${NC} Manually updating production scripts..."

# Check if we're running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo $0"
    exit 1
fi

SCRIPTS_DIR="/opt/app-monitor/scripts"
SOURCE_DIR="/home/jdubz/Development/app-monitor/scripts/production"

# Copy all production scripts
echo -e "${GREEN}[INFO]${NC} Copying scripts from ${SOURCE_DIR} to ${SCRIPTS_DIR}..."
cp -f "${SOURCE_DIR}/"*.sh "${SCRIPTS_DIR}/"
chmod +x "${SCRIPTS_DIR}/"*.sh

echo -e "${GREEN}[INFO]${NC} Production scripts updated successfully!"
echo -e "${GREEN}[INFO]${NC} You can now trigger a deployment and it will use the updated scripts"
