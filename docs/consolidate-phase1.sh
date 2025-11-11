#!/bin/bash
#
# Documentation Consolidation - Phase 1: Archive Obsolete Docs
# Created: 2025-11-11
# Run from: /home/jdubz/Development/app-monitor
#

set -e  # Exit on error

DOCS_DIR="/home/jdubz/Development/app-monitor/docs"
cd "$DOCS_DIR" || exit 1

echo "========================================="
echo "Documentation Consolidation - Phase 1"
echo "Archiving obsolete status documents"
echo "========================================="
echo

# Create backup just in case
BACKUP_DIR="/tmp/docs-backup-$(date +%Y%m%d-%H%M%S)"
echo "Creating backup at: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r . "$BACKUP_DIR/"
echo "✓ Backup complete"
echo

echo "Phase 1.1: Archive obsolete docs from root → archive/"
echo "-------------------------------------------"

# Archive obsolete deployment/status docs
files_to_archive=(
    "DEPLOYMENT_STATUS.md"
    "DEPLOYMENT_STATE_ANALYSIS.md"
    "DEPLOYMENT_IMPROVEMENTS_NO_REDIS.md"
    "PRODUCTION_FIX_MANUAL_STEPS.md"
    "PHASE_0_AUDIT_REPORT.md"
    "PHASE_0_IMPLEMENTATION_PROGRESS.md"
    "PR_WEBHOOK_CLEANUP_PLAN.md"
    "PR_WEBHOOK_FINAL_SUMMARY.md"
    "PR_WEBHOOK_MIGRATION_PROGRESS.md"
    "WEBHOOK_STATUS.md"
    "SHUTDOWN_STATE_PERSISTENCE.md"
)

for file in "${files_to_archive[@]}"; do
    if [ -f "$file" ]; then
        echo "  Moving: $file → archive/"
        mv "$file" archive/
    else
        echo "  ⚠ Not found: $file (already moved?)"
    fi
done
echo

echo "Phase 1.2: Archive completed plans from plans/ → archive/"
echo "----------------------------------------------"

# Archive completed plan documents
plan_files_to_archive=(
    "plans/CONTINUOUS_PR_IMPLEMENTATION_COMPLETE.md"
    "plans/BACKEND_PRODUCTION_ANALYSIS.md"
    "plans/PRODUCTION_DEPLOYMENT_ANALYSIS.md"
    "plans/PR_TRACKING_ANALYSIS.md"
    "plans/PR_TRACKING_ANALYSIS_AND_FIXES.md"
)

for file in "${plan_files_to_archive[@]}"; do
    if [ -f "$file" ]; then
        echo "  Moving: $file → archive/"
        mv "$file" archive/
    else
        echo "  ⚠ Not found: $file (already moved?)"
    fi
done
echo

echo "Phase 1.3: Move investigations from root → investigations/"
echo "-----------------------------------------------"

investigation_files=(
    "PR_TRACKING_INVESTIGATION_REPORT.md"
    "STUCK_PRS_RESOLUTION.md"
)

for file in "${investigation_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  Moving: $file → investigations/"
        mv "$file" investigations/
    else
        echo "  ⚠ Not found: $file (already moved?)"
    fi
done
echo

echo "Phase 1.4: Move active plans from root → plans/"
echo "------------------------------------"

plan_files_to_move=(
    "INTELLIGENT_AGENT_SELECTION_STRATEGY.md"
    "DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md"
)

for file in "${plan_files_to_move[@]}"; do
    if [ -f "$file" ]; then
        echo "  Moving: $file → plans/"
        mv "$file" plans/
    else
        echo "  ⚠ Not found: $file (already moved?)"
    fi
done
echo

echo "Phase 1.5: Delete superseded documentation"
echo "--------------------------------------"

# Only delete if user confirms
echo "The following files will be DELETED (superseded):"
echo "  - DOCUMENTATION_INVENTORY.md (replaced by CONSOLIDATION_AUDIT)"
echo
read -p "Delete these files? (y/N): " confirm

if [[ "$confirm" =~ ^[Yy]$ ]]; then
    if [ -f "DOCUMENTATION_INVENTORY.md" ]; then
        echo "  Deleting: DOCUMENTATION_INVENTORY.md"
        rm "DOCUMENTATION_INVENTORY.md"
    fi
    echo "✓ Files deleted"
else
    echo "⊘ Skipped deletion (user declined)"
fi
echo

echo "========================================="
echo "Phase 1 Complete!"
echo "========================================="
echo
echo "Summary:"
echo "  • Archived: ${#files_to_archive[@]} obsolete docs"
echo "  • Archived: ${#plan_files_to_archive[@]} completed plans"
echo "  • Moved: ${#investigation_files[@]} investigations"
echo "  • Moved: ${#plan_files_to_move[@]} plans"
echo "  • Backup: $BACKUP_DIR"
echo
echo "Next steps:"
echo "  1. Review the changes: git status"
echo "  2. Run Phase 2: ./consolidate-phase2.sh"
echo "  3. Update README.md navigation"
echo

# Show git status
cd /home/jdubz/Development/app-monitor
echo "Git status:"
git status docs/
