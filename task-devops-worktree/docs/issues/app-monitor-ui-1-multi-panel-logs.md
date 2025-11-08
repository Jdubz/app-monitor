# APP-MONITOR-UI-1 — Multi-Panel Log Viewer with Drag & Resize

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, type-developer-experience, app-monitor, frontend-only
- **Estimated Effort**: 3-4 days (Phase 1: 2 days, Phase 2: 1-2 days)
- **Dependencies**: None (app-monitor already complete)
- **Related**: APP-MONITOR-5 (Logs viewer - this enhances it)

## What This Issue Covers

Enhance the app-monitor frontend to support **multiple simultaneous log panels** with advanced layout capabilities. Developers often need to monitor multiple services at once (e.g., frontend + backend + worker simultaneously), but the current single-panel view forces constant switching between sources.

## Context

**Current State**:

- Single log viewer panel
- Dropdown to switch between log sources
- Cannot view multiple services simultaneously
- Must constantly switch sources to monitor different services
- **Result**: Poor developer experience when debugging multi-service issues

**Developer Pain Points**:

```
Scenario: Debugging a job submission flow
- Need to see: Frontend logs (user action)
              + Backend logs (API processing)
              + Worker logs (job execution)

Current workflow:
1. View frontend logs → see user clicked submit
2. Switch to backend logs → see API received request
3. Switch to worker logs → see job processing
4. Switch back to frontend → see response handling
5. Repeat...

Desired workflow:
- View all three simultaneously in split panels
- See the entire flow in real-time without switching
```

**Vision**:

- **Phase 1**: Multiple fixed panels for simultaneous log viewing
- **Phase 2**: Draggable, resizable panels with flexible layouts

## Tasks

### Phase 1: Multi-Panel Layout (2 days)

#### 1. Design Panel Layout System

- [ ] Design panel grid system (2-4 panels)
- [ ] Define panel size options (full, half, third, quarter)
- [ ] Create panel layout templates (2-panel, 3-panel, 4-panel)
- [ ] Design panel header with source selector
- [ ] Design add/remove panel controls

#### 2. Implement Panel Container

- [ ] Create PanelContainer component
- [ ] Support multiple LogsViewer instances
- [ ] Manage panel state (sources, filters, settings)
- [ ] Handle panel add/remove
- [ ] Sync panel updates independently

#### 3. Panel Management

- [ ] Add panel button (+ icon)
- [ ] Remove panel button (X icon per panel)
- [ ] Source selector per panel (dropdown)
- [ ] Independent filtering per panel
- [ ] Independent pause/resume per panel

#### 4. Layout Templates

- [ ] Single panel (default, current behavior)
- [ ] Horizontal split (2 panels side-by-side)
- [ ] Vertical split (2 panels stacked)
- [ ] Quad layout (4 panels in grid)
- [ ] Custom layout (3 panels: main + 2 side)

#### 5. Log Parsing & Display

- [ ] Parse log entries to extract only the message
- [ ] Strip metadata (timestamp, level, service, labels)
- [ ] Clean display format (just the log message)
- [ ] Optional: Toggle to show/hide metadata per panel
- [ ] Syntax highlighting for log messages (optional)

#### 6. Copy Functionality

- [ ] Fix Ctrl+C to copy instead of clear
- [ ] Allow text selection within panels
- [ ] Copy selected logs to clipboard
- [ ] Copy all logs button per panel
- [ ] Preserve formatting when copying
- [ ] Visual feedback when copied

#### 7. State Management

- [ ] Track panel configurations
- [ ] Persist panel layout to localStorage
- [ ] Restore panel layout on reload
- [ ] Export/import panel configurations

### Phase 2: Drag & Resize (1-2 days)

#### 8. Install Drag & Drop Library

- [ ] Evaluate libraries (react-grid-layout, react-mosaic, custom)
- [ ] Install chosen library
- [ ] Configure for log panels

#### 9. Implement Draggable Panels

- [ ] Enable drag-to-reorder panels
- [ ] Visual feedback during drag
- [ ] Snap to grid positions
- [ ] Prevent overlapping

#### 10. Implement Resizable Panels

- [ ] Add resize handles to panels
- [ ] Support horizontal resize
- [ ] Support vertical resize
- [ ] Maintain minimum panel size
- [ ] Redistribute space on resize

