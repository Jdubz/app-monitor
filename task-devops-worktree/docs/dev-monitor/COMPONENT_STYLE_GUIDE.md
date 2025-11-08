# Dev-Monitor Component Style Guide

**Version:** 1.0  
**Last Updated:** October 25, 2025

## Overview

This guide documents the component architecture, styling conventions, and patterns used in the dev-monitor frontend.

---

## Architecture

### Component Structure

```
src/
├── components/
│   ├── layout/           # Reusable layout components
│   │   ├── Header.tsx
│   │   ├── MainLayout.tsx
│   │   ├── TabNav.tsx
│   │   └── TabContent.tsx
│   ├── tabs/             # Tab-specific components
│   │   ├── LocalTab.tsx
│   │   ├── ScriptsTab.tsx
│   │   ├── EnvironmentTab.tsx
│   │   ├── SystemHealthTab.tsx
│   │   └── ClaudeWorkersTab.tsx
│   └── [feature]/        # Feature-specific components
│       └── ComponentName.tsx
├── styles/
│   └── theme.ts          # Theme constants
└── App.tsx               # Main app entry (48 lines!)
```

---

## Styling Conventions

### CSS Modules (Preferred)

Use CSS Modules for component-specific styling:

```tsx
// Component.tsx
import styles from './Component.module.css';

export function Component() {
  return <div className={styles.container}>Content</div>;
}
```

```css
/* Component.module.css */
.container {
  padding: 20px;
  background-color: #fff;
}
```

**Benefits:**
- Scoped styles (no conflicts)
- Type-safe class names
- Easy to maintain
- Clear separation

### Naming Convention

**CSS Module Classes:**
- Use camelCase: `.container`, `.sectionTitle`, `.activeTab`
- Be descriptive: `.errorMessage` not `.err`
- Avoid abbreviations unless common: `.btn` is okay, `.cnt` is not

**Component Files:**
- PascalCase: `Header.tsx`, `TabNav.tsx`
- Matching CSS: `Header.module.css`, `TabNav.module.css`
- Index exports: `index.ts` for clean imports

---

## Component Patterns

### Layout Components

#### Purpose
Provide reusable layout structure across the app.

#### Example: Header

```tsx
// components/layout/Header.tsx
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Dev Console Monitor</h1>
      <p className={styles.subtitle}>
        Manage and monitor all job-finder development processes
      </p>
    </header>
  );
}
```

**Key Points:**
- Pure presentational component
- No business logic
- Minimal props
- Fully styled with CSS Modules

---

### Tab Components

#### Purpose
Encapsulate content and behavior for each tab.

#### Example: LocalTab

```tsx
// components/tabs/LocalTab.tsx
import ServiceGrid from '../ServiceGrid';
import MinimalPanelContainer from '../MinimalPanelContainer';
import styles from './LocalTab.module.css';

export function LocalTab() {
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Services</h2>
        </div>
        <ServiceGrid />
      </section>

      <section className={styles.logsSection}>
        <MinimalPanelContainer />
      </section>
    </>
  );
}
```

**Key Points:**
- Compose existing components
- Handle tab-specific layout
- Pass props to child components
- Use semantic HTML

---

### Tab Components with Props

#### Example: EnvironmentTab

```tsx
// components/tabs/EnvironmentTab.tsx
import { Socket } from 'socket.io-client';
import CloudPanelContainer from '../CloudPanelContainer';
import { Environment } from '../../types/log.types';

interface EnvironmentTabProps {
  socket: Socket | null;
  environment: string;
  environments: Record<string, Environment>;
}

export function EnvironmentTab({ 
  socket, 
  environment, 
  environments 
}: EnvironmentTabProps) {
  const env = environments[environment];
  if (!env) return null;
  
  return (
    <CloudPanelContainer 
      socket={socket}
      environment={environment}
      projectId={env.projectId}
    />
  );
}
```

**Key Points:**
- Clear TypeScript interfaces
- Prop validation (null check)
- Pass through necessary props
- Early return for invalid state

---

## Composition Patterns

### App.tsx - Clean Composition

```tsx
function App() {
  const { socket } = useServices();
  const [activeTab, setActiveTab] = useState<TabType>('local');
  const [environments, setEnvironments] = useState<Record<string, Environment>>({});

  useEffect(() => {
    // Fetch environments
  }, []);

  return (
    <LogProvider socket={socket}>
      <MainLayout>
        <Header />
        <TabContent>
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="tab-panel">
            {activeTab === 'local' && <LocalTab />}
            {activeTab === 'scripts' && <ScriptsTab socket={socket} />}
            {/* ... more tabs */}
          </div>
        </TabContent>
      </MainLayout>
    </LogProvider>
  );
}
```

**Key Points:**
- Minimal logic in App.tsx
- Clear component hierarchy
- Props passed explicitly
- Conditional rendering at top level

---

## TypeScript Guidelines

### Component Props

Always define explicit interfaces:

