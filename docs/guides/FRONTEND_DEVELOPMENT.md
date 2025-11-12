# Frontend Development Guide

**Last Updated:** 2025-11-12  
**Audience:** Frontend developers working on App Monitor UI

**Consolidated from:**
- frontend-testing-guide.md
- frontend-troubleshooting.md
- frontend-safety-guide.md

---

## Table of Contents

1. [Testing](#testing)
2. [Troubleshooting](#troubleshooting)
3. [Safety Guidelines](#safety-guidelines)
4. [Component Patterns](#component-patterns)
5. [State Management](#state-management)
6. [Performance](#performance)

---

## Testing

### Test Structure

```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // Arrange
    const props = { ... };
    
    // Act
    render(<ComponentName {...props} />);
    
    // Assert
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
```

### Testing Hooks

**Custom hooks require special setup:**

```typescript
import { renderHook, act } from '@testing-library/react';

describe('useCustomHook', () => {
  it('should update state', () => {
    const { result } = renderHook(() => useCustomHook());
    
    act(() => {
      result.current.updateValue('new value');
    });
    
    expect(result.current.value).toBe('new value');
  });
});
```

### Testing Async Operations

```typescript
it('should fetch data', async () => {
  render(<DataComponent />);
  
  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
  
  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});
```

### Testing WebSocket Components

```typescript
import { act } from '@testing-library/react';

it('should handle socket events', () => {
  const mockSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn()
  };
  
  render(<SocketComponent socket={mockSocket} />);
  
  // Simulate socket event
  act(() => {
    const handler = mockSocket.on.mock.calls.find(
      call => call[0] === 'event_name'
    )[1];
    handler({ data: 'test' });
  });
  
  expect(screen.getByText('test')).toBeInTheDocument();
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# Specific file
npm test -- ComponentName

# Update snapshots
npm test -- -u
```

---

## Troubleshooting

### Common Issues

#### 1. "Cannot find module" errors

**Symptom:** Import errors in tests

**Solutions:**
```typescript
// Use absolute imports
import { Component } from '@/components/Component';

// Or configure path aliases in vite.config.ts
resolve: {
  alias: {
    '@': '/src'
  }
}
```

#### 2. WebSocket hangs in tests

**Symptom:** Tests timeout waiting for socket connections

**Solution:**
```typescript
// Mock the socket service
vi.mock('@/services/socketService', () => ({
  socketService: {
    connect: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
  }
}));
```

#### 3. State updates not reflected

**Symptom:** Component doesn't re-render after state change

**Solution:**
```typescript
// Wrap state updates in act()
import { act } from '@testing-library/react';

act(() => {
  fireEvent.click(button);
});

// Or use userEvent (auto-wraps in act)
import { userEvent } from '@testing-library/user-event';

await userEvent.click(button);
```

#### 4. "Not wrapped in act()" warnings

**Cause:** State updates outside act()

**Solution:**
```typescript
// Before
setTimeout(() => setState(value), 100);

// After
act(() => {
  setTimeout(() => setState(value), 100);
});

// Or use waitFor
await waitFor(() => {
  expect(element).toBeInTheDocument();
});
```

#### 5. Snapshot tests failing

**Symptom:** Snapshots don't match after minor changes

**Solution:**
```bash
# Review changes
npm test -- -u

# Or update specific test
npm test -- ComponentName -u
```

### Debugging Tips

#### Use Testing Playground

```typescript
import { screen } from '@testing-library/react';

// Get debug output
screen.debug();

// Or debug specific element
screen.debug(screen.getByRole('button'));
```

#### Check What's Rendered

```typescript
// See all accessible roles
screen.logTestingPlaygroundURL();

// Find by text (case-insensitive)
screen.getByText('text', { exact: false });

// Find by role
screen.getByRole('button', { name: /submit/i });
```

#### Mock Console Methods

```typescript
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

---

## Safety Guidelines

### API Calls

**Always handle errors:**

```typescript
// ❌ Unsafe
const data = await fetch('/api/data').then(r => r.json());

// ✅ Safe
try {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
} catch (error) {
  console.error('Failed to fetch data:', error);
  // Show user-friendly error
}
```

### State Updates

**Check component is mounted:**

```typescript
useEffect(() => {
  let isMounted = true;
  
  async function fetchData() {
    const data = await api.getData();
    if (isMounted) {
      setData(data);
    }
  }
  
  fetchData();
  
  return () => {
    isMounted = false;
  };
}, []);
```

### WebSocket Connections

**Clean up listeners:**

```typescript
useEffect(() => {
  const handleMessage = (data) => {
    // Handle message
  };
  
  socket.on('message', handleMessage);
  
  return () => {
    socket.off('message', handleMessage);
  };
}, [socket]);
```

### User Input

**Validate before using:**

```typescript
// ❌ Dangerous
const userInput = input.value;
element.innerHTML = userInput;

// ✅ Safe
const userInput = DOMPurify.sanitize(input.value);
element.textContent = userInput;
```

### Environment Variables

**Use safe defaults:**

```typescript
// ❌ Crashes if undefined
const apiUrl = import.meta.env.VITE_API_URL;

// ✅ Safe with default
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
```

---

## Component Patterns

### Container/Presentational Pattern

```typescript
// Container (logic)
function TaskListContainer() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchTasks().then(setTasks).finally(() => setLoading(false));
  }, []);
  
  return <TaskList tasks={tasks} loading={loading} />;
}

// Presentational (UI)
function TaskList({ tasks, loading }: Props) {
  if (loading) return <Spinner />;
  return (
    <ul>
      {tasks.map(task => <TaskItem key={task.id} task={task} />)}
    </ul>
  );
}
```

### Custom Hooks

```typescript
function useTaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    
    fetchTasks()
      .then(data => isMounted && setTasks(data))
      .catch(err => isMounted && setError(err))
      .finally(() => isMounted && setLoading(false));
    
    return () => { isMounted = false; };
  }, []);
  
  return { tasks, loading, error };
}

