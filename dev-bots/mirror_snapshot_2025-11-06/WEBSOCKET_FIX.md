# WebSocket Connection Fix

## Problem

WebSocket connection failing with error:

```
WebSocket connection to 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket' failed
```

## Root Causes

1. **Environment variable mismatch**: Frontend `.env` had `VITE_API_URL` but code expected `VITE_API_BASE_URL`
2. **Wrong connection URL**: Frontend was connecting directly to backend (port 5000) instead of through Vite dev server proxy (port 5174)
3. **Incomplete Vite proxy config**: Missing `changeOrigin` and `rewriteWsOrigin` options for WebSocket proxy
4. **Backend Socket.IO config**: Missing explicit transport and path configuration

## Changes Made

### 1. Frontend Environment Variable (`frontend/.env`)

```diff
- VITE_API_URL=http://localhost:5000
+ VITE_API_BASE_URL=http://localhost:5174
```

### 2. Frontend Socket URLs (multiple files)

Updated default URLs to use Vite dev server proxy:

- `frontend/src/hooks/useEnhancedSocket.ts`
- `frontend/src/hooks/useServices.ts`
- `frontend/src/services/ApiClient.ts`

Changed from:

```typescript
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
```

To:

```typescript
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5174";
```

### 3. Vite Proxy Configuration (`frontend/vite.config.ts`)

```diff
  '/socket.io': {
    target: 'http://localhost:5000',
+   changeOrigin: true,
    ws: true,
+   rewriteWsOrigin: true,
  },
```

### 4. Backend Socket.IO Server (`backend/src/server.ts`)

```diff
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
+     methods: ["GET", "POST"],
    },
+   path: '/socket.io',
+   transports: ['websocket', 'polling'],
+   allowEIO3: true,
  });
```

## How It Works Now

1. Frontend connects to `http://localhost:5174` (Vite dev server)
2. Vite proxy forwards `/socket.io` requests to `http://localhost:5000` (backend)
3. Backend Socket.IO server accepts connection with proper CORS headers
4. WebSocket upgrade happens through the proxy chain

## To Apply the Fix

**Backend**: Already restarted automatically (nodemon detected changes)

**Frontend**: Restart the Vite dev server:

```bash
# In the terminal running the frontend (pts/6)
# Press Ctrl+C, then:
cd app-monitor/frontend && npm run dev

# OR from app-monitor root:
make dev-frontend
```

## Verification

After restarting the frontend:

1. Open browser console
2. Look for `[Socket] Connected` message
3. Check Network tab - WebSocket connection should show as "101 Switching Protocols"

## Testing

A test HTML file has been created at `/tmp/test-socket.html` that can be opened in a browser to verify the Socket.IO connection independently.