#### 11. Advanced Layout Features

- [ ] Save custom layouts
- [ ] Name custom layouts
- [ ] Quick-switch between layouts
- [ ] Reset to default layout
- [ ] Share layouts (export/import)

#### 12. Polish & UX

- [ ] Smooth animations
- [ ] Keyboard shortcuts (add panel, remove panel, switch focus)
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Mobile responsiveness (stack panels on small screens)

## Technology & Implementation Notes

- **Dependencies:** `react-grid-layout`, `@dnd-kit/core`, `@dnd-kit/sortable`
- **Component Organization:** Place layout components under `frontend/src/components/layout/`
- **State Management:** Introduce `useDashboardLayout` and `usePanelDrag` hooks to isolate layout logic
- **Persistence:** Store layouts via `layoutStorage` utilities with export/import support

### Planned File Changes

```yaml
CREATE:
  - frontend/src/components/layout/DashboardLayout.tsx
  - frontend/src/components/layout/PanelContainer.tsx
  - frontend/src/components/layout/PanelHeader.tsx
  - frontend/src/components/layout/PanelResizer.tsx
  - frontend/src/hooks/useDashboardLayout.ts
  - frontend/src/hooks/usePanelDrag.ts
  - frontend/src/services/layoutStorage.ts
  - frontend/src/types/layout.types.ts

MODIFY:
  - frontend/src/App.tsx
  - frontend/src/components/LogsViewer.tsx
  - frontend/src/components/ServiceGrid.tsx
  - frontend/package.json
```

### Additional Tasks

1. **Layout Type System**
   - Define panel types (logs, services, metrics, scripts)
   - Model persisted panel configuration and layout templates
2. **Drag & Resize Controls**
   - Implement dedicated `PanelHeader` and `PanelResizer` components
   - Provide visual feedback during drag/resize interactions
3. **Layout Persistence**
   - Build storage helpers for automatic save/restore
   - Support versioning plus export/import of layouts
4. **Testing Focus**
   - Unit: reducer logic, persistence helpers, drag utilities
   - Integration: drag-and-drop flows, resize behavior, layout reloads
   - Manual: keyboard accessibility, responsive breakpoints, metadata toggles

## Proposed Implementation

### Phase 1: Fixed Multi-Panel Layout

#### Component Structure

```typescript
// frontend/src/components/logs/PanelContainer.tsx
interface Panel {
  id: string;
  source: string;        // 'frontend' | 'backend' | 'worker' | 'local-all'
  filters: LogFilters;
  paused: boolean;
  position: PanelPosition;
}

interface PanelPosition {
  row: number;
  col: number;
  width: number;   // 1-4 (grid units)
  height: number;  // 1-4 (grid units)
}

export const PanelContainer: React.FC = () => {
  const [panels, setPanels] = useState<Panel[]>([
    { id: '1', source: 'local-all', filters: {}, paused: false, position: { row: 0, col: 0, width: 4, height: 4 } }
  ]);
  const [layout, setLayout] = useState<LayoutType>('single');

  const addPanel = () => {
    const newPanel = createPanel();
    setPanels([...panels, newPanel]);
    adjustLayout(panels.length + 1);
  };

  const removePanel = (id: string) => {
    setPanels(panels.filter(p => p.id !== id));
    adjustLayout(panels.length - 1);
  };

  return (
    <div className="panel-container">
      <PanelToolbar
        onAddPanel={addPanel}
        onLayoutChange={setLayout}
        currentLayout={layout}
      />
      <div className={`panel-grid layout-${layout}`}>
        {panels.map(panel => (
          <PanelWrapper
            key={panel.id}
            panel={panel}
            onRemove={() => removePanel(panel.id)}
            onSourceChange={(source) => updatePanelSource(panel.id, source)}
          >
            <LogsViewer
              source={panel.source}
              filters={panel.filters}
              paused={panel.paused}
            />
          </PanelWrapper>
        ))}
      </div>
    </div>
  );
};
```

#### Panel Wrapper Component

