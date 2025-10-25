# Dev-Monitor Configuration Fix

## Issue Found

The ProcessManager was incorrectly configured with a **port conflict** and **redundant service**.

### Problem

**Configuration Before Fix:**
1. `firebase-emulators` - Run from `job-finder-FE` (ports: 4000, 9099, 8080, 5001)
2. `frontend-dev` - Vite dev server from `job-finder-FE` (port: 5173)
3. `backend-functions` - **WRONG** - Run `npm run serve` from `job-finder-BE` (port: 5001) ❌
4. `python-worker` - Docker from `job-finder-worker`

**Critical Issues:**
- ❌ **Port 5001 Conflict**: Both `firebase-emulators` and `backend-functions` tried to run Functions emulator on port 5001
- ❌ **Redundant Service**: Firebase emulators already include the Functions emulator - no need for separate service
- ❌ **Incorrect Architecture**: Violated the documented architecture in `DEV_ORCHESTRATION.md`

### Root Cause

Per `docs/DEV_ORCHESTRATION.md`, the Firebase Emulator suite (started from `job-finder-FE`) includes:
- Auth emulator (port 9099)
- Firestore emulator (port 8080)
- **Functions emulator (port 5001)** ← Already included!
- Storage emulator (port 9199)
- Hosting emulator (port 5000)
- UI (port 4000)
- Hub (port 4400)

The backend Functions are **part of the emulator suite**, not a separate service.

## Solution

**Configuration After Fix:**
1. `firebase-emulators` - Run from `job-finder-FE` - All Firebase emulators including Functions
2. `frontend-dev` - Vite dev server from `job-finder-FE` (port 5173)
3. `python-worker` - Docker from `job-finder-worker`

**Removed:** `backend-functions` service (redundant)

### Changes Made

**File:** `/home/jdubz/Development/job-finder-app-manager/dev-monitor/backend/src/config.ts`

**Before:**
```typescript
export const services: Record<string, ServiceConfig> = {
  'firebase-emulators': { ... },
  'frontend-dev': { ... },
  'backend-functions': {  // ❌ REMOVED
    command: 'npm',
    args: ['run', 'serve'],  // Would start emulators again!
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    ports: [5001],  // Conflict!
  },
  'python-worker': { ... },
}
```

**After:**
```typescript
export const services: Record<string, ServiceConfig> = {
  'firebase-emulators': {
    name: 'firebase-emulators',
    displayName: 'Firebase Emulators',
    description: 'Firebase Auth, Firestore, Functions, Storage emulators + UI',
    command: 'firebase',
    args: ['emulators:start'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    ports: [4000, 4400, 8080, 9099, 9199, 5001, 5000],  // Complete list
  },
  'frontend-dev': {
    name: 'frontend-dev',
    displayName: 'Frontend Dev Server',
    description: 'React/Vite development server',
    command: 'npm',
    args: ['run', 'dev'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    ports: [5173],
  },
  'python-worker': {
    name: 'python-worker',
    displayName: 'Python Worker',
    description: 'Job queue worker (Docker)',
    command: 'docker',
    args: ['compose', '-f', 'docker-compose.dev.yml', 'up'],
    cwd: path.join(ROOT_DIR, 'job-finder-worker'),
  },
}
```

### Local Environment Config Updated

**Before:** 4 services  
**After:** 3 services (removed backend-functions from local environment)

## Verification

### Scripts Verified

✅ **job-finder-FE/package.json**:
- `"dev": "vite"` - Runs Vite dev server (port 5173)
- Firebase config includes all emulators

✅ **job-finder-BE/package.json**:
- `"serve": "npm run build && firebase emulators:start --only functions"` 
- This is NOT needed - Functions are part of the full emulator suite from FE

✅ **job-finder-worker**:
- Has `docker-compose.dev.yml` file

### Port Allocation (Corrected)

| Service | Ports | Source |
|---------|-------|--------|
| Firebase Emulators | 4000 (UI), 4400 (Hub), 5000 (Hosting), 5001 (Functions), 8080 (Firestore), 9099 (Auth), 9199 (Storage) | job-finder-FE |
| Frontend Dev | 5173 | job-finder-FE (Vite) |
| Python Worker | (internal Docker) | job-finder-worker |
| Dev Monitor Backend | 5000 | dev-monitor/backend |
| Dev Monitor Frontend | 5174 | dev-monitor/frontend |

**Note:** Dev Monitor Backend port 5000 may conflict with Firebase Hosting emulator (also 5000). This should be monitored or the dev-monitor backend port should be changed if running simultaneously.

## Correct Startup Order

As per `DEV_ORCHESTRATION.md`:

1. **Firebase Emulators** (includes Functions) - `firebase emulators:start` from `job-finder-FE`
2. **Frontend Dev Server** - `npm run dev` from `job-finder-FE`
3. **Python Worker** - `docker compose up` from `job-finder-worker`

## Testing

✅ Backend builds successfully with corrected config  
✅ No more port 5001 conflict  
✅ Matches documented architecture  
✅ 3 services instead of 4 (correct number)  

## Impact

**User Impact:**
- ✅ Services will now start correctly without port conflicts
- ✅ Firebase Functions will work (part of emulator suite)
- ✅ Cleaner service grid UI (3 services instead of 4)
- ⚠️ "Backend Functions" service removed from UI (was redundant anyway)

**Migration:**
- Users who bookmarked/favorited "backend-functions" service will need to use "firebase-emulators" instead
- All Functions are accessible via the emulator on port 5001 (no change in actual functionality)

## Additional Potential Issue

**Dev Monitor Backend Port Conflict:**

The dev-monitor backend runs on port 5000, which conflicts with Firebase Hosting emulator (also port 5000).

**Options:**
1. Change dev-monitor backend to different port (e.g., 5002)
2. Document that dev-monitor should run independently
3. Disable Firebase Hosting emulator if not needed for development

**Recommendation:** Change dev-monitor backend to port 5002 to avoid conflicts.

