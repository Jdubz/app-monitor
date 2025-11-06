#!/bin/bash

# Setup Environment Variables for Claude Workers
# This script checks for Claude CLI credentials and sets up optional environment variables

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CREDENTIALS_FILE="$PROJECT_DIR/.claude/.credentials.json"
ENV_FILE="$SCRIPT_DIR/.env"

echo "🔑 Claude Workers Environment Setup"
echo "=================================="
echo ""

# Check for Claude CLI credentials
echo "Checking for Claude CLI credentials..."
if [ -f "$CREDENTIALS_FILE" ]; then
    echo "✅ Found Claude CLI credentials at: $CREDENTIALS_FILE"
    echo "   Credentials will be mounted into Docker containers"
else
    echo "❌ Claude CLI credentials not found at: $CREDENTIALS_FILE"
    echo ""
    echo "Please ensure you have:"
    echo "1. Installed Claude CLI: https://claude.ai/cli"
    echo "2. Authenticated with: claude auth login"
    echo "3. Credentials file exists at: $CREDENTIALS_FILE"
    echo ""
    exit 1
fi

echo ""

# Check if .env file already exists
if [ -f "$ENV_FILE" ]; then
    echo "⚠️  .env file already exists at: $ENV_FILE"
    echo "Current contents:"
    cat "$ENV_FILE"
    echo ""
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

echo "Setting up optional environment variables..."
echo ""

# Get GitHub Token (optional)
read -p "Enter your GitHub Token (optional, press Enter to skip): " GITHUB_TOKEN

# Create .env file
echo "Creating .env file..."
cat > "$ENV_FILE" << EOF
# Claude Workers Environment Variables
# Claude API Key is handled via mounted credentials file
GITHUB_TOKEN=$GITHUB_TOKEN
NODE_ENV=production
EOF

echo "✅ .env file created at: $ENV_FILE"
echo ""

# Show the contents
echo "Environment setup:"
echo "Claude CLI Credentials: ✅ Found at $CREDENTIALS_FILE"
if [ -n "$GITHUB_TOKEN" ]; then
    echo "GITHUB_TOKEN: ${GITHUB_TOKEN:0:10}..."
else
    echo "GITHUB_TOKEN: (not set)"
fi
echo ""

echo "🚀 You can now start the system with:"
echo "   make start"
echo ""
echo "📝 To check your environment:"
echo "   make env-check"
echo ""
echo "🔧 To edit the .env file later:"
echo "   nano $ENV_FILE"
