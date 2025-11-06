#!/bin/bash
# Test all repositories using common utilities

set -e  # Exit on error

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/build-utils.sh"
source "$SCRIPT_DIR/../common/repo-paths.sh"

log_header "Testing all repositories..."
echo ""

# Test each repo using common utilities
test_repo "frontend" "$FE_DIR"
echo ""
test_repo "backend" "$BE_DIR"
echo ""

log_success "All tests passed"