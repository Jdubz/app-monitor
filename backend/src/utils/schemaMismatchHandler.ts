/**
 * Schema Mismatch Error Handler
 *
 * Wraps database operations to catch schema mismatch errors and provide
 * helpful error messages with actionable remediation steps.
 */

import { logger } from './logger.js';
import { MigrationManager } from '../services/migrationManager.js';
import Database from 'better-sqlite3';

export class SchemaMismatchError extends Error {
  constructor(
    message: string,
    public readonly table: string,
    public readonly column: string,
    public readonly operation: string,
    public readonly helpText?: string
  ) {
    super(message);
    this.name = 'SchemaMismatchError';
  }
}

/**
 * Detect if error is a schema mismatch
 */
export function isSchemaMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  return (
    message.includes('no such column') ||
    message.includes('has no column named') ||
    message.includes('no such table') ||
    message.includes('table') && message.includes('has no column')
  );
}

/**
 * Parse schema mismatch error to extract details
 */
export function parseSchemaMismatchError(error: Error): {
  table?: string;
  column?: string;
  operation: string;
} {
  const message = error.message;

  // Pattern: "table X has no column named Y"
  const columnMatch = message.match(/table\s+(\w+)\s+has\s+no\s+column\s+named\s+(\w+)/i);
  if (columnMatch) {
    return {
      table: columnMatch[1],
      column: columnMatch[2],
      operation: 'column_access'
    };
  }

  // Pattern: "no such column: table.column"
  const noColumnMatch = message.match(/no\s+such\s+column:\s+(\w+)\.(\w+)/i);
  if (noColumnMatch) {
    return {
      table: noColumnMatch[1],
      column: noColumnMatch[2],
      operation: 'column_access'
    };
  }

  // Pattern: "no such table: X"
  const tableMatch = message.match(/no\s+such\s+table:\s+(\w+)/i);
  if (tableMatch) {
    return {
      table: tableMatch[1],
      operation: 'table_access'
    };
  }

  return {
    operation: 'unknown'
  };
}

/**
 * Get helpful error message for schema mismatch
 */
export function getHelpfulErrorMessage(
  error: Error,
  db?: Database.Database
): string {
  const details = parseSchemaMismatchError(error);

  let helpText = '\n' + '═'.repeat(70) + '\n';
  helpText += '🚨 SCHEMA MISMATCH DETECTED\n';
  helpText += '═'.repeat(70) + '\n\n';

  if (details.column) {
    helpText += `❌ Missing Column: ${details.table}.${details.column}\n\n`;
    helpText += 'This usually means migrations are out of sync with the database.\n\n';
  } else if (details.table) {
    helpText += `❌ Missing Table: ${details.table}\n\n`;
    helpText += 'This table should be created by a migration.\n\n';
  }

  helpText += '🔧 How to fix:\n';
  helpText += '━'.repeat(70) + '\n\n';

  helpText += '1. Validate schema:\n';
  helpText += '   npm run migrate:validate\n\n';

  helpText += '2. Check pending migrations:\n';
  helpText += '   npm run migrate:status\n\n';

  helpText += '3. Apply pending migrations:\n';
  helpText += '   npm run migrate:up\n\n';

  if (db) {
    try {
      const manager = new MigrationManager(db);
      const status = manager.getStatus();

      if (status.pending > 0) {
        helpText += `⚠️  You have ${status.pending} pending migration(s)\n`;
        helpText += '   Run "npm run migrate:up" to apply them.\n\n';
      }

      if (status.failed > 0) {
        helpText += `❌ You have ${status.failed} failed migration(s)\n`;
        helpText += '   Check logs and fix failed migrations.\n\n';
      }
    } catch (_err) {
      // Ignore errors checking status
    }
  }

  helpText += '4. If migrations are current, you may need:\n';
  helpText += '   - Manual schema fix (ALTER TABLE)\n';
  helpText += '   - New migration file\n';
  helpText += '   - Schema rebuild (development only)\n\n';

  helpText += '📚 Documentation:\n';
  helpText += '   - Troubleshooting: docs/migrations/troubleshooting.md\n';
  helpText += '   - Best Practices: docs/migrations/best-practices.md\n\n';

  helpText += '═'.repeat(70) + '\n';
  helpText += `Original Error: ${error.message}\n`;
  helpText += '═'.repeat(70) + '\n';

  return helpText;
}

/**
 * Wrap a database operation with schema mismatch detection
 */
export async function withSchemaMismatchDetection<T>(
  operation: () => T | Promise<T>,
  context: {
    operationName: string;
    db?: Database.Database;
  }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && isSchemaMismatchError(error)) {
      const details = parseSchemaMismatchError(error);
      const helpText = getHelpfulErrorMessage(error, context.db);

      // Log structured error
      logger.error({
        category: 'database',
        action: 'schema_mismatch_detected',
        message: `Schema mismatch in ${context.operationName}`,
        error: error.message,
        details: {
          ...details,
          operationName: context.operationName
        }
      });

      // Log helpful message to console
      console.error(helpText);

      // Throw enhanced error
      throw new SchemaMismatchError(
        `Schema mismatch in ${context.operationName}: ${error.message}`,
        details.table || 'unknown',
        details.column || 'unknown',
        context.operationName,
        helpText
      );
    }

    throw error;
  }
}

/**
 * Synchronous version of withSchemaMismatchDetection
 */
export function withSchemaMismatchDetectionSync<T>(
  operation: () => T,
  context: {
    operationName: string;
    db?: Database.Database;
  }
): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof Error && isSchemaMismatchError(error)) {
      const details = parseSchemaMismatchError(error);
      const helpText = getHelpfulErrorMessage(error, context.db);

      // Log structured error
      logger.error({
        category: 'database',
        action: 'schema_mismatch_detected',
        message: `Schema mismatch in ${context.operationName}`,
        error: error.message,
        details: {
          ...details,
          operationName: context.operationName
        }
      });

      // Log helpful message to console
      console.error(helpText);

      // Throw enhanced error
      throw new SchemaMismatchError(
        `Schema mismatch in ${context.operationName}: ${error.message}`,
        details.table || 'unknown',
        details.column || 'unknown',
        context.operationName,
        helpText
      );
    }

    throw error;
  }
}
