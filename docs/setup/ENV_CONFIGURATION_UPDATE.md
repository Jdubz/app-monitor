# Environment Configuration Update

**Date:** 2025-11-15  
**Category:** Setup  
**Status:** ✅ COMPLETED

## Overview

Centralized environment configuration to use `shared/.env` for both development and production, ensuring consistency and proper separation between dev and production servers.

## Changes Made

### 1. Backend Configuration

**File:** `backend/src/config.ts`

```typescript
// Before: Local backend .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// After: Shared .env
const sharedEnvPath = path.join(__dirname, '../../shared/.env');
dotenv.config({ path: sharedEnvPath });
```

**Benefits:**
- Single source of truth for environment variables
- Consistent between dev (`/home/.../shared/.env`) and production (`/opt/app-monitor/shared/.env`)

### 2. Frontend Vite Proxy

**File:** `frontend/vite.config.ts`

```typescript
// Before: Hardcoded
proxy: {
  '/api': { target: 'http://localhost:5000' }  // HARDCODED!
}

// After: Configurable
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:5000';
proxy: {
  '/api': { target: backendUrl }  // CONFIGURABLE!
}
```

**Benefits:**
- E2E tests can use isolated backend ports
- No risk of accidentally proxying to production
- Environment-specific configuration

### 3. Shared Environment Structure

**Created files:**
- `shared/.env` - Development configuration (gitignored)
- `shared/.env.example` - Template for developers
- `shared/.gitignore` - Protects secrets

**Key variables:**
```bash
# API Authentication
API_KEY=dev-local-key-12345
VITE_API_KEY=dev-local-key-12345

# Backend URL for Vite proxy
VITE_BACKEND_URL=http://localhost:5000

# Runtime API base
VITE_API_BASE_URL=http://localhost:5000
```

## Migration Guide

### For New Developers

```bash
cd shared
cp .env.example .env
# Edit .env with your credentials

cd ../backend
npm run build
```

### For Existing Development Environments

The old `backend/.env` and `frontend/.env.development` are no longer used.

## Configuration Reference

### Development
```
Location: <repo-root>/shared/.env
API_KEY: dev-local-key-12345
REQUIRE_AUTH: false
PORT: 5000
VITE_BACKEND_URL: http://localhost:5000
```

### Production
```
Location: /opt/app-monitor/shared/.env
API_KEY: <production-key>
REQUIRE_AUTH: true
PORT: 5001 or 5002 (blue-green)
VITE_BACKEND_URL: (empty - same origin)
```

### E2E Tests
```
Overridden in test-e2e-auth.js:
PORT: 5555
VITE_BACKEND_URL: http://localhost:5555
API_KEY: test-e2e-key-12345
```

## Safety Features

✅ Shared `.env` gitignored (secrets protected)  
✅ E2E test uses isolated ports (5555, 5556)  
✅ E2E test refuses to run from `/opt/app-monitor`  
✅ Vite proxy configurable via environment  
✅ No hardcoded production URLs

## Testing

Verified with:
```bash
npm run test:e2e:auth
```

Results: ✅ 0 auth errors, clean test isolation

## Related Documentation

- [Environment Setup](ENVIRONMENT_SETUP.md)
- [Production Setup](PRODUCTION_SETUP_QUICKSTART.md)
