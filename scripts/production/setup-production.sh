#!/bin/bash
set -e

# ============================================================================
# PRODUCTION Environment Setup
# ============================================================================
# This script sets up the PRODUCTION deployment environment.
#
# ⚠️  WARNING: This is for PRODUCTION ONLY - NOT for development!
# ⚠️  Development should use: npm run dev (backend) and npm run dev (frontend)
# ⚠️  DO NOT run this script in development environments
# ============================================================================

echo "🏭 PRODUCTION Environment Setup"
echo "================================"
echo ""
echo "⚠️  WARNING: This will set up PRODUCTION services"
echo "⚠️  These services will run on system startup"
echo "⚠️  Development should use separate dev servers"
echo ""
read -p "Continue with PRODUCTION setup? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Setup cancelled"
    exit 1
fi

# Configuration
PRODUCTION_USER="$USER"
PRODUCTION_DIR="/opt/app-monitor"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_PORT=5050
FRONTEND_PORT=5173

echo ""
echo "📋 Configuration:"
echo "  Production directory: $PRODUCTION_DIR"
echo "  Production user: $PRODUCTION_USER"
echo "  Backend port: $BACKEND_PORT"
echo "  Frontend port: $FRONTEND_PORT"
echo ""

# Create production directory
echo "📁 Creating production directory..."
sudo mkdir -p $PRODUCTION_DIR
sudo chown $PRODUCTION_USER:$PRODUCTION_USER $PRODUCTION_DIR

# Copy systemd service files
echo "📋 Installing systemd services..."
sudo cp "$SOURCE_DIR/scripts/production/systemd/app-monitor-backend-prod.service" /etc/systemd/system/
sudo cp "$SOURCE_DIR/scripts/production/systemd/app-monitor-frontend-prod.service" /etc/systemd/system/

# Replace placeholders in service files
sudo sed -i "s|{PRODUCTION_USER}|$PRODUCTION_USER|g" /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i "s|{PRODUCTION_DIR}|$PRODUCTION_DIR|g" /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i "s|{PRODUCTION_USER}|$PRODUCTION_USER|g" /etc/systemd/system/app-monitor-frontend-prod.service
sudo sed -i "s|{PRODUCTION_DIR}|$PRODUCTION_DIR|g" /etc/systemd/system/app-monitor-frontend-prod.service

# Create production environment file
echo "🔐 Creating production environment file..."
cat > "$PRODUCTION_DIR/.env" << EOF
# PRODUCTION Environment Variables
# ⚠️  DO NOT commit this file to version control
# ⚠️  Update secrets via CI/CD pipeline or manual secure process

NODE_ENV=production
PORT=$BACKEND_PORT
FRONTEND_PORT=$FRONTEND_PORT

# Add your production secrets here
# ANTHROPIC_API_KEY=your-key-here
# DATABASE_URL=your-db-url-here
EOF

chmod 600 "$PRODUCTION_DIR/.env"

# Reload systemd
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo ""
echo "✅ Production setup complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Update secrets in $PRODUCTION_DIR/.env"
echo "  2. Set up GitHub Actions self-hosted runner (see docs/production/GITHUB_ACTIONS_SETUP.md)"
echo "  3. Deploy initial version: ./scripts/production/deploy.sh"
echo ""
echo "⚠️  IMPORTANT: Development work should use:"
echo "  - cd $SOURCE_DIR && npm run dev -w backend"
echo "  - cd $SOURCE_DIR && npm run dev -w frontend"
echo ""