```typescript
// frontend/src/components/logs/PanelWrapper.tsx
interface PanelWrapperProps {
  panel: Panel;
  onRemove: () => void;
  onSourceChange: (source: string) => void;
  children: React.ReactNode;
}

export const PanelWrapper: React.FC<PanelWrapperProps> = ({
  panel,
  onRemove,
  onSourceChange,
  children
}) => {
  const [showMetadata, setShowMetadata] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleCopyAll = async () => {
    if (!panelRef.current) return;

    const logText = panelRef.current.innerText;
    await navigator.clipboard.writeText(logText);

    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className="panel-wrapper" style={getPanelStyle(panel.position)}>
      <div className="panel-header">
        <select
          value={panel.source}
          onChange={(e) => onSourceChange(e.target.value)}
          className="source-selector"
        >
          <option value="local-all">Local - All Services</option>
          <option value="local-frontend">Local - Frontend</option>
          <option value="local-backend">Local - Backend</option>
          <option value="local-worker">Local - Worker</option>
          <option value="staging-all">Staging - All</option>
          <option value="production-all">Production - All</option>
        </select>

        <div className="panel-controls">
          <label className="metadata-toggle">
            <input
              type="checkbox"
              checked={showMetadata}
              onChange={(e) => setShowMetadata(e.target.checked)}
            />
            Show metadata
          </label>

          <button
            onClick={handleCopyAll}
            className="copy-btn"
            title="Copy all logs"
          >
            {copyFeedback ? <CheckIcon /> : <CopyIcon />}
          </button>

          <button onClick={onRemove} className="remove-panel-btn" title="Remove panel">
            <XIcon />
          </button>
        </div>
      </div>

      <div className="panel-content" ref={panelRef}>
        {React.cloneElement(children as React.ReactElement, { showMetadata })}
      </div>
    </div>
  );
};
```

#### Log Parsing Utility

```typescript
// frontend/src/utils/logParser.ts
interface ParsedLog {
  timestamp?: string;
  level?: string;
  service?: string;
  labels?: Record<string, string>;
  message: string;
  raw: string;
}

export class LogParser {
  /**
   * Parse structured log entry and extract message
   *
   * Examples:
   * "[2025-10-21 04:00:00] INFO [frontend] User clicked submit button"
   * → "User clicked submit button"
   *
   * "{"timestamp":"2025-10-21T04:00:00Z","level":"INFO","message":"Processing job"}"
   * → "Processing job"
   */
  static parse(logLine: string): ParsedLog {
    // Try JSON parsing first
    try {
      const json = JSON.parse(logLine);
      return {
        timestamp: json.timestamp,
        level: json.level,
        service: json.service,
        labels: json.labels,
        message: json.message || json.msg || logLine,
        raw: logLine,
      };
    } catch {
      // Not JSON, try regex patterns
    }

    // Common log patterns
    const patterns = [
      // [timestamp] LEVEL [service] message
      /^\[([^\]]+)\]\s+(\w+)\s+\[([^\]]+)\]\s+(.+)$/,

      // timestamp LEVEL service: message
      /^(\S+)\s+(\w+)\s+(\S+):\s+(.+)$/,

      // LEVEL: message
      /^(\w+):\s+(.+)$/,

      // [LEVEL] message
      /^\[(\w+)\]\s+(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = logLine.match(pattern);
      if (match) {
        return this.extractFromMatch(match, logLine);
      }
    }

    // No pattern matched, return entire line as message
    return {
      message: logLine,
      raw: logLine,
    };
  }

  private static extractFromMatch(
    match: RegExpMatchArray,
    raw: string,
  ): ParsedLog {
    // Different patterns have different capture groups
    if (match.length === 5) {
      // Full pattern: timestamp, level, service, message
      return {
        timestamp: match[1],
        level: match[2],
        service: match[3],
        message: match[4],
        raw,
      };
    } else if (match.length === 3) {
      // Simple pattern: level, message
      return {
        level: match[1],
        message: match[2],
        raw,
      };
    }

    return { message: raw, raw };
  }

  /**
   * Format log for display
   */
  static format(log: ParsedLog, showMetadata: boolean): string {
    if (showMetadata) {
      return log.raw;
    }
    return log.message;
  }
}
```

#### Enhanced LogsViewer Component

