#!/bin/bash
#
# Safe dev script - ensures single instance and proper cleanup
#

set -e

# Check if backend is already running
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Backend already running on port 5000"
    exit 0
fi

# Start backend with tsx watch
exec npx tsx watch --clear-screen=false src/index.ts
