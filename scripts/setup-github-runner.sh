#!/bin/bash
set -e

# Setup GitHub Actions Self-Hosted Runner
# This script sets up a GitHub Actions runner on the local machine

RUNNER_DIR="${HOME}/actions-runner"
RUNNER_NAME="${HOSTNAME}-runner"

echo "🏃 Setting up GitHub Actions self-hosted runner"
echo "================================================"
echo ""

# Check if already installed
if [ -d "$RUNNER_DIR" ]; then
  echo "⚠️  Runner directory already exists at $RUNNER_DIR"
  read -p "Remove and reinstall? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing existing runner..."
    cd "$RUNNER_DIR"
    if [ -f ./svc.sh ]; then
      sudo ./svc.sh stop || true
      sudo ./svc.sh uninstall || true
    fi
    cd ..
    rm -rf "$RUNNER_DIR"
  else
    echo "❌ Installation cancelled"
    exit 1
  fi
fi

# Create runner directory
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Download latest runner
echo "📥 Downloading GitHub Actions runner..."
RUNNER_VERSION="2.311.0"  # Update this to latest version
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

# Extract runner
echo "📦 Extracting runner..."
tar xzf "./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
rm "./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

echo ""
echo "✅ Runner downloaded and extracted"
echo ""
echo "📋 Next steps:"
echo "=============="
echo ""
echo "1. Go to your GitHub repository settings:"
echo "   https://github.com/Jdubz/app-monitor/settings/actions/runners/new?arch=x64&os=linux"
echo ""
echo "2. Copy the registration token from GitHub"
echo ""
echo "3. Run the configuration:"
echo "   cd $RUNNER_DIR"
echo "   ./config.sh --url https://github.com/Jdubz/app-monitor --token YOUR_TOKEN --name $RUNNER_NAME"
echo ""
echo "4. Install as a service:"
echo "   sudo ./svc.sh install"
echo "   sudo ./svc.sh start"
echo ""
echo "5. Check status:"
echo "   sudo ./svc.sh status"
echo ""
