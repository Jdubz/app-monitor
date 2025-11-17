#!/bin/bash
#
# Coverage Delta Calculator
#
# Calculates test coverage delta on changed files compared to baseline.
# Used by Phase 5 validation to ensure new code maintains ≥80% coverage.
#
# Output: JSON report with coverage metrics
#

WORKSPACE_DIR="/workspace"
ARTIFACTS_DIR="$WORKSPACE_DIR/.artifacts"
BASE_BRANCH="${BASE_BRANCH:-main}"

# Get list of changed files (excluding tests)
get_changed_files() {
  git diff --name-only "$BASE_BRANCH"...HEAD 2>/dev/null | \
    grep -E '\.(ts|tsx|js|jsx)$' | \
    grep -v -E '(__tests__|\.test\.|\.spec\.)' || echo ""
}

# Parse LCOV file and extract coverage for specific files
extract_coverage() {
  local lcov_file="$1"
  local file_list="$2"
  
  if [ ! -f "$lcov_file" ]; then
    echo "{}"
    return
  fi
  
  # Simple parsing - count lines found (LF) and lines hit (LH) per file
  awk -v files="$file_list" '
  BEGIN {
    split(files, file_array, "\n")
    for (i in file_array) {
      target_files[file_array[i]] = 1
    }
  }
  /^SF:/ {
    current_file = substr($0, 4)
    # Normalize path
    sub(/^\/workspace\//, "", current_file)
    lf = 0
    lh = 0
  }
  /^LF:/ { lf = substr($0, 4) }
  /^LH:/ { lh = substr($0, 4) }
  /^end_of_record/ {
    if (current_file in target_files && lf > 0) {
      pct = (lh / lf) * 100
      printf "%s:%.2f\n", current_file, pct
    }
  }
  ' "$lcov_file"
}

# Calculate average coverage from file:percentage pairs
calc_average() {
  local coverage_data="$1"
  
  if [ -z "$coverage_data" ]; then
    echo "100.00"
    return
  fi
  
  echo "$coverage_data" | awk -F: '
  {
    sum += $2
    count++
  }
  END {
    if (count > 0) {
      printf "%.2f", sum / count
    } else {
      print "100.00"
    }
  }
  '
}

# Main execution
cd "$WORKSPACE_DIR" || exit 1

# Get changed files
CHANGED_FILES=$(get_changed_files)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -v '^$' | wc -l)

# Current coverage
CURRENT_LCOV="$ARTIFACTS_DIR/coverage.lcov"
if [ ! -f "$CURRENT_LCOV" ]; then
  # Try alternative locations
  if [ -f "backend/coverage/lcov.info" ]; then
    CURRENT_LCOV="backend/coverage/lcov.info"
  elif [ -f "frontend/coverage/lcov.info" ]; then
    CURRENT_LCOV="frontend/coverage/lcov.info"
  fi
fi

# Extract coverage for changed files
CURRENT_COVERAGE=$(extract_coverage "$CURRENT_LCOV" "$CHANGED_FILES")
CURRENT_AVG=$(calc_average "$CURRENT_COVERAGE")

# Baseline coverage (fetch from main branch if possible)
# For now, use current as baseline if no baseline exists
BASELINE_AVG="$CURRENT_AVG"
BASELINE_LCOV="$ARTIFACTS_DIR/baseline-coverage.lcov"

if [ -f "$BASELINE_LCOV" ]; then
  BASELINE_COVERAGE=$(extract_coverage "$BASELINE_LCOV" "$CHANGED_FILES")
  BASELINE_AVG=$(calc_average "$BASELINE_COVERAGE")
fi

# Calculate delta
DELTA=$(echo "$CURRENT_AVG - $BASELINE_AVG" | bc -l)

# Check thresholds
THRESHOLD=80.0
MEETS_ABSOLUTE=$(echo "$CURRENT_AVG >= $THRESHOLD" | bc -l)
MEETS_RELATIVE=$(echo "$DELTA >= -0.1" | bc -l)
PASSING=$((MEETS_ABSOLUTE && MEETS_RELATIVE))

# Output JSON
cat <<EOF
{
  "summary": {
    "changedFiles": $CHANGED_COUNT,
    "currentCoverage": $CURRENT_AVG,
    "baselineCoverage": $BASELINE_AVG,
    "delta": $DELTA,
    "passing": $([ "$PASSING" -eq 1 ] && echo "true" || echo "false"),
    "threshold": $THRESHOLD,
    "meetsAbsoluteThreshold": $([ "$MEETS_ABSOLUTE" -eq 1 ] && echo "true" || echo "false"),
    "meetsRelativeThreshold": $([ "$MEETS_RELATIVE" -eq 1 ] && echo "true" || echo "false")
  },
  "changedFiles": [
$(echo "$CHANGED_FILES" | grep -v '^$' | sed 's/^/    "/' | sed 's/$/"/' | paste -sd ',' -)
  ],
  "fileCoverage": {
$(echo "$CURRENT_COVERAGE" | awk -F: '{ printf "    \"%s\": %.2f", $1, $2; if (NR < end) printf ","; print "" }' | head -n -1)
  }
}
EOF
