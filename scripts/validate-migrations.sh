#!/bin/bash
# Database Migration Validator
# Validates that migration files exist and follow safe patterns

set -euo pipefail

echo "🔍 Validating database migrations..."

MIGRATIONS_DIR="backend/migrations"
[ ! -d "${MIGRATIONS_DIR}" ] && { echo "❌ No migrations dir"; exit 1; }

MIGRATION_FILES=$(find "${MIGRATIONS_DIR}" -name "*.sql" | sort)
COUNT=$(echo "${MIGRATION_FILES}" | wc -l)

if [ ${COUNT} -eq 0 ]; then
  echo "❌ ERROR: No migration files found"
  exit 1
fi

echo "📦 Found ${COUNT} migration files"

ERRORS=0
WARNINGS=0

# List migrations for reference
echo ""
echo "Migration files:"
for migration in ${MIGRATION_FILES}; do
  filename=$(basename "${migration}")
  echo "  - ${filename}"
done

# Validate each migration file for best practices
echo ""
echo "🔍 Checking migration file patterns..."
for migration in ${MIGRATION_FILES}; do
  filename=$(basename "${migration}")

  # Check file is readable and non-empty
  if [ ! -s "${migration}" ]; then
    echo "  ❌ ERROR: ${filename} is empty or unreadable"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Check for CREATE TABLE without IF NOT EXISTS (warning for legacy migrations)
  if grep -q "CREATE TABLE" "${migration}" && ! grep -q "CREATE TABLE IF NOT EXISTS" "${migration}"; then
    # Only fail for newer migrations (020+) - legacy ones already ran in production
    migration_num=$(echo "${filename}" | sed 's/^0*\([0-9]*\).*/\1/')
    if [ ${migration_num} -ge 20 ]; then
      echo "  ❌ ERROR: ${filename} - CREATE TABLE must use IF NOT EXISTS"
      ERRORS=$((ERRORS + 1))
    else
      WARNINGS=$((WARNINGS + 1))
    fi
  fi

  # Check for CREATE INDEX without IF NOT EXISTS (warning for legacy migrations)
  if grep -q "CREATE INDEX" "${migration}" && ! grep -q "CREATE INDEX IF NOT EXISTS" "${migration}"; then
    migration_num=$(echo "${filename}" | sed 's/^0*\([0-9]*\).*/\1/')
    if [ ${migration_num} -ge 20 ]; then
      echo "  ❌ ERROR: ${filename} - CREATE INDEX must use IF NOT EXISTS"
      ERRORS=$((ERRORS + 1))
    else
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

# Validate no duplicate migration numbers
echo ""
echo "🔢 Checking for duplicate migration numbers..."
NUMBERS=$(echo "${MIGRATION_FILES}" | sed 's/.*\/\([0-9]*\)_.*/\1/' | sort)
DUPLICATES=$(echo "${NUMBERS}" | uniq -d)
if [ -n "${DUPLICATES}" ]; then
  echo "  ❌ ERROR: Duplicate migration numbers found: ${DUPLICATES}"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
if [ ${ERRORS} -gt 0 ]; then
  echo "❌ Migration validation failed with ${ERRORS} error(s)"
  exit 1
elif [ ${WARNINGS} -gt 0 ]; then
  echo "⚠️  Validation passed with ${WARNINGS} warning(s) (legacy migrations)"
  echo "✅ All migration files validated successfully"
  echo "   - ${COUNT} migration files found"
  echo "   - No duplicate migration numbers"
  echo "   - All new migrations (020+) use safe patterns"
else
  echo "✅ All migration files validated successfully"
  echo "   - ${COUNT} migration files found"
  echo "   - No duplicate migration numbers"
  echo "   - All migrations use safe patterns"
fi
