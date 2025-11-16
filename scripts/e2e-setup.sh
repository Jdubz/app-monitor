#!/bin/bash
set -e

# E2E Test Environment Setup
# Sets up isolated test environment for E2E tests
# NEVER affects production!

echo "🧪 Setting up E2E test environment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ Must run from project root${NC}"
  exit 1
fi

# Safety check: Make sure we're not using production DB
if [ -f ".env" ]; then
  PROD_DB=$(grep "DATABASE_PATH" .env | grep -v "^#" || echo "")
  if [ ! -z "$PROD_DB" ]; then
    echo -e "${YELLOW}⚠️  Production .env detected${NC}"
    echo -e "${YELLOW}   E2E tests use .env.e2e (isolated environment)${NC}"
  fi
fi

# Create E2E test database directory
mkdir -p backend/data
mkdir -p e2e/results

# Clean up old test database
if [ -f "backend/data/e2e-test.db" ]; then
  echo "🗑️  Removing old E2E test database..."
  rm -f backend/data/e2e-test.db
fi

# Run migrations for E2E test database
echo "📊 Setting up E2E test database..."
cd backend
DATABASE_PATH=./data/e2e-test.db node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./data/e2e-test.db');

// Run all migrations
const migrationsDir = './migrations';
const files = fs.readdirSync(migrationsDir).sort();

for (const file of files) {
  if (!file.endsWith('.sql')) continue;
  console.log('Running migration:', file);
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    db.exec(sql);
  } catch (err) {
    console.warn('Migration warning:', file, err.message);
  }
}

db.close();
console.log('✅ E2E database ready');
"
cd ..

# Install Playwright browsers if needed
if [ ! -d "node_modules/@playwright" ]; then
  echo "📦 Installing Playwright..."
  npm install -D @playwright/test
fi

echo "🌐 Installing Playwright browsers..."
npx playwright install chromium

echo ""
echo -e "${GREEN}✅ E2E test environment ready!${NC}"
echo ""
echo "Run tests with:"
echo "  npm run test:e2e"
echo ""
echo "Run tests with UI:"
echo "  npm run test:e2e:ui"
echo ""
echo -e "${YELLOW}⚠️  Test environment uses:${NC}"
echo "  • Backend: http://localhost:3002"
echo "  • Frontend: http://localhost:5174"
echo "  • Database: backend/data/e2e-test.db"
echo ""
echo -e "${GREEN}✅ Completely isolated from production!${NC}"
