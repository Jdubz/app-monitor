#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Open the database
const dbPath = path.join(__dirname, 'data', 'tasks', 'queue.db');
console.log(`Opening database: ${dbPath}`);
const db = new Database(dbPath);

// Create migrations table if it doesn't exist
console.log('Creating migrations table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Check if PR workflow migration has been applied
const migrationName = '005_pr_workflow';
const existing = db.prepare('SELECT * FROM migrations WHERE name = ?').get(migrationName);

if (existing) {
  console.log(`Migration ${migrationName} already applied at ${existing.applied_at}`);
  process.exit(0);
}

console.log('Applying PR workflow migration...');

try {
  // Begin transaction
  db.exec('BEGIN TRANSACTION');

  // Read and execute the migration SQL
  const migrationPath = path.join(__dirname, 'backend', 'migrations', '005_pr_workflow.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  // Remove comments and split by semicolon to handle multiple statements
  const statements = migrationSQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .filter(stmt => stmt.trim().length > 0)
    .map(stmt => stmt.trim() + ';');

  console.log(`Executing ${statements.length} SQL statements...`);

  for (const statement of statements) {
    console.log(`Executing: ${statement.substring(0, 100)}...`);
    try {
      db.exec(statement);
    } catch (err) {
      // Skip if column already exists
      if (err.message.includes('duplicate column name')) {
        console.log(`  Column already exists, skipping...`);
      } else {
        throw err;
      }
    }
  }

  // Record the migration
  db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);

  // Commit transaction
  db.exec('COMMIT');

  console.log('Migration applied successfully!');

  // Verify the columns were added
  const columns = db.pragma('table_info(tasks)');
  const prColumns = columns.filter(c => c.name.includes('pr_'));
  console.log(`\nPR-related columns in tasks table: ${prColumns.map(c => c.name).join(', ')}`);

} catch (error) {
  console.error('Migration failed:', error);
  db.exec('ROLLBACK');
  process.exit(1);
}

db.close();
console.log('\nDatabase migration complete!');