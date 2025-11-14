# Dev-Monitor Development Guidelines

## Purpose
Best practices and patterns for working on the App Monitor codebase (backend + frontend).

## When to Read
Read when working on ANY dev-monitor feature to understand system architecture and conventions.

## System Architecture

### Monorepo Structure
```
app-monitor/
├── backend/          # Express + TypeScript API (port 5000)
├── frontend/         # React + TypeScript UI (port 5174)
├── shared/           # Shared types and API contracts
│   └── api-contracts/  # SOURCE OF TRUTH for all API types
├── dev-bots/         # Autonomous development agents
└── docs/             # Comprehensive documentation
```

### Key Principles

#### 1. API Contracts are Source of Truth
**CRITICAL:** ALL request/response types MUST be defined in `shared/api-contracts/index.ts`

```typescript
// ✅ CORRECT: Define in shared/api-contracts/index.ts
export interface CreateTaskRequest {
  title: string;
  type: TaskType;
  description: string;
}

export interface CreateTaskResponse {
  task: Task;
  validation: ValidationResult;
}

// Backend uses ApiSuccess/ApiError wrappers
import { ApiSuccess, ApiError } from '../../shared/api-contracts/index.js';

router.post('/api/tasks', async (req, res) => {
  const task = await taskService.createTask(req.body);
  res.json(ApiSuccess(task));
});

// Frontend unwraps contracts
const response = await api.post<CreateTaskResponse>('/api/tasks', data);
return response.task; // Unwrapped
```

❌ **NEVER:** Duplicate types in backend or frontend
❌ **NEVER:** Use inline type definitions for API responses
❌ **NEVER:** Skip api-contracts for new endpoints

#### 2. Port Assignments (FIXED - DO NOT CHANGE)
**Development:**
- Backend: **5000** (dev-server)
- Frontend: **5174** (Vite dev server)

**Production:**
- Backend: **5001/5002** (blue-green deployment)
- Frontend: **80** (nginx)

**Fail Fast:** If port conflicts occur, exit immediately - NO automatic cleanup

####3. Environment Separation
**Development:** `/home/jdubz/Development/app-monitor` (current working directory)
**Production:** `/opt/app-monitor` (NEVER touch manually - CI/CD only)

- Use `staging` or feature branches for dev work
- NEVER commit directly to `main` branch
- NEVER modify production files manually

## Code Style & Conventions

### TypeScript
```typescript
// ✅ GOOD: Strict mode, proper typing
interface User {
  id: string;
  email: string;
  roles: Role[];
}

function validateUser(user: User): ValidationResult {
  // Functional programming patterns preferred
  return {
    isValid: user.email.includes('@'),
    errors: []
  };
}

// ❌ BAD: any types, require imports
const validateUser = (user: any) => {  // NO
  const crypto = require('crypto');     // NO - use import
  return user.email.includes('@');
};
```

**Rules:**
- ✅ Strict mode enabled (no implicit any)
- ✅ ESM imports (`import/export`, NOT `require`)
- ✅ Functional programming patterns preferred
- ✅ Use `interface` for object shapes
- ✅ Use `type` for unions/intersections
- ❌ NO `any` types (use proper typing or `unknown`)

### Backend Patterns

#### Service Layer
```typescript
// backend/src/services/userService.ts
export class UserService {
  async createUser(data: CreateUserRequest): Promise<User> {
    // Business logic here
    const user = await this.db.insert('users', data);
    
    logger.info({
      category: 'user',
      action: 'created',
      message: `User created: ${user.id}`,
      details: { userId: user.id, email: user.email }
    });
    
    return user;
  }
}
```

#### Route Layer (Thin Wrappers)
```typescript
// backend/src/routes/users.ts
import { ApiSuccess, ApiError } from '../../shared/api-contracts/index.js';

router.post('/api/users', async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    res.json(ApiSuccess(user));
  } catch (error) {
    logger.error({ category: 'api', action: 'create_user_failed', error });
    res.status(400).json(ApiError('Failed to create user', error.message));
  }
});
```

**Service Guidelines:**
- ✅ Services in `backend/src/services/` handle ALL business logic
- ✅ Routes in `backend/src/routes/` are thin wrappers (validation + error handling)
- ✅ Use structured logging via `logger.info/warn/error`
- ✅ All database access through `backend/src/services/database.ts`
- ✅ Process management via `ProcessManager` service

#### Structured Logging
```typescript
// ✅ GOOD: Structured logging
logger.info({
  category: 'process',      // Group: process|api|context|docker|pr
  action: 'task_completed', // Specific action
  message: 'Task completed successfully',
  details: {
    taskId: task.id,
    duration: Date.now() - startTime,
    agent: task.assignedAgent
  }
});

// ❌ BAD: Unstructured logging
console.log('Task done:', taskId); // NO
logger.info('Task ' + taskId + ' completed'); // NO
```

### Frontend Patterns

#### Component Structure
```typescript
// frontend/src/components/TaskList.tsx
import { Task } from '../../../shared/api-contracts/index.js';

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
      ))}
    </div>
  );
}
```

