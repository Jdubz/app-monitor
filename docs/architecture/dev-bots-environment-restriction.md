# Dev-Bots Environment-Based Task Creation Restriction

## Overview

Dev-bots are prevented from spawning other dev-bots in non-production environments to prevent infinite recursion, uncontrolled task spawning, and resource exhaustion during development and testing.

## Security Design

### Threat Model

**Problem**: Dev-bots running in development, staging, or test environments could:
1. Create infinite task chains (dev-bot creates dev-bot creates dev-bot...)
2. Exhaust system resources during local development
3. Pollute test databases with unintended tasks
4. Create confusion about which tasks are real vs. test artifacts

**Solution**: Environment-based gating at the API level that prevents task creation in non-production environments.

## Implementation

### Location
- **File**: `backend/src/routes/dev-bots.routes.ts`
- **Endpoint**: `POST /api/dev-bots/tasks`
- **Lines**: 845-879

### How It Works

```typescript
// Check environment before creating task
if (config.nodeEnv !== 'production') {
  // Log warning
  logger.warn({
    category: 'api',
    action: 'task_creation_blocked_non_production',
    message: `Task creation blocked in ${config.nodeEnv} environment`,
    details: {
      environment: config.nodeEnv,
      taskType: type,
      taskTitle: title,
      note: 'Dev-bots can only create tasks in production to prevent recursive spawning'
    }
  });

  // Return stubbed response (HTTP 200)
  return res.json({
    task: {
      id: `stub-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type,
      title,
      description: taskDescription,
      status: 'pending',
      createdAt: new Date().toISOString(),
      stubbed: true,
      reason: 'Task creation is disabled in non-production environments'
    },
    validation: {
      isValid: true,
      warnings: ['Task not created - dev-bot task spawning is disabled in non-production environments'],
      suggestions: []
    },
    message: 'Task creation stubbed (non-production environment)'
  });
}
```

### Environment Detection

Uses `config.nodeEnv` which reads from `process.env.NODE_ENV`:
- **development** (default): Tasks blocked
- **staging**: Tasks blocked
- **test**: Tasks blocked
- **production**: Tasks allowed

## Behavior by Environment

| Environment | Task Creation | Response Type | HTTP Status | addTask Called |
|------------|---------------|---------------|-------------|----------------|
| development | ❌ Blocked | Stubbed | 200 | No |
| staging | ❌ Blocked | Stubbed | 200 | No |
| test | ❌ Blocked | Stubbed | 200 | No |
| production | ✅ Allowed | Real | 200 | Yes |

## Stubbed Response Structure

When tasks are blocked, a stubbed response is returned that:

1. **Returns HTTP 200** - Not an error from API perspective
2. **Contains stub task** - With all expected fields
3. **Includes warning** - In validation.warnings array
4. **Maintains API contract** - Same response shape as real tasks

### Stub Task Fields

```typescript
{
  id: "stub-1699999999999-abc123",     // stub- prefix
  type: "implementation",               // From request
  title: "Task Title",                  // From request
  description: "Task description",      // From request
  status: "pending",                    // Always pending
  createdAt: "2025-11-12T07:00:00Z",   // Current timestamp
  stubbed: true,                        // Flag indicating stub
  reason: "Task creation is disabled..." // Explanation
}
```

## Validation Order

The implementation maintains the following validation order:

1. ✅ **Required fields** (type, title, description, acceptanceCriteria)
2. ✅ **Agent validation** (if assignedAgent provided)
3. ✅ **Environment check** ← **This restriction**
4. ✅ **V3 template validation** (if applicable)
5. ✅ **Task creation** (production only)

This ensures proper error messages for invalid requests before checking environment.

## Logging

### When Blocked (Non-Production)

```json
{
  "category": "api",
  "action": "task_creation_blocked_non_production",
  "message": "Task creation blocked in development environment",
  "details": {
    "environment": "development",
    "taskType": "implementation",
    "taskTitle": "My Task",
    "note": "Dev-bots can only create tasks in production to prevent recursive spawning"
  }
}
```

### When Allowed (Production)

No special logging - normal task creation flow.

## Testing

### Test Coverage

**Location**: `backend/src/routes/dev-bots.routes.test.ts`

#### Non-Production Tests (11 tests)
- Task creation blocked with stubbed response
- Validation warnings included
- Required field validation still runs
- Agent validation still runs
- HTTP 200 status returned
- Unique stub IDs generated
- Complete logger structure validated
- All task types blocked consistently
- API response wrapper format maintained
- Staging environment blocking
- Test environment blocking

#### Production Tests (5 tests)
- Task creation allowed
- Real task returned (not stubbed)
- No blocking warnings logged
- HTTP 200 status (default)
- addTask called with correct parameters

**Total**: 16 environment-specific tests

## Production Deployment

### Enabling Task Creation

Set the environment variable:

```bash
export NODE_ENV=production
```

### Verification

```bash
# Check current environment
echo $NODE_ENV

