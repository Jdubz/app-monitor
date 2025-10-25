# App Monitor Makefile
.PHONY: help install setup dev dev-backend dev-frontend stop test lint build clean

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show this help
	@echo "$(CYAN)App Monitor - Developer Tool$(RESET)"
	@echo "=============================="
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@npm install
	@npm install --workspaces
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

dev: ## Start backend + frontend
	@echo "$(CYAN)Starting App Monitor...$(RESET)"
	@npm run dev

dev-backend: ## Start backend only
	@echo "$(CYAN)Starting backend...$(RESET)"
	@npm run dev:backend

dev-frontend: ## Start frontend only
	@echo "$(CYAN)Starting frontend...$(RESET)"
	@npm run dev:frontend

stop: ## Stop all services
	@echo "$(CYAN)Stopping services...$(RESET)"
	@-lsof -ti:5000 2>/dev/null | xargs -r kill -9 2>/dev/null
	@-lsof -ti:5174 2>/dev/null | xargs -r kill -9 2>/dev/null
	@sleep 1
	@echo "$(GREEN)✓ Services stopped$(RESET)"

build: ## Build all workspaces
	@echo "$(CYAN)Building...$(RESET)"
	@npm run build

test: ## Run all tests
	@echo "$(CYAN)Running tests...$(RESET)"
	@npm test

lint: ## Lint all workspaces
	@echo "$(CYAN)Linting...$(RESET)"
	@npm run lint

clean: ## Clean build artifacts
	@echo "$(CYAN)Cleaning...$(RESET)"
	@npm run clean
	@rm -rf node_modules
