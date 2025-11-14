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
EXPECTED_DB_PATH_PATTERN="\${SHARED_DIR}/data/dev-bots.db"
EXPECTED_BACKUP_DIR_PATTERN="\${SHARED_DIR}/backups/database"

# Forbidden patterns that indicate incorrect paths
FORBIDDEN_DB_PATH_PATTERN="shared/backend/data"
FORBIDDEN_DB_PATH_PATTERN2="/backend/data/dev-bots.db"

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

# Function to check for hardcoded incorrect paths
check_for_incorrect_paths() {
    local script="$1"
    local incorrect_pattern="$2"
    local description="$3"

    if [ ! -f "${script}" ]; then
        return
    fi

    if grep -q "${incorrect_pattern}" "${script}"; then
        log_error "Found incorrect path pattern in ${script##*/}: ${description}"
        log_error "  Pattern: ${incorrect_pattern}"
        grep -n "${incorrect_pattern}" "${script}" | while read -r line; do
            log_error "  Line: ${line}"
        done
        ((ERRORS++))
    fi
}

# Validate backup-db.sh (most critical)
log_info ""
log_info "=== Validating backup-db.sh ==="
BACKUP_SCRIPT="${SCRIPTS_DIR}/backup-db.sh"
check_script_path "${BACKUP_SCRIPT}" "DEPLOY_DIR" "${EXPECTED_DEPLOY_DIR_PATTERN}" "Deploy directory"
check_script_path "${BACKUP_SCRIPT}" "SHARED_DIR" "${EXPECTED_SHARED_DIR_PATTERN}" "Shared directory"
check_script_path "${BACKUP_SCRIPT}" "DB_PATH" "${EXPECTED_DB_PATH_PATTERN}" "Database path"
check_script_path "${BACKUP_SCRIPT}" "BACKUP_DIR" "${EXPECTED_BACKUP_DIR_PATTERN}" "Backup directory"

# Check for forbidden path patterns
check_for_incorrect_paths "${BACKUP_SCRIPT}" "${FORBIDDEN_DB_PATH_PATTERN}" "Forbidden database path pattern (${FORBIDDEN_DB_PATH_PATTERN})"

# Validate deploy.sh
log_info ""
log_info "=== Validating deploy.sh ==="
DEPLOY_SCRIPT="${SCRIPTS_DIR}/deploy.sh"
if [ -f "${DEPLOY_SCRIPT}" ]; then
    check_for_incorrect_paths "${DEPLOY_SCRIPT}" "${FORBIDDEN_DB_PATH_PATTERN}" "Forbidden path pattern"
    log_info "✓ deploy.sh validated"
fi

# Validate health-check.sh
log_info ""
log_info "=== Validating health-check.sh ==="
HEALTH_SCRIPT="${SCRIPTS_DIR}/health-check.sh"
if [ -f "${HEALTH_SCRIPT}" ]; then
    check_for_incorrect_paths "${HEALTH_SCRIPT}" "${FORBIDDEN_DB_PATH_PATTERN}" "Forbidden path pattern"
    log_info "✓ health-check.sh validated"
fi

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
