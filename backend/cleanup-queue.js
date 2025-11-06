#!/usr/bin/env node
/**
 * Clean up task queue - keep only 3 meaningful tasks
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data/tasks/queue.db');
const db = new Database(dbPath);

console.log('🔍 Current queue status:');
const stats = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM tasks
  GROUP BY status
`).all();
console.table(stats);

// Keep only these 3 meaningful tasks
const tasksToKeep = [
  'task-1-1762449893850', // Add /health endpoint to backend API
  'task-9-1762409997003', // Check if exists
  'task-1-1762412998657'  // Test ephemeral container execution
];

console.log('\n📋 Tasks to keep:', tasksToKeep);

// First, let's see what tasks we have
const allPending = db.prepare(`
  SELECT id, title, type, created_at
  FROM tasks
  WHERE status = 'pending'
  ORDER BY created_at DESC
`).all();

console.log('\n📝 All pending tasks:');
allPending.forEach((task, i) => {
  console.log(`${i+1}. ${task.id} - ${task.title}`);
});

// Delete all pending tasks except the ones we want to keep
const deleteStmt = db.prepare(`
  UPDATE tasks
  SET status = 'cancelled'
  WHERE status = 'pending'
  AND id NOT IN (?, ?, ?)
`);

const result = deleteStmt.run(...tasksToKeep);
console.log(`\n✅ Cancelled ${result.changes} tasks`);

// Show final status
const finalStats = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM tasks
  GROUP BY status
`).all();
console.log('\n📊 Final queue status:');
console.table(finalStats);

const remainingPending = db.prepare(`
  SELECT id, title, type
  FROM tasks
  WHERE status = 'pending'
`).all();
console.log('\n✅ Remaining pending tasks:');
console.table(remainingPending);

db.close();
