#!/bin/bash

# Setup Bot Volumes Script
# Creates complete copies of the job-finder-app-manager workspace for each bot
# Each volume includes all repos on staging branch, env files, and secrets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VOLUMES_DIR="$SCRIPT_DIR/volumes"

BOT_NAMES=("bot-a" "bot-b")
REPOS=("job-finder-BE" "job-finder-FE" "job-finder-shared-types" "job-finder-worker")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -d "$WORKSPACE_ROOT/job-finder-BE" ] || [ ! -d "$WORKSPACE_ROOT/job-finder-FE" ]; then
    log_error "Cannot find job-finder repos. Current workspace root: $WORKSPACE_ROOT"
    exit 1
fi

log_info "Workspace root: $WORKSPACE_ROOT"
log_info "Volumes directory: $VOLUMES_DIR"

# Create volumes directory if it doesn't exist
mkdir -p "$VOLUMES_DIR"

for BOT in "${BOT_NAMES[@]}"; do
    log_info "===================================="
    log_info "Setting up ${BOT}..."
    log_info "===================================="

    BOT_DIR="$VOLUMES_DIR/$BOT"

    # Remove existing bot directory if it exists
    if [ -d "$BOT_DIR" ]; then
        log_warn "Removing existing $BOT directory..."
        rm -rf "$BOT_DIR"
    fi

    # Create bot directory
    mkdir -p "$BOT_DIR"

    # Copy ALL root-level files (excluding managed repos and git data)
    log_info "Copying all root-level files for ${BOT}..."

    # Use rsync to copy everything from root, excluding the managed repos
    rsync -av --progress \
        --exclude '.git' \
        --exclude '.git-credentials' \
        --exclude '.claude' \
        --exclude 'node_modules' \
        --exclude 'job-finder-BE' \
        --exclude 'job-finder-FE' \
        --exclude 'job-finder-shared-types' \
        --exclude 'job-finder-worker' \
        --exclude 'app-monitor' \
        "$WORKSPACE_ROOT/" "$BOT_DIR/"

    log_info "  ✓ Copied all root-level files"

    # Clone each repo
    for REPO in "${REPOS[@]}"; do
        log_info "Processing repo: ${REPO}"

        SOURCE_REPO="$WORKSPACE_ROOT/$REPO"
        TARGET_REPO="$BOT_DIR/$REPO"

        if [ ! -d "$SOURCE_REPO/.git" ]; then
            log_error "  ✗ $SOURCE_REPO is not a git repository, skipping..."
            continue
        fi

        # Get the remote URL from the source repo
        REMOTE_URL=$(cd "$SOURCE_REPO" && git config --get remote.origin.url || echo "")

        if [ -z "$REMOTE_URL" ]; then
            log_warn "  ⚠ No remote URL found for $REPO, copying directory instead..."
            cp -r "$SOURCE_REPO" "$TARGET_REPO"
        else
            log_info "  Cloning $REPO from $REMOTE_URL..."
            git clone "$REMOTE_URL" "$TARGET_REPO"

            # Checkout staging branch
            log_info "  Checking out staging branch..."
            cd "$TARGET_REPO"

            # Fetch all branches
            git fetch --all

            # Check if staging branch exists
            if git show-ref --verify --quiet refs/heads/staging; then
                git checkout staging
                log_info "  ✓ Checked out staging branch"
            elif git show-ref --verify --quiet refs/remotes/origin/staging; then
                git checkout -b staging origin/staging
                log_info "  ✓ Checked out staging branch from origin"
            else
                log_warn "  ⚠ No staging branch found, staying on $(git branch --show-current)"
            fi

            # Copy env files if they exist in the source
            if [ -f "$SOURCE_REPO/.env" ]; then
                cp "$SOURCE_REPO/.env" "$TARGET_REPO/.env"
                log_info "  ✓ Copied .env for $REPO"
            fi

            if [ -f "$SOURCE_REPO/.env.local" ]; then
                cp "$SOURCE_REPO/.env.local" "$TARGET_REPO/.env.local"
                log_info "  ✓ Copied .env.local for $REPO"
            fi

            # Copy any other secret files
            for secret_file in .env.development .env.production .env.test credentials.json service-account.json; do
                if [ -f "$SOURCE_REPO/$secret_file" ]; then
                    cp "$SOURCE_REPO/$secret_file" "$TARGET_REPO/$secret_file"
                    log_info "  ✓ Copied $secret_file for $REPO"
                fi
            done
        fi

        log_info "  ✓ Completed $REPO"
    done

    # Copy app-monitor directory (excluding dev-bots/volumes to avoid recursion)
    if [ -d "$WORKSPACE_ROOT/app-monitor" ]; then
        log_info "Copying app-monitor (excluding dev-bots/volumes)..."
        mkdir -p "$BOT_DIR/app-monitor"

        # Use rsync to copy, excluding volumes directory to prevent recursion
        rsync -av --progress \
            --exclude 'dev-bots/volumes' \
            --exclude 'node_modules' \
            --exclude '.next' \
            --exclude 'dist' \
            --exclude 'build' \
            "$WORKSPACE_ROOT/app-monitor/" "$BOT_DIR/app-monitor/"

        # Ensure the volumes directory exists but is empty in the bot
        mkdir -p "$BOT_DIR/app-monitor/dev-bots/volumes"
        log_info "  ✓ Copied app-monitor (volumes directory created but empty)"
    fi

    log_info ""
    log_info "${GREEN}✓ Completed setup for ${BOT}${NC}"
    log_info "Location: $BOT_DIR"
    log_info ""
done

log_info "===================================="
log_info "${GREEN}All bots setup complete!${NC}"
log_info "===================================="
log_info ""
log_info "Bot volumes created at:"
for BOT in "${BOT_NAMES[@]}"; do
    log_info "  - $VOLUMES_DIR/$BOT"
done
log_info ""
log_info "Next steps:"
log_info "  1. Review the volumes to ensure all files are present"
log_info "  2. Update docker-compose files to mount these volumes"
log_info "  3. Start the bots with their respective docker-compose files"
