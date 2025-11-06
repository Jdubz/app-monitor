# 📊 Worker Activity Visualization System

## 🎯 **Current Status**

### **Workers Status:**

- **Worker A**: Idle (last seen: 2025-10-23T04:55:16)
- **Worker B**: Idle (last seen: 2025-10-23T04:55:16)
- **Pending Tasks**: 1 (Linting cleanup task)
- **Issue**: Task assignment not working properly

## 🖥️ **Visualization System Design**

### **1. Real-Time Activity Dashboard**

```javascript
class WorkerActivityVisualizer {
  constructor() {
    this.activityLog = [];
    this.codebaseChanges = new Map();
    this.workerMetrics = {
      "worker-a": { tasksCompleted: 0, linesChanged: 0, filesModified: 0 },
      "worker-b": { tasksCompleted: 0, linesChanged: 0, filesModified: 0 },
    };
  }

  // Track worker activity
  trackActivity(workerId, activity) {
    this.activityLog.push({
      timestamp: Date.now(),
      workerId,
      activity,
      type: activity.type,
    });

    // Update metrics
    if (activity.type === "task_completed") {
      this.workerMetrics[workerId].tasksCompleted++;
      this.workerMetrics[workerId].linesChanged += activity.linesChanged || 0;
      this.workerMetrics[workerId].filesModified += activity.filesModified || 0;
    }
  }

  // Generate activity report
  generateActivityReport() {
    return {
      currentStatus: this.getCurrentStatus(),
      recentActivity: this.getRecentActivity(10),
      workerMetrics: this.workerMetrics,
      codebaseChanges: this.getCodebaseChanges(),
      performanceMetrics: this.getPerformanceMetrics(),
    };
  }
}
```

### **2. Codebase Change Tracking**

```javascript
class CodebaseChangeTracker {
  constructor() {
    this.changeHistory = [];
    this.fileModifications = new Map();
    this.dependencyChanges = new Map();
  }

  // Track file changes
  trackFileChange(workerId, filePath, changeType, linesChanged) {
    const change = {
      timestamp: Date.now(),
      workerId,
      filePath,
      changeType, // 'created', 'modified', 'deleted'
      linesChanged,
      scope: this.analyzeScope(filePath, changeType),
    };

    this.changeHistory.push(change);

    // Update file modification tracking
    if (!this.fileModifications.has(filePath)) {
      this.fileModifications.set(filePath, []);
    }
    this.fileModifications.get(filePath).push(change);
  }

  // Analyze change scope
  analyzeScope(filePath, changeType) {
    const scopes = {
      core: /(?:core|src|lib)/,
      tests: /(?:test|spec|__tests__)/,
      docs: /(?:docs|documentation|README)/,
      config: /(?:config|\.json|\.yml|\.yaml)/,
      docker: /(?:docker|Dockerfile)/,
    };

    for (const [scope, pattern] of Object.entries(scopes)) {
      if (pattern.test(filePath)) {
        return scope;
      }
    }
    return "other";
  }

  // Generate change visualization
  generateChangeVisualization() {
    return {
      changeTimeline: this.changeHistory.slice(-50),
      fileActivity: this.getFileActivity(),
      scopeDistribution: this.getScopeDistribution(),
      workerContribution: this.getWorkerContribution(),
    };
  }
}
```