```tsx
interface MyComponentProps {
  title: string;
  isActive?: boolean;      // Optional
  onClick: () => void;      // Callbacks
  items: Item[];           // Arrays
  style?: CSSProperties;   // Optional CSS
}

export function MyComponent({ 
  title, 
  isActive = false,         // Default value
  onClick,
  items,
  style 
}: MyComponentProps) {
  // Component implementation
}
```

### Type Exports

Export types with components:

```tsx
// TabNav.tsx
export type TabType = 'local' | 'scripts' | 'staging' | 'production' | 'health' | 'claude-workers';

interface TabNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  // Implementation
}
```

---

## File Organization

### Index Files

Use index files for clean imports:

```tsx
// components/layout/index.ts
export { Header } from './Header';
export { MainLayout } from './MainLayout';
export { TabNav } from './TabNav';
export { TabContent } from './TabContent';
export type { TabType } from './TabNav';
```

**Usage:**
```tsx
// Instead of multiple imports:
import { Header } from './components/layout/Header';
import { MainLayout } from './components/layout/MainLayout';

// Use single import:
import { Header, MainLayout, TabNav } from './components/layout';
```

---

## Common Patterns

### Conditional Rendering

**Good:**
```tsx
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}
```

**Avoid:**
```tsx
{isLoading ? <Spinner /> : null}  // Ternary not needed
```

### State Management

Keep state close to where it's used:

```tsx
// ✅ Good - State in component that uses it
function EnvironmentTab({ socket, environment }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  // Use logs here
}

// ❌ Avoid - Passing setState everywhere
function App() {
  const [logs, setLogs] = useState<Log[]>([]);
  return <EnvironmentTab setLogs={setLogs} />;
}
```

### Event Handlers

Name handlers clearly:

```tsx
// ✅ Good
function TabNav({ onTabChange }: Props) {
  const handleTabClick = (tab: TabType) => {
    onTabChange(tab);
  };
}

// ❌ Avoid
function TabNav({ onChange }: Props) {
  const click = (t) => onChange(t);
}
```

---

## CSS Guidelines

### Layout

```css
/* Use modern layout */
.container {
  display: flex;
  gap: 20px;
  flex-direction: column;
}

/* Avoid old-school */
.container {
  float: left;
  margin-bottom: 20px;
}
```

### Colors

Use semantic naming:

```css
.error {
  color: #e53935;
  background-color: #ffebee;
}

.success {
  color: #43a047;
  background-color: #e8f5e9;
}
```

### Spacing

Use consistent spacing scale:

```css
/* 4px base unit */
.small { padding: 8px; }    /* 2x */
.medium { padding: 16px; }  /* 4x */
.large { padding: 24px; }   /* 6x */
```

---

## Testing Patterns

### Component Tests

```tsx
import { render, screen } from '@testing-library/react';
import { Header } from './Header';

describe('Header', () => {
  it('renders title', () => {
    render(<Header />);
    expect(screen.getByText('Dev Console Monitor')).toBeInTheDocument();
  });
});
```

### Testing Props

```tsx
it('calls onTabChange when tab clicked', () => {
  const handleChange = vi.fn();
  render(<TabNav activeTab="local" onTabChange={handleChange} />);
  
  const scriptsTab = screen.getByText('Scripts');
  scriptsTab.click();
  
  expect(handleChange).toHaveBeenCalledWith('scripts');
});
```

---

## Best Practices

### ✅ DO:
- Use CSS Modules for styling
- Define explicit TypeScript interfaces
- Keep components focused and small
- Use semantic HTML elements
- Compose components together
- Export types with components
- Use index files for clean imports

### ❌ DON'T:
- Use inline styles in JSX
- Use `any` type
- Create god components (>500 lines)
- Prop drill more than 2 levels
- Mix business logic with presentation
- Use non-semantic divs everywhere

---

## Migration Guide

### Converting Inline Styles to CSS Modules

**Before:**
```tsx
<div style={{
  padding: '20px',
  backgroundColor: '#fff',
  borderRadius: '8px'
}}>
  Content
</div>
```

**After:**
```tsx
// Component.tsx
<div className={styles.container}>
  Content
</div>

// Component.module.css
.container {
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
}
```

### Extracting Components

Look for:
- Repeated JSX patterns
- Large render methods (>100 lines)
- Logical sections with comments
- Different concerns mixed together

**Extract into:**
- Layout components (Header, Footer, Sidebar)
- Feature components (UserProfile, SearchBar)
- UI components (Button, Card, Badge)

---

## Resources

### References:
- React Documentation: https://react.dev
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- CSS Modules: https://github.com/css-modules/css-modules
- Vite: https://vitejs.dev

### Internal Docs:
- `/dev-monitor/REFACTORING_DOCUMENTATION.md` - Refactoring guide
- `/dev-monitor/PHASE3_PROGRESS.md` - Implementation progress
- `/dev-monitor/ARCHITECTURE.md` - System architecture

---

**Questions?** Check the existing code for examples or refer to the refactoring docs.
