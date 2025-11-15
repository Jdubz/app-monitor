# Analysis: Interactive Admin Assistant Tab Failures

**Purpose:** Investigation of production failures in interactive admin assistant tab, with regression prevention measures.

**Delete After:** 2025-12-15 (30 days) or when action items completed

---

## Problem

Interactive Admin Assistant tab failing in production with:
- Frontend log transport sending to `localhost:5000` instead of production API
- 404 errors when fetching interactive session state
- No test coverage to prevent recurrence

## Investigation

**Root Causes:**
1. `frontend/src/utils/observability/transport.ts` used wrong env var (`VITE_API_URL` vs `VITE_API_BASE_URL`)
2. Missing GET `/interactive/session` route in backend (only POST/DELETE existed)
3. Zero test coverage for these critical paths

## Findings

1. **Wrong env var**: `VITE_API_URL` → `VITE_API_BASE_URL` in transport.ts
2. **Missing route**: Added GET `/interactive/session` (returns 501 while disabled)
3. **No tests**: Created 19 regression tests (10 backend, 9 frontend)

## Action Items

- [x] Fix env var in `frontend/src/utils/observability/transport.ts` (PR #176)
- [x] Add GET route in `backend/src/routes/dev-bots/interactive.routes.ts` (PR #176)
- [x] Add regression tests for env var usage (PR #176)
- [x] Add route coverage tests for all 6 HTTP methods (PR #176)
- [ ] Deploy via CI/CD (blocked: stuck deployment lock cleared, waiting for PR merge)
- [ ] Verify fix in production (blocked: awaiting deployment)
- [ ] Delete this analysis after deployment verified

## Prevention Pattern

**For similar issues:**
1. All new API routes MUST have tests verifying route existence (not 404)
2. All env var usage MUST have source code verification tests
3. Use `it.each()` pattern for testing multiple similar endpoints

**Example:**
```typescript
const routes = [
  { method: 'get', path: '/api/endpoint' },
  { method: 'post', path: '/api/endpoint' },
];

it.each(routes)('$method $path exists', async ({ method, path }) => {
  const response = await request(app)[method](path);
  expect(response.status).not.toBe(404);
});
```
