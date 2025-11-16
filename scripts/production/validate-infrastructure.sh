#!/bin/bash
#
# Infrastructure Validation Script for App Monitor
# Validates critical paths and configurations before deployment
#
# This script checks that all deployment scripts reference correct PATH PATTERNS
# and prevents deployment if critical infrastructure expectations are violated
#
# NOTE: This validates CODE PATTERNS, not filesystem paths, so it works in CI
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Expected infrastructure path patterns (validates patterns in code, not filesystem)
EXPECTED_DEPLOY_DIR_PATTERN="/opt/app-monitor"
EXPECTED_SHARED_DIR_PATTERN="\${DEPLOY_DIR}/shared"
EXPECTED_DB_PATH_PATTERN="\${SHARED_DIR}/backend/data/app-monitor.db"
EXPECTED_BACKUP_DIR_PATTERN="\${SHARED_DIR}/backups/database"

# Single source of truth - ONLY allow this database path
CANONICAL_DB_PATH="/opt/app-monitor/shared/backend/data/app-monitor.db"

# Source directory (for pre-deployment validation)
SOURCE_DIR="${1:-$(pwd)}"
SCRIPTS_DIR="${SOURCE_DIR}/scripts/production"

log_info "Starting infrastructure validation..."
log_info "Source directory: ${SOURCE_DIR}"
log_info "Scripts directory: ${SCRIPTS_DIR}"

ERRORS=0
WARNINGS=0

# Function to check script for correct path pattern
check_script_path() {
    local script="$1"
    local var_name="$2"
    local expected_pattern="$3"
    local friendly_name="$4"

    if [ ! -f "${script}" ]; then
        log_warn "Script not found: ${script}"
        ((WARNINGS++))
        return
    fi

    # Extract the variable definition (raw, with variables intact)
    local actual_value=$(grep "^${var_name}=" "${script}" | head -1 | sed 's/^[^=]*=//; s/"//g; s/'"'"'//g')

    if [ -z "${actual_value}" ]; then
        log_warn "${friendly_name} not found in ${script##*/}"
        ((WARNINGS++))
        return
    fi

    # Check if the actual value matches the expected pattern
    if [ "${actual_value}" = "${expected_pattern}" ]; then
        log_info "✓ ${friendly_name} pattern correct in ${script##*/}: ${actual_value}"
    else
        log_error "${friendly_name} pattern incorrect in ${script##*/}"
        log_error "  Expected: ${expected_pattern}"
        log_error "  Found:    ${actual_value}"
        ((ERRORS++))
    fi
}

# Function to validate database path - ONLY allow canonical path
validate_database_references() {
    local script="$1"

    if [ ! -f "${script}" ]; then
        return
    fi

    log_info "Checking ${script##*/} for database path references..."

    # Find all .db file references (end of line or followed by non-letter)
    # Exclude method calls (.db. or .db\ patterns) to avoid false positives like "this.db.exec" or regex "this\\.db\\.exec"
    # Filter out comments (lines with : followed by optional whitespace then #)
    # Filter out escaped patterns like \\.db\\ which are JavaScript/regex patterns
    # Filter out grep patterns (lines containing grep -E or grep -qE)
    local db_refs=$(grep -n '\.db\([^a-zA-Z.\\]\|$\)' "${script}" | grep -v ':[[:space:]]*#' | grep -v '\\\\.db\\\\' | grep -v 'grep -.*E.*\.db' || true)

    if [ -z "${db_refs}" ]; then
        log_info "  No database references found"
        return
    fi

    # Check each reference - must be valid database path or backup pattern
    # Using process substitution to avoid subshell issue with ERRORS counter
    while IFS=: read -r line_num line_content; do
        # Skip backup file patterns (BACKUP_FILE, BACKUP_PATH, backup globs, etc.)
        if echo "${line_content}" | grep -qE "(BACKUP_FILE|BACKUP_PATH|_backup|backup_|app-monitor_.*\.db|dev-bots_.*\.db)"; then
            log_info "  Line ${line_num}: ✓ Backup file pattern (skipped)"
            continue
        fi

        # Allow:
        # 1. DATABASE_PATH environment variable
        # 2. The literal canonical path: /opt/app-monitor/shared/backend/data/app-monitor.db
        # 3. The variable expansion pattern: ${SHARED_DIR}/backend/data/app-monitor.db
        # 4. Development relative paths: data/app-monitor.db or ../data/app-monitor.db

        if echo "${line_content}" | grep -q "DATABASE_PATH"; then
            log_info "  Line ${line_num}: ✓ Uses DATABASE_PATH variable"
        elif echo "${line_content}" | grep -q "${CANONICAL_DB_PATH}"; then
            log_info "  Line ${line_num}: ✓ Uses canonical path"
        elif echo "${line_content}" | grep -qE '\$\{SHARED_DIR\}/backend/data/app-monitor\.db'; then
            log_info "  Line ${line_num}: ✓ Uses variable expansion pattern"
        elif echo "${line_content}" | grep -qE '(^|[[:space:]="])(\.\./)?data/app-monitor\.db([[:space:]]|"|$)'; then
            log_info "  Line ${line_num}: ✓ Uses relative dev path"
        else
            log_error "  Line ${line_num}: Invalid database reference"
            log_error "    Found: ${line_content}"
            log_error "    Allowed: DATABASE_PATH, ${CANONICAL_DB_PATH}, \${SHARED_DIR}/backend/data/app-monitor.db, or data/app-monitor.db"
            ((ERRORS++))
        fi
    done < <(echo "${db_refs}")
}

# Validate backup-db.sh (most critical)
log_info ""
log_info "=== Validating backup-db.sh ==="
BACKUP_SCRIPT="${SCRIPTS_DIR}/backup-db.sh"
check_script_path "${BACKUP_SCRIPT}" "DEPLOY_DIR" "${EXPECTED_DEPLOY_DIR_PATTERN}" "Deploy directory"
check_script_path "${BACKUP_SCRIPT}" "SHARED_DIR" "${EXPECTED_SHARED_DIR_PATTERN}" "Shared directory"
check_script_path "${BACKUP_SCRIPT}" "DB_PATH" "${EXPECTED_DB_PATH_PATTERN}" "Database path"
check_script_path "${BACKUP_SCRIPT}" "BACKUP_DIR" "${EXPECTED_BACKUP_DIR_PATTERN}" "Backup directory"
validate_database_references "${BACKUP_SCRIPT}"

# Validate all production scripts for database references
log_info ""
log_info "=== Validating all scripts for database path compliance ==="
for script in "${SCRIPTS_DIR}"/*.sh; do
    if [ -f "${script}" ]; then
        # Skip validating the validation script itself to avoid false positives
        if [ "${script}" != "${SCRIPTS_DIR}/validate-infrastructure.sh" ]; then
            validate_database_references "${script}"
        fi
    fi
done

# Summary
log_info ""
log_info "=== Validation Summary ==="
log_info "Errors:   ${ERRORS}"
log_info "Warnings: ${WARNINGS}"

if [ ${ERRORS} -gt 0 ]; then
    log_error "Infrastructure validation FAILED with ${ERRORS} error(s)"
    log_error "Deployment should NOT proceed - critical path issues detected"
    exit 1
elif [ ${WARNINGS} -gt 0 ]; then
    log_warn "Infrastructure validation completed with ${WARNINGS} warning(s)"
    log_warn "Review warnings before deployment"
    exit 0
else
    log_info "✓ Infrastructure validation PASSED"
    log_info "All critical paths are correct"
    exit 0
fi