// Usage
function TaskListComponent() {
  const { tasks, loading, error } = useTaskList();
  // ... render
}
```

### Error Boundaries

```typescript
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, info) {
    console.error('Error caught:', error, info);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## State Management

### Local State (useState)

**For component-specific state:**

```typescript
const [count, setCount] = useState(0);
const [name, setName] = useState('');
const [items, setItems] = useState<Item[]>([]);
```

### Context (useContext)

**For shared state across components:**

```typescript
const TaskContext = createContext<TaskContextType | null>(null);

function TaskProvider({ children }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  
  return (
    <TaskContext.Provider value={{ tasks, setTasks }}>
      {children}
    </TaskContext.Provider>
  );
}

// Usage
function useTaskContext() {
  const context = useContext(TaskContext);
  if (!context) throw new Error('Must be within TaskProvider');
  return context;
}
```

### Refs (useRef)

**For DOM access or mutable values:**

```typescript
const inputRef = useRef<HTMLInputElement>(null);

// Focus input
inputRef.current?.focus();

// Store previous value
const prevValue = useRef<string>();
useEffect(() => {
  prevValue.current = value;
}, [value]);
```

---

## Performance

### Memoization

```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// Memoize callbacks
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

// Memoize components
const MemoizedComponent = React.memo(Component);
```

### Lazy Loading

```typescript
const LazyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <LazyComponent />
    </Suspense>
  );
}
```

### Virtual Scrolling

**For long lists:**

```typescript
import { FixedSizeList } from 'react-window';

function TaskList({ tasks }: Props) {
  return (
    <FixedSizeList
      height={600}
      itemCount={tasks.length}
      itemSize={50}
    >
      {({ index, style }) => (
        <div style={style}>
          <TaskItem task={tasks[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## Additional Resources

- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Component Style Guide](./component-style-guide.md)
- [API Reference](./api-reference.md)
