# Dev-Monitor

⚠️ **LOCAL DEVELOPMENT TOOL ONLY** - Designed for local development, not for deployment.

🔒 **SAFETY FIRST** - Comprehensive safety checks prevent multiple instances and port conflicts. See [docs/SAFETY_GUIDE.md](./docs/SAFETY_GUIDE.md).

---

## Overview

Dev-Monitor is a **local development tool** for managing and monitoring development processes (services, Docker containers, task queue) from a single web interface. Replaces manual terminal management with an intuitive real-time UI.

**Current Status:** Phase 3 Complete ✅ (Backend modularized, Frontend modernized, Testing infrastructure complete)

### Features

✅ **Process Management** - Start/stop/restart local services with state tracking  
✅ **Docker Integration** - Manage containers, stream logs, monitor stats  
✅ **Task Queue** - Execute and track development tasks with Claude Workers  
✅ **Real-time Updates** - WebSocket-based live monitoring (<100ms latency)  
✅ **Log Aggregation** - Centralized logs from all sources with search/filter  
✅ **Script Execution** - Run build/test/lint scripts with history tracking  
✅ **Port Management** - Automatic conflict detection and resolution  

---

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** (optional, for container management)

### Installation

```bash
# From dev-monitor directory
cd backend && npm install
cd ../frontend && npm install
```

### Start Development

```bash
# Backend (Terminal 1)
cd backend && npm run dev

# Frontend (Terminal 2)  
cd frontend && npm run dev
```

**Access:** http://localhost:5174 (frontend) → http://localhost:5000 (backend API)

### Or Run Both Simultaneously

```bash
# From job-finder-app-manager root
npm run monitor:dev
```

---

## Architecture

### Technology Stack

**Backend:**
- Express 4.x + Socket.IO 4.x
- TypeScript (strict mode)
- Dockerode for container management
- Vitest (257 unit + 122+ integration tests)

**Frontend:**
- React 18 + TypeScript (strict mode)
- Vite 5.x (HMR < 1s)
- CSS Modules + Design System (80+ utilities)
- Socket.IO Client

