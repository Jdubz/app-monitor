#!/bin/bash
# Install dependencies in all repositories using common utilities

set -e  # Exit on error

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/build-utils.sh"
source "$SCRIPT_DIR/../common/repo-paths.sh"

log_header "Installing dependencies in all repositories..."
echo ""

# Install dependencies for each repo using common utilities
install_dependencies "frontend" "$FE_DIR"
echo ""
install_dependencies "backend" "$BE_DIR"
echo ""
install_dependencies "dev-monitor backend" "$DEV_MONITOR_DIR/backend"
echo ""
install_dependencies "dev-monitor frontend" "$DEV_MONITOR_DIR/frontend"
echo ""

log_success "All dependencies installed"