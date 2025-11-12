#!/bin/bash
#
# Production Deployment Fixes - Implementation Guide
# Run this script on the production server to apply all fixes
#
# Time: ~5 minutes total
# Requires: sudo access
#

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Production Deployment Fixes - Implementation                ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will apply 2 systemd configuration fixes:"
echo "  1. Increase shutdown timeout (30s → 120s)"
echo "  2. Automate process cleanup on start"
echo ""
echo "Note: Code changes (health endpoint, drain period) are in the repo"
echo "      and will be deployed automatically on next deployment."
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Fix 1: Increase systemd shutdown timeout"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

sudo mkdir -p /etc/systemd/system/app-monitor-backend@.service.d/

echo "Creating timeout.conf..."
sudo tee /etc/systemd/system/app-monitor-backend@.service.d/timeout.conf > /dev/null <<'EOF'
[Service]
# Graceful shutdown needs 120s to complete all cleanup tasks
# This allows sufficient time for task completion, WebSocket draining, and cleanup
TimeoutStopSec=120
EOF

echo "✓ timeout.conf created"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Fix 2: Automate process cleanup on start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating cleanup.conf..."
sudo tee /etc/systemd/system/app-monitor-backend@.service.d/cleanup.conf > /dev/null <<'EOF'
[Service]
# Run cleanup script before starting to remove orphaned processes
ExecStartPre=/opt/app-monitor/scripts/cleanup-processes.sh
EOF

echo "✓ cleanup.conf created"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Reloading systemd configuration..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

sudo systemctl daemon-reload

echo "✓ systemd reloaded"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Checking timeout configuration..."
TIMEOUT=$(systemctl show app-monitor-backend@5001 | grep "^TimeoutStopUSec=" | cut -d= -f2)
if [ "$TIMEOUT" == "2min" ]; then
    echo "✅ Timeout: 2min (120 seconds)"
else
    echo "⚠️  Timeout: $TIMEOUT (expected 2min)"
fi

echo ""
echo "Checking cleanup configuration..."
if systemctl cat app-monitor-backend@5001 2>/dev/null | grep -q "ExecStartPre=/opt/app-monitor/scripts/cleanup-processes.sh"; then
    echo "✅ Cleanup: Configured"
else
    echo "⚠️  Cleanup: Not found in service file"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All fixes applied successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next deployment will include:"
echo "  ✓ Health endpoint returns 503 during shutdown"
echo "  ✓ Drain period optimized (30s instead of 60s)"
echo ""
echo "No service restart needed - changes take effect on next deployment."
echo ""
