# API Error Response Standards

## Overview

All API endpoints return standardized error responses that follow the `ApiError` contract. This ensures consistent, informative error handling across the entire API.

## Error Response Structure

```typescript
interface ApiError {
  success: false;
  error: string;         // Error category (e.g., "UNAUTHORIZED")
  message?: string;      // Human-readable error message
  code?: string;         // Specific error code (e.g., "AUTH_REQUIRED")
  details?: {
    // Error-specific context
    field?: string;
    service?: string;
    // ...
    troubleshooting?: TroubleshootingHint[];
  };
}

interface TroubleshootingHint {
  issue: string;           // What went wrong
  solution: string;        // How to fix it
}
```

## Error Response Helpers

Located in `backend/src/utils/errorResponses.ts`:

### badRequest(res, message, context, field?)
**400 Bad Request** - Invalid client input
```typescript
return ErrorResponses.badRequest(
  res,
  'taskId is required',
  { category: 'api', action: 'create_task_validation' },
  'taskId'
);
```

### unauthorized(res, message, context, hasKey)
**401 Unauthorized** - Missing or invalid authentication
```typescript
return ErrorResponses.unauthorized(
  res,
  'API key required',
  { category: 'api', action: 'auth_missing' },
  false
);
```

### notFound(res, resource, identifier?, context?)
**404 Not Found** - Resource doesn't exist
```typescript
return ErrorResponses.notFound(
  res,
  'Task',
  taskId,
  { category: 'api', action: 'get_task_not_found' }
);
```

### conflict(res, message, context, currentState?)
**409 Conflict** - Resource state conflict
```typescript
return ErrorResponses.conflict(
  res,
  'Task already running',
  { category: 'api', action: 'start_task_conflict' },
  'running'
);
```

### internalError(res, message, context, error?)
**500 Internal Server Error** - Unexpected server error
```typescript
return ErrorResponses.internalError(
  res,
  'Failed to process task',
  { category: 'api', action: 'process_task_error' },
  error
);
```

### serviceUnavailable(res, service, context, healthy?)
**503 Service Unavailable** - Service dependency not available
```typescript
return ErrorResponses.serviceUnavailable(
  res,
  'Dev-Bots coordinator',
  { category: 'api', action: 'get_status_unavailable' },
  devBotsManager.isHealthy()
);
```

### validationError(res, message, context, errors)
**422 Unprocessable Entity** - Validation failed
```typescript
return ErrorResponses.validationError(
  res,
  'Task validation failed',
  { category: 'api', action: 'validate_task' },
  [
    { field: 'title', error: 'Title is required' },
    { field: 'description', error: 'Description must be at least 10 characters' }
  ]
);
```

### rateLimitExceeded(res, message, context, retryAfter?)
**429 Too Many Requests** - Rate limit exceeded
```typescript
return ErrorResponses.rateLimitExceeded(
  res,
  'Rate limit exceeded',
  { category: 'api', action: 'rate_limit_check' },
  60 // retry after 60 seconds
);
```

## Example Error Responses

### 401 Unauthorized (Missing API Key)
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "API key required. Include X-API-Key header.",
  "code": "AUTH_REQUIRED",
  "details": {
    "hasKey": false,
    "troubleshooting": [
      {
        "issue": "Missing API key",
        "solution": "Include X-API-Key header with your request. Get API key from environment configuration."
      }
    ]
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Task 'task-123' not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": {
    "resource": "Task",
    "identifier": "task-123",
    "troubleshooting": [
      {
        "issue": "The requested task does not exist",
        "solution": "Verify the task ID is correct: task-123"
      }
    ]
  }
}
```

### 503 Service Unavailable
```json
{
  "success": false,
  "error": "SERVICE_UNAVAILABLE",
  "message": "Dev-Bots coordinator is currently unavailable",
  "code": "SERVICE_DOWN",
  "details": {
    "service": "Dev-Bots coordinator",
    "healthy": false,
    "troubleshooting": [
      {
        "issue": "Dev-Bots coordinator is not responding",
        "solution": "Check if Dev-Bots coordinator is running. Restart the service if needed."
      },
      {
        "issue": "Service may be starting up",
        "solution": "Wait 10-30 seconds and retry. Check service status endpoint."
      }
    ]
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "Failed to process task",
  "code": "SERVER_ERROR",
  "details": {
    "timestamp": "2025-11-15T06:25:00.000Z",
    "troubleshooting": [
      {
        "issue": "Internal server error occurred",
        "solution": "Check server logs for detailed error information. Contact support if the issue persists."
      }
    ]
  }
}
```

## Migration Guide

### Before
```typescript
res.status(404).json({
  error: 'Task not found'
});
```

### After
```typescript
return ErrorResponses.notFound(
  res,
  'Task',
  taskId,
  {
    category: 'api',
    action: 'get_task_not_found',
    details: { taskId }
  }
);
```

## Benefits

1. **Consistency** - All errors follow the same structure
2. **Informative** - Includes troubleshooting hints
3. **Type-safe** - Uses TypeScript contracts
4. **Loggable** - Structured logging with context
5. **Debuggable** - Includes relevant details and timestamps
6. **User-friendly** - Clear messages and actionable solutions

## Best Practices

1. **Always provide context** - Include category, action, and relevant details
2. **Use appropriate error type** - Match HTTP status to the error condition
3. **Include identifiers** - Help users identify what resource failed
4. **Log before responding** - Errors automatically log with full context
5. **Don't expose sensitive data** - Sanitize error details in production

## Related Files

- `backend/src/utils/errorResponses.ts` - Error response helpers
- `shared/api-contracts/index.ts` - ApiError contract
- `backend/src/middleware/auth.ts` - Example usage in auth
- `backend/src/routes/dev-bots/status.routes.ts` - Example usage in routes
