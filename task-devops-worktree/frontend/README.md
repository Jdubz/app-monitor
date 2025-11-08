# Dev Monitor Frontend

React-based frontend for the development process monitor. Provides a comprehensive UI for managing and monitoring all job-finder development services.

## Features

### Service Panel Components (DEV-MONITOR-4)
- **ServiceGrid**: Responsive grid layout displaying all 4 services
- **ServiceCard**: Individual service panels with status, controls, and info
- **StatusBadge**: Color-coded status indicators (running/stopped/starting/stopping/error)
- **ControlButtons**: Start/Stop/Restart/Kill buttons with confirmation dialogs
- **ServiceInfo**: Display service details (PID, ports, uptime, errors)

### Logs Viewer Components (DEV-MONITOR-5)
- **LogsViewer**: Main container with real-time streaming logs
- **LogLine**: Individual log entries with timestamp, service, level, and message
- **LogFilters**: Filter by service, log level, and search text
- **LogsToolbar**: Controls for pause/resume, clear, download, and auto-scroll
- **LogLevelBadge**: Color-coded badges for ERROR/WARN/INFO/DEBUG

## Technical Implementation

### Custom Hooks
- **useServices**: Manages service state with Socket.IO real-time updates
  - Optimistic UI updates for better UX
  - Automatic polling fallback (every 10 seconds)
  - Service control actions (start/stop/restart/kill)

- **useLogStream**: Real-time log streaming via Socket.IO
  - Buffer management when paused (up to 5,000 lines)
  - Auto-scroll toggle
  - Download logs as text file
  - Pause/resume streaming

- **useLogFilter**: Client-side log filtering
  - Filter by service (multi-select)
  - Filter by log level (ERROR/WARN/INFO/DEBUG)
  - Real-time text search with highlighting
  - Efficient memoized filtering

### API Integration
- **api.ts**: Axios-based API client
  - Full CRUD operations for service management
  - Error handling with user-friendly messages
  - 30-second timeout for service operations
  - Type-safe with shared TypeScript interfaces

### Type Safety
- **service.types.ts**: ProcessInfo, ServiceConfig, ServiceControlResponse
- **log.types.ts**: LogLine, LogFilters, LogLevel, LogHistory
- Shared types ensure consistency between frontend and backend

## File Structure

```
src/
├── components/
│   ├── ControlButtons.tsx      # Service control buttons
│   ├── LogFilters.tsx          # Log filtering controls
│   ├── LogLevelBadge.tsx       # Log level badge component
│   ├── LogLine.tsx             # Individual log line
│   ├── LogsToolbar.tsx         # Logs toolbar actions
│   ├── LogsViewer.tsx          # Main logs viewer
│   ├── ServiceCard.tsx         # Service card component
│   ├── ServiceGrid.tsx         # Services grid layout
│   ├── ServiceInfo.tsx         # Service info display
│   └── StatusBadge.tsx         # Status badge component
├── hooks/
│   ├── useLogFilter.ts         # Log filtering logic
│   ├── useLogStream.ts         # Socket.IO log streaming
│   └── useServices.ts          # Service state management
├── services/
│   └── api.ts                  # API client (Axios)
├── types/
│   ├── log.types.ts            # Log type definitions
│   └── service.types.ts        # Service type definitions
├── App.tsx                     # Main application component
└── main.tsx                    # Application entry point
```

## Key Features

### Service Management
- ✅ Real-time service status updates via Socket.IO
- ✅ Color-coded status badges with pulse animation for transitional states
- ✅ Start/Stop/Restart/Kill controls with proper button states
- ✅ Kill button requires double-click confirmation
- ✅ Optimistic UI updates with error rollback
- ✅ Display service info: PID, ports, uptime
- ✅ Error messages displayed inline

### Logs Viewer
- ✅ Real-time log streaming from all services
- ✅ Filter by service (multi-select or all)
- ✅ Filter by log level (ERROR/WARN/INFO/DEBUG)
- ✅ Real-time text search with highlighting
- ✅ Pause/resume streaming with buffer
- ✅ Auto-scroll toggle
- ✅ Clear logs from view
- ✅ Download logs as .txt file
- ✅ Connection status indicator
- ✅ Handles up to 5,000 log lines efficiently
- ✅ Color-coded log levels and service names
- ✅ Monospace font for better readability
- ✅ Keyboard shortcuts (Ctrl+C, Ctrl+Space, Ctrl+↓)

### UI/UX
- Responsive layout (desktop and mobile)
- Clean, functional design (dev tool aesthetic)
- Dark theme for logs viewer (easier on eyes)
- Smooth transitions and hover effects
- Loading states for async operations
- Empty states with helpful messages
- Accessible form controls
- Toast notifications for errors

## Performance Optimizations
- Memoized log filtering
- React.memo for LogLine components
- Efficient state updates with functional setState
- Log buffer limits (5,000 lines max)
- Virtual scrolling ready (can add react-window if needed)
- Debounced search (via React state)
- Socket.IO connection reuse

## Keyboard Shortcuts
- **Ctrl+C**: Clear logs (with confirmation)
- **Ctrl+Space**: Pause/resume streaming
- **Ctrl+↓**: Jump to bottom of logs

## Dependencies
- **React 18.2**: Modern React with hooks
- **Socket.IO Client 4.6**: Real-time bidirectional communication
- **Axios 1.6**: HTTP client for REST API calls
- **TypeScript 5.3**: Type safety and better DX
- **Vite 5.0**: Fast build tool and dev server

## Development

### Run Development Server
```bash
npm run dev
```
Runs on http://localhost:5174 (connects to backend on port 5000)

### Build for Production
```bash
npm run build
```

### Lint Code
```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Type Check
```bash
npx tsc --noEmit
```

## Environment Variables
Create a `.env` file:
```
VITE_API_BASE_URL=http://localhost:5000
```

## Backend Requirements
- Backend must be running on port 5000 (configurable via env)
- Socket.IO server must be available at same URL
- API endpoints:
  - GET `/api/health`
  - GET `/api/services/status`
  - GET `/api/services/:name/status`
  - POST `/api/services/:name/start`
  - POST `/api/services/:name/stop`
  - POST `/api/services/:name/restart`
  - POST `/api/services/:name/kill`
  - GET `/api/services/:name/logs`

## Socket.IO Events

### Emitted by Client
- `subscribe_logs`: Subscribe to log stream for a service
- `unsubscribe_logs`: Unsubscribe from log stream
- `get_history`: Request log history for a service
- `get_service_status`: Request status for a service
- `get_all_statuses`: Request status for all services

### Received by Client
- `initial_statuses`: Initial service statuses on connection
- `log_line`: New log line received
- `log_history`: Log history response
- `status_change`: Service status changed
- `all_statuses`: All service statuses
- `service_status`: Single service status
- `error`: Error message

## Future Enhancements
- [ ] Virtual scrolling for 10,000+ logs (react-window)
- [ ] Log persistence to disk
- [ ] Regex search support
- [ ] Export logs as JSON/CSV
- [ ] Split view for multiple service logs
- [ ] Service grouping and tabs
- [ ] Dark mode toggle
- [ ] Service dependency visualization
- [ ] Performance metrics graphs
- [ ] Start All / Stop All buttons

## License
Internal development tool - not for public distribution
