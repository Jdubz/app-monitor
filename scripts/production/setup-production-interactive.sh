#!/bin/bash
set -e

# ============================================================================
# PRODUCTION Environment Setup - Interactive Version
# ============================================================================
# This script sets up the PRODUCTION deployment environment.
# It will prompt for your sudo password once at the beginning.
#
# ⚠️  WARNING: This is for PRODUCTION ONLY - NOT for development!
# ⚠️  Development should use: npm run dev (backend) and npm run dev (frontend)
# ============================================================================

echo "🏭 PRODUCTION Environment Setup (Interactive)"
echo "=============================================="
echo ""
echo "⚠️  WARNING: This will set up PRODUCTION services"
echo "⚠️  These services will run on system startup"
echo "⚠️  Development should use separate dev servers"
echo ""
echo "This script will:"
echo "  1. Create /opt/app-monitor directory"
echo "  2. Install systemd service files"
echo "  3. Clone repository to production"
echo "  4. Create production .env file"
echo "  5. Build application"
echo "  6. Start production services"
echo ""
read -p "Continue with PRODUCTION setup? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Setup cancelled"
    exit 1
fi

# Get sudo password upfront
echo ""
echo "🔐 Please enter your sudo password (required for system setup):"
sudo -v

# Keep sudo alive
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

# Configuration
# Get the actual user (not root when using sudo)
if [ -n "$SUDO_USER" ]; then
    PRODUCTION_USER="$SUDO_USER"
else
    PRODUCTION_USER="$USER"
fi
PRODUCTION_DIR="/opt/app-monitor"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_URL="https://github.com/Jdubz/app-monitor.git"
BACKEND_PORT=5050
FRONTEND_PORT=5173

echo ""
echo "📋 Configuration:"
echo "  Production directory: $PRODUCTION_DIR"
echo "  Production user: $PRODUCTION_USER"
echo "  Backend port: $BACKEND_PORT"
echo "  Frontend port: $FRONTEND_PORT"
echo "  Source directory: $SOURCE_DIR"
echo ""

# Step 1: Create production directory
echo "📁 Step 1/7: Creating production directory..."
sudo mkdir -p $PRODUCTION_DIR
sudo chown $PRODUCTION_USER:$PRODUCTION_USER $PRODUCTION_DIR
echo "   ✅ Production directory created"

# Step 2: Install systemd service files
echo ""
echo "📋 Step 2/7: Installing systemd services..."
sudo cp "$SOURCE_DIR/scripts/production/systemd/app-monitor-backend-prod.service" /etc/systemd/system/
sudo cp "$SOURCE_DIR/scripts/production/systemd/app-monitor-frontend-prod.service" /etc/systemd/system/

# Replace placeholders
sudo sed -i "s|{PRODUCTION_USER}|$PRODUCTION_USER|g" /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i "s|{PRODUCTION_DIR}|$PRODUCTION_DIR|g" /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i "s|{PRODUCTION_USER}|$PRODUCTION_USER|g" /etc/systemd/system/app-monitor-frontend-prod.service
sudo sed -i "s|{PRODUCTION_DIR}|$PRODUCTION_DIR|g" /etc/systemd/system/app-monitor-frontend-prod.service

# Reload systemd
sudo systemctl daemon-reload
echo "   ✅ Systemd services installed"

# Step 3: Clone repository
echo ""
echo "📥 Step 3/7: Cloning repository to production..."
cd $PRODUCTION_DIR
if [ ! -d ".git" ]; then
    git clone --branch main $REPO_URL .
    echo "   ✅ Repository cloned"
else
    echo "   ⚠️  Repository already exists, pulling latest..."
    git fetch origin
    git checkout main
    git reset --hard origin/main
    echo "   ✅ Repository updated"
fi

# Step 4: Create production environment file
echo ""
echo "🔐 Step 4/7: Creating production environment file..."
cat > "$PRODUCTION_DIR/.env" << 'EOF'
# PRODUCTION Environment Variables
# ⚠️  DO NOT commit this file to version control

