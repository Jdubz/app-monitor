#!/usr/bin/env node
/**
 * Schema Validation CLI Tool
 *
 * Validates that database schema matches migration expectations.
 * Critical for catching schema drift before it causes production failures.
 *
 * Usage:
 *   npm run migrate:validate              # Validate dev database
 *   npm run migrate:validate -- --prod    # Validate production database
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MigrationManager } from '../services/migrationManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine database path
const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const customPath = args.find(arg => arg.startsWith('--db='))?.split('=')[1];

const DB_PATH = customPath
  ? customPath
  : isProd
    ? '/opt/app-monitor/current/backend/data/app-monitor.db'
    : path.join(__dirname, '..', '..', 'data', 'app-monitor.db');

console.log('🔍 Database Schema Validation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📂 Database: ${DB_PATH}`);
console.log(`🌍 Environment: ${isProd ? 'PRODUCTION' : 'Development'}\n`);

try {
  // Open database
  const db = new Database(DB_PATH);
  const manager = new MigrationManager(db);

  // Run validation
  console.log('⏳ Validating schema...\n');
  const result = manager.validateSchema();

  // Display results
  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log('✅ Schema validation PASSED');
    console.log('\n✓ All critical columns exist');
    console.log('✓ All column types match expectations');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  }

  // Show errors
  if (result.errors.length > 0) {
    console.log('❌ Schema validation FAILED\n');
    console.log(`Found ${result.errors.length} schema error(s):\n`);

    for (const error of result.errors) {
      if (error.issue === 'missing') {
        console.log(`  ❌ ${error.table}.${error.column} MISSING`);
        console.log(`     Expected type: ${error.expectedType}`);
      } else {
        console.log(`  ❌ ${error.table}.${error.column} TYPE MISMATCH`);
        console.log(`     Expected: ${error.expectedType}`);
        console.log(`     Actual: ${error.actualType}`);
      }
      console.log('');
    }
  }

  // Show warnings
  if (result.warnings.length > 0) {
    console.log(`⚠️  ${result.warnings.length} warning(s):\n`);

    for (const warning of result.warnings) {
      console.log(`  ⚠️  ${warning.table}: ${warning.message}`);
    }
    console.log('');
  }

  // Provide remediation steps
  if (result.errors.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 How to fix:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('1. Check pending migrations:');
    console.log('   npm run migrate:status\n');
    console.log('2. Apply pending migrations:');
    console.log('   npm run migrate:up\n');
    console.log('3. If migrations are up to date, you may need:');
    console.log('   - Manual schema fix (ALTER TABLE)');
    console.log('   - New migration file');
    console.log('   - Schema rebuild (development only)\n');
    console.log('4. See: docs/migrations/troubleshooting.md\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Schema validation PASSED with warnings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Review warnings above. They may indicate:');
    console.log('- Tables that don\'t exist yet (may be expected)');
    console.log('- Permission issues accessing tables');
    console.log('- Non-critical schema differences\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  }

  db.close();

} catch (error) {
  console.error('❌ Validation failed with error:\n');
  console.error(error instanceof Error ? error.message : String(error));
  console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(1);
}
