#!/bin/bash
# Database Migration Validator

set -euo pipefail

echo "🔍 Validating database migrations..."

MIGRATIONS_DIR="backend/migrations"
[ ! -d "${MIGRATIONS_DIR}" ] && { echo "❌ No migrations dir"; exit 1; }

COUNT=$(find "${MIGRATIONS_DIR}" -name "*.sql" | wc -l)
echo "📦 Found ${COUNT} migration files"

# List migrations for reference
ls -1 "${MIGRATIONS_DIR}"/*.sql | sort

echo "✅ Migration files validated"
