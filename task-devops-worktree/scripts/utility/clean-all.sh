#!/bin/bash
# Clean all repositories using common utilities

set -e  # Exit on error

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/build-utils.sh"
source "$SCRIPT_DIR/../common/repo-paths.sh"

log_header "Cleaning build artifacts in all repositories..."
echo ""

# Clean each repo using common utilities
clean_repo "frontend" "$FE_DIR"
echo ""
clean_repo "backend" "$BE_DIR"
echo ""

log_success "All artifacts cleaned"