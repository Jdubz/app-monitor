#!/bin/bash
# Repository path constants

# Get the app-monitor root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export APP_MONITOR_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# job-finder-app-manager root (parent directory)
export MANAGER_ROOT_DIR="$(cd "$APP_MONITOR_DIR/.." && pwd)"

# Repository directories (in job-finder-app-manager)
export FE_DIR="$MANAGER_ROOT_DIR/job-finder-FE"
export BE_DIR="$MANAGER_ROOT_DIR/job-finder-BE"
export WORKER_DIR="$MANAGER_ROOT_DIR/job-finder-worker"

# App monitor components
export BACKEND_DIR="$APP_MONITOR_DIR/backend"
export FRONTEND_DIR="$APP_MONITOR_DIR/frontend"
export DEV_BOTS_DIR="$APP_MONITOR_DIR/dev-bots"

# Verify directories exist
verify_repo_paths() {
    local missing=0

    if [ ! -d "$FE_DIR" ]; then
        echo "Error: Frontend directory not found: $FE_DIR" >&2
        missing=1
    fi

    if [ ! -d "$BE_DIR" ]; then
        echo "Error: Backend directory not found: $BE_DIR" >&2
        missing=1
    fi

    if [ ! -d "$WORKER_DIR" ]; then
        echo "Error: Worker directory not found: $WORKER_DIR" >&2
        missing=1
    fi

    return $missing
}
