#!/bin/bash
# Lint frontend using common utilities

set -e  # Exit on error

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/build-utils.sh"
source "$SCRIPT_DIR/../common/repo-paths.sh"

lint_repo "frontend" "$FE_DIR"