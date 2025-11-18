# Custom ESLint Rules

This directory contains custom ESLint rules for enforcing architectural patterns specific to this project.

## Rules

### `no-direct-db-in-routes`

**Purpose**: Prevents direct database access in route handler files.

**Why**: Enforces the layered architecture principle: `Routes -> Services -> Database`

**Violations**:
- Calling `.getDatabase()` and storing result in a variable for direct SQL queries
- Calling `.db.prepare()` directly in route files

**Allowed**:
- Passing database to service constructors (service initialization)
- Test files (rule not applied)

**Examples**:

```typescript
// ❌ BAD - Direct database access in routes
router.get('/endpoint', async (req, res) => {
  const taskQueue = devBotsManager.getTaskQueue();
  const db = taskQueue.getDatabase(); // ❌ Violation

  const results = db.prepare('SELECT * FROM tasks').all(); // ❌ Violation
  res.json(results);
});

// ✅ GOOD - Use service methods
router.get('/endpoint', async (req, res) => {
  const taskQueue = devBotsManager.getTaskQueue();

  const results = taskQueue.getAllTasks(); // ✅ Service method
  res.json(results);
});

// ✅ ALLOWED - Service initialization
const db = devBotsManager.getTaskQueue().getDatabase();
const plansService = new PlansService(db); // ✅ Passing to service constructor
```

## Status

**✅ WORKING**: The ESLint custom rule is fully functional and enforcing layered architecture.

**Solution**: For ES module projects (package.json with `"type": "module"`):
1. Create `eslint-local-rules.cjs` at project root (NOT `.js` - must be `.cjs`)
2. Export rules with CommonJS syntax (module.exports)
3. Use `.cjs` extension for all rule files in the subdirectory
4. Reference subdirectory rules with relative path: `require('./eslint-local-rules/rule-name.cjs')`

**Why .cjs is required**: When package.json has `"type": "module"`, all `.js` files are treated as ES modules. The `eslint-plugin-local-rules` package uses CommonJS `require()`, so rule files must use `.cjs` extension to be loaded as CommonJS.

## Installation

1. ✅ Custom rules are in `eslint-local-rules/` directory
2. ✅ `eslint-plugin-local-rules` is installed
3. ✅ `eslint-local-rules.cjs` is at backend root
4. ✅ `.eslintrc.cjs` is configured to use the rule

The rule automatically runs during `npm run lint` and will fail CI if violations are detected.
