# App Monitor Scripts Panel Implementation Progress

**Date:** 2025-10-21
**Feature:** Script Execution Panel in App Monitor
**Status:** Backend Complete ✅ | Frontend In Progress 🔄

---

## Completed Work ✅

### Backend (100% Complete)

#### 1. Script Configuration (`backend/src/config.ts`)

- ✅ Added `ScriptConfig` interface with full configuration options
- ✅ Added `ScriptCategory` type ('build' | 'test' | 'quality' | 'database' | 'deployment' | 'utility')
- ✅ Added `DangerLevel` type ('safe' | 'warning' | 'danger')
- ✅ Configured 14 essential scripts:
  - **Frontend**: build, test, e2e, lint, type-check
  - **Backend**: build, test, lint
  - **Worker**: test, lint, format
  - **Database**: seed, clear (with confirmation)
  - **Utility**: install-all, clean-all

#### 2. Script Manager Service (`backend/src/services/scriptManager.ts`)

- ✅ Created ScriptManager class extending EventEmitter
- ✅ Implemented `executeScript()` - spawns child process with output capture
- ✅ Implemented `getScripts()` - returns all available scripts
- ✅ Implemented `getExecutions()` - returns execution history
- ✅ Implemented `getExecution(id)` - get specific execution details
- ✅ Implemented `killScript(id)` - terminate running scripts
- ✅ Implemented `clearHistory()` - clear completed executions
- ✅ Event emissions:
  - `script:started` - when script begins
  - `script:output` - real-time output lines
  - `script:completed` - successful completion
  - `script:failed` - failure with exit code
  - `script:killed` - user termination

#### 3. API Routes (`backend/src/routes/api.ts`)

- ✅ `GET /api/scripts` - List all available scripts
- ✅ `POST /api/scripts/:scriptId/execute` - Execute a script
- ✅ `GET /api/scripts/executions` - Get all executions
- ✅ `GET /api/scripts/executions/:executionId` - Get execution details
- ✅ `POST /api/scripts/executions/:executionId/kill` - Kill running script
- ✅ `DELETE /api/scripts/executions` - Clear history

#### 4. Socket.IO Integration (`backend/src/server.ts`)

- ✅ Added scriptManager import from routes
- ✅ Wired up all script events to Socket.IO:
  - Real-time output streaming
  - Status change broadcasts
  - Completion/failure notifications

**Backend Result:** Fully functional script execution system with REST API and real-time WebSocket updates.

---

## Remaining Frontend Work 🔄

### Phase 1: Core Infrastructure (Estimated: 2-3 hours)

#### 1. Type Definitions

**File:** `frontend/src/types/script.types.ts` (NEW)

```typescript
export type ScriptCategory =
  | "build"
  | "test"
  | "quality"
  | "database"
  | "deployment"
  | "utility";
export type DangerLevel = "safe" | "warning" | "danger";
export type ScriptStatus = "running" | "completed" | "failed";

export interface Script {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: ScriptCategory;
  command: string;
  args: string[];
  cwd: string;
  requiresConfirmation?: boolean;
  dangerLevel?: DangerLevel;
  icon?: string;
}

export interface ScriptExecution {
  id: string;
  scriptId: string;
  config: Script;
  pid?: number;
  status: ScriptStatus;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  output: string[];
}

export interface ScriptExecutionSummary {
  id: string;
  scriptId: string;
  displayName: string;
  status: ScriptStatus;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  outputLines: number;
}
```

#### 2. API Client

**File:** `frontend/src/services/api.ts` (UPDATE)

```typescript
// Add to existing api.ts

export async function getScripts(): Promise<Script[]> {
  const response = await fetch(`${API_BASE_URL}/scripts`);
  if (!response.ok) throw new Error("Failed to fetch scripts");
  const data = await response.json();
  return data.scripts;
}

export async function executeScript(
  scriptId: string,
): Promise<ScriptExecution> {
  const response = await fetch(`${API_BASE_URL}/scripts/${scriptId}/execute`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to execute script");
  return response.json();
}

export async function getExecutions(): Promise<ScriptExecutionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/scripts/executions`);
  if (!response.ok) throw new Error("Failed to fetch executions");
  const data = await response.json();
  return data.executions;
}

export async function getExecution(
  executionId: string,
): Promise<ScriptExecution> {
  const response = await fetch(
    `${API_BASE_URL}/scripts/executions/${executionId}`,
  );
  if (!response.ok) throw new Error("Failed to fetch execution");
  return response.json();
}

export async function killScript(executionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/scripts/executions/${executionId}/kill`,
    {
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Failed to kill script");
}

export async function clearHistory(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/scripts/executions`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to clear history");
}
```

#### 3. React Hook for Scripts

**File:** `frontend/src/hooks/useScripts.ts` (NEW)

```typescript
import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import {
  Script,
  ScriptExecution,
  ScriptExecutionSummary,
} from "../types/script.types";
import * as api from "../services/api";