# Should output: production
```

### Monitoring

Monitor for these log messages:
- ❌ `task_creation_blocked_non_production` - Should NOT appear in production
- ✅ Tasks created successfully - Should appear normally

## Design Rationale

### Why HTTP 200?

Returning HTTP 200 (success) instead of 403 (forbidden) because:

1. **Not a failure** - The request was valid and processed
2. **Expected behavior** - This is intentional design, not an error
3. **Dev-bot compatibility** - Dev-bots don't fail when they try to spawn tasks
4. **API consistency** - Success response structure maintained

### Why Stubbed Response?

Returning a stubbed task (instead of error) because:

1. **Graceful degradation** - Dev-bot code continues working
2. **Testability** - Test environments can verify task creation logic
3. **Debugging** - Developers can see what task would have been created
4. **API contract** - Same response shape as real task creation

### Why Environment Variable?

Using `NODE_ENV` because:

1. **Standard practice** - Industry standard for environment detection
2. **Already used** - Config already reads this variable
3. **Simple** - No additional configuration needed
4. **Clear intent** - Explicitly set per environment

## Security Benefits

1. **Prevents infinite recursion** - Dev-bots can't spawn endless chains
2. **Resource protection** - Local development doesn't exhaust resources
3. **Test isolation** - Test suites don't create real tasks
4. **Production control** - Only production dev-bots can self-replicate
5. **Monitoring clarity** - Production logs show real task creation only

## Related Files

- `backend/src/routes/dev-bots.routes.ts:845-879` - Implementation
- `backend/src/routes/dev-bots.routes.test.ts:610-1252` - Tests
- `backend/src/config.ts:17` - Environment configuration
- `backend/tests/integration/api/api.routes.test.ts:968-979` - Integration test

## Migration Notes

### For Existing Deployments

No migration required. The feature:
- ✅ Maintains backward compatibility
- ✅ Production behavior unchanged (when NODE_ENV=production)
- ✅ Non-production already defaulted to development
- ✅ No database changes needed

### For Local Development

No changes needed:
- Local development defaults to `development` environment
- Task creation via UI/API still works normally
- Only dev-bot-to-dev-bot spawning is affected

## Future Enhancements

Potential improvements (not currently implemented):

1. **Whitelist specific dev-bot types** - Allow certain safe task types
2. **Rate limiting** - Limit task creation frequency instead of blocking
3. **Configurable per-environment** - More granular control than binary on/off
4. **Audit trail** - Track attempted task creations in non-production

## FAQ

### Q: Can I still create tasks manually in development?
**A**: Yes! This only affects dev-bot-to-dev-bot task creation. Manual task creation via UI/API works normally in all environments.

### Q: How do I test dev-bot task creation locally?
**A**: Set `NODE_ENV=production` in your local environment. However, be careful as this will allow real task creation.

### Q: What if I need dev-bots to create tasks in staging?
**A**: Set `NODE_ENV=production` for staging. However, ensure you have monitoring in place to prevent runaway task creation.

### Q: Why don't I see errors when tasks are blocked?
**A**: By design! The API returns HTTP 200 with a stubbed response so dev-bots continue operating normally without failures.

### Q: How can I tell if a task is stubbed?
**A**: Check the `stubbed` field in the task object and the `id` field (stub IDs start with "stub-").

## Version History

- **v1.0.0** (2025-11-12): Initial implementation with environment-based blocking