**See:** [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture

### Project Structure

```
dev-monitor/
├── backend/
│   ├── src/
│   │   ├── routes/          # 10 modular route files (76 endpoints)
│   │   ├── services/        # Core services (Process, Docker, Task, etc.)
│   │   ├── utils/           # Helpers (logger, port manager, etc.)
│   │   └── types/           # TypeScript type definitions
│   └── tests/
│       ├── integration/     # 122+ integration tests
│       └── test-utils.ts    # 15+ test utilities
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── layout/      # Header, MainLayout, TabNav, TabContent
│       │   ├── tabs/        # Local, Scripts, Environment, Health, Workers
│       │   └── common/      # StyledButton, StyledBadge, StyledCard
│       └── styles/
│           ├── theme.ts     # Design system tokens
│           └── common.module.css  # 80+ utility classes
└── docs/                    # Documentation files
```

---

## Development

### Run Tests

```bash
# Backend - all tests
cd backend && npm test

# Backend - unit tests only
cd backend && npm run test:unit

# Backend - integration tests only
cd backend && npm run test:integration

# Frontend - all tests
cd frontend && npm test

# With coverage
npm run test:coverage
```

**Current:** 257 unit tests + 122+ integration tests passing ✅

### Build

```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

### Lint

```bash
# Backend
cd backend && npm run lint

# Frontend
cd frontend && npm run lint

# Auto-fix
npm run lint:fix
```

---

## API Overview

### REST Endpoints (76 total)

**Services** (6 endpoints)
- `GET /api/services/status` - All service statuses
- `POST /api/services/:name/start` - Start service
- `POST /api/services/:name/stop` - Stop service
- `POST /api/services/:name/restart` - Restart service

**Docker** (4 endpoints)
- `GET /api/docker/containers` - List containers
- `POST /api/docker/containers/start` - Start container
- `POST /api/docker/containers/stop` - Stop container
- `GET /api/docker/containers/:id/logs` - Stream logs

**Tasks** (15 endpoints)
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

**Scripts** (6 endpoints)
- `GET /api/scripts` - List available scripts
- `POST /api/scripts/:name/execute` - Execute script
- `GET /api/scripts/:name/history` - Execution history

*+ 45 more endpoints for worker management, logs, ports, etc.*

### WebSocket Events

**Process Events:**
- `process:started` - Process started
- `process:stopped` - Process stopped
- `process:log` - Log message from process

**Container Events:**
- `container:status` - Container status changed
- `container:created` - Container created

**Task Events:**
- `task:created` - New task added
- `task:assigned` - Task assigned to worker
- `task:completed` - Task finished

**See:** [API Documentation](./API.md) (coming soon)

---

## Configuration

### Backend Environment

```bash
# backend/.env
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
DOCKER_HOST=unix:///var/run/docker.sock
```

### Frontend Environment

```bash
# frontend/.env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

---

## Documentation

### Core Documentation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Testing strategies and examples
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick lookup guide

### Development Guides
- **[frontend/COMPONENT_STYLE_GUIDE.md](./frontend/COMPONENT_STYLE_GUIDE.md)** - Styling patterns and components
- **[PHASE3_PROGRESS.md](./PHASE3_PROGRESS.md)** - Phase 3 completion details
- **[PHASE3_FINAL_SUMMARY.md](./PHASE3_FINAL_SUMMARY.md)** - Phase 3 summary

### Additional Documentation
- **[docs/SAFETY_GUIDE.md](./docs/SAFETY_GUIDE.md)** - Safety checks and best practices
- **[REFACTORING_DOCUMENTATION.md](./REFACTORING_DOCUMENTATION.md)** - Complete refactoring plan
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions (coming soon)

---

## Development Workflow

### Phase 3 Complete ✅

**3.1 Backend Simplification**
- ✅ Modularized 2,828-line API into 10 focused route modules
- ✅ Dependency injection pattern for services
- ✅ 76 endpoints organized by domain

**3.2 Frontend Modernization**
- ✅ App.tsx: 334 → 48 lines (86% reduction)
- ✅ Created 80+ reusable CSS utility classes
- ✅ Comprehensive style guide (500+ lines)
- ✅ Zero inline styles

**3.3 TypeScript Optimization**
- ✅ Strict mode enabled
- ✅ Shared types integration
- ✅ Minimal `any` usage

**3.4 Development Experience**
- ✅ Hot reload < 1s for both stacks
- ✅ Source maps enabled
- ✅ Clear error messages

**3.5 Testing Infrastructure**
- ✅ 257 unit tests
- ✅ 122+ integration tests
- ✅ Test utilities library (15+ helpers)
- ✅ Comprehensive testing guide

### Phase 4: Polish & Documentation (Current)

**4.1 UI/UX Improvements** (Planned)
- Dashboard layout polish
- Enhanced log viewer
- Keyboard shortcuts
- Status indicators

**4.2 Documentation** (In Progress)
- ✅ Architecture documentation
- 🔄 Setup documentation  
- ⏳ API documentation
- ⏳ Troubleshooting guide

**4.3 Testing Strategy** (Planned)
- E2E tests with Playwright
- CI/CD pipeline
- Performance testing

---

## Performance

- **API Response:** < 50ms average
- **Socket Latency:** < 100ms
- **Hot Reload:** < 1s (both stacks)
- **Memory Usage:** < 200MB typical
- **Build Time:** < 5s (backend), < 3s (frontend)
- **Test Execution:** ~8s (unit + integration)

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
lsof -i :5000    # Find process
kill -9 <PID>    # Kill process
```

**Docker connection failed:**
```bash
docker ps        # Verify Docker is running
```

**Tests failing:**
```bash
npm run test:unit         # Run unit tests only
npm run test:integration  # Run integration tests only
```

**See:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions (coming soon)

---

## Contributing

This is a development tool within the job-finder-app-manager repository.

### Workflow
1. Create feature branch
2. Make changes
3. Run tests: `npm test`
4. Run linter: `npm run lint`
5. Submit PR

### Code Standards
- TypeScript strict mode
- Follow style guide (frontend/COMPONENT_STYLE_GUIDE.md)
- Write tests for new features
- Document complex logic

---

## Why Node.js/Express?

Chosen for several strategic reasons:

1. **Consistency** - All scripts in job-finder-app-manager are Node.js-based
2. **TypeScript Integration** - Shared types between frontend and backend
3. **Native Process Management** - Excellent `child_process` module
4. **Single Runtime** - No separate Python virtual environment needed
5. **Existing Tooling** - Leverage existing ESLint, Prettier configuration
6. **Developer Experience** - Prioritize ease of maintenance

---

## License

MIT - Same as the job-finder-app-manager parent project

---

**For detailed information, see the documentation files listed above.**  
**For questions or issues, refer to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or the team.**