```typescript
// frontend/src/components/logs/LogsViewer.tsx (enhanced)
interface LogsViewerProps {
  source: string;
  filters: LogFilters;
  paused: boolean;
  showMetadata?: boolean; // NEW
}

export const LogsViewer: React.FC<LogsViewerProps> = ({
  source,
  filters,
  paused,
  showMetadata = false // NEW: default to message-only
}) => {
  const [logs, setLogs] = useState<string[]>([]);

  // ... socket connection logic ...

  const displayLogs = useMemo(() => {
    return logs.map(logLine => {
      const parsed = LogParser.parse(logLine);
      return LogParser.format(parsed, showMetadata);
    });
  }, [logs, showMetadata]);

  // Enable text selection and copying
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't interfere with Ctrl+C (let browser handle it)
    if (e.key === 'c' && e.ctrlKey) {
      // Browser will handle copying selected text
      return;
    }

    // Handle other keyboard shortcuts
    if (e.key === 'Escape') {
      // Clear selection if needed
    }
  };

  return (
    <div
      className="logs-viewer"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="logs-container" style={{ userSelect: 'text' }}>
        {displayLogs.map((log, index) => (
          <div key={index} className="log-line">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### CSS for Text Selection

```css
/* frontend/src/styles/panel-logs.css */

/* Enable text selection in log panels */
.panel-content {
  user-select: text;
  cursor: text;
}

.logs-viewer {
  user-select: text;
}

.log-line {
  user-select: text;
  cursor: text;
  padding: 2px 8px;
}

.log-line:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Highlight selected text */
.log-line::selection {
  background: rgba(100, 149, 237, 0.3);
}

/* Copy button feedback */
.copy-btn {
  transition: all 0.2s ease;
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn svg {
  width: 16px;
  height: 16px;
}

/* Metadata toggle */
.metadata-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}

.panel-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

#### Layout Templates CSS

```css
/* frontend/src/styles/panel-layouts.css */

/* Single panel (full screen) */
.layout-single {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  gap: 8px;
}

/* Horizontal split (side by side) */
.layout-horizontal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr;
  gap: 8px;
}

/* Vertical split (stacked) */
.layout-vertical {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
}

/* Quad layout (2x2 grid) */
.layout-quad {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
}

/* Main + sidebar (70/30 split) */
.layout-main-sidebar {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
}

.layout-main-sidebar .panel-wrapper:first-child {
  grid-row: 1 / 3;
}

.panel-wrapper {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--panel-bg);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
}

.panel-content {
  flex: 1;
  overflow: hidden;
}
```

#### Panel Toolbar

```typescript
// frontend/src/components/logs/PanelToolbar.tsx
interface PanelToolbarProps {
  onAddPanel: () => void;
  onLayoutChange: (layout: LayoutType) => void;
  currentLayout: LayoutType;
}

export const PanelToolbar: React.FC<PanelToolbarProps> = ({
  onAddPanel,
  onLayoutChange,
  currentLayout
}) => {
  return (
    <div className="panel-toolbar">
      <div className="toolbar-section">
        <h3>Log Panels</h3>
      </div>

      <div className="toolbar-section">
        <button onClick={onAddPanel} className="btn-add-panel">
          <PlusIcon /> Add Panel
        </button>

        <select
          value={currentLayout}
          onChange={(e) => onLayoutChange(e.target.value as LayoutType)}
          className="layout-selector"
        >
          <option value="single">Single</option>
          <option value="horizontal">Horizontal Split</option>
          <option value="vertical">Vertical Split</option>
          <option value="quad">Quad Grid</option>
          <option value="main-sidebar">Main + Sidebar</option>
        </select>
      </div>
    </div>
  );
};
```

### Phase 2: Drag & Resize with react-grid-layout

#### Installation

```bash
cd app-monitor/frontend
npm install react-grid-layout
npm install --save-dev @types/react-grid-layout
```

#### Draggable/Resizable Implementation

