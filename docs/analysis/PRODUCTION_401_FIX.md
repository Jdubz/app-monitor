# Production 401 Authentication Error Fix

**Date:** 2025-11-15  
**Category:** Analysis  
**Status:** ✅ RESOLVED

## Problem

All frontend API calls to production backend were failing with 401 Unauthorized errors.

## Root Cause

The frontend build was created **without** the `VITE_API_KEY` environment variable. Vite embeds environment variables at build time, so the production deployment had no API key in the bundle.

### Why This Happened

1. The production build at `/opt/app-monitor/current` (symlink to release) had no `.env` file
2. The shared `.env` exists at `/opt/app-monitor/shared/.env` but wasn't available during build
3. Vite requires `VITE_*` variables to be present at build time, not runtime
4. The deployment process didn't pass environment variables to the build command

## Investigation Steps

```bash
# 1. Checked if backend was running (it was on port 5001)
lsof -i:5001

# 2. Tested backend auth with correct key (worked)
curl -H "X-API-Key: hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE=" \
  http://localhost:5001/api/health
# Result: 200 OK

# 3. Searched for API key in frontend bundle (not found)
strings /opt/app-monitor/current/frontend/dist/assets/*.js | grep "hs8RixMMgo"
# Result: Empty

# 4. Confirmed production .env has the key
cat /opt/app-monitor/shared/.env | grep VITE_API_KEY
# Result: VITE_API_KEY=hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE=
```

## Fix Applied

Rebuilt frontend with production environment variables:

```bash
cd /home/jdubz/Development/app-monitor/frontend

# Build with production env vars
VITE_API_KEY="hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE=" \
VITE_PASSWORD="Ddght2ubQX7aYhc8wToU" \
VITE_API_BASE_URL="" \
npm run build

# Deployed to production
cp -r dist /opt/app-monitor/current/frontend/

# Verified key in bundle
strings dist/assets/ApiClient-*.js | grep "hs8RixMMgo8a"
# Result: hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE= ✅
```

## Proper Deployment Process

For future deployments, the build must include environment variables:

```bash
# Option 1: Export from shared .env before build
cd /opt/app-monitor
export $(grep VITE shared/.env | xargs)
npm run build:frontend

# Option 2: Pass explicitly to build command
cd /opt/app-monitor
VITE_API_KEY="$(grep VITE_API_KEY shared/.env | cut -d= -f2)" \
VITE_PASSWORD="$(grep VITE_PASSWORD shared/.env | cut -d= -f2)" \
VITE_API_BASE_URL="$(grep VITE_API_BASE_URL shared/.env | cut -d= -f2)" \
npm run build:frontend
```

## Prevention

Update deployment scripts to:

1. **Load shared/.env before frontend build**
   ```bash
   source /opt/app-monitor/shared/.env
   npm run build:frontend
   ```

2. **Add verification step**
   ```bash
   # After build, verify API key is present
   if ! strings frontend/dist/assets/*.js | grep -q "$VITE_API_KEY"; then
     echo "ERROR: API key not found in frontend build!"
     exit 1
   fi
   ```

3. **Document in CI/CD**
   - Update deployment documentation
   - Add to production deployment checklist

## Related Issues

- Build process doesn't automatically load shared/.env
- No verification that env vars are in build
- Silent failure - no warning that VITE_API_KEY was undefined

## Related Documentation

- [ENV_CONFIGURATION_UPDATE.md](../setup/ENV_CONFIGURATION_UPDATE.md)
- [FRONTEND_AUTH_INVESTIGATION.md](FRONTEND_AUTH_INVESTIGATION.md)
- [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT.md)

## Verification

After fix:
```bash
# Check frontend bundle has API key
strings /opt/app-monitor/current/frontend/dist/assets/ApiClient-*.js | \
  grep "hs8RixMMgo8a"
# Result: hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE= ✅

# Test API call works
curl http://localhost/api/health
# (via nginx, should work now)
```
