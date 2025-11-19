#!/bin/bash
# validate-production-schema.sh
# Validates that production database schema matches migration expectations
# CRITICAL: Run before and after deployments to catch schema drift

set -e

PROD_DB="${1:-/opt/app-monitor/current/backend/data/app-monitor.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
  echo -e "${RED}❌ ERROR: $1${NC}" >&2
}

warn() {
  echo -e "${YELLOW}⚠️  WARNING: $1${NC}" >&2
}

success() {
  echo -e "${GREEN}✓ $1${NC}"
}

info() {
  echo "ℹ️  $1"
}

# Check database exists
if [ ! -f "$PROD_DB" ]; then
  error "Database not found: $PROD_DB"
  exit 1
fi

info "Validating schema for: $PROD_DB"
echo ""

# Critical columns that MUST exist
declare -A CRITICAL_COLUMNS=(
  # task_stage_runs critical columns
  ["task_stage_runs.recovery_diagnosis"]="TEXT"
  ["task_stage_runs.artifacts_blob"]="TEXT"
  ["task_stage_runs.phase_index"]="INTEGER"
  ["task_stage_runs.phase_name"]="TEXT"

  # tasks table phase columns
  ["tasks.phase_index"]="INTEGER"
  ["tasks.phase_name"]="TEXT"
  ["tasks.phase_status"]="TEXT"
  ["tasks.phase_attempts"]="INTEGER"
  ["tasks.phase_payload"]="TEXT"

  # tasks table other critical columns
  ["tasks.fingerprint"]="TEXT"
  ["tasks.chain_id"]="TEXT"
  ["tasks.pr_number"]="INTEGER"
)

ERRORS=0
WARNINGS=0

info "Checking critical columns..."
echo ""

for col_spec in "${!CRITICAL_COLUMNS[@]}"; do
  IFS='.' read -r table column <<< "$col_spec"
  expected_type="${CRITICAL_COLUMNS[$col_spec]}"

  # Query column info
  col_info=$(sqlite3 "$PROD_DB" "PRAGMA table_info($table);" 2>/dev/null | grep -w "$column" || true)

  if [ -z "$col_info" ]; then
    error "$table.$column MISSING (expected $expected_type)"
    ((ERRORS++))
  else
    # Extract actual type
    actual_type=$(echo "$col_info" | cut -d'|' -f3)
    if [ "$actual_type" = "$expected_type" ]; then
      success "$table.$column exists with correct type ($actual_type)"
    else
      warn "$table.$column has type '$actual_type' (expected '$expected_type')"
      ((WARNINGS++))
    fi
  fi
done

echo ""
info "Checking critical tables exist..."
echo ""

CRITICAL_TABLES=(
  "tasks"
  "task_stage_runs"
  "migrations"
  "workers"
  "task_executions"
)

for table in "${CRITICAL_TABLES[@]}"; do
  if sqlite3 "$PROD_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"; then
    success "Table $table exists"
  else
    error "Table $table MISSING"
    ((ERRORS++))
  fi
done

echo ""
info "Checking migration 026 (phase system) was applied..."
echo ""

migration_026=$(sqlite3 "$PROD_DB" "SELECT name, status FROM migrations WHERE id = 26;" 2>/dev/null || echo "")
if echo "$migration_026" | grep -q "applied"; then
  success "Migration 026 (phase system) is applied"
else
  error "Migration 026 (phase system) NOT applied or failed"
  ((ERRORS++))
fi

echo ""
info "Checking migration 029 (recovery_diagnosis fix)..."
echo ""

migration_029=$(sqlite3 "$PROD_DB" "SELECT name, status FROM migrations WHERE id = 29;" 2>/dev/null || echo "")
if echo "$migration_029" | grep -q "applied"; then
  success "Migration 029 (recovery_diagnosis fix) is applied"
else
  warn "Migration 029 (recovery_diagnosis fix) not yet applied - may need manual fix"
  ((WARNINGS++))
fi

echo ""
echo "================================"
echo "Schema Validation Summary"
echo "================================"
echo "Database: $PROD_DB"
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
  error "VALIDATION FAILED - $ERRORS critical issues found"
  echo ""
  echo "IMMEDIATE ACTION REQUIRED:"
  echo "1. Review missing columns/tables above"
  echo "2. Check if migrations need to be run"
  echo "3. Consider manual schema fixes if needed"
  echo ""
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  warn "VALIDATION PASSED with $WARNINGS warnings"
  echo ""
  echo "Review warnings above - these may indicate:"
  echo "- Pending migrations"
  echo "- Schema drift between environments"
  echo "- Type mismatches (may be acceptable)"
  echo ""
  exit 0
else
  success "VALIDATION PASSED - Schema is healthy"
  echo ""
  exit 0
fi
