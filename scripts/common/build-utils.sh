#!/bin/bash
# Build utilities for consistent build operations

# Source colors and logging
source "$(dirname "${BASH_SOURCE[0]}")/colors.sh"
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"

# Build a single repository
build_repo() {
    local repo_name=$1
    local repo_dir=$2
    local build_command=$3
    
    if [ ! -d "$repo_dir" ]; then
        log_error "Repository directory not found: $repo_dir"
        return 1
    fi
    
    log_info "Building $repo_name..."
    cd "$repo_dir"
    
    if eval "$build_command"; then
        log_success "$repo_name build complete"
        return 0
    else
        log_error "$repo_name build failed"
        return 1
    fi
}

# Install dependencies for a repository
install_dependencies() {
    local repo_name=$1
    local repo_dir=$2
    
    if [ ! -d "$repo_dir" ]; then
        log_error "Repository directory not found: $repo_dir"
        return 1
    fi
    
    log_info "Installing $repo_name dependencies..."
    cd "$repo_dir"
    
    if npm install; then
        log_success "$repo_name dependencies installed"
        return 0
    else
        log_error "$repo_name dependency installation failed"
        return 1
    fi
}

# Lint a repository
lint_repo() {
    local repo_name=$1
    local repo_dir=$2
    local lint_command=${3:-"npm run lint"}
    
    if [ ! -d "$repo_dir" ]; then
        log_error "Repository directory not found: $repo_dir"
        return 1
    fi
    
    log_info "Linting $repo_name..."
    cd "$repo_dir"
    
    if eval "$lint_command"; then
        log_success "$repo_name lint passed"
        return 0
    else
        log_error "$repo_name lint failed"
        return 1
    fi
}

# Test a repository
test_repo() {
    local repo_name=$1
    local repo_dir=$2
    local test_command=${3:-"npm run test"}
    
    if [ ! -d "$repo_dir" ]; then
        log_error "Repository directory not found: $repo_dir"
        return 1
    fi
    
    log_info "Testing $repo_name..."
    cd "$repo_dir"
    
    if eval "$test_command"; then
        log_success "$repo_name tests passed"
        return 0
    else
        log_error "$repo_name tests failed"
        return 1
    fi
}

# Clean build artifacts
clean_repo() {
    local repo_name=$1
    local repo_dir=$2
    local clean_command=${3:-"npm run clean"}
    
    if [ ! -d "$repo_dir" ]; then
        log_error "Repository directory not found: $repo_dir"
        return 1
    fi
    
    log_info "Cleaning $repo_name..."
    cd "$repo_dir"
    
    if eval "$clean_command" 2>/dev/null || rm -rf dist node_modules/.vite functions/dist; then
        log_success "$repo_name cleaned"
        return 0
    else
        log_error "$repo_name cleanup failed"
        return 1
    fi
}
