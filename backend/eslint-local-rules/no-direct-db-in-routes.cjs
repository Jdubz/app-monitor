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
 * - Calling db.prepare() in route files
 * - Calling db.exec() in route files
 *
 * Allowed patterns:
 * - Service initialization (passing db to service constructors)
 * - Passing db to initialization functions
 * - Test files
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
      noDatabasePrepare: 'Routes should not execute SQL queries directly. Move database logic to service layer.',
      noDatabaseExec: 'Routes should not execute SQL statements directly. Move database logic to service layer.',
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
      // Detect db.prepare() and db.exec() patterns
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'MemberExpression' &&
          node.callee.object &&
          node.callee.object.type === 'Identifier' &&
          node.callee.property
        ) {
          const objectName = node.callee.object.name;
          const propertyName = node.callee.property.name;

          // Flag db.prepare() and db.exec() calls
          // Allow getDatabase() and getDb() for service initialization
          if (
            (objectName === 'db' || objectName === 'database') &&
            (propertyName === 'prepare' || propertyName === 'exec')
          ) {
            if (propertyName === 'prepare') {
              context.report({
                node,
                messageId: 'noDatabasePrepare',
              });
            } else if (propertyName === 'exec') {
              context.report({
                node,
                messageId: 'noDatabaseExec',
              });
            }
          }
        }
      },
    };
  },
};
