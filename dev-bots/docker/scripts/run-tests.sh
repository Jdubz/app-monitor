#!/bin/bash
# ==============================================================================
# Phase 5 Test Runner Script
# ==============================================================================
# This script runs all tests and quality checks for Phase 5 validation.
# It's executed BEFORE the agent runs to determine if tests need fixing.
#
# Exit Codes:
#   0 - All tests passed, coverage maintained
#   1 - Tests failed or coverage decreased
#
# Output: /workspace/.artifacts/test-results.json
# ==============================================================================

set -e

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
ARTIFACTS_DIR="${WORKSPACE_DIR}/.artifacts"
RESULTS_FILE="${ARTIFACTS_DIR}/test-results.json"
COVERAGE_DELTA_THRESHOLD="-0.1"  # Minimum acceptable coverage delta (%)

# Create artifacts directory
mkdir -p "$ARTIFACTS_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Phase 5: Test & Validation Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Initialize result tracking
ALL_TESTS_PASSING=true
LINT_PASSING=true
TYPE_CHECK_PASSING=true
BUILD_PASSING=true
COVERAGE_DELTA_ACCEPTABLE=true

TEST_SUMMARY="{}"
FAILURES="[]"

# ==============================================================================
# Step 1: Build Project
# ==============================================================================
echo "📦 Building project..."
cd "$WORKSPACE_DIR"

if npm run build > "$ARTIFACTS_DIR/build.log" 2>&1; then
    echo "  ✅ Build successful"
    BUILD_PASSING=true
else
    echo "  ❌ Build failed - see $ARTIFACTS_DIR/build.log"
    BUILD_PASSING=false
    FAILURES=$(echo "$FAILURES" | jq '. + [{"step": "build", "error": "Build failed"}]')
fi

# ==============================================================================
# Step 2: Run Linters
# ==============================================================================
echo ""
echo "🔍 Running linters..."

if npm run lint > "$ARTIFACTS_DIR/lint.log" 2>&1; then
    echo "  ✅ Linting passed"
    LINT_PASSING=true
else
    echo "  ❌ Linting failed - see $ARTIFACTS_DIR/lint.log"
    LINT_PASSING=false
    FAILURES=$(echo "$FAILURES" | jq '. + [{"step": "lint", "error": "Linting failed"}]')
fi

# ==============================================================================
# Step 3: Run Type Checker
# ==============================================================================
echo ""
echo "📝 Running type checker..."

if npx tsc --noEmit > "$ARTIFACTS_DIR/type-check.log" 2>&1; then
    echo "  ✅ Type checking passed"
    TYPE_CHECK_PASSING=true
else
    echo "  ❌ Type checking failed - see $ARTIFACTS_DIR/type-check.log"
    TYPE_CHECK_PASSING=false
    FAILURES=$(echo "$FAILURES" | jq '. + [{"step": "type-check", "error": "Type checking failed"}]')
fi

# ==============================================================================
# Step 4: Run Unit Tests
# ==============================================================================
echo ""
echo "🧪 Running unit tests..."

UNIT_TOTAL=0
UNIT_PASSED=0
UNIT_FAILED=0

