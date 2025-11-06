#!/bin/bash
# Logging functions for consistent output

# Source colors if not already loaded
if [ -z "$CYAN" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/colors.sh"
fi

log_info() {
    echo -e "${CYAN}$1${RESET}"
}

log_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${RESET}"
}

log_error() {
    echo -e "${RED}✗ $1${RESET}"
}

log_header() {
    echo -e "${BOLD}${CYAN}$1${RESET}"
}
