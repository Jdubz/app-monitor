/**
 * ESLint Rule: no-direct-db-in-routes
 *
 * Prevents direct database access in route handler files.
 * Routes should use service methods instead of calling getDatabase() or executing SQL directly.
 *
 * This enforces the layered architecture principle:
 * Routes -> Services -> Database
 *
 * Violations:
 * - Calling .getDatabase() followed by storing in a variable and using it for queries
 * - Calling .db.prepare() in route files
 *
 * Exceptions:
 * - Service initialization (passing db to service constructors) - allowed
 * - Test files - rule not applied
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent direct database access in route handlers',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noDatabaseInRoutes: 'Routes should not access the database directly. Use service methods instead. Consider adding a method to TaskQueueService or the appropriate service layer.',
      noDatabasePrepare: 'Routes should not execute SQL queries directly. Move database logic to service layer.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply to route files (files in src/routes/ directory)
    if (!filename.includes('/routes/')) {
      return {};
    }

    // Skip test files
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    return {
      // Detect .getDatabase() calls that are stored in variables
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          node.init.callee &&
          node.init.callee.type === 'MemberExpression' &&
          node.init.callee.property &&
          node.init.callee.property.name === 'getDatabase'
        ) {
          // This is: const db = something.getDatabase()
          // This pattern is problematic in routes
          context.report({
            node,
            messageId: 'noDatabaseInRoutes',
          });
        }
      },

      // Detect db.prepare() pattern
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'MemberExpression' &&
          node.callee.object &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'db' &&
          node.callee.property &&
          node.callee.property.name === 'prepare'
        ) {
          context.report({
            node,
            messageId: 'noDatabasePrepare',
          });
        }
      },
    };
  },
};
