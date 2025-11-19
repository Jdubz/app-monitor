/**
 * Migration 029 Tests
 *
 * Tests for migration 029 (add recovery_diagnosis column).
 * This serves as an example of how to test migrations.
 */

import { describe, it, expect } from 'vitest';
import {
  createDatabaseWithOldSchema,
  createFreshDatabase,
  columnExists,
  applyMigration,
  testMigrationIdempotency,
  getColumnType
} from '../utils/migrationTestHelpers.js';

describe('Migration 029: Add recovery_diagnosis column', () => {
  it('should add recovery_diagnosis column to old schema', () => {
    // Create database with schema BEFORE migration 029
    const db = createDatabaseWithOldSchema(29);

    // Verify column doesn't exist yet
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(false);

    // Apply migration 029
    const result = applyMigration(db, 29);

    // Should succeed
    expect(result.success).toBe(true);

    // Verify column was added
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);

    // Verify column type
    expect(getColumnType(db, 'task_stage_runs', 'recovery_diagnosis')).toBe('TEXT');

    db.close();
  });

  it('should be idempotent (safe to run twice)', () => {
    // Test that running migration twice doesn't cause errors
    const result = testMigrationIdempotency(29);

    // Migration should be idempotent
    expect(result.idempotent).toBe(true);

    // If not idempotent, check the error
    if (!result.idempotent) {
      console.error('Migration 029 is not idempotent:', result.error);
    }
  });

  it('should work on fresh database (all migrations)', () => {
    // Create fresh database by running ALL migrations
    const db = createFreshDatabase();

    // Column should exist (created by either migration 026 or 029)
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);

    // Verify type
    expect(getColumnType(db, 'task_stage_runs', 'recovery_diagnosis')).toBe('TEXT');

    db.close();
  });

  it('should not break existing task_stage_runs data', () => {
    // Create database with old schema
    const db = createDatabaseWithOldSchema(29);

    // Insert test data BEFORE migration
    db.prepare(`
      INSERT INTO task_stage_runs (id, task_id, phase_index, phase_name, attempt, status, created_at)
      VALUES (1, 'test-task', 1, 'Planning', 1, 'success', ${Date.now()})
    `).run();

    // Verify data exists
    const beforeCount = db.prepare('SELECT COUNT(*) as count FROM task_stage_runs').get() as { count: number };
    expect(beforeCount.count).toBe(1);

    // Apply migration
    const result = applyMigration(db, 29);
    expect(result.success).toBe(true);

    // Verify data still exists
    const afterCount = db.prepare('SELECT COUNT(*) as count FROM task_stage_runs').get() as { count: number };
    expect(afterCount.count).toBe(1);

    // Verify old data has NULL for new column
    const row = db.prepare('SELECT recovery_diagnosis FROM task_stage_runs WHERE id = 1').get() as { recovery_diagnosis: string | null };
    expect(row.recovery_diagnosis).toBeNull();

    // Verify can insert new data with recovery_diagnosis
    db.prepare(`
      INSERT INTO task_stage_runs (id, task_id, phase_index, phase_name, attempt, status, created_at, recovery_diagnosis)
      VALUES (2, 'test-task-2', 1, 'Planning', 1, 'success', ${Date.now()}, '{"error": "test"}')
    `).run();

    const newRow = db.prepare('SELECT recovery_diagnosis FROM task_stage_runs WHERE id = 2').get() as { recovery_diagnosis: string };
    expect(newRow.recovery_diagnosis).toBe('{"error": "test"}');

    db.close();
  });

  it('should handle migration on database where column already exists manually', () => {
    // Simulate scenario where column was added manually (emergency hotfix)
    const db = createDatabaseWithOldSchema(29);

    // Add column manually (simulating emergency hotfix)
    db.exec('ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT');

    // Verify column exists
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);

    // Apply migration - should handle duplicate gracefully
    const result = applyMigration(db, 29);

    // Should fail with duplicate error, which is expected and safe
    if (!result.success) {
      expect(result.error).toMatch(/duplicate column|already exists/i);
    }

    // Column should still exist either way
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);

    db.close();
  });
});

/**
 * Example: How to test other migrations
 *
 * Copy this file and modify for your migration:
 *
 * 1. Update migration number (29 → your migration number)
 * 2. Update table/column names
 * 3. Add specific tests for your migration's behavior
 * 4. Test both fresh databases and upgrades from old schema
 * 5. Test idempotency
 * 6. Test data preservation
 */