NODE_ENV=production
PORT=5050
FRONTEND_PORT=5173

# Add your production secrets below:
# ANTHROPIC_API_KEY=your-production-key-here
# DATABASE_URL=your-production-db-url-here
# GOOGLE_CLOUD_PROJECT=your-gcp-project-id
EOF

chmod 600 "$PRODUCTION_DIR/.env"
echo "   ✅ Production .env file created"
echo "   ⚠️  IMPORTANT: Edit /opt/app-monitor/.env to add your API keys"

# Step 5: Install dependencies
echo ""
echo "📦 Step 5/7: Installing dependencies..."
# Use npm install if package-lock.json doesn't exist, otherwise use npm ci
if [ -f "package-lock.json" ]; then
    npm ci --omit=dev
else
    echo "   ⚠️  No package-lock.json found, using npm install..."
    npm install --omit=dev
fi
echo "   ✅ Dependencies installed"

# Step 6: Build application
echo ""
echo "🏗️  Step 6/7: Building application..."
echo "   Building backend..."
cd backend
npm run build
cd ..

echo "   Building frontend..."
cd frontend
npm run build
cd ..
echo "   ✅ Application built"

# Step 7: Start services
echo ""
echo "🚀 Step 7/7: Starting production services..."
sudo systemctl start app-monitor-backend-prod.service
sudo systemctl start app-monitor-frontend-prod.service

# Wait for services to start
echo "   ⏳ Waiting for services to start..."
sleep 3

# Check service status
echo ""
echo "🔍 Checking service status..."
if sudo systemctl is-active --quiet app-monitor-backend-prod.service; then
    echo "   ✅ Backend service is running"
else
    echo "   ❌ Backend service failed to start"
    echo "      View logs: sudo journalctl -u app-monitor-backend-prod.service -n 50"
fi

if sudo systemctl is-active --quiet app-monitor-frontend-prod.service; then
    echo "   ✅ Frontend service is running"
else
    echo "   ❌ Frontend service failed to start"
    echo "      View logs: sudo journalctl -u app-monitor-frontend-prod.service -n 50"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PRODUCTION SETUP COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Production Location: $PRODUCTION_DIR"
echo "🌐 Backend URL: http://localhost:$BACKEND_PORT"
echo "🌐 Frontend URL: http://localhost:$FRONTEND_PORT"
echo ""
echo "📝 IMPORTANT NEXT STEPS:"
echo ""
echo "1. 🔐 Configure production secrets:"
echo "   nano /opt/app-monitor/.env"
echo "   # Add your ANTHROPIC_API_KEY and other secrets"
echo ""
echo "2. 🔄 Restart services after adding secrets:"
echo "   sudo systemctl restart app-monitor-backend-prod.service"
echo "   sudo systemctl restart app-monitor-frontend-prod.service"
echo ""
echo "3. 🤖 Set up GitHub Actions self-hosted runner:"
echo "   See: docs/production/GITHUB_ACTIONS_SETUP.md"
echo ""
echo "4. 🔧 Enable auto-start on boot (optional):"
echo "   sudo systemctl enable app-monitor-backend-prod.service"
echo "   sudo systemctl enable app-monitor-frontend-prod.service"
echo ""
echo "📊 VIEW LOGS:"
echo "   Backend:  sudo journalctl -u app-monitor-backend-prod.service -f"
echo "   Frontend: sudo journalctl -u app-monitor-frontend-prod.service -f"
echo ""
echo "🛑 MANAGE SERVICES:"
echo "   Stop:     sudo systemctl stop app-monitor-backend-prod.service"
echo "   Start:    sudo systemctl start app-monitor-backend-prod.service"
echo "   Restart:  sudo systemctl restart app-monitor-backend-prod.service"
echo "   Status:   sudo systemctl status app-monitor-backend-prod.service"
echo ""
echo "⚠️  REMEMBER: Development work should be done in:"
echo "   $SOURCE_DIR"
echo "   Using: npm run dev -w backend && npm run dev -w frontend"
echo ""
