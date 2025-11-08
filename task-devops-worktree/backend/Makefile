.PHONY: help dev start stop restart status clean install build test test-watch test-coverage lint lint-fix type-check check

# Default target - show help
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RESET := \033[0m

# Project variables
PORT := 5000
NODE_MODULES := node_modules

help: ## Show this help message
	@echo ""
	@echo "$(CYAN)Available commands:$(RESET)"
	@echo ""
	@echo "$(GREEN)Development:$(RESET)"
	@echo "  make dev          - Start development server with hot reload"
	@echo "  make restart      - Restart development server (stops, waits, starts)"
	@echo "  make stop         - Stop development server gracefully"
	@echo "  make status       - Show current server status and port usage"
	@echo ""
	@echo "$(GREEN)Testing:$(RESET)"
	@echo "  make test         - Run all tests"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo ""
	@echo "$(GREEN)Code Quality:$(RESET)"
	@echo "  make lint         - Run ESLint on source files"
	@echo "  make lint-fix     - Run ESLint and auto-fix issues"
	@echo "  make type-check   - Run TypeScript type checking"
	@echo "  make check        - Run all checks (lint + type-check)"
	@echo ""
	@echo "$(GREEN)Build & Setup:$(RESET)"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build production bundle"
	@echo "  make start        - Start production server"
	@echo "  make clean        - Remove build artifacts and stop servers"
	@echo ""
	@echo "$(YELLOW)Tips:$(RESET)"
	@echo "  - If port $(PORT) is in use, run: make restart"
	@echo "  - To see what's running: make status"
	@echo "  - To clean everything: make clean"
	@echo ""

# Development Commands
dev: ## Start development server
	@echo "$(CYAN)Starting development server...$(RESET)"
	@bash scripts/safe-dev.sh

restart: ## Restart development server
	@echo "$(CYAN)Restarting development server...$(RESET)"
	@bash scripts/restart-dev.sh

stop: ## Stop development server
	@bash scripts/stop-dev.sh

status: ## Show server status
	@bash scripts/status-dev.sh

# Setup and Dependencies
install: ## Install dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@npm install
	@echo "$(GREEN)Dependencies installed successfully$(RESET)"

# Build Commands
build: ## Build production bundle
	@echo "$(CYAN)Building production bundle...$(RESET)"
	@npm run build
	@echo "$(GREEN)Build completed successfully$(RESET)"

start: ## Start production server
	@echo "$(CYAN)Starting production server...$(RESET)"
	@npm run start

# Testing Commands
test: ## Run all tests
	@echo "$(CYAN)Running tests...$(RESET)"
	@npm run test

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(RESET)"
	@npm run test:watch

test-coverage: ## Run tests with coverage
	@echo "$(CYAN)Running tests with coverage...$(RESET)"
	@npm run test:coverage

# Code Quality Commands
lint: ## Run ESLint
	@echo "$(CYAN)Running ESLint...$(RESET)"
	@npm run lint

lint-fix: ## Run ESLint and auto-fix
	@echo "$(CYAN)Running ESLint with auto-fix...$(RESET)"
	@npm run lint:fix

type-check: ## Run TypeScript type checking
	@echo "$(CYAN)Running TypeScript type checker...$(RESET)"
	@npm run type-check

check: lint type-check ## Run all checks
	@echo "$(GREEN)All checks passed!$(RESET)"

# Cleanup Commands
clean: stop ## Stop servers and clean build artifacts
	@echo "$(CYAN)Cleaning build artifacts...$(RESET)"
	@rm -rf dist
	@rm -rf coverage
	@rm -rf .vitest
	@echo "$(GREEN)Cleanup completed$(RESET)"

# Utility Commands (hidden from help)
.PHONY: verify-install
verify-install:
	@test -d $(NODE_MODULES) || (echo "$(YELLOW)Dependencies not installed. Run: make install$(RESET)" && exit 1)
