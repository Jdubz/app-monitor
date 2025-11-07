#!/usr/bin/env node
/**
 * Cleanup Script: Remove Unused Recovery Tables
 *
 * Drops recovery_attempts and recovery_safety_checks tables that were
 * created by the original recovery migration but are no longer used
 * by the simplified recovery system (73% code reduction).
 *
 * The simplified system only uses task metadata fields:
 * - is_repair_bot
 * - original_task_id
 * - repair_stage
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databasePaths = [
  join(__dirname, 'data', 'dev-bots.db'),
  join(__dirname, 'data', 'tasks', 'queue.db')
];

function cleanupDatabase(dbPath) {
  if (!existsSync(dbPath)) {
    console.log(`⏭️  Skipping ${dbPath} (does not exist)`);
    return;
  }

  console.log(`\n🔍 Checking ${dbPath}...`);

  const db = new Database(dbPath);

  try {
    // Check if tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('recovery_attempts', 'recovery_safety_checks')"
    ).all();

    if (tables.length === 0) {
      console.log(`   ✅ Already clean (no unused tables found)`);
      return;
    }

    console.log(`   📊 Found ${tables.length} unused table(s): ${tables.map(t => t.name).join(', ')}`);

    // Check if tables have any data
    for (const table of tables) {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
      console.log(`   📦 ${table.name}: ${count.count} rows`);
    }

    // Drop unused indexes first
    const unusedIndexes = [
      'idx_recovery_attempts_task',
      'idx_recovery_attempts_status',
      'idx_recovery_safety_attempt'
    ];

    for (const indexName of unusedIndexes) {
      try {
        db.exec(`DROP INDEX IF EXISTS ${indexName}`);
        console.log(`   🗑️  Dropped index: ${indexName}`);
      } catch (error) {
        console.log(`   ⚠️  Could not drop index ${indexName}: ${error.message}`);
      }
    }

    // Drop unused tables
    db.exec('DROP TABLE IF EXISTS recovery_safety_checks');
    console.log(`   🗑️  Dropped table: recovery_safety_checks`);

    db.exec('DROP TABLE IF EXISTS recovery_attempts');
    console.log(`   🗑️  Dropped table: recovery_attempts`);

    // Verify cleanup
    const remainingTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('recovery_attempts', 'recovery_safety_checks')"
    ).all();

    if (remainingTables.length === 0) {
      console.log(`   ✅ Cleanup complete`);
    } else {
      console.log(`   ⚠️  Warning: Some tables still exist: ${remainingTables.map(t => t.name).join(', ')}`);
    }

  } catch (error) {
    console.error(`   ❌ Error cleaning up ${dbPath}:`, error.message);
  } finally {
    db.close();
  }
}

console.log('🧹 Unused Recovery Tables Cleanup Script');
console.log('========================================\n');
console.log('This script removes recovery_attempts and recovery_safety_checks tables');
console.log('that were created but never used by the simplified recovery system.\n');

for (const dbPath of databasePaths) {
  cleanupDatabase(dbPath);
}

console.log('\n✅ Cleanup complete!\n');