```typescript
// frontend/src/components/logs/DraggablePanelContainer.tsx
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface LayoutItem {
  i: string;        // panel id
  x: number;        // grid column
  y: number;        // grid row
  w: number;        // width in grid units
  h: number;        // height in grid units
  minW?: number;
  minH?: number;
}

export const DraggablePanelContainer: React.FC = () => {
  const [panels, setPanels] = useState<Panel[]>([...]);
  const [layout, setLayout] = useState<LayoutItem[]>([
    { i: '1', x: 0, y: 0, w: 12, h: 4, minW: 3, minH: 2 }
  ]);

  const onLayoutChange = (newLayout: LayoutItem[]) => {
    setLayout(newLayout);
    saveLayout(newLayout); // Persist to localStorage
  };

  return (
    <GridLayout
      className="panel-grid"
      layout={layout}
      onLayoutChange={onLayoutChange}
      cols={12}
      rowHeight={100}
      width={1200}
      isDraggable={true}
      isResizable={true}
      compactType="vertical"
      preventCollision={false}
    >
      {panels.map(panel => (
        <div key={panel.id} className="panel-wrapper">
          <PanelWrapper
            panel={panel}
            onRemove={() => removePanel(panel.id)}
            onSourceChange={(source) => updatePanelSource(panel.id, source)}
          >
            <LogsViewer
              source={panel.source}
              filters={panel.filters}
              paused={panel.paused}
            />
          </PanelWrapper>
        </div>
      ))}
    </GridLayout>
  );
};
```

#### Custom Drag Handle

```typescript
// Add custom drag handle to panel header
.panel-header {
  cursor: move;
  user-select: none;
}

.panel-header .drag-handle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-header .drag-handle::before {
  content: '⋮⋮';
  font-size: 16px;
  color: var(--text-muted);
}
```

#### Save/Load Layouts

```typescript
// frontend/src/services/layoutStorage.ts
interface SavedLayout {
  name: string;
  panels: Panel[];
  grid: LayoutItem[];
  createdAt: string;
}

export class LayoutStorage {
  private static STORAGE_KEY = "app-monitor-layouts";

  static saveLayout(name: string, panels: Panel[], grid: LayoutItem[]) {
    const layouts = this.getAllLayouts();
    layouts[name] = {
      name,
      panels,
      grid,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(layouts));
  }

  static loadLayout(name: string): SavedLayout | null {
    const layouts = this.getAllLayouts();
    return layouts[name] || null;
  }

  static getAllLayouts(): Record<string, SavedLayout> {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  static deleteLayout(name: string) {
    const layouts = this.getAllLayouts();
    delete layouts[name];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(layouts));
  }

  static exportLayout(name: string): string {
    const layout = this.loadLayout(name);
    return JSON.stringify(layout, null, 2);
  }

  static importLayout(json: string) {
    const layout: SavedLayout = JSON.parse(json);
    this.saveLayout(layout.name, layout.panels, layout.grid);
  }
}
```

#### Layout Presets

```typescript
// frontend/src/constants/layoutPresets.ts
export const LAYOUT_PRESETS = {
  "fullstack-debug": {
    name: "Full Stack Debug",
    description: "Monitor FE + BE + Worker simultaneously",
    panels: [
      {
        id: "1",
        source: "local-frontend",
        position: { x: 0, y: 0, w: 4, h: 4 },
      },
      {
        id: "2",
        source: "local-backend",
        position: { x: 4, y: 0, w: 4, h: 4 },
      },
      { id: "3", source: "local-worker", position: { x: 8, y: 0, w: 4, h: 4 } },
    ],
  },
  "frontend-focus": {
    name: "Frontend Focus",
    description: "Large FE panel with small BE reference",
    panels: [
      {
        id: "1",
        source: "local-frontend",
        position: { x: 0, y: 0, w: 8, h: 4 },
      },
      {
        id: "2",
        source: "local-backend",
        position: { x: 8, y: 0, w: 4, h: 4 },
      },
    ],
  },
  "staging-production": {
    name: "Staging vs Production",
    description: "Compare staging and production logs",
    panels: [
      { id: "1", source: "staging-all", position: { x: 0, y: 0, w: 6, h: 4 } },
      {
        id: "2",
        source: "production-all",
        position: { x: 6, y: 0, w: 6, h: 4 },
      },
    ],
  },
};
```

## Acceptance Criteria

### Phase 1

- [ ] Can add multiple log panels (up to 4)
- [ ] Each panel has independent source selector
- [ ] Each panel has independent filters
- [ ] Each panel can be paused/resumed independently
- [ ] Layout templates work (single, horizontal, vertical, quad)
- [ ] Panel configurations persist across page reloads
- [ ] Can remove individual panels
- [ ] All panels update in real-time
- [ ] **Logs show only message by default (no timestamps, levels, labels)**
- [ ] **Toggle to show/hide metadata per panel**
- [ ] **Ctrl+C copies selected text (does NOT clear panel)**
- [ ] **Text selection works in all panels**
- [ ] **Copy all logs button per panel with visual feedback**
- [ ] **Log parsing handles JSON and common text formats**

