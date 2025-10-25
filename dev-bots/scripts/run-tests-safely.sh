#!/bin/bash

# Safe Test Runner Script - claude-workers
# Runs tests in smaller batches to prevent memory issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Running claude-workers tests safely to prevent memory issues...${NC}"

# Test file groups (smaller batches)
E2E_TESTS=(
  "tests/e2e/complete-workflow.spec.ts"
  "tests/e2e/docker-orchestration.spec.ts"
  "tests/e2e/context-isolation.spec.ts"
)

# Function to run tests with memory limits
run_test_batch() {
  local test_file="$1"
  local batch_name="$2"
  
  echo -e "${YELLOW}Running: $test_file${NC}"
  
  # Set memory limits and run test
  NODE_OPTIONS='--max-old-space-size=2048' npx playwright test "$test_file" \
    --workers=1 \
    --fully-parallel=false \
    --reporter=verbose \
    --timeout=30000
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $test_file passed${NC}"
  else
    echo -e "${RED}❌ $test_file failed${NC}"
    return 1
  fi
}

# Function to run all E2E tests
run_e2e_tests() {
  echo -e "${YELLOW}📦 Running E2E tests...${NC}"
  
  local failed_tests=0
  
  for test_file in "${E2E_TESTS[@]}"; do
    if [ -f "$test_file" ]; then
      if ! run_test_batch "$test_file" "E2E"; then
        ((failed_tests++))
      fi
    else
      echo -e "${YELLOW}⚠️  Test file not found: $test_file${NC}"
    fi
  done
  
  if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✅ All E2E tests passed${NC}"
  else
    echo -e "${RED}❌ $failed_tests E2E tests failed${NC}"
    return 1
  fi
}

# Function to run all tests
run_all_tests() {
  echo -e "${YELLOW}🚀 Running all tests in safe batches...${NC}"
  
  # Run E2E tests
  if ! run_e2e_tests; then
    echo -e "${RED}💥 Some tests failed!${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}🎉 All tests completed successfully!${NC}"
}

# Main execution
case "${1:-all}" in
  "e2e")
    run_e2e_tests
    ;;
  "all")
    run_all_tests
    ;;
  *)
    echo "Usage: $0 [e2e|all]"
    echo "  e2e  - Run only E2E tests"
    echo "  all  - Run all tests (default)"
    exit 1
    ;;
esac
