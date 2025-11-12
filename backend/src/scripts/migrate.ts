#!/usr/bin/env node
/**
 * Migration CLI Tool
 * 
 * Commands:
 *   npm run migrate status    - Show migration status
 *   npm run migrate list      - List all migrations
 *   npm run migrate up        - Apply pending migrations
 *   npm run migrate create    - Create a new migration file
 */

import Database from 'better-sqlite3';
import { MigrationManager } from '../services/migrationManager.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', 'data', 'dev-bots.db');

function printUsage() {
  console.log(`
Migration CLI Tool

Commands:
  status     - Show migration status
  list       - List all migrations
  up         - Apply pending migrations
  create <name> - Create new migration
`);
}

async function runStatus(db: Database.Database) {
  const manager = new MigrationManager(db);
  const status = manager.getStatus();

  console.log('\n📊 Migration Status\n');
  console.log(`Available:  ${status.available}`);
  console.log(`Applied:    ${status.applied}`);
  console.log(`Pending:    ${status.pending}`);
  console.log(`Failed:     ${status.failed}\n`);
  
  if (status.pending > 0) {
    console.log(`⚠️  ${status.pending} pending - run 'npm run migrate up'\n`);
  } else {
    console.log('✅ All migrations up to date\n');
  }
}

async function runList(db: Database.Database) {
  const manager = new MigrationManager(db);
  const migrations = manager.listMigrations();

  console.log('\n📋 Migrations\n');
  for (const m of migrations) {
    const icon = m.status === 'applied' ? '✅' : m.status === 'failed' ? '❌' : '⏳';
    console.log(`${icon} ${String(m.id).padStart(3, '0')}: ${m.name}`);
  }
  console.log('');
}

async function runUp(db: Database.Database) {
  const manager = new MigrationManager(db);
  console.log('\n🚀 Applying migrations...\n');
  const result = await manager.runMigrations();
  console.log(`\nApplied: ${result.applied}, Failed: ${result.failed}\n`);
  if (!result.success) process.exit(1);
}

async function main() {
  const command = process.argv[2];
  if (!command) { printUsage(); return; }
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  try {
    switch (command) {
      case 'status': await runStatus(db); break;
      case 'list': await runList(db); break;
      case 'up': await runUp(db); break;
      default: printUsage();
    }
  } finally {
    db.close();
  }
}

main().catch(console.error);