### Phase 2

- [ ] Panels can be dragged to reorder
- [ ] Panels can be resized (width and height)
- [ ] Resize handles visible and functional
- [ ] Minimum panel size enforced
- [ ] Layout changes persist to localStorage
- [ ] Can save custom layouts with names
- [ ] Can load saved layouts
- [ ] Can export/import layouts
- [ ] Smooth animations during drag/resize
- [ ] No overlapping panels

## Implementation Strategy

### Phase 1: Multi-Panel Layout (2 days)

#### Day 1: Core Infrastructure + Log Parsing

- Morning: Design panel system, create components
- Afternoon: Implement panel add/remove, source selection
  - **Add log parser utility**
  - **Implement message-only display**
- Evening: Test with 2-3 panels simultaneously
  - **Verify log parsing works with JSON and text formats**

#### Day 2: Layout Templates, Copy & Persistence

- Morning: Implement layout templates (horizontal, vertical, quad)
  - **Add metadata toggle per panel**
- Afternoon: Add localStorage persistence
  - **Fix Ctrl+C behavior (enable text selection)**
  - **Add Copy All button with feedback**
- Evening: Polish UI, test all layouts
  - **Test copy functionality thoroughly**

### Phase 2: Drag & Resize (1-2 days)

#### Day 3: Drag & Drop

- Morning: Install react-grid-layout, basic integration
- Afternoon: Configure drag behavior, custom handles
- Evening: Test drag-to-reorder, fix edge cases

#### Day 4 (if needed): Resize & Polish

- Morning: Implement resize functionality
- Afternoon: Save/load custom layouts
- Evening: Polish animations, accessibility, testing

## Benefits

### For Developers

- **Faster Debugging**: See all services at once, no switching
- **Better Context**: Understand request flow across services
- **Flexible Workflow**: Customize layout to match debugging needs
- **Persistent Setup**: Layouts saved, don't reconfigure every time

### Use Cases

1. **Full Stack Debugging**: Monitor FE + BE + Worker simultaneously during job submission
2. **API Development**: Backend logs + API client logs side-by-side
3. **Production Issues**: Compare staging vs production logs
4. **Performance Testing**: Monitor all services during load tests
5. **Multi-Region**: Compare logs from different regions/environments

## UI Mockup (ASCII)

### Phase 1: Horizontal Split Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Panel Toolbar                [+ Add Panel] [Layout: ▼]      │
├──────────────────────────────┬──────────────────────────────┤
│ Panel 1                    X │ Panel 2                    X │
│ Source: [Local - Frontend ▼] │ Source: [Local - Backend  ▼] │
│ ☐ Show metadata    [Copy][X] │ ☐ Show metadata    [Copy][X] │
│ ────────────────────────────│ ──────────────────────────── │
│ User clicked submit button   │ POST /api/jobs received      │
│ Validating form data...      │ Validating request payload   │
│ Form validation passed       │ Calling worker service...    │
│ Sending API call to /jobs    │ Job enqueued: job-123        │
│                              │ Returning success response   │
│                              │                              │
│ ↑ Clean messages only!       │ ↑ No timestamps/levels       │
└──────────────────────────────┴──────────────────────────────┘