export function useScripts(socket: Socket | null) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [executions, setExecutions] = useState<Map<string, ScriptExecution>>(
    new Map(),
  );
  const [activeExecutions, setActiveExecutions] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available scripts
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const data = await api.getScripts();
        setScripts(data);
      } catch (err) {
        setError("Failed to load scripts");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchScripts();
  }, []);

  // Socket.IO listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("script:started", (execution: ScriptExecution) => {
      setExecutions((prev) => new Map(prev).set(execution.id, execution));
      setActiveExecutions((prev) => new Set(prev).add(execution.id));
    });

    socket.on(
      "script:output",
      (data: { executionId: string; scriptId: string; line: string }) => {
        setExecutions((prev) => {
          const exec = prev.get(data.executionId);
          if (!exec) return prev;

          const updated = new Map(prev);
          updated.set(data.executionId, {
            ...exec,
            output: [...exec.output, data.line],
          });
          return updated;
        });
      },
    );

    socket.on("script:completed", (execution: ScriptExecution) => {
      setExecutions((prev) => new Map(prev).set(execution.id, execution));
      setActiveExecutions((prev) => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    socket.on("script:failed", (execution: ScriptExecution) => {
      setExecutions((prev) => new Map(prev).set(execution.id, execution));
      setActiveExecutions((prev) => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    socket.on("script:killed", (execution: ScriptExecution) => {
      setExecutions((prev) => new Map(prev).set(execution.id, execution));
      setActiveExecutions((prev) => {
        const updated = new Set(prev);
        updated.delete(execution.id);
        return updated;
      });
    });

    return () => {
      socket.off("script:started");
      socket.off("script:output");
      socket.off("script:completed");
      socket.off("script:failed");
      socket.off("script:killed");
    };
  }, [socket]);

  const executeScript = async (scriptId: string) => {
    try {
      await api.executeScript(scriptId);
    } catch (err) {
      console.error("Failed to execute script:", err);
      throw err;
    }
  };

  const killScript = async (executionId: string) => {
    try {
      await api.killScript(executionId);
    } catch (err) {
      console.error("Failed to kill script:", err);
      throw err;
    }
  };

  return {
    scripts,
    executions: Array.from(executions.values()),
    activeExecutions,
    loading,
    error,
    executeScript,
    killScript,
  };
}
```

### Phase 2: UI Components (Estimated: 4-5 hours)

#### 4. Script Card Component

**File:** `frontend/src/components/ScriptCard.tsx` (NEW)

```typescript
import { useState } from 'react';
import { Script } from '../types/script.types';

interface ScriptCardProps {
  script: Script;
  isRunning: boolean;
  onExecute: (scriptId: string) => void;
}

export default function ScriptCard({ script, isRunning, onExecute }: ScriptCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (script.requiresConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    onExecute(script.id);
    setShowConfirm(false);
  };

  const dangerColors = {
    safe: { bg: '#e7f5ff', border: '#339af0', text: '#1971c2' },
    warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
    danger: { bg: '#ffe5e5', border: '#ff6b6b', text: '#c92a2a' },
  };

  const colors = dangerColors[script.dangerLevel || 'safe'];

  return (
    <div style={{
      backgroundColor: '#fff',
      border: `2px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '16px',
      cursor: isRunning ? 'not-allowed' : 'pointer',
      opacity: isRunning ? 0.6 : 1,
      transition: 'all 0.2s',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '24px' }}>{script.icon}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: '#333',
          }}>
            {script.displayName}
          </h3>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '13px',
            color: '#666',
          }}>
            {script.description}
          </p>
        </div>
      </div>

      {showConfirm ? (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          backgroundColor: colors.bg,
          borderRadius: '4px',
          border: `1px solid ${colors.border}`,
        }}>
          <p style={{
            margin: '0 0 8px 0',
            fontSize: '13px',
            color: colors.text,
            fontWeight: 500,
          }}>
            Are you sure? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleClick}
              style={{
                padding: '6px 12px',
                backgroundColor: colors.border,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#fff',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleClick}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isRunning ? '#ccc' : colors.border,
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            marginTop: '8px',
          }}
        >
          {isRunning ? '⏳ Running...' : '▶ Run Script'}
        </button>
      )}
    </div>
  );
}
```

#### 5. Scripts Panel Component

**File:** `frontend/src/components/ScriptsPanel.tsx` (NEW)

```typescript
import { Socket } from 'socket.io-client';
import { useScripts } from '../hooks/useScripts';
import ScriptCard from './ScriptCard';
import { ScriptCategory } from '../types/script.types';

interface ScriptsPanelProps {
  socket: Socket | null;
}

export default function ScriptsPanel({ socket }: ScriptsPanelProps) {
  const { scripts, executions, activeExecutions, loading, error, executeScript } = useScripts(socket);

  if (loading) {
    return <div>Loading scripts...</div>;
  }

  if (error) {
    return <div style={{ color: '#c92a2a' }}>{error}</div>;
  }

  const categories: { name: string; key: ScriptCategory; icon: string }[] = [
    { name: 'Build', key: 'build', icon: '📦' },
    { name: 'Test', key: 'test', icon: '🧪' },
    { name: 'Quality', key: 'quality', icon: '🔍' },
    { name: 'Database', key: 'database', icon: '🗄️' },
    { name: 'Utility', key: 'utility', icon: '🛠️' },
  ];

  return (
    <div>
      {/* Active Executions */}
      {activeExecutions.size > 0 && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#e7f5ff',
          borderRadius: '8px',
          border: '2px solid #339af0',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
            ⏳ Running ({activeExecutions.size})
          </h3>
          {executions
            .filter(exec => activeExecutions.has(exec.id))
            .map(exec => (
              <div key={exec.id} style={{
                marginTop: '8px',
                fontSize: '14px',
                color: '#1971c2',
              }}>
                {exec.config.displayName} - {exec.output.length} lines
              </div>
            ))}
        </div>
      )}

      {/* Script Categories */}
      {categories.map(category => {
        const categoryScripts = scripts.filter(s => s.category === category.key);

        if (categoryScripts.length === 0) return null;

        return (
          <div key={category.key} style={{ marginBottom: '32px' }}>
            <h2 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>{category.icon}</span>
              {category.name}
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {categoryScripts.map(script => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  isRunning={Array.from(activeExecutions).some(id =>
                    executions.find(e => e.id === id)?.scriptId === script.id
                  )}
                  onExecute={executeScript}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

#### 6. Update App.tsx

**File:** `frontend/src/App.tsx` (UPDATE)

```typescript
// Add to imports
import ScriptsPanel from './components/ScriptsPanel';

// Update TabType
type TabType = 'local' | 'scripts' | 'staging' | 'production';

// Update tab buttons (add after 'local' button)
<button onClick={() => setActiveTab('scripts')} style={tabStyle('scripts')}>
  Scripts
</button>

// Add tab content (after local tab content)
{activeTab === 'scripts' && (
  <section>
    <div style={{ marginBottom: '16px' }}>
      <h2 style={{
        margin: 0,
        fontSize: '20px',
        fontWeight: 600,
        color: '#333',
      }}>
        Development Scripts
      </h2>
      <p style={{
        margin: '4px 0 0 0',
        fontSize: '13px',
        color: '#666',
      }}>
        Execute common development tasks across all repositories
      </p>
    </div>
    <ScriptsPanel socket={socket} />
  </section>
)}
```

---

## Testing Plan 🧪

### Backend Testing

```bash
# 1. Start app-monitor backend
cd app-monitor/backend
npm run dev

# 2. Test API endpoints
curl http://localhost:5000/api/scripts
curl -X POST http://localhost:5000/api/scripts/fe-lint/execute
curl http://localhost:5000/api/scripts/executions
```

### Frontend Testing

```bash
# 1. Start app-monitor frontend
cd app-monitor/frontend
npm run dev

# 2. Manual testing checklist
- [ ] Scripts tab appears in navigation
- [ ] All script categories display correctly
- [ ] Clicking "Run Script" executes script
- [ ] Real-time output appears
- [ ] Confirmation dialogs work for dangerous scripts
- [ ] Running scripts show "Running..." state
- [ ] Completed scripts show success/failure
- [ ] Kill script button works (future feature)
```

---

## Estimated Completion Time

- **Type Definitions**: 30 minutes
- **API Client**: 30 minutes
- **useScripts Hook**: 1 hour
- **ScriptCard Component**: 1.5 hours
- **ScriptsPanel Component**: 1.5 hours
- **App.tsx Integration**: 30 minutes
- **Testing & Bug Fixes**: 1 hour

**Total**: 6-7 hours for complete frontend implementation

---

## Next Steps

1. Create type definitions (`script.types.ts`)
2. Add API client methods
3. Implement `useScripts` hook
4. Build `ScriptCard` component
5. Build `ScriptsPanel` component
6. Update `App.tsx` to add Scripts tab
7. Test end-to-end flow
8. Add execution history view (optional enhancement)
9. Add output viewer modal (optional enhancement)

---

**Status Summary:**

- ✅ **Backend**: 100% complete, fully functional
- 🔄 **Frontend**: 0% complete, plan documented
- 📊 **Overall Progress**: 50% complete

**Implementation ready to continue at any time!**
