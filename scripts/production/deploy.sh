#!/bin/bash
set -e

# ============================================================================
# PRODUCTION Deployment Script
# ============================================================================
# This script deploys the app to PRODUCTION from the main branch.
#
# ⚠️  WARNING: This deploys to PRODUCTION - NOT for development!
# ⚠️  This script should ONLY be called by CI/CD or authorized personnel
# ⚠️  Development testing should be done on dev servers
# ============================================================================

echo "🏭 PRODUCTION Deployment"
echo "======================="
echo ""
echo "⚠️  WARNING: This will deploy to PRODUCTION"
echo "⚠️  This will restart production services"
echo "⚠️  Users may experience brief downtime"
echo ""

# Configuration
PRODUCTION_DIR="/opt/app-monitor"
REPO_URL="https://github.com/Jdubz/app-monitor.git"
BRANCH="main"

# Check if running as authorized user
if [ ! -w "$PRODUCTION_DIR" ]; then
    echo "❌ ERROR: No write access to $PRODUCTION_DIR"
    echo "   Run setup-production.sh first or check permissions"
    exit 1
fi

cd "$PRODUCTION_DIR"

echo "📥 Pulling latest code from main branch..."
if [ ! -d ".git" ]; then
    echo "   Cloning repository..."
    git clone --branch $BRANCH $REPO_URL .
else
    echo "   Fetching updates..."
    git fetch origin
    git checkout $BRANCH
    git reset --hard origin/$BRANCH
fi

echo ""
echo "📦 Installing dependencies..."
npm ci --production

echo ""
echo "🏗️  Building backend..."
cd backend
npm run build

echo ""
echo "🏗️  Building frontend..."
cd ../frontend
npm run build

echo ""
echo "🔄 Restarting services..."
sudo systemctl restart app-monitor-backend-prod.service
sudo systemctl restart app-monitor-frontend-prod.service

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

echo ""
echo "🔍 Checking service status..."
sudo systemctl status app-monitor-backend-prod.service --no-pager || true
sudo systemctl status app-monitor-frontend-prod.service --no-pager || true

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 View logs:"
echo "  Backend:  sudo journalctl -u app-monitor-backend-prod.service -f"
echo "  Frontend: sudo journalctl -u app-monitor-frontend-prod.service -f"
echo ""
echo "🔧 Manage services:"
echo "  sudo systemctl stop app-monitor-backend-prod.service"
echo "  sudo systemctl start app-monitor-backend-prod.service"
echo "  sudo systemctl restart app-monitor-backend-prod.service"
echo ""