With metadata enabled (☑ Show metadata):
┌──────────────────────────────────────────────────────────────┐
│ [2025-10-21 04:00:00] INFO [frontend] User clicked submit    │
│ [2025-10-21 04:00:01] DEBUG [frontend] Validating form...    │
│ [2025-10-21 04:00:01] INFO [frontend] Form validation passed │
└──────────────────────────────────────────────────────────────┘
```

### Phase 2: Drag & Resize

```
┌─────────────────────────────────────────────────────────────┐
│ ⋮⋮ Panel 1 (Frontend)      X │ ⋮⋮ Panel 2 (Backend)       X │
│                              ┊                              │
│ <─────── Resizable ──────────┼──────────────────>          │
│                              ┊                              │
├──────────────────────────────┴──────────────────────────────┤
│ ⋮⋮ Panel 3 (Worker)                                       X │
│                                                              │
│ <─────────────── Draggable ───────────────────>            │
└─────────────────────────────────────────────────────────────┘
```

## Related Issues

- APP-MONITOR-5 — Logs viewer (enhances this component)
- APP-MONITOR-CONSOLIDATE-1 — Centralized scripts (complementary UX improvement)

## Future Enhancements (Post Phase 2)

- [ ] Search across all visible panels simultaneously
- [ ] Highlight matching logs across panels
- [ ] Sync scroll across panels (optional toggle)
- [ ] Diff view (compare two panels side-by-side)
- [ ] Timeline view (correlate logs by timestamp)
- [ ] Custom panel types (metrics, not just logs)
- [ ] Share layout URLs (encode layout in URL params)
- [ ] Mobile-responsive stacking
- [ ] Keyboard shortcuts (Ctrl+1/2/3 to focus panels)

## Technical Considerations

### Performance

- Each panel maintains its own socket connection
- Implement virtualization for long log lists
- Debounce resize events
- Lazy render off-screen panels

### State Management

- Use React Context for panel state
- Consider Zustand for complex state (if needed)
- LocalStorage for persistence

### Accessibility

- ARIA labels for panels
- Keyboard navigation between panels
- Focus management during drag/drop
- Screen reader announcements

## Testing Checklist

- [ ] Add 1-4 panels successfully
- [ ] Remove panels individually
- [ ] Each panel shows different source correctly
- [ ] Filters work independently per panel
- [ ] Pause/resume works per panel
- [ ] Layout templates apply correctly
- [ ] Panel state persists across reload
- [ ] **Log parsing: Messages display without metadata by default**
- [ ] **Log parsing: JSON logs parsed correctly**
- [ ] **Log parsing: Text logs parsed correctly**
- [ ] **Log parsing: Toggle shows/hides metadata**
- [ ] **Copy: Ctrl+C copies selected text**
- [ ] **Copy: Ctrl+C does NOT clear the panel**
- [ ] **Copy: Text selection works across all log lines**
- [ ] **Copy: Copy All button works and shows feedback**
- [ ] **Copy: Copied text preserves formatting**
- [ ] **Copy: Can select and copy partial log lines**
- [ ] Drag panels to reorder (Phase 2)
- [ ] Resize panels (Phase 2)
- [ ] Save/load custom layouts (Phase 2)
- [ ] Export/import layouts (Phase 2)
- [ ] Mobile view (stacks panels)
- [ ] Keyboard navigation works

## Dependencies Installation

```bash
cd app-monitor/frontend

# Phase 1 (no new dependencies needed)

# Phase 2
npm install react-grid-layout
npm install --save-dev @types/react-grid-layout
```

## Notes

### Log Parsing Strategy

The log parser intelligently handles multiple log formats:

**Supported Formats:**

1. **JSON logs** - Extracts `message` or `msg` field

   ```json
   {"timestamp":"2025-10-21T04:00:00Z","level":"INFO","message":"Processing job"}
   → "Processing job"
   ```

2. **Structured text** - Parses common patterns

   ```
   [2025-10-21 04:00:00] INFO [frontend] User clicked submit
   → "User clicked submit"
   ```

3. **Simple prefixed** - Strips level prefixes

   ```
   INFO: Form validation passed
   → "Form validation passed"
   ```

4. **Plain text** - Returns as-is
   ```
   Processing complete
   → "Processing complete"
   ```

**Why Clean Display Matters:**

- Reduces visual noise during debugging
- Easier to scan multiple panels simultaneously
- Focuses attention on actual log content
- Metadata still available via toggle when needed

### Copy Functionality Details

**Current Issue (to fix):**

- Ctrl+C currently clears the panel (wrong behavior)
- No way to copy log snippets for sharing/documentation

**Solution:**

- Set `user-select: text` on all log containers
- Remove any event handlers that interfere with Ctrl+C
- Let browser's native copy mechanism work
- Add "Copy All" button for convenience
- Visual feedback (checkmark) when copied

**Copy Use Cases:**

1. Copy specific error messages for bug reports
2. Share log snippets with team members
3. Paste logs into documentation
4. Save interesting log sequences for analysis

### Implementation Priority

- Phase 1 is immediately useful (2 days)
- **Log parsing and copy are critical** (part of Phase 1)
- Phase 2 adds polish but is optional
- Start with Phase 1, get feedback, then decide on Phase 2
- Consider performance with 4+ simultaneous socket connections
- Test with real debugging scenarios
- Get developer feedback on layout presets needed
