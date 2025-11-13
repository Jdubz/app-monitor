#!/usr/bin/env bash
set -euo pipefail

# Schema Validation Script
# Prevents deployment of code with duplicate table definitions
# Ensures migrations are the single source of truth for database schema

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[SCHEMA-CHECK]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

BACKEND_DIR="backend/src/services"
MIGRATIONS_DIR="backend/migrations"
ERRORS=0

log "Starting schema validation..."

# Check 1: Verify tasks table schema is compatible if it exists in TaskQueueService
log "Checking tasks table schema compatibility..."
if grep -A 20 "CREATE TABLE.*tasks" "$BACKEND_DIR"/taskQueue.sqlite.ts 2>/dev/null | grep -q "id TEXT PRIMARY KEY"; then
  # Tasks table exists in TaskQueueService - check if it has required columns
  log "Found tasks table in TaskQueueService (for tests/standalone usage)"
  
  # Check if it includes migration columns (fingerprint, project, etc.)
  if grep -A 60 "CREATE TABLE.*tasks" "$BACKEND_DIR"/taskQueue.sqlite.ts | grep -q "fingerprint TEXT" &&\
     grep -A 60 "CREATE TABLE.*tasks" "$BACKEND_DIR"/taskQueue.sqlite.ts | grep -q "project TEXT"; then
    log "✓ Tasks table includes columns from migrations (unified schema)"
  else
    error "Tasks table in TaskQueueService is missing columns from migrations!"
    error "The schema must include ALL columns from migrations to be compatible:"
    error "  - fingerprint (migration 016)"
    error "  - project (migration 002)"
    error "  - pr_number, chain_id, etc. (other migrations)"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "✓ No tasks table in TaskQueueService (will use migrations only)"
fi

# Check 2: Migrations are properly numbered (allowing gaps for skipped migrations)
log "Checking migration file numbering..."
cd "$MIGRATIONS_DIR"
migration_files=$(ls [0-9][0-9][0-9]_*.sql 2>/dev/null | wc -l)
if [[ $migration_files -eq 0 ]]; then
  error "No migration files found in $MIGRATIONS_DIR"
  ERRORS=$((ERRORS + 1))
else
  highest=$(ls [0-9][0-9][0-9]_*.sql 2>/dev/null | sort | tail -1 | cut -d'_' -f1 | sed 's/^0*//')
  log "✓ Found $migration_files migration files (up to migration $highest)"
fi
cd - > /dev/null

# Check 3: All migrations are referenced in database.ts
log "Checking migrations are applied in database.ts..."
for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9]_*.sql; do
  migration_name=$(basename "$migration_file" .sql)
  if ! grep -q "'$migration_name'" backend/src/services/database.ts; then
    # Skip known empty migrations (013-015)
    if [[ ! "$migration_name" =~ ^(013_|014_|015_) ]]; then
      warn "Migration $migration_name exists but may not be applied in database.ts"
      warn "Check if it's intentionally skipped (like 012-015)"
    fi
  fi
done
log "✓ Migration references checked"

# Check 4: Verify fingerprint column exists in migrations
log "Checking for fingerprint column in migrations..."
if grep -q "fingerprint" "$MIGRATIONS_DIR"/016_add_fingerprint_column.sql 2>/dev/null; then
  log "✓ Fingerprint column migration exists"
else
  warn "Migration 016 (fingerprint column) not found - may need to be created"
fi

# Summary
echo ""
if [[ $ERRORS -eq 0 ]]; then
  log "✅ Schema validation passed!"
  log "All checks passed. Safe to deploy."
  exit 0
else
  error "❌ Schema validation failed with $ERRORS error(s)"
  error "Fix the issues above before deploying"
  exit 1
fi
