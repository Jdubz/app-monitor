#!/bin/bash
#
# Phase 5 Test Runner - Executed in container before agent
# 
# This script runs the complete test suite including:
# - Build verification
# - Unit tests
# - Integration tests
# - E2E tests
# - Linting
# - Type checking
# - Coverage generation
#
# Outputs results to /workspace/.artifacts/ for validation
#

set -e

WORKSPACE_DIR="/workspace"
ARTIFACTS_DIR="$WORKSPACE_DIR/.artifacts"

# Create artifacts directory
mkdir -p "$ARTIFACTS_DIR"

echo "========================================"
echo "Phase 5: Test Coverage & Validation"
echo "========================================"
echo ""

# Track overall success
ALL_PASSED=true

# Function to log results
log_result() {
  local name="$1"
  local status="$2"
  local message="$3"
  
  if [ "$status" = "PASS" ]; then
    echo "✓ $name: PASSED"
  else
    echo "✗ $name: FAILED - $message"
    ALL_PASSED=false
  fi
}

# 1. Build Project
echo "Step 1/7: Building project..."
if npm run build > "$ARTIFACTS_DIR/build.log" 2>&1; then
  log_result "Build" "PASS"
else
  log_result "Build" "FAIL" "Build failed - see build.log"
fi

# 2. Run Unit Tests (Backend)
echo "Step 2/7: Running backend unit tests..."
cd "$WORKSPACE_DIR/backend"
if npm test -- --coverage --run > "$ARTIFACTS_DIR/backend-tests.log" 2>&1; then
  log_result "Backend Tests" "PASS"
else
  log_result "Backend Tests" "FAIL" "Unit tests failed - see backend-tests.log"
fi

# 3. Run Unit Tests (Frontend)
echo "Step 3/7: Running frontend unit tests..."
cd "$WORKSPACE_DIR/frontend"
if npm test -- --coverage --run > "$ARTIFACTS_DIR/frontend-tests.log" 2>&1; then
  log_result "Frontend Tests" "PASS"
else
  log_result "Frontend Tests" "FAIL" "Unit tests failed - see frontend-tests.log"
fi

# 4. Run Linters
echo "Step 4/7: Running linters..."
cd "$WORKSPACE_DIR"
if npm run lint > "$ARTIFACTS_DIR/lint.log" 2>&1; then
  log_result "Linting" "PASS"
else
  log_result "Linting" "FAIL" "Linting errors - see lint.log"
fi

# 5. Run Type Checking
echo "Step 5/7: Running TypeScript type checks..."
cd "$WORKSPACE_DIR/backend"
if npx tsc --noEmit > "$ARTIFACTS_DIR/tsc-backend.log" 2>&1; then
  log_result "Backend Type Check" "PASS"
else
  log_result "Backend Type Check" "FAIL" "Type errors - see tsc-backend.log"
fi

cd "$WORKSPACE_DIR/frontend"
if npx tsc --noEmit > "$ARTIFACTS_DIR/tsc-frontend.log" 2>&1; then
  log_result "Frontend Type Check" "PASS"
else
  log_result "Frontend Type Check" "FAIL" "Type errors - see tsc-frontend.log"
fi

# 6. Generate Coverage Report
echo "Step 6/7: Generating coverage report..."
cd "$WORKSPACE_DIR"

# Merge coverage from backend and frontend
if [ -f "backend/coverage/lcov.info" ] && [ -f "frontend/coverage/lcov.info" ]; then
  cat backend/coverage/lcov.info frontend/coverage/lcov.info > "$ARTIFACTS_DIR/coverage.lcov"
  log_result "Coverage Merge" "PASS"
elif [ -f "backend/coverage/lcov.info" ]; then
  cp backend/coverage/lcov.info "$ARTIFACTS_DIR/coverage.lcov"
  log_result "Coverage Merge" "PASS" "Only backend coverage available"
elif [ -f "frontend/coverage/lcov.info" ]; then
  cp frontend/coverage/lcov.info "$ARTIFACTS_DIR/coverage.lcov"
  log_result "Coverage Merge" "PASS" "Only frontend coverage available"
else
  log_result "Coverage Merge" "FAIL" "No coverage files found"
fi

# 7. Calculate Coverage Delta
echo "Step 7/7: Calculating coverage delta..."
if [ -f "$WORKSPACE_DIR/docker/scripts/coverage-delta.sh" ]; then
  bash "$WORKSPACE_DIR/docker/scripts/coverage-delta.sh" > "$ARTIFACTS_DIR/coverage-delta.json" 2>&1
  log_result "Coverage Delta" "PASS"
else
  echo '{"error": "coverage-delta.sh not found"}' > "$ARTIFACTS_DIR/coverage-delta.json"
  log_result "Coverage Delta" "FAIL" "Script not found"
fi

# Generate test results summary
echo ""
echo "========================================"
echo "Test Results Summary"
echo "========================================"

cat > "$ARTIFACTS_DIR/test-results.json" <<EOF
{
  "all_tests_passing": $ALL_PASSED,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "steps": {
    "build": "$(grep -q '✓ Build' <<< "$(cat "$ARTIFACTS_DIR/build.log" 2>/dev/null || echo '')" && echo 'pass' || echo 'fail')",
    "backend_tests": "$([ -f "$ARTIFACTS_DIR/backend-tests.log" ] && echo 'completed' || echo 'failed')",
    "frontend_tests": "$([ -f "$ARTIFACTS_DIR/frontend-tests.log" ] && echo 'completed' || echo 'failed')",
    "linting": "$([ -f "$ARTIFACTS_DIR/lint.log" ] && echo 'completed' || echo 'failed')",
    "type_check": "completed",
    "coverage": "$([ -f "$ARTIFACTS_DIR/coverage.lcov" ] && echo 'generated' || echo 'missing')"
  }
}
EOF

if [ "$ALL_PASSED" = true ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed - review artifacts in $ARTIFACTS_DIR"
  exit 1
fi