#### Custom Hooks
```typescript
// frontend/src/hooks/useTasks.ts
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadTasks();
  }, []);
  
  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api.get<TaskListResponse>('/api/tasks');
      setTasks(data.tasks);
    } catch (error) {
      // Error handling
    } finally {
      setLoading(false);
    }
  };
  
  return { tasks, loading, refresh: loadTasks };
}
```

#### API Service Centralization
```typescript
// frontend/src/services/api.ts
class ApiService {
  async get<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data.data; // Unwrap ApiSuccess
  }
}

export const api = new ApiService();
```

**Frontend Guidelines:**
- ✅ Components in `frontend/src/components/`
- ✅ Custom hooks in `frontend/src/hooks/`
- ✅ API calls centralized in `frontend/src/services/api.ts`
- ✅ Use Radix UI primitives for accessible components
- ✅ Tailwind CSS for styling (NO inline styles)
- ✅ Error boundaries for component errors

### Error Handling

#### Backend
```typescript
// ✅ GOOD: Structured error handling
try {
  const result = await taskService.executeTask(taskId);
  return ApiSuccess(result);
} catch (error) {
  logger.error({
    category: 'task',
    action: 'execution_failed',
    message: 'Task execution failed',
    error,
    details: { taskId, reason: error.message }
  });
  
  return ApiError('Task execution failed', error.message);
}
```

#### Frontend
```typescript
// ✅ GOOD: Error boundary usage
<ErrorBoundary fallback={<ErrorDisplay />}>
  <TaskList tasks={tasks} />
</ErrorBoundary>
```

## Testing

### Unit Tests
```typescript
// ✅ GOOD: Test files next to source
// backend/src/services/userService.test.ts
describe('UserService', () => {
  it('creates user with valid data', async () => {
    const service = new UserService(mockDb);
    const user = await service.createUser({ email: 'test@example.com' });
    expect(user.id).toBeDefined();
  });
});
```

### Running Tests
```bash
# All tests
npm test

# Backend only (safe runner prevents resource leaks)
npm run test:backend  # Uses safe-test-runner.cjs

# Frontend only
npm run test:frontend

# With coverage
npm run test:coverage
```

**Testing Guidelines:**
- ✅ Unit tests: Vitest (`.test.ts` files next to source)
- ✅ E2E tests: Playwright (`frontend/e2e/`)
- ✅ Integration tests: Vitest with real service instances
- ✅ Use safe test runner: `node safe-test-runner.cjs`
- ✅ Target coverage: >80%

## Git Workflow

### Branch Strategy
- `main` - Production (auto-deploys to `/opt/app-monitor`)
- `staging` - Integration testing
- Feature branches: `feature/description` or `fix/description`

### Commit Conventions
```bash
# ✅ GOOD: Conventional commits
git commit -m "feat: add context bundle generation"
git commit -m "fix: resolve null pointer in task service"
git commit -m "docs: update API documentation"
git commit -m "refactor: extract validation logic"
git commit -m "test: add unit tests for context cache"

# ❌ BAD: Vague messages
git commit -m "updates"
git commit -m "fix stuff"
git commit -m "WIP"
```

**Commit Rules:**
- ✅ Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- ✅ Keep commits atomic and focused
- ✅ Reference issues/tasks in commit messages
- ❌ Never force push to `main` or `staging`

### Automated Quality Checks
- **Pre-commit:** ESLint on staged files (Husky)
- **Pre-push:** All unit tests must pass (Husky)
- **CI/CD:** Linting + tests on PRs to `main` (GitHub Actions)

## Common Development Tasks

### Adding New API Endpoint
1. Define types in `shared/api-contracts/index.ts`
2. Create/update route in `backend/src/routes/`
3. Implement business logic in `backend/src/services/`
4. Add API call to `frontend/src/services/api.ts`
5. Use in components via hooks or direct calls
6. Write tests for backend route and frontend integration

### Adding New Service
1. Create service file in `backend/src/services/serviceName.ts`
2. Export instance and types
3. Import in `backend/src/server.ts` if needs initialization
4. Add configuration to `backend/src/config.ts` if needed
5. Write unit tests in `backend/src/services/serviceName.test.ts`

### Adding New Component
1. Create in `frontend/src/components/ComponentName.tsx`
2. Use Radix UI primitives where possible
3. Style with Tailwind utility classes
4. Extract reusable logic to custom hooks
5. Write component tests in `frontend/src/components/ComponentName.test.tsx`

## Performance Considerations
- ✅ WebSocket for real-time updates (NOT polling)
- ✅ Virtual scrolling for large log lists (`@tanstack/react-virtual`)
- ✅ Log rotation and size limits
- ✅ Database indexes on frequently queried columns
- ✅ Debounce user inputs (search, filters)

## What NOT to Do
❌ Change production files in `/opt/app-monitor` directly
❌ Commit directly to `main` branch
❌ Duplicate API types instead of using shared contracts
❌ Use polling when WebSocket is available
❌ Add new dependencies without updating package.json
❌ Skip tests or bypass git hooks
❌ Use inline styles instead of Tailwind classes
❌ Leave TODO comments without creating tracked issues

## Documentation
**Start here for context:**
- `docs/README.md` - Documentation index
- `docs/architecture/master-design-intent.md` - Architecture source of truth
- `docs/setup/README.md` - Setup and configuration
- `docs/guides/api-reference.md` - API documentation
