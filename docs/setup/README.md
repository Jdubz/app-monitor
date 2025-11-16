# Setup Documentation

Complete setup guides for app-monitor.

## Guides

- [Production Setup Quickstart](./PRODUCTION_SETUP_QUICKSTART.md) - Fast production deployment
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Environment variable configuration
- [CI/CD Setup](./CI_CD_SETUP.md) - Continuous integration and deployment

## Additional Setup

- [API Reference](../guides/API_REFERENCE.md) - Complete API documentation
- [GitHub Webhooks](../guides/GITHUB_WEBHOOKS.md) - Webhook configuration

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
