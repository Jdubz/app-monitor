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

**⚠️ TODO**: The ESLint plugin loading is currently not working due to an issue with `eslint-plugin-local-rules` in ES module projects.

The rule has been implemented and is ready to use, but needs one of these solutions:
1. Configure `eslint-plugin-local-rules` to work with ES modules
2. Switch to using `--rulesdir` flag directly
3. Create a proper npm package for the custom rules
4. Use ESLint's flat config (eslint.config.js) instead of .eslintrc.cjs

**Temporary Workaround**: Code reviews should manually check for direct database access in route files.

## Installation (When Fixed)

1. The custom rules are already in `eslint-local-rules/` directory
2. `eslint-plugin-local-rules` is already installed
3. `.eslintrc.cjs` is already configured to use the rule

Once the plugin loading issue is resolved, the rule will automatically enforce these patterns during linting.
