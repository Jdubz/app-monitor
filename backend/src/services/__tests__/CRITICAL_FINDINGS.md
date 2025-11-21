# Critical Test Coverage Findings

**Analysis Date:** 2025-11-20
**Analyzed By:** Claude Code
**Status:** 🚨 CRITICAL GAPS IDENTIFIED

## The Problem

**26/26 service-level tests pass ✅**
**Actual system failures: SEGFAULT + Real bugs not caught ❌**

## Root Cause Analysis

### 1. 🔴 SEGMENTATION FAULT (Current Blocker)

**What's Happening:**
```bash
$ npm run test
...
✓ src/services/__tests__/taskBlockingResume.integration.test.ts (8 passed)
Segmentation fault (core dumped)
❌ Tests failed (exit code: 139)
```

**Why It Happens:**
- better-sqlite3 native cleanup race condition
- Multiple test files create in-memory databases
- All databases try to clean up simultaneously
- C++ native resources finalized concurrently
- Segfault in native code

**Impact:**
- **Entire test suite cannot run reliably**
- CI/CD pipeline fails intermittently
- Cannot merge PRs with confidence
- Developers can't run full test suite locally

**Why Our Service-Level Tests Don't Catch This:**
- They run in isolation with `--pool=forks --poolOptions.forks.singleFork=true`
- Single database at a time
- No concurrent cleanup

**Solution Required:**
- Implement proper database cleanup in ALL test files
- Use `afterEach()` with proper error handling
- Consider switching to serial test execution globally
- Or migrate to a different SQLite library

### 2. 🔴 Artifact Extractor - Completely Mocked in Our Tests

**Real Implementation** (`artifactExtractor.service.ts:46-114`):
```typescript
async extractArtifacts(options: ArtifactExtractionOptions): Promise<PhaseArtifacts> {
  try {
    // Step 1: docker cp from container
    await this.copyFromContainer(containerId, this.artifactsPath, extractDir);

    // Step 2: Read files from temp directory
    const artifacts = await this.readArtifacts(extractDir, phaseIndex);

    return artifacts;
  } catch (error) {
    // RETURNS ERROR ARTIFACTS - validators will see this!
    return {
      stdout: `Error extracting artifacts: ${error.message}`,
      exitCode: -1,
    };
  }
}
```

**Our Tests:**
```typescript
vi.spyOn(ephemeralWorkerService['artifactExtractor'], 'extractArtifacts')
  .mockResolvedValue(mockArtifacts); // ❌ NEVER tests real extraction
```

**Failure Modes Not Tested:**
1. **Docker daemon down** - `docker cp` fails
2. **Container doesn't have .artifacts directory** - Silently returns empty artifacts
3. **Malformed phase.json** - JSON.parse fails (line 165)
4. **Missing stdout.log** - No output captured
5. **Invalid exit_code file** - parseInt returns NaN
6. **Filesystem errors** - Temp directory creation fails
7. **Race conditions** - Multiple extractions from same container

**Real Impact:**
If artifact extraction fails, validators receive:
```json
{
  "stdout": "Error extracting artifacts: Container not found",
  "exitCode": -1
}
```

This will make validators fail with "No planning artifacts found" - **but our tests mock perfect artifacts so we never see this!**

### 3. 🔴 JSON Parsing Failures Not Tested

**Real Code** (`artifactExtractor.service.ts:164-206`):
```typescript
const phaseData = JSON.parse(fs.readFileSync(phaseJsonPath, 'utf-8'));
```

**Failure Scenarios Not Tested:**
1. Agent outputs malformed JSON
2. Agent outputs partial JSON (truncated)
3. Agent outputs JSON with wrong structure
4. Agent outputs empty file
5. Agent outputs non-JSON text
6. Unicode/encoding issues
7. File corruption

**Our Tests:**
```typescript
const mockArtifacts = {
  planning: {
    obsolete: false,
    task_realigned: false,
    architecture_notes: 'Perfect planning output',
    estimated_complexity: 'medium'
  }
}; // ❌ Perfect JSON every time
```

