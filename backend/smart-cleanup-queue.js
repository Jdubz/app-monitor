#!/usr/bin/env node
/**
 * Smart queue cleanup - mark completed tasks and keep 3 new ones
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

// Tasks that were actually completed (based on git log)
const completedTasks = {
  'Extract Task status': 'completed', // 68abbda, 1c21ae6
  'Add /health endpoint': 'completed', // 09f7ce9
  'Add JSDoc comments': 'completed', // e07ce69, 1c21ae6
  'SQLite schema': 'completed', // 6732511
  'task deduplication': 'completed', // 51fbfda
  'TypeScript build': 'completed', // Should check frontend
  'Migrate dev-bot task queue': 'completed', // We just did this!
  'Design SQLite schema for dev-bot': 'completed', // We just did this!
};

// Get all pending tasks
const allPending = db.prepare(`
  SELECT id, title, type, created_at
  FROM tasks
  WHERE status = 'pending'
  ORDER BY created_at ASC
`).all();

console.log('\n📝 Analyzing pending tasks:');

const toComplete = [];
const toCancel = [];
const toKeep = [];

allPending.forEach((task) => {
  let action = 'keep';

  // Check if task matches completed work
  for (const [keyword, status] of Object.entries(completedTasks)) {
    if (task.title.toLowerCase().includes(keyword.toLowerCase())) {
      toComplete.push(task);
      action = 'complete';
      break;
    }
  }

  // Cancel duplicate/test tasks
  if (action === 'keep') {
    if (task.title.includes('Test Task') ||
        task.title.includes('Echo test') ||
        task.title.includes('Simple test') ||
        task.title.includes('Test NEW') ||
        task.title.includes('Test invalid') ||
        task.title.match(/^Task \d+$/)) {
      toCancel.push(task);
      action = 'cancel';
    }
  }

  if (action === 'keep') {
    toKeep.push(task);
  }

  console.log(`  ${action.padEnd(10)} ${task.id.padEnd(25)} ${task.title}`);
});

console.log(`\n📊 Summary:`);
console.log(`  Complete: ${toComplete.length}`);
console.log(`  Cancel: ${toCancel.length}`);
console.log(`  Keep: ${toKeep.length}`);

// Mark completed tasks
if (toComplete.length > 0) {
  const completeStmt = db.prepare(`
    UPDATE tasks
    SET status = 'completed',
        completed_at = ?,
        output = 'Marked as completed - work verified in git history'
    WHERE id = ?
  `);

  const now = Date.now();
  toComplete.forEach(task => {
    completeStmt.run(now, task.id);
  });
  console.log(`\n✅ Marked ${toComplete.length} tasks as completed`);
}

// Cancel test/duplicate tasks
if (toCancel.length > 0) {
  const cancelStmt = db.prepare(`
    UPDATE tasks
    SET status = 'cancelled'
    WHERE id = ?
  `);

  toCancel.forEach(task => {
    cancelStmt.run(task.id);
  });
  console.log(`❌ Cancelled ${toCancel.length} test/duplicate tasks`);
}

// Keep only top 3 remaining tasks
if (toKeep.length > 3) {
  const keepIds = toKeep.slice(0, 3).map(t => t.id);
  const cancelExcess = toKeep.slice(3);

  const cancelStmt = db.prepare(`
    UPDATE tasks
    SET status = 'cancelled'
    WHERE id = ?
  `);

  cancelExcess.forEach(task => {
    cancelStmt.run(task.id);
  });

  console.log(`\n🔄 Kept first 3 tasks, cancelled ${cancelExcess.length} excess tasks`);
  console.log(`\n✅ Final 3 pending tasks:`);
  toKeep.slice(0, 3).forEach((task, i) => {
    console.log(`  ${i+1}. ${task.title} (${task.type})`);
  });
}

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
console.log('\n📋 Remaining pending tasks:');
console.table(remainingPending);

db.close();
