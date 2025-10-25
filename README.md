# App Monitor

Developer monitoring and automation tool for the job-finder-app-manager ecosystem.

## Structure

- `backend/` - Express + TypeScript backend (port 5000)
- `frontend/` - React + TypeScript frontend (port 5174)
- `dev-bots/` - Autonomous development bots (formerly claude-workers)
- `docs/` - Comprehensive documentation
- `scripts/` - Utility scripts

## Quick Start

```bash
# Install dependencies
make install

# Start both backend and frontend
make dev

# Or start individually
make dev-backend
make dev-frontend
```

## Integration with job-finder-app-manager

This tool is designed to monitor and manage services in the job-finder-app-manager monorepo.

**Log Watching:** Currently watches logs in `../job-finder-app-manager/logs/`. Future versions will use config-based log sources.

## Development

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed development guide.

## Testing

```bash
# Run all tests
make test

# Run specific workspace tests
npm test -w backend
npm test -w frontend
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Migration Guide](./docs/MIGRATION_GUIDE.md)
- [API Documentation](./docs/api/)

## License

MIT