### **3. Real-Time Monitoring Dashboard**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Claude Workers Activity Dashboard</title>
    <style>
      .dashboard {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding: 20px;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }

      .worker-status {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 8px;
        border-left: 4px solid #007acc;
      }

      .worker-active {
        border-left-color: #28a745;
      }

      .worker-busy {
        border-left-color: #ffc107;
      }

      .worker-error {
        border-left-color: #dc3545;
      }

      .activity-log {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        max-height: 400px;
        overflow-y: auto;
      }

      .activity-item {
        padding: 8px;
        margin: 5px 0;
        border-radius: 4px;
        background: white;
        border-left: 3px solid #007acc;
      }

      .activity-task {
        border-left-color: #28a745;
      }

      .activity-cleanup {
        border-left-color: #ffc107;
      }

      .activity-error {
        border-left-color: #dc3545;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 20px 0;
      }

      .metric-card {
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        text-align: center;
      }

      .metric-value {
        font-size: 2em;
        font-weight: bold;
        color: #007acc;
      }

      .metric-label {
        color: #666;
        margin-top: 5px;
      }
    </style>
  </head>
  <body>
    <div class="dashboard">
      <div class="worker-status" id="worker-a-status">
        <h3>Worker A</h3>
        <p>Status: <span id="worker-a-status-text">Idle</span></p>
        <p>Current Task: <span id="worker-a-task">None</span></p>
        <p>Last Seen: <span id="worker-a-lastseen">Never</span></p>
      </div>

      <div class="worker-status" id="worker-b-status">
        <h3>Worker B</h3>
        <p>Status: <span id="worker-b-status-text">Idle</span></p>
        <p>Current Task: <span id="worker-b-task">None</span></p>
        <p>Last Seen: <span id="worker-b-lastseen">Never</span></p>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value" id="total-tasks">0</div>
          <div class="metric-label">Total Tasks</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="active-tasks">0</div>
          <div class="metric-label">Active Tasks</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="completed-tasks">0</div>
          <div class="metric-label">Completed Tasks</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="scope-violations">0</div>
          <div class="metric-label">Scope Violations</div>
        </div>
      </div>

      <div class="activity-log">
        <h3>Recent Activity</h3>
        <div id="activity-list">
          <div class="activity-item">No recent activity</div>
        </div>
      </div>
    </div>

    <script>
      class ActivityDashboard {
        constructor() {
          this.updateInterval = 5000; // 5 seconds
          this.startMonitoring();
        }

        async startMonitoring() {
          await this.updateDashboard();
          setInterval(() => this.updateDashboard(), this.updateInterval);
        }

        async updateDashboard() {
          try {
            // Fetch worker status
            const statusResponse = await fetch("/api/status");
            const status = await statusResponse.json();

            // Fetch task queue
            const tasksResponse = await fetch("/api/tasks");
            const tasks = await tasksResponse.json();

            // Fetch scope violations
            const violationsResponse = await fetch("/api/scope-violations");
            const violations = await violationsResponse.json();

            // Update UI
            this.updateWorkerStatus(status.workers);
            this.updateTaskMetrics(tasks);
            this.updateScopeViolations(violations);
            this.updateActivityLog(tasks.completed);
          } catch (error) {
            console.error("Failed to update dashboard:", error);
          }
        }

        updateWorkerStatus(workers) {
          Object.entries(workers).forEach(([workerId, worker]) => {
            const statusElement = document.getElementById(`${workerId}-status`);
            const statusTextElement = document.getElementById(
              `${workerId}-status-text`,
            );
            const taskElement = document.getElementById(`${workerId}-task`);
            const lastSeenElement = document.getElementById(
              `${workerId}-lastseen`,
            );

            // Update status
            statusTextElement.textContent = worker.status;
            taskElement.textContent = worker.currentTask || "None";
            lastSeenElement.textContent = new Date(
              worker.lastSeen,
            ).toLocaleString();

            // Update styling
            statusElement.className = `worker-status worker-${worker.status}`;
          });
        }

        updateTaskMetrics(tasks) {
          document.getElementById("total-tasks").textContent =
            tasks.pending.length + tasks.active.length + tasks.completed.length;
          document.getElementById("active-tasks").textContent =
            tasks.active.length;
          document.getElementById("completed-tasks").textContent =
            tasks.completed.length;
        }

        updateScopeViolations(violations) {
          document.getElementById("scope-violations").textContent =
            violations.total;
        }

        updateActivityLog(completedTasks) {
          const activityList = document.getElementById("activity-list");
          const recentTasks = completedTasks.slice(-10).reverse();

          if (recentTasks.length === 0) {
            activityList.innerHTML =
              '<div class="activity-item">No recent activity</div>';
            return;
          }

          activityList.innerHTML = recentTasks
            .map((task) => {
              const activityClass = this.getActivityClass(task);
              const timestamp = new Date(
                task.completedAt || task.createdAt,
              ).toLocaleString();

              return `
                        <div class="activity-item ${activityClass}">
                            <strong>${task.type.toUpperCase()}</strong> - ${task.description.substring(0, 100)}...
                            <br><small>${timestamp} | ${task.assignedWorker || "Unassigned"}</small>
                        </div>
                    `;
            })
            .join("");
        }

        getActivityClass(task) {
          if (task.status === "scope_violation") return "activity-error";
          if (task.isPeriodicCleanup) return "activity-cleanup";
          if (task.status === "completed") return "activity-task";
          return "";
        }
      }

      // Initialize dashboard
      new ActivityDashboard();
    </script>
  </body>
</html>
```

### **4. Codebase Change Visualization**

```javascript
class CodebaseVisualizer {
  constructor() {
    this.changeMap = new Map();
    this.dependencyGraph = new Map();
  }

  // Track code changes
  trackCodeChange(workerId, filePath, changes) {
    const change = {
      timestamp: Date.now(),
      workerId,
      filePath,
      changes: changes,
      impact: this.analyzeImpact(changes),
    };

    if (!this.changeMap.has(filePath)) {
      this.changeMap.set(filePath, []);
    }
    this.changeMap.get(filePath).push(change);
  }

  // Analyze change impact
  analyzeImpact(changes) {
    return {
      linesAdded: changes.added || 0,
      linesRemoved: changes.removed || 0,
      filesModified: changes.files || 0,
      complexity: this.calculateComplexity(changes),
      risk: this.assessRisk(changes),
    };
  }

  // Generate visualization data
  generateVisualization() {
    return {
      fileActivity: this.getFileActivity(),
      workerContribution: this.getWorkerContribution(),
      changeTimeline: this.getChangeTimeline(),
      impactAnalysis: this.getImpactAnalysis(),
    };
  }
}
```

## 🚀 **Implementation Plan**

### **Phase 1: Basic Activity Monitoring**

1. **Real-Time Dashboard**: HTML dashboard with worker status
2. **Activity Logging**: Track all worker activities
3. **Basic Metrics**: Task counts, completion rates, scope violations

### **Phase 2: Advanced Visualization**

1. **Codebase Change Tracking**: File modification tracking
2. **Dependency Analysis**: Impact analysis of changes
3. **Performance Metrics**: Worker efficiency and quality metrics

### **Phase 3: Interactive Visualization**

1. **Interactive Charts**: D3.js or Chart.js visualizations
2. **Real-Time Updates**: WebSocket connections for live updates
3. **Historical Analysis**: Trend analysis and reporting

## 📊 **Current Issues to Fix**

1. **Task Assignment**: Workers are idle but tasks aren't being assigned
2. **Activity Tracking**: No real-time activity monitoring
3. **Change Tracking**: No codebase change visualization
4. **Performance Metrics**: No worker performance tracking

Let me fix the task assignment issue first, then implement the visualization system!
