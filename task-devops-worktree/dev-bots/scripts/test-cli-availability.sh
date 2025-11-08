#!/bin/bash
# ==============================================================================
# CLI Availability Test Script
# ==============================================================================
# Tests that both Claude Code and Codex CLIs are available and functional
# in the dev-bot Docker container
#
# Usage:
#   1. Inside Docker container: ./dev-bots/scripts/test-cli-availability.sh
#   2. From host via Docker:
#      docker run --rm dev-bot:latest /workspace/dev-bots/scripts/test-cli-availability.sh
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 Testing CLI Availability${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=4

# Test 1: Check if Claude CLI is installed
echo -e "${YELLOW}Test 1/4: Checking if Claude CLI is installed...${NC}"
if which claude >/dev/null 2>&1; then
    CLAUDE_PATH=$(which claude)
    echo -e "${GREEN}  ✅ Claude CLI found at: $CLAUDE_PATH${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}  ❌ Claude CLI not found${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test 2: Check if Codex CLI is installed
echo -e "${YELLOW}Test 2/4: Checking if Codex CLI is installed...${NC}"
if which codex >/dev/null 2>&1; then
    CODEX_PATH=$(which codex)
    echo -e "${GREEN}  ✅ Codex CLI found at: $CODEX_PATH${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}  ❌ Codex CLI not found${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test 3: Verify Claude CLI is executable and responds
echo -e "${YELLOW}Test 3/4: Verifying Claude CLI is functional...${NC}"
if claude --version >/dev/null 2>&1; then
    CLAUDE_VERSION=$(claude --version 2>&1 | head -1)
    echo -e "${GREEN}  ✅ Claude CLI is functional${NC}"
    echo -e "     Version: $CLAUDE_VERSION"
    ((TESTS_PASSED++))
else
    echo -e "${RED}  ❌ Claude CLI exists but is not functional${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test 4: Verify Codex CLI is executable and responds
echo -e "${YELLOW}Test 4/4: Verifying Codex CLI is functional...${NC}"
if codex --version >/dev/null 2>&1; then
    CODEX_VERSION=$(codex --version 2>&1 | head -1)
    echo -e "${GREEN}  ✅ Codex CLI is functional${NC}"
    echo -e "     Version: $CODEX_VERSION"
    ((TESTS_PASSED++))
else
    echo -e "${RED}  ❌ Codex CLI exists but is not functional${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Total Tests:  $TOTAL_TESTS"
echo -e "  ${GREEN}Passed:       $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "  ${RED}Failed:       $TESTS_FAILED${NC}"
else
    echo -e "  Failed:       $TESTS_FAILED"
fi
echo ""

# Final result
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All CLI availability tests passed!${NC}"
    echo -e "${GREEN}   Both Claude and Codex CLIs are working correctly.${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some CLI availability tests failed!${NC}"
    echo -e "${RED}   Please check the Docker image build and ensure both CLIs are installed.${NC}"
    echo ""
    exit 1
fi