### 4. 🔴 Phase 2 GitHub Integration Not Verified

**Code Comment** (`Phase2ImplementationValidator.ts:76-82`):
```typescript
// TODO: Verify PR exists on GitHub via API
// For now, we trust the agent's output
// Future: Add GitHub API call to verify:
//   - PR exists with given number
//   - PR is open
//   - Branch exists
//   - Commits match
```

**Our Tests:**
```typescript
const validArtifacts = {
  implementation: {
    pr_number: 456,  // ❌ We don't verify this PR exists
    pr_url: 'https://github.com/owner/repo/pull/456',
    branch_name: 'feature/auth-implementation',
    commits: 5
  }
};
```

**Real Failure:**
Agent could output `pr_number: 999999` for non-existent PR, and validation passes.

### 5. 🔴 Container Execution Not Tested

**Real Code** (`ephemeralWorker.service.ts:232-394`):

**Error Paths NOT Tested:**
```typescript
// Line 232: Max concurrent workers
throw new Error('Maximum concurrent dev-bots are already active');

// Line 368: GitHub CLI config not found
message: `GitHub CLI config not found. PR creation will fail!`

// Line 394: Missing GitHub token
throw new Error('Missing GITHUB_TOKEN and GitHub CLI config directory...');

// Line 514: Failed to create worker
action: 'failed_to_create_ephemeral_worker'

// Line 545: Git command failed
reject(new Error(`Git command failed: ${stderr}`));

// Line 616: Failed to clone repository
action: 'failed_to_clone_repository'

// Line 763: Task execution failed
action: 'task_execution_failed'
```

**Our Tests:** Mock the entire `ephemeralWorkerService.completePhaseExecution()` method - **never exercise these error paths**.

### 6. 🔴 Recovery Agent Not Tested

**What We Test:**
```typescript
it('should handle orchestrator blocking after max attempts', () => {
  const shouldBlock = orchestrator.checkAttemptLimits(task);
  expect(shouldBlock).toBe(true);
});
```

**What We DON'T Test:**
- Recovery agent diagnosis logic
- Recovery strategy selection
- Context bundle generation
- Recovery prompt generation
- Agent personality selection for recovery

**Real Issue:**
If recovery agent is broken, tasks block forever without diagnosis.

### 7. 🔴 Database Segfault is the Primary Blocker

**Evidence:**
```
✓ All tests pass individually
❌ Tests segfault when run together
```

**Why This Matters Most:**
1. **Can't run CI/CD reliably** - Random segfaults
2. **Can't validate PRs** - Tests crash before completion
3. **Can't catch regressions** - Tests don't complete
4. **False confidence** - "Tests pass" locally with isolated runs

## Test Coverage Reality Check

### What We Actually Test

✅ **Validator Logic** - Field validation works
✅ **Orchestrator Transitions** - Phase routing works
✅ **Database Operations** - Single-threaded CRUD works

### What We DON'T Test

❌ **Artifact Extraction** - Completely mocked
❌ **Container Execution** - Completely mocked
❌ **GitHub Integration** - Not verified
❌ **JSON Parsing** - Always perfect input
❌ **Error Recovery** - No error paths tested
❌ **Concurrent Operations** - Causes segfaults
❌ **Docker Daemon** - Never tested
❌ **File System Errors** - Never tested
❌ **Network Errors** - Never tested

## Real-World Failure Scenarios

### Scenario 1: Docker Daemon Down
**System:** ❌ `docker cp` fails, artifact extraction returns error
**Our Tests:** ✅ Pass (we mock artifacts)
**User Impact:** Task fails, no diagnostics

### Scenario 2: Agent Outputs Malformed JSON
**System:** ❌ JSON.parse throws, artifacts empty
**Our Tests:** ✅ Pass (we mock perfect JSON)
**User Impact:** Validator rejects, task retries indefinitely

