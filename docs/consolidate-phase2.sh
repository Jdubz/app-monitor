#!/bin/bash
#
# Documentation Consolidation - Phase 2: Create Organized Structure
# Created: 2025-11-11
# Run from: /home/jdubz/Development/app-monitor
#

set -e  # Exit on error

DOCS_DIR="/home/jdubz/Development/app-monitor/docs"
cd "$DOCS_DIR" || exit 1

echo "========================================="
echo "Documentation Consolidation - Phase 2"
echo "Creating organized directory structure"
echo "========================================="
echo

echo "Phase 2.1: Create setup/ directory"
echo "-------------------------------"

mkdir -p setup
echo "✓ Created: docs/setup/"

setup_files=(
    "PRODUCTION_SETUP_QUICKSTART.md"
    "ENVIRONMENT_SETUP.md"
    "CI_CD_SETUP.md"
)

for file in "${setup_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  Moving: $file → setup/"
        mv "$file" setup/
    else
        echo "  ⚠ Not found: $file"
    fi
done
echo

echo "Phase 2.2: Create guides/ directory (for future consolidated guides)"
echo "---------------------------------------------------------------"

mkdir -p guides
echo "✓ Created: docs/guides/"
echo "  (Will contain: deployment.md, pr-workflow.md, troubleshooting.md)"
echo "  Note: These will be created in Phase 3 (consolidation)"
echo

echo "Phase 2.3: Update archive/ with dated subfolders (optional, for future)"
echo "----------------------------------------------------------------"

# This is optional - you might want to organize archive by date later
echo "  ⊘ Skipped: Archive organization (can do later if needed)"
echo

echo "Phase 2.4: Create README for each major directory"
echo "---------------------------------------------"

# Create setup/README.md
cat > setup/README.md << 'EOF'
# Setup Documentation

Complete setup guides for app-monitor.

## Guides

- [Production Setup Quickstart](./PRODUCTION_SETUP_QUICKSTART.md) - Fast production deployment
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Environment variable configuration
- [CI/CD Setup](./CI_CD_SETUP.md) - Continuous integration and deployment

## Additional Setup

- [API Authentication](../API_AUTHENTICATION.md) - API key configuration
- [Cloudflare Tunnel](../CLOUDFLARE_TUNNEL.md) - Tunnel setup for webhooks
- [GitHub Webhooks](../GITHUB_WEBHOOKS.md) - Webhook configuration
- [Google Cloud Logging](../GOOGLE_CLOUD_LOGGING_PERMISSIONS.md) - GCP permissions

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Jdubz/app-monitor.git
cd app-monitor
npm install

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# 3. Start development
npm run dev

# 4. For production, see:
# - PRODUCTION_SETUP_QUICKSTART.md
# - CI_CD_SETUP.md
```

See [Main README](../README.md) for full documentation navigation.
EOF
echo "✓ Created: setup/README.md"

# Create guides/README.md
cat > guides/README.md << 'EOF'
# User Guides

Comprehensive guides for using and maintaining app-monitor.

## Available Guides

Coming soon (Phase 3 consolidation):
- **deployment.md** - Complete deployment guide (consolidated from 6+ docs)
- **pr-workflow.md** - PR workflow and automation (consolidated from 8+ docs)
- **troubleshooting.md** - Troubleshooting guide (consolidated from fragments)

## Current References

Until consolidated guides are created, refer to:
- [Architecture](../architecture.md) - System design
- [Development](../DEVELOPMENT.md) - Development workflow
- [Setup Guides](../setup/) - All setup documentation
- [Plans](../plans/) - Active planning documents

See [Main README](../README.md) for full documentation navigation.
EOF
echo "✓ Created: guides/README.md"
echo

echo "Phase 2.5: Make consolidation scripts executable"
echo "--------------------------------------------"

chmod +x consolidate-phase1.sh consolidate-phase2.sh
echo "✓ Scripts are executable"
echo

echo "========================================="
echo "Phase 2 Complete!"
echo "========================================="
echo
echo "Summary:"
echo "  • Created: docs/setup/"
echo "  • Created: docs/guides/"
echo "  • Moved: ${#setup_files[@]} files to setup/"
echo "  • Created: README files for new directories"
echo
echo "New structure:"
echo "  docs/"
echo "    ├── setup/           (${#setup_files[@]} files)"
echo "    ├── guides/          (0 files, READMEs created)"
echo "    ├── plans/           (active plans)"
echo "    ├── dev-bots/        (unchanged)"
echo "    ├── dev-monitor/     (unchanged)"
echo "    ├── investigations/  (2+ files)"
echo "    └── archive/         (31+ files)"
echo
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. Update main README.md with new structure"
echo "  3. Run Phase 3: Create consolidated guides (manual)"
echo

# Show git status
cd /home/jdubz/Development/app-monitor
echo "Git status:"
git status docs/
