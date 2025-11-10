#!/bin/bash
#
# Database Backup Script for App Monitor
# Creates timestamped SQLite database backups
#

set -euo pipefail

# Configuration
DEPLOY_DIR="/opt/app-monitor"
SHARED_DIR="${DEPLOY_DIR}/shared"
DB_PATH="${SHARED_DIR}/backend/data/dev-bots.db"
BACKUP_DIR="${SHARED_DIR}/backups/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dev-bots_${TIMESTAMP}.db"
MAX_BACKUPS=10

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main backup flow
main() {
    log_info "Starting database backup..."

    # Create backup directory if needed
    mkdir -p "${BACKUP_DIR}"

    # Check if database exists
    if [ ! -f "${DB_PATH}" ]; then
        log_error "Database file not found: ${DB_PATH}"
        exit 1
    fi

    # Create backup using SQLite backup command for consistency
    if command -v sqlite3 > /dev/null; then
        log_info "Using SQLite backup command..."
        sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

        # Verify backup integrity
        log_info "Verifying backup integrity..."
        if ! sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;" > /dev/null 2>&1; then
            log_error "Backup integrity check failed - backup may be corrupted"
            rm -f "${BACKUP_FILE}"
            exit 1
        fi
        log_info "Backup integrity verified"
    else
        # Fallback to simple copy
        log_info "Using file copy for backup..."
        cp "${DB_PATH}" "${BACKUP_FILE}"
    fi

    # Verify backup was created and has content
    if [ -f "${BACKUP_FILE}" ]; then
        local size=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null)
        if [ "$size" -eq 0 ]; then
            log_error "Backup file is empty"
            exit 1
        fi
        local size_human=$(du -h "${BACKUP_FILE}" | cut -f1)
        log_info "Backup created successfully: ${BACKUP_FILE} (${size_human})"
    else
        log_error "Backup file was not created"
        exit 1
    fi

    # Cleanup old backups (keep last MAX_BACKUPS)
    log_info "Cleaning up old backups (keeping last ${MAX_BACKUPS})..."
    cd "${BACKUP_DIR}"
    # Sort by filename (timestamp) in reverse order, skip first MAX_BACKUPS, delete rest
    ls -1 dev-bots_*.db 2>/dev/null | sort -r | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

    local backup_count=$(ls -1 dev-bots_*.db 2>/dev/null | wc -l)
    log_info "Current backup count: ${backup_count}"

    log_info "Database backup completed successfully"
}

main "$@"