if npm test -- --coverage --reporter=json > "$ARTIFACTS_DIR/unit-tests.json" 2>&1; then
    echo "  ✅ Unit tests passed"
    # Parse test results from JSON
    if [ -f "$ARTIFACTS_DIR/unit-tests.json" ]; then
        UNIT_TOTAL=$(jq -r '.numTotalTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
        UNIT_PASSED=$(jq -r '.numPassedTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
        UNIT_FAILED=$(jq -r '.numFailedTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
    fi
else
    echo "  ❌ Unit tests failed"
    ALL_TESTS_PASSING=false
    # Extract failures if available
    if [ -f "$ARTIFACTS_DIR/unit-tests.json" ]; then
        UNIT_TOTAL=$(jq -r '.numTotalTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
        UNIT_PASSED=$(jq -r '.numPassedTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
        UNIT_FAILED=$(jq -r '.numFailedTests // 0' "$ARTIFACTS_DIR/unit-tests.json")
        
        # Extract failure details
        jq -r '.testResults[]?.assertionResults[]? | select(.status == "failed") | {suite: .ancestorTitles[0], test: .title, error: .failureMessages[0]}' \
            "$ARTIFACTS_DIR/unit-tests.json" >> "$ARTIFACTS_DIR/test-failures.json" 2>/dev/null || true
    fi
fi

# ==============================================================================
# Step 5: Run Integration Tests (if available)
# ==============================================================================
echo ""
echo "🔗 Running integration tests..."

INTEGRATION_TOTAL=0
INTEGRATION_PASSED=0
INTEGRATION_FAILED=0

if npm run test:integration > "$ARTIFACTS_DIR/integration-tests.log" 2>&1; then
    echo "  ✅ Integration tests passed"
else
    # Integration tests may not exist - check if command exists
    if grep -q "test:integration" package.json 2>/dev/null; then
        echo "  ❌ Integration tests failed"
        ALL_TESTS_PASSING=false
    else
        echo "  ⚠️  No integration tests configured"
    fi
fi

# ==============================================================================
# Step 6: Run E2E Tests (if available)
# ==============================================================================
echo ""
echo "🌐 Running E2E tests..."

E2E_TOTAL=0
E2E_PASSED=0
E2E_FAILED=0

if npm run test:e2e > "$ARTIFACTS_DIR/e2e-tests.log" 2>&1; then
    echo "  ✅ E2E tests passed"
else
    # E2E tests may not exist - check if command exists
    if grep -q "test:e2e" package.json 2>/dev/null; then
        echo "  ❌ E2E tests failed"
        ALL_TESTS_PASSING=false
    else
        echo "  ⚠️  No E2E tests configured"
    fi
fi

# ==============================================================================
# Step 7: Calculate Coverage Delta
# ==============================================================================
echo ""
echo "📊 Calculating coverage delta..."

# Run coverage delta script
if [ -f "/scripts/coverage-delta.sh" ]; then
    bash /scripts/coverage-delta.sh > "$ARTIFACTS_DIR/coverage-delta.json" 2>&1
    
    if [ -f "$ARTIFACTS_DIR/coverage-delta.json" ]; then
        COVERAGE_DELTA=$(jq -r '.delta // 0' "$ARTIFACTS_DIR/coverage-delta.json")
        COVERAGE_THRESHOLD=$(jq -r '.threshold // 80' "$ARTIFACTS_DIR/coverage-delta.json")
        CURRENT_COVERAGE=$(jq -r '.current.changedFilesCoverage // 0' "$ARTIFACTS_DIR/coverage-delta.json")
        
        echo "  Coverage on changed files: ${CURRENT_COVERAGE}%"
        echo "  Coverage delta: ${COVERAGE_DELTA}%"
        echo "  Threshold: ${COVERAGE_THRESHOLD}%"
        
        # Check both absolute threshold (≥80%) and delta (≥COVERAGE_DELTA_THRESHOLD%)
        if (( $(echo "$CURRENT_COVERAGE >= $COVERAGE_THRESHOLD" | bc -l) )) && \
           (( $(echo "$COVERAGE_DELTA >= $COVERAGE_DELTA_THRESHOLD" | bc -l) )); then
            echo "  ✅ Coverage maintained"
            COVERAGE_DELTA_ACCEPTABLE=true
        else
            echo "  ❌ Coverage decreased below threshold"
            COVERAGE_DELTA_ACCEPTABLE=false
            FAILURES=$(echo "$FAILURES" | jq ". + [{\"step\": \"coverage\", \"error\": \"Coverage on changed files: ${CURRENT_COVERAGE}%, delta: ${COVERAGE_DELTA}%\"}]")
        fi
    else
        echo "  ⚠️  Coverage delta calculation failed"
        COVERAGE_DELTA_ACCEPTABLE=false
    fi
else
    echo "  ⚠️  Coverage delta script not found"
    COVERAGE_DELTA_ACCEPTABLE=true  # Don't fail if script missing
fi

# ==============================================================================
# Step 8: Generate Test Results JSON
# ==============================================================================
echo ""
echo "📝 Generating test results..."

# Aggregate all results
TEST_SUMMARY=$(jq -n \
    --argjson unitTotal "$UNIT_TOTAL" \
    --argjson unitPassed "$UNIT_PASSED" \
    --argjson unitFailed "$UNIT_FAILED" \
    --argjson integrationTotal "$INTEGRATION_TOTAL" \
    --argjson integrationPassed "$INTEGRATION_PASSED" \
    --argjson integrationFailed "$INTEGRATION_FAILED" \
    --argjson e2eTotal "$E2E_TOTAL" \
    --argjson e2ePassed "$E2E_PASSED" \
    --argjson e2eFailed "$E2E_FAILED" \
    '{
        unit: {total: $unitTotal, passed: $unitPassed, failed: $unitFailed},
        integration: {total: $integrationTotal, passed: $integrationPassed, failed: $integrationFailed},
        e2e: {total: $e2eTotal, passed: $e2ePassed, failed: $e2eFailed}
    }'
)

# Read coverage delta if available
COVERAGE_DATA="{}"
if [ -f "$ARTIFACTS_DIR/coverage-delta.json" ]; then
    COVERAGE_DATA=$(cat "$ARTIFACTS_DIR/coverage-delta.json")
fi

# Read failures if available
if [ -f "$ARTIFACTS_DIR/test-failures.json" ]; then
    FAILURES=$(jq -s '.' "$ARTIFACTS_DIR/test-failures.json")
fi

# Determine overall passing status
if [ "$ALL_TESTS_PASSING" = true ] && \
   [ "$LINT_PASSING" = true ] && \
   [ "$TYPE_CHECK_PASSING" = true ] && \
   [ "$BUILD_PASSING" = true ] && \
   [ "$COVERAGE_DELTA_ACCEPTABLE" = true ]; then
    ALL_GATES_PASSING=true
else
    ALL_GATES_PASSING=false
fi

# Create final results JSON
jq -n \
    --argjson allTestsPassing "$ALL_TESTS_PASSING" \
    --argjson lintPassing "$LINT_PASSING" \
    --argjson typeCheckPassing "$TYPE_CHECK_PASSING" \
    --argjson buildPassing "$BUILD_PASSING" \
    --argjson coverageDeltaAcceptable "$COVERAGE_DELTA_ACCEPTABLE" \
    --argjson allGatesPassing "$ALL_GATES_PASSING" \
    --argjson testSummary "$TEST_SUMMARY" \
    --argjson coverageData "$COVERAGE_DATA" \
    --argjson failures "$FAILURES" \
    '{
        all_tests_passing: $allGatesPassing,
        lint_passing: $lintPassing,
        type_check_passing: $typeCheckPassing,
        build_passing: $buildPassing,
        coverage_delta_acceptable: $coverageDeltaAcceptable,
        test_summary: $testSummary,
        coverage_delta: $coverageData.delta,
        failures: $failures,
        timestamp: now
    }' > "$RESULTS_FILE"

# ==============================================================================
# Summary
# ==============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Build:        $([ "$BUILD_PASSING" = true ] && echo '✅ PASS' || echo '❌ FAIL')"
echo "Lint:         $([ "$LINT_PASSING" = true ] && echo '✅ PASS' || echo '❌ FAIL')"
echo "Type Check:   $([ "$TYPE_CHECK_PASSING" = true ] && echo '✅ PASS' || echo '❌ FAIL')"
echo "Unit Tests:   $([ "$ALL_TESTS_PASSING" = true ] && echo '✅ PASS' || echo '❌ FAIL') (${UNIT_PASSED}/${UNIT_TOTAL})"
echo "Coverage:     $([ "$COVERAGE_DELTA_ACCEPTABLE" = true ] && echo '✅ PASS' || echo '❌ FAIL')"
echo ""
echo "Overall:      $([ "$ALL_GATES_PASSING" = true ] && echo '✅ ALL GATES PASSING' || echo '❌ VALIDATION FAILED')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""

# Exit with appropriate code
if [ "$ALL_GATES_PASSING" = true ]; then
    exit 0
else
    exit 1
fi
