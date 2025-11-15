# API Contract Implementation - Remaining Issues

## Fixed ✅
1. ✅ Backend `buildQueueSummary` now imports from `@app-monitor/api-contracts`  
2. ✅ Removed duplicate `DevBotsQueueSummary` type from `backend/src/routes/dev-bots/shared.ts`

## Still Need to Fix 🔧

### Critical: Type Duplication in Frontend
**File:** `frontend/src/types/dev-bots.ts:47-63`

**Current:** Duplicate queue type definitions
**Should Be:** Re-export from shared contracts like other types

**Fix:**
```typescript
// Add to imports (line 23):
  DevBotsQueueSummary as ContractDevBotsQueueSummary,
  DevBotsQueueItem as ContractDevBotsQueueItem,
  DevBotsQueueBucket as ContractDevBotsQueueBucket,

// Replace lines 47-63 with:
export type DevBotsQueueSummary = ContractDevBotsQueueSummary;
export type DevBotsQueueItem = ContractDevBotsQueueItem;
export type DevBotsQueueBucket = ContractDevBotsQueueBucket;
```

### Medium: sendError undefined fields
**File:** `backend/src/utils/apiResponse.ts:43-49`

**Current:** Optional fields can be `undefined`
**Better:** Only include fields with values

**Fix:**
```typescript
const response: ApiError = {
  success: false,
  error,
  ...(options?.message && { message: options.message }),
  ...(options?.code && { code: options.code }),
  ...(options?.details && { details: options.details }),
};
```

### Low: Other Temporary Types
**File:** `backend/src/routes/dev-bots/shared.ts`

Multiple "temporary" types still using `Record<string, unknown>`:
- `ContractDevBotsTask`
- `ContractDevBotsTaskDetail`
- `DevBotsTaskHistoryEvent`
- etc.

These should gradually migrate to shared contracts.

---

**Recommendation:** Address frontend type duplication in next commit to complete the migration.
