# Context System Tests

## CI-Safe Testing Approach

All tests in this directory are designed to run in CI environments **without requiring external dependencies**.

### Key Design Principles

#### 1. In-Memory Database
- Uses SQLite `:memory:` databases via `TestDatabase` helper
- No persistent database required
- Migration runs automatically in memory
- Perfect for CI/CD pipelines

```typescript
import { createTestDatabase } from './helpers/testDatabase';

// In your test:
const testDb = await createTestDatabase();
const connection = testDb.getConnection();
// Use connection for testing
testDb.destroy(); // Cleanup
```

#### 2. Temporary File System
- All file operations use `os.tmpdir()`
- Automatic cleanup after tests
- No pollution of project directory

```typescript
import { createTempDir, createTempFile, removeDir } from './helpers/testUtils';

// Create temp directory
const tempDir = await createTempDir();

// Create temp file
const filePath = await createTempFile('content', 'test.md', tempDir);

// Cleanup
await removeDir(tempDir);
```

#### 3. Mock Factories
- Pre-built mock data for all types
- No external dependencies
- Consistent test data

```typescript
import { mockRecipe, mockBundle, mockCacheEntry } from './helpers/testMocks';

const recipe = mockRecipe({ profile: 'custom-profile' });
const bundle = mockBundle();
const entry = mockCacheEntry();
```

### Test Structure

```
__tests__/
├── helpers/
│   ├── testDatabase.ts    # In-memory DB helper
│   ├── testMocks.ts        # Mock factories
│   └── testUtils.ts        # Test utilities
├── contextCache.test.ts
├── contextBundleGenerator.test.ts
├── contextTransforms.test.ts
├── contextRecipeValidator.test.ts
├── contextLogger.test.ts
└── integration/
    ├── contextSystem.integration.test.ts
    ├── contextDatabase.integration.test.ts
    └── contextFileSystem.integration.test.ts
```

### Running Tests

```bash
# Run all context tests
npm test -- src/services/context

# Run specific test file
npm test -- contextCache.test.ts

# Run with coverage
npm test -- --coverage src/services/context

# Run in CI
npm test -- --ci --coverage src/services/context
```

### CI Configuration

No special configuration needed! Tests are fully self-contained:
- ✅ No database setup required
- ✅ No external services needed
- ✅ No environment variables required
- ✅ Works on any OS (Linux, Mac, Windows)

### Test Utilities Reference

#### testDatabase.ts
- `createTestDatabase()` - Create in-memory database
- `TestDatabase.getConnection()` - Get DB connection
- `TestDatabase.clearData()` - Clear all data
- `TestDatabase.destroy()` - Close database

#### testMocks.ts
- `mockRecipe(overrides?)` - Create mock recipe
- `mockBundle(overrides?)` - Create mock bundle
- `mockCacheEntry(overrides?)` - Create mock cache entry
- `mockProfileContent(overrides?)` - Create mock profile content
- `mockSource(overrides?)` - Create mock source
- `mockFileContent.markdown` - Sample markdown content
- `mockFileContent.code` - Sample code content
- `mockFileContent.json` - Sample JSON content

#### testUtils.ts
- `createTempDir(prefix?)` - Create temp directory
- `createTempFile(content, filename?, dir?)` - Create temp file
- `removeDir(path)` - Remove directory recursively
- `createMockFileSystem(structure)` - Create mock file tree
- `mockGitCommand(hash)` - Mock git commands
- `waitFor(condition, timeout?)` - Wait for async condition
- `sleep(ms)` - Sleep for duration
- `spyOnConsole()` - Spy on console output
- `assertThrows(fn, message?)` - Assert function throws
- `randomString(length?)` - Generate random string
- `mockGitHash()` - Generate mock git hash

### Best Practices

1. **Always cleanup resources**
   ```typescript
   afterEach(async () => {
     testDb.destroy();
     await removeDir(tempDir);
   });
   ```

2. **Use beforeEach for isolation**
   ```typescript
   beforeEach(async () => {
     testDb = await createTestDatabase();
   });
   ```

3. **Test with real recipe files when possible**
   ```typescript
   // Use actual recipes from config/context-recipes/
   const loader = new ContextRecipeLoader();
   const result = await loader.loadRecipe('deployment');
   ```

4. **Mock only external dependencies**
   - Mock: Database, file system, git commands
   - Don't mock: Internal classes, pure functions

### Integration Tests

Integration tests use the same principles:
- In-memory database
- Temporary file system
- Real recipe files from project
- No external services

They test the complete flow from recipe loading to bundle generation to cache storage.

### Coverage Goals

- **Unit Tests**: 85%+ per module
- **Integration Tests**: 90%+ of critical paths
- **Overall**: 80%+ total coverage

### Troubleshooting

**Tests fail with "Database not found"**
- Ensure `createTestDatabase()` is called before use
- Check `testDb.destroy()` isn't called too early

**Tests fail with "File not found"**
- Use `createTempFile()` or `createMockFileSystem()`
- Check file paths are absolute
- Verify cleanup isn't removing files too early

**Tests timeout**
- Check for resource leaks (unclosed DB, intervals)
- Use `waitFor()` with appropriate timeout
- Verify async operations complete

**Tests fail in CI but pass locally**
- Check for hardcoded paths
- Verify no dependency on local database
- Ensure temp files use `os.tmpdir()`

## Summary

All tests are **100% CI-compatible** with zero external dependencies. Run anywhere, anytime! 🚀
