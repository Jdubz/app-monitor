# App Monitor Makefile
.PHONY: help install setup dev dev-backend dev-frontend stop start status restart test lint build clean
.PHONY: bot-build bot-a bot-b bot-start bot-stop bot-logs-a bot-logs-b bot-status bot-shell-a bot-shell-b bot-clean bot-sync

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
	@./scripts/process-manager.sh stop

status: ## Show process status
	@./scripts/process-manager.sh status

start: ## Start all services
	@./scripts/process-manager.sh start

restart: ## Restart all services
	@./scripts/process-manager.sh restart

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

# ============================================================================
# Dev-Bot Commands
# ============================================================================

bot-build: ## Build dev-bot Docker image
	@echo "$(CYAN)Building dev-bot Docker image...$(RESET)"
	@cd dev-bots/docker && docker build -f Dockerfile -t claude-worker:latest ../../..
	@echo "$(GREEN)✓ Dev-bot image built$(RESET)"

bot-sync: ## Sync workspace to bot volumes
	@echo "$(CYAN)Syncing workspace to bot volumes...$(RESET)"
	@cd dev-bots && ./setup-bot-volumes.sh
	@echo "$(GREEN)✓ Bot volumes synced$(RESET)"

bot-a: ## Start bot-a in interactive mode
	@echo "$(CYAN)Starting bot-a in interactive mode...$(RESET)"
	@cd dev-bots && docker-compose up -d bot-a
	@echo "$(GREEN)✓ Bot-a started$(RESET)"
	@echo "$(YELLOW)To attach: docker attach dev-bot-a$(RESET)"
	@echo "$(YELLOW)To enter shell: make bot-shell-a$(RESET)"

bot-b: ## Start bot-b in interactive mode
	@echo "$(CYAN)Starting bot-b in interactive mode...$(RESET)"
	@cd dev-bots && docker-compose up -d bot-b
	@echo "$(GREEN)✓ Bot-b started$(RESET)"
	@echo "$(YELLOW)To attach: docker attach dev-bot-b$(RESET)"
	@echo "$(YELLOW)To enter shell: make bot-shell-b$(RESET)"

bot-start: ## Start both dev-bots
	@echo "$(CYAN)Starting both dev-bots...$(RESET)"
	@cd dev-bots && docker-compose up -d
	@echo "$(GREEN)✓ Both bots started$(RESET)"
	@echo "$(YELLOW)Use 'make bot-status' to check status$(RESET)"

bot-stop: ## Stop all dev-bots
	@echo "$(CYAN)Stopping dev-bots...$(RESET)"
	@cd dev-bots && docker-compose down
	@echo "$(GREEN)✓ Dev-bots stopped$(RESET)"

bot-restart-a: ## Restart bot-a
	@echo "$(CYAN)Restarting bot-a...$(RESET)"
	@cd dev-bots && docker-compose restart bot-a
	@echo "$(GREEN)✓ Bot-a restarted$(RESET)"

bot-restart-b: ## Restart bot-b
	@echo "$(CYAN)Restarting bot-b...$(RESET)"
	@cd dev-bots && docker-compose restart bot-b
	@echo "$(GREEN)✓ Bot-b restarted$(RESET)"

bot-logs-a: ## View bot-a logs
	@cd dev-bots && docker-compose logs -f bot-a

bot-logs-b: ## View bot-b logs
	@cd dev-bots && docker-compose logs -f bot-b

bot-status: ## Check dev-bot status
	@echo "$(CYAN)Dev-Bot Status:$(RESET)"
	@docker ps --filter "name=dev-bot" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

bot-shell-a: ## Enter bot-a shell
	@echo "$(CYAN)Entering bot-a shell...$(RESET)"
	@docker exec -it dev-bot-a /bin/bash

bot-shell-b: ## Enter bot-b shell
	@echo "$(CYAN)Entering bot-b shell...$(RESET)"
	@docker exec -it dev-bot-b /bin/bash

bot-clean: ## Clean up bot containers and volumes
	@echo "$(CYAN)Cleaning up dev-bots...$(RESET)"
	@cd dev-bots && docker-compose down -v
	@echo "$(GREEN)✓ Dev-bots cleaned$(RESET)"

bot-rebuild: ## Rebuild and restart bots
	@echo "$(CYAN)Rebuilding dev-bots...$(RESET)"
	@make bot-stop
	@make bot-build
	@make bot-start
	@echo "$(GREEN)✓ Dev-bots rebuilt$(RESET)"
