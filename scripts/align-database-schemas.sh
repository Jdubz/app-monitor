#!/bin/bash
set -e

echo "=================================="
echo " Database Schema Alignment"
echo "=================================="
echo ""
echo "This script aligns the database schema between:"
echo "  - DevBotsDatabase (migrations)"
echo "  - TaskQueueService (createSchema)"
echo ""
echo "Strategy:"
echo "  1. Backup existing databases"
echo "  2. Create fresh database with TaskQueueService schema"
echo "  3. Apply non-conflicting migrations (PR workflow, quality, etc.)"
echo "  4. Clean up old/deprecated database files"
echo ""

# Paths
BACKEND_DIR="${BACKEND_DIR:-$(cd "$(dirname "$0")/../backend" && pwd)}"
DATA_DIR="$BACKEND_DIR/data"
SHARED_DATA="/opt/app-monitor/shared/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Ensure data directories exist
mkdir -p "$DATA_DIR"
mkdir -p "$SHARED_DATA"

# Backup existing databases
echo "📦 Backing up existing databases..."
if [ -f "$DATA_DIR/app-monitor.db" ]; then
  cp "$DATA_DIR/app-monitor.db" "$DATA_DIR/app-monitor-backup-$TIMESTAMP.db"
  echo "  ✅ Backed up local: app-monitor-backup-$TIMESTAMP.db"
fi

if [ -f "$SHARED_DATA/dev-bots.db" ]; then
  cp "$SHARED_DATA/dev-bots.db" "$SHARED_DATA/dev-bots-backup-$TIMESTAMP.db"
  echo "  ✅ Backed up production: dev-bots-backup-$TIMESTAMP.db"
fi

# Remove old/deprecated databases
echo ""
echo "🗑️  The following deprecated database files will be removed:"
FILES_TO_DELETE=(
  "$DATA_DIR/dev-bots-tasks.db"
  "$SHARED_DATA/dev-bots-tasks.db"
  "$DATA_DIR/task-queue.db"
  "$SHARED_DATA/task-queue.db"
)
for file in "${FILES_TO_DELETE[@]}"; do
  if [ -f "$file" ]; then
    echo "  - $file"
  fi
done
echo ""
read -p "Are you sure you want to delete these files? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  for file in "${FILES_TO_DELETE[@]}"; do
    if [ -f "$file" ]; then
      rm -f "$file"
      echo "  🗑️  Deleted: $file"
    fi
  done
  echo "  ✅ Removed deprecated databases"
else
  echo "  ❌ Deletion cancelled. Deprecated databases were not removed."
fi

# Create fresh database (TaskQueueService will initialize it)
echo ""
echo "🆕 Fresh database will be created on next backend start"
echo "  Location: $DATA_DIR/app-monitor.db"
echo "  TaskQueueService.createSchema() will initialize tables"
echo ""

echo "=================================="
echo " ✅ Schema Alignment Complete"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Start backend: npm start"
echo "  2. TaskQueueService will create unified schema"
echo "  3. DevBotsDatabase migrations will add supplementary tables"
echo ""
echo "Backups available at:"
if [ -n "$(find "$DATA_DIR" -maxdepth 1 -name '*backup*' 2>/dev/null)" ]; then
  ls -lh "$DATA_DIR"/*backup* 2>/dev/null
else
  echo "  (no local backups)"
fi
if [ -n "$(find "$SHARED_DATA" -maxdepth 1 -name '*backup*' 2>/dev/null)" ]; then
  ls -lh "$SHARED_DATA"/*backup* 2>/dev/null
else
  echo "  (no production backups)"
fi
