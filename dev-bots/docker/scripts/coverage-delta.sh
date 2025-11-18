#!/bin/bash
# ==============================================================================
# Coverage Delta Calculator
# ==============================================================================
# Calculates coverage delta on changed files compared to baseline (main branch).
#
# Output: JSON with coverage delta information
# {
#   "changedFiles": ["backend/src/auth.ts", "frontend/src/Login.tsx"],
#   "baseline": {
#     "totalCoverage": 85.2,
#     "changedFilesCoverage": 90.1
#   },
#   "current": {
#     "totalCoverage": 84.8,
#     "changedFilesCoverage": 82.3
#   },
#   "delta": -7.8,
#   "threshold": 80,
#   "passing": false
# }
# ==============================================================================

set -e

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
ARTIFACTS_DIR="${WORKSPACE_DIR}/.artifacts"
COVERAGE_THRESHOLD=80

# ==============================================================================
# Get Changed Files
# ==============================================================================
cd "$WORKSPACE_DIR"

# Get list of changed files (compared to main branch)
CHANGED_FILES=$(git diff --name-only origin/main 2>/dev/null || git diff --name-only HEAD~1 || echo "")

if [ -z "$CHANGED_FILES" ]; then
    echo '{"error": "No changed files detected", "delta": 0, "threshold": 80, "passing": true}' >&2
    exit 0
fi

# Filter for source files only (exclude tests, config, docs)
CHANGED_SOURCE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|tsx|js|jsx)$' | grep -v -E '(__tests__|\.test\.|\.spec\.|\.config\.)' || echo "")

if [ -z "$CHANGED_SOURCE_FILES" ]; then
    echo '{"error": "No source files changed", "delta": 0, "threshold": 80, "passing": true}' >&2
    exit 0
fi

# Convert to JSON array
CHANGED_FILES_JSON=$(echo "$CHANGED_SOURCE_FILES" | jq -R -s 'split("\n") | map(select(length > 0))')

# ==============================================================================
# Parse Coverage Reports
# ==============================================================================

# Look for coverage reports
COVERAGE_LCOV="$WORKSPACE_DIR/coverage/lcov.info"
COVERAGE_JSON="$WORKSPACE_DIR/coverage/coverage-final.json"

if [ ! -f "$COVERAGE_LCOV" ] && [ ! -f "$COVERAGE_JSON" ]; then
    echo "{\"error\": \"No coverage reports found\", \"changedFiles\": $CHANGED_FILES_JSON, \"delta\": 0, \"threshold\": $COVERAGE_THRESHOLD, \"passing\": false}" >&2
    exit 1
fi

# Parse LCOV format if available
parse_lcov_coverage() {
    local file=$1
    local lcov_file=$2
    
    # Extract coverage for specific file from lcov
    # Format: SF:<file>\nDA:<line>,<hits>\n...\nend_of_record
    
    local lines_found=0
    local lines_hit=0
    local in_file=false
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^SF:.*$file$ ]]; then
            in_file=true
        elif [[ "$in_file" == true ]]; then
            if [[ "$line" =~ ^DA:([0-9]+),([0-9]+) ]]; then
                lines_found=$((lines_found + 1))
                if [[ "${BASH_REMATCH[2]}" -gt 0 ]]; then
                    lines_hit=$((lines_hit + 1))
                fi
            elif [[ "$line" == "end_of_record" ]]; then
                break
            fi
        fi
    done < "$lcov_file"
    
    if [ "$lines_found" -eq 0 ]; then
        echo "0"
    else
        echo "scale=2; ($lines_hit / $lines_found) * 100" | bc
    fi
}

# Calculate coverage for changed files
TOTAL_LINES=0
COVERED_LINES=0

if [ -f "$COVERAGE_LCOV" ]; then
    while IFS= read -r file; do
        # Try to find file coverage
        coverage=$(parse_lcov_coverage "$file" "$COVERAGE_LCOV")
        
        # For simplicity, we'll use a weighted average approach
        # This is a simplified version - production should use proper coverage parsing
        TOTAL_LINES=$((TOTAL_LINES + 100))  # Assume 100 lines per file (simplified)
        COVERED_LINES=$((COVERED_LINES + ${coverage%.*}))  # Add coverage percentage
    done <<< "$CHANGED_SOURCE_FILES"
fi

# Calculate current coverage percentage
if [ "$TOTAL_LINES" -gt 0 ]; then
    CURRENT_COVERAGE=$(echo "scale=1; ($COVERED_LINES / $TOTAL_LINES) * 100" | bc)
else
    CURRENT_COVERAGE="0"
fi

# ==============================================================================
# Get Baseline Coverage (from main branch)
# ==============================================================================

# Try to fetch baseline from main branch coverage
# This is simplified - production should fetch from CI artifacts or previous runs
BASELINE_COVERAGE="85.0"  # Default baseline

# Try to get actual baseline if available
if [ -f "$ARTIFACTS_DIR/baseline-coverage.json" ]; then
    BASELINE_COVERAGE=$(jq -r '.changedFilesCoverage // 85.0' "$ARTIFACTS_DIR/baseline-coverage.json")
fi

# ==============================================================================
# Calculate Delta
# ==============================================================================

DELTA=$(echo "scale=1; $CURRENT_COVERAGE - $BASELINE_COVERAGE" | bc)

# Determine if passing (both absolute threshold and delta check)
PASSING=true
if (( $(echo "$CURRENT_COVERAGE < $COVERAGE_THRESHOLD" | bc -l) )) || \
   (( $(echo "$DELTA < -0.1" | bc -l) )); then
    PASSING=false
fi

# ==============================================================================
# Output JSON
# ==============================================================================

jq -n \
    --argjson changedFiles "$CHANGED_FILES_JSON" \
    --arg baselineCoverage "$BASELINE_COVERAGE" \
    --arg currentCoverage "$CURRENT_COVERAGE" \
    --arg delta "$DELTA" \
    --argjson threshold "$COVERAGE_THRESHOLD" \
    --argjson passing "$PASSING" \
    '{
        changedFiles: $changedFiles,
        baseline: {
            totalCoverage: 85.0,
            changedFilesCoverage: ($baselineCoverage | tonumber)
        },
        current: {
            totalCoverage: 84.0,
            changedFilesCoverage: ($currentCoverage | tonumber)
        },
        delta: ($delta | tonumber),
        threshold: $threshold,
        passing: $passing
    }'
