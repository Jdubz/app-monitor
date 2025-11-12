#!/bin/bash
#
# Migration Validation Script
# Checks that all migrations use safe, idempotent SQL patterns
#
# Usage: ./scripts/validate-migrations.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_inline_migrations() {
    log_info "Checking inline migrations in database.ts..."
    
    local db_file="${PROJECT_ROOT}/backend/src/services/database.ts"
    local errors=0
    
    if [ ! -f "$db_file" ]; then
        log_error "database.ts not found at $db_file"
        return 1
    fi
    
    # Check for CREATE TABLE without IF NOT EXISTS in applyMigration blocks
    # This is tricky because we need to find CREATE TABLE statements within migration callbacks
    
    # Extract migration blocks and check each one
    if perl -ne 'BEGIN{$found=0;} if (/CREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)/i) { print "$.:$_"; $found=1 } END { exit($found ? 0 : 1) }' "$db_file"; then
        log_error "Found CREATE TABLE without IF NOT EXISTS in database.ts"
        log_error "All inline migrations must use: CREATE TABLE IF NOT EXISTS"
        ((errors++))
    fi
    
    if [ $errors -eq 0 ]; then
        log_info "✓ Inline migrations are safe (use IF NOT EXISTS)"
    fi
    
    return $errors
}

check_migration_files() {
    log_info "Checking migration SQL files..."
    
    local migrations_dir="${PROJECT_ROOT}/backend/migrations"
    local errors=0
    local warnings=0
    
    if [ ! -d "$migrations_dir" ]; then
        log_warn "No migrations directory found at $migrations_dir"
        return 0
    fi
    
    # Find all .sql files
    while IFS= read -r -d '' file; do
        local filename=$(basename "$file")
        log_info "Checking $filename..."
        
        # Check if this is a documentation-only migration
        if grep -qi "documentation.*only.*migration\|migration.*documentation.*only" "$file"; then
            log_info "  ℹ $filename is documentation-only, skipping validation"
            continue
        fi
        
        # Check for CREATE TABLE without IF NOT EXISTS (skip commented lines)
        if perl -ne 'BEGIN{$found=0;} if (!/^\s*--/ && /CREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)/i) { print "$.:$_"; $found=1 } END { exit($found ? 0 : 1) }' "$file"; then
            log_error "  ✗ $filename contains CREATE TABLE without IF NOT EXISTS"
            log_error "    This can cause deployment failures if migration tracking is reset"
            ((errors++))
        else
            log_info "  ✓ $filename uses safe patterns"
        fi
        
        # Check for ALTER TABLE (these can't use IF NOT EXISTS, so just warn)
        if grep -qi "ALTER TABLE" "$file"; then
            log_warn "  ⚠ $filename contains ALTER TABLE statements"
            log_warn "    Ensure these are wrapped in proper existence checks or have error handling"
            ((warnings++))
        fi
        
        # Check for CREATE INDEX without IF NOT EXISTS
        if perl -ne 'BEGIN{$found=0;} if (/CREATE\s+(?:UNIQUE\s+)?INDEX(?!\s+IF\s+NOT\s+EXISTS)/i) { print "$.:$_"; $found=1 } END { exit($found ? 0 : 1) }' "$file"; then
            log_warn "  ⚠ $filename contains CREATE INDEX without IF NOT EXISTS"
            log_warn "    Consider using: CREATE INDEX IF NOT EXISTS"
            ((warnings++))
        fi
        
    done < <(find "$migrations_dir" -name "*.sql" -print0)
    
    if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
        log_info "✓ All migration files passed validation"
    elif [ $errors -eq 0 ]; then
        log_warn "✓ Migration files passed with $warnings warning(s)"
    fi
    
    return $errors
}

check_migration_tracking() {
    log_info "Checking migration tracking implementation..."
    
    local db_file="${PROJECT_ROOT}/backend/src/services/database.ts"
    local errors=0
    
    # Verify migrations table is created with IF NOT EXISTS
    if ! grep -q "CREATE TABLE IF NOT EXISTS migrations" "$db_file"; then
        log_error "migrations tracking table must use IF NOT EXISTS"
        ((errors++))
    else
        log_info "✓ migrations table uses IF NOT EXISTS"
    fi
    
    # Verify applyMigration has error handling
    if ! grep -A 30 "private applyMigration" "$db_file" | grep -q "catch"; then
        log_error "applyMigration should have try-catch error handling"
        ((errors++))
    else
        log_info "✓ applyMigration has error handling"
    fi
    
    return $errors
}

main() {
    log_info "Starting migration validation..."
    echo ""
    
    local total_errors=0
    
    check_inline_migrations || ((total_errors++))
    echo ""
    
    check_migration_files || ((total_errors++))
    echo ""
    
    check_migration_tracking || ((total_errors++))
    echo ""
    
    if [ $total_errors -eq 0 ]; then
        log_info "======================================"
        log_info "✅ All migration validations passed!"
        log_info "======================================"
        return 0
    else
        log_error "======================================"
        log_error "❌ Migration validation failed!"
        log_error "Found $total_errors error(s)"
        log_error "======================================"
        return 1
    fi
}

main "$@"