### Scenario 3: GitHub Token Expired
**System:** ❌ Container creation fails, task blocked
**Our Tests:** ✅ Pass (we don't create containers)
**User Impact:** All tasks fail, system unusable

### Scenario 4: Multiple Tests Run Concurrently
**System:** ❌ Segmentation fault
**Our Tests:** ✅ Pass (we run serially)
**User Impact:** CI/CD fails, PRs can't merge

### Scenario 5: Fake PR Number from Agent
**System:** ✅ Validation passes (TODO not implemented)
**Our Tests:** ✅ Pass (we don't verify PRs)
**User Impact:** Task marked complete but PR doesn't exist

## Immediate Action Required

### Priority 1: Fix Segfault (BLOCKING)

**Options:**
1. **Global Serial Execution**
   ```bash
   vitest.config.ts: { pool: 'forks', poolOptions: { forks: { singleFork: true } } }
   ```

2. **Proper Database Cleanup**
   ```typescript
   afterEach(() => {
     try {
       db?.close();
     } catch (err) {
       // Already closed
     }
   });
   ```

3. **Switch SQLite Library**
   - Consider node-sqlite3 or sql.js (no native code)

### Priority 2: Add Integration Tests

**Add ONE real integration test per phase:**
```typescript
describe('Phase 1 Real Integration', () => {
  it('should extract artifacts from real container', async () => {
    // 1. Create actual Docker container
    // 2. Write phase.json inside container
    // 3. Call real artifactExtractor.extractArtifacts()
    // 4. Verify extraction works
    // 5. Cleanup container
  });
});
```

**Benefits:**
- Catches real extraction failures
- Tests Docker integration
- Tests JSON parsing with real files
- Runs in CI with Docker available

### Priority 3: Add Error Path Tests

**Test each error condition:**
```typescript
it('should handle missing artifacts directory', async () => {
  // Container without .artifacts folder
  const artifacts = await extractor.extractArtifacts({...});
  expect(artifacts.stdout).toContain('Error extracting');
  expect(artifacts.exitCode).toBe(-1);
});

it('should handle malformed JSON', async () => {
  // Container with invalid phase.json
  const artifacts = await extractor.extractArtifacts({...});
  expect(artifacts.planning).toBeUndefined();
});
```

### Priority 4: Implement GitHub Verification

**Phase 2 Validator Enhancement:**
```typescript
// Uncomment TODO at line 76
const prExists = await this.githubService.prExists(
  implementation.pr_number
);
if (!prExists) {
  errors.push(`PR #${implementation.pr_number} does not exist on GitHub`);
}
```

## Recommendations

### Short Term (This Week)

1. ✅ **Document the gaps** (this file)
2. 🔴 **Fix segfault** - Enable global serial execution
3. 🟡 **Add 1-2 real integration tests** - Prove concept works
4. 🟡 **Test artifact extraction errors** - Add failure scenarios

### Medium Term (This Month)

1. **Add GitHub API mocking** - Use MSW or nock
2. **Implement PR verification** - Complete TODO
3. **Add container error tests** - Docker daemon failures
4. **Add JSON parsing tests** - Malformed inputs

### Long Term (This Quarter)

1. **Full E2E tests** - One per phase in CI only
2. **Chaos testing** - Random failures
3. **Load testing** - Concurrent tasks
4. **Contract testing** - Agent output schemas

## Conclusion

**Current State:**
- ✅ 26 service-level tests pass
- ❌ Entire test suite segfaults
- ❌ Real integration points not tested
- ❌ Error paths not tested
- ❌ System failures not caught

**Reality:**
Our service-level tests provide **value but false confidence**. They test the "happy path" logic well, but completely miss:
1. Real extraction failures
2. Docker integration issues
3. JSON parsing errors
4. GitHub API problems
5. Concurrent execution bugs

**The segfault is the most critical issue** - until fixed, the entire test suite is unreliable.

**Next Steps:**
1. Fix segfault (Priority 1)
2. Add real integration tests (Priority 2)
3. Test error paths (Priority 3)
4. Implement GitHub verification (Priority 4)
