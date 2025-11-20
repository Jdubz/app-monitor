# App Monitor Frontend

React-based frontend for monitoring development bots, tracking pull requests, managing task queues, and interacting with the admin bot.

## Features

### Dev-Bots Monitoring
- **Infrastructure Overview**: Monitor dev-bot workers, containers, and agent status
- **System Configuration**: View max workers, active tasks, and system health
- **Real-time Status**: Live updates via Server-Sent Events (SSE)

### PR Tracking
- **Pull Request Monitoring**: Track PRs across monitored repositories
- **Status Indicators**: See review status, checks, and merge readiness
- **GitHub Integration**: Direct links to PRs and repositories

### Task Queue Management
- **Queue Visibility**: View all queued, active, and completed tasks
- **Task Details**: See task metadata, logs, and execution history
- **Chain Tracking**: Monitor multi-task chains and dependencies
- **Task Control**: Resume blocked tasks, view phase progress

### Plans System
- **Plan Management**: Track technical plans and implementation status
- **Progress Tracking**: Monitor completion percentages
- **Task Association**: See which tasks belong to which plans

### Admin Bot Chat
- **AI Conversation Interface**: Chat with Codex CLI (pre-configured with MCP tools)
- **Real-time Streaming**: SSE-based streaming of responses
- **MCP Integration**: Access to 24 admin tools (task queue, worker management, etc.)
- **Session Management**: Start/stop chat sessions, automatic reconnection

## Architecture

### Technology Stack
- **React 18** with TypeScript
- **Vite** for build tooling
- **TanStack Virtual** for efficient list rendering
- **Radix UI** for accessible components
- **assistant-ui** for chat interface
- **Server-Sent Events (SSE)** for real-time updates
- **Axios** for API communication

### Key Components

#### Monitor Shell (`/src/components/monitor/DevMonitorShell.tsx`)
Main tabbed interface with URL-based routing:
- `/monitor/dev-bots` - Dev-bots infrastructure
- `/monitor/prs` - PR tracking
- `/monitor/queue` - Task queue
- `/monitor/plans` - Plans system
- `/monitor/interactive` - Admin bot chat

#### Admin Bot Chat (`/src/components/admin-bot/AdminBotChat.tsx`)
Interactive chat interface with:
- Session lifecycle management (start/stop/reconnect)
- Message sending with validation (max 10KB)
- Streaming response display
- Auto-scroll and timestamp display
- Keyboard shortcuts (Enter to send, Shift+Enter for newlines)

#### Custom Hooks

**useAdminBotSSE** (`/src/hooks/useAdminBotSSE.ts`)
- Manages SSE connection for admin bot streaming
- Handles output, error, and exit events
- Auto-reconnection via EventSource API
- Manual close function for cleanup

**useSSE** (`/src/hooks/useSSE.ts`)
- Generic SSE hook for task queue and dev-bots events
- Event-based message handling
- Automatic reconnection on transient failures

**useDevBotsStore** (`/src/contexts/devBotsStore.tsx`)
- State management for dev-bots monitoring
- Worker status tracking
- Settings management

### API Integration

**ApiClient** (`/src/services/ApiClient.ts`)
- Centralized axios client with interceptors
- Automatic API key injection via headers
- Environment-based base URL configuration
- Type-safe request/response handling

**API Base URL** (`/src/utils/apiBaseUrl.ts`)
- Smart URL resolution (supports absolute, relative, origin-based)
- Environment variable support (`VITE_API_BASE_URL`)
- Default to `http://localhost:5000` in development

## Development

### Prerequisites
- Node.js 18+
- npm 9+

### Setup
```bash
npm install
```

### Environment Variables
Create a `.env` file (or use `shared/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_API_KEY=your-api-key
VITE_PASSWORD=your-password
```

### Development Server
```bash
npm run dev
```
Opens on `http://localhost:5173`

### Build
```bash
npm run build
```
Output in `dist/` directory

### Testing

**Unit Tests:**
```bash
npm test              # Safe test runner (recommended)
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode
```

**Integration Tests:**
```bash
npm run test:integration
```

**E2E Tests (Playwright):**
```bash
npm run test:e2e         # Headless
npm run test:e2e:ui      # Interactive UI
npm run test:e2e:headed  # With browser visible
```

**Coverage:**
```bash
npm run test:coverage
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── admin-bot/          # Admin bot chat
│   │   │   └── AdminBotChat.tsx
│   │   ├── common/              # Shared UI components
│   │   ├── dev-bots/            # Dev-bots monitoring
│   │   ├── layout/              # Layout components
│   │   ├── monitor/             # Monitor shell & tabs
│   │   │   ├── DevMonitorShell.tsx
│   │   │   └── tabs/            # Tab content components
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/
│   │   ├── useAdminBotSSE.ts   # Admin bot SSE hook
│   │   ├── useSSE.ts           # Generic SSE hook
│   │   └── useDevBotsStore.ts  # Dev-bots state
│   ├── services/
│   │   └── ApiClient.ts         # HTTP client
│   ├── types/                   # TypeScript types
│   ├── utils/                   # Utility functions
│   └── App.tsx                  # Root component
├── tests/                       # Unit & integration tests
├── e2e/                         # E2E tests
└── public/                      # Static assets
```

## Key Dependencies

### UI Framework
- `react` v18.2.0 - Core framework
- `react-router-dom` v7.9.4 - Routing
- `@assistant-ui/react` v0.11.41 - Chat interface

### UI Components
- `@radix-ui/*` - Accessible component primitives
- `lucide-react` - Icon library
- `@tanstack/react-virtual` - Virtual scrolling

### API & Real-time
- `axios` v1.6.5 - HTTP client
- Native EventSource API - SSE connections

### Development
- `vite` v5.0.11 - Build tool
- `typescript` v5.3.3 - Type checking
- `vitest` v1.6.1 - Unit testing
- `@playwright/test` v1.56.1 - E2E testing
- `@testing-library/react` v14.3.1 - Component testing

## API Endpoints

The frontend communicates with these backend endpoints:

### Admin Bot
- `POST /api/admin-bot/chat/start` - Start session
- `POST /api/admin-bot/chat/message` - Send message
- `GET /api/admin-bot/chat/stream` - SSE stream (output/error/exit)
- `POST /api/admin-bot/chat/stop` - Stop session
- `GET /api/admin-bot/chat/status` - Get session status

### Dev-Bots
- `GET /api/dev-bots/status` - Get system status
- `GET /api/dev-bots/settings` - Get settings
- `POST /api/dev-bots/settings` - Update settings

### Task Queue
- `GET /api/tasks` - List tasks
- `GET /api/tasks/:id` - Get task details
- `POST /api/tasks/:id/resume` - Resume blocked task

### SSE Events
- `GET /api/sse/events` - Real-time event stream
  - `task:added`, `task:assigned`, `task:started`, `task:completed`, `task:failed`
  - `system:status`, `system:health`

## Authentication

All API requests require an API key passed via:
- **Header:** `X-API-Key: <key>`
- **SSE Query Param:** `?apiKey=<key>` (EventSource doesn't support custom headers)

## Contributing

### Code Style
- Use TypeScript for type safety
- Follow existing component structure
- Write tests for new features
- Use semantic commit messages

### Testing Requirements
- Unit tests for all hooks and utilities
- Component tests for UI components
- Integration tests for API interactions
- E2E tests for critical user flows

---

**Version:** 1.0.0
**Last Updated:** 2025-11-20
