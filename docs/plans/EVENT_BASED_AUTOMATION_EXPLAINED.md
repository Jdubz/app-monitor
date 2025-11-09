# Event-Based Automation Explained

## What is Event-Based?

**Event-Based** means automation is triggered by **specific things happening** (events), not by time schedules.

### Event-Based (What You Have)
```
Something happens → Automation responds
```

**Examples:**
- PR is created → Auto-review starts
- CI test fails → Auto-create repair task
- File changes → Rebuild happens
- User clicks button → Action executes

### Time-Based (What You DON'T Want)
```
Clock hits specific time → Automation runs
```

**Examples:**
- Every day at 3am → Run cleanup
- Every hour → Check for updates
- Every 5 minutes → Poll for changes

---

## Event-Based in Your Dev-Bots System

Your system already uses event-based triggers extensively:

### 1. **Task Queue Events**
```typescript
// When task status changes
task.status = 'completed' → emit('task.completed')
task.status = 'failed'    → emit('task.failed')

// Your system listens and responds:
on('task.completed', (task) => {
  if (task.pr_number) {
    prMonitor.checkStatus(task.pr_number);
  }
});
```

### 2. **GitHub Webhook Events**
```yaml
# GitHub sends webhook when:
- pull_request opened
- pull_request_review submitted
- check_run completed
- push to branch

# Your server receives webhook → processes event
```

### 3. **PR Workflow Events**
```typescript
// PR Orchestrator emits events:
PR created        → Start monitoring
Checks pass       → Attempt auto-merge
Checks fail       → Create repair task
Review requested  → Notify learning system
```

### 4. **Container Lifecycle Events**
```typescript
// Docker events:
Container started  → Log execution start
Container exited   → Parse output, update task
Container failed   → Trigger recovery
```

---

## How to Add More Automation (Event-Based)

The key is to identify **what events already exist** and **what actions should trigger**.

### Architecture Pattern

```
┌─────────────────────┐
│   Event Source      │
│  (already exists)   │
└──────────┬──────────┘
           │
           │ emits event
           ▼
┌─────────────────────┐
│   Event Listener    │
│   (you create)      │
└──────────┬──────────┘
           │
           │ triggers action
           ▼
┌─────────────────────┐
│   Automation        │
│   (API call/task)   │
└─────────────────────┘
```

---

## Concrete Automation Examples

### Example 1: Auto-Create Task When PR Check Fails

**Event:** GitHub webhook `check_run.completed` with `conclusion: 'failure'`

**Implementation:**
```typescript
// backend/src/routes/webhooks.ts

router.post('/webhooks/github', async (req, res) => {
  const event = req.body;
  
  // Event: Check run failed
  if (event.action === 'completed' && 
      event.check_run.conclusion === 'failure') {
    
    const prNumber = event.check_run.pull_requests[0]?.number;
    
    // Automation: Create repair task
    await devBotsManager.addTask({
      type: 'bug',
      title: `Fix failing checks in PR #${prNumber}`,
      documentation: `CI checks failed: ${event.check_run.name}`,
      acceptanceCriteria: ['All checks pass'],
      followup_for_pr: prNumber
    });
    
    logger.info({
      category: 'automation',
      action: 'auto_task_created',
      message: `Auto-created repair task for PR #${prNumber}`
    });
  }
  
  res.json({ received: true });
});
```

**Setup:**
```bash
# Configure GitHub webhook
# Repository Settings → Webhooks → Add webhook
# URL: https://your-domain.com/api/webhooks/github
# Events: Check runs, Pull requests
```

---

### Example 2: Auto-Review When PR is Ready

**Event:** GitHub webhook `pull_request.labeled` with label `ready-for-review`

**Implementation:**
```typescript
router.post('/webhooks/github', async (req, res) => {
  const event = req.body;
  
  // Event: PR labeled "ready-for-review"
  if (event.action === 'labeled' && 
      event.label.name === 'ready-for-review') {
    
    const pr = event.pull_request;
    
    // Automation: Create review task
    await devBotsManager.addTask({
      type: 'review',
      title: `Review PR #${pr.number}: ${pr.title}`,
      documentation: `Review changes in ${pr.html_url}`,
      acceptanceCriteria: [
        'Code quality verified',
        'No security issues',
        'Tests are adequate'
      ],
      assignedAgent: 'code-reviewer',
      pr_number: pr.number,
      pr_url: pr.html_url
    });
  }
  
  res.json({ received: true });
});
```

---

### Example 3: Auto-Documentation When Files Change

**Event:** GitHub webhook `push` with changes to `/backend/src/`

**Implementation:**
```typescript
router.post('/webhooks/github', async (req, res) => {
  const event = req.body;
  
  // Event: Push to main branch
  if (event.ref === 'refs/heads/main') {
    const commits = event.commits;
    
    // Check if code files changed
    const codeFiles = commits.flatMap(c => 
      [...c.added, ...c.modified]
    ).filter(f => 
      f.startsWith('backend/src/') && f.endsWith('.ts')
    );
    
    if (codeFiles.length > 0) {
      // Automation: Create documentation task
      await devBotsManager.addTask({
        type: 'documentation',
        title: 'Update documentation for recent code changes',
        documentation: `Code files changed: ${codeFiles.join(', ')}`,
        acceptanceCriteria: [
          'README updated if public APIs changed',
          'JSDoc comments added to new functions',
          'Architecture docs reflect new structure'
        ],
        assignedAgent: 'documentation-specialist',
        files: codeFiles
      });
    }
  }
  
  res.json({ received: true });
});
```

---

### Example 4: Auto-Cleanup After Task Completion

**Event:** Internal event `task.completed` with status `merged`

**Implementation:**
```typescript
// backend/src/services/devBotsManager.ts

class DevBotsManager extends EventEmitter {
  
  async completeTask(taskId: string) {
    const task = this.getTask(taskId);
    
    // Mark as completed
    await this.taskQueue.updateTask(taskId, { 
      status: 'completed' 
    });
    
    // Emit event
    this.emit('task.completed', task);
  }
}

// Listen for event
devBotsManager.on('task.completed', async (task) => {
  
  // Event: Task with PR was completed
  if (task.pr_number && task.pr_status === 'merged') {
    
    // Automation: Create cleanup task
    await devBotsManager.addTask({
      type: 'maintenance',
      title: `Cleanup after PR #${task.pr_number}`,
      documentation: 'Delete feature branch, archive artifacts',
      acceptanceCriteria: [
        'Feature branch deleted',
        'Old artifacts archived',
        'Metrics recorded'
      ],
      assignedAgent: 'devops-engineer'
    });
  }
});
```

---

### Example 5: Auto-Scale Based on Queue Depth

**Event:** Internal event `queue.depth.changed`

**Implementation:**
```typescript
// backend/src/services/taskQueue.sqlite.ts

class TaskQueueService extends EventEmitter {
  
  async addTask(task: Task) {
    // Add to queue
    const result = await this.db.run('INSERT INTO tasks ...');
    
    // Check queue depth
    const queueDepth = await this.getQueueDepth();
    
    // Emit event with depth
    this.emit('queue.depth.changed', queueDepth);
    
    return result;
  }
}

// Listen for event
taskQueue.on('queue.depth.changed', async (depth) => {
  
  // Event: Queue is backing up
  if (depth.pending > 10) {
    
    logger.warn({
      category: 'automation',
      action: 'high_queue_depth',
      message: `Queue depth high: ${depth.pending} pending tasks`
    });
    
    // Automation: Create triage task
    await devBotsManager.addTask({
      type: 'triage',
      title: 'Triage high-priority tasks',
      documentation: `${depth.pending} tasks pending, prioritize critical work`,
      acceptanceCriteria: [
        'Top 5 tasks prioritized',
        'Low-priority tasks deferred or combined'
      ],
      assignedAgent: 'project-manager',
      priority: 10 // High priority
    });
  }
});
```

---

## Event Sources in Your System

### 1. GitHub Webhooks (External Events)
- `pull_request` - PR opened, closed, labeled, etc.
- `pull_request_review` - Review submitted, approved
- `check_run` - CI checks completed
- `push` - Code pushed to branch
- `issues` - Issue opened, closed, labeled

### 2. Task Queue Events (Internal)
- `task.created`
- `task.assigned`
- `task.started`
- `task.completed`
- `task.failed`
- `queue.depth.changed`

### 3. PR Workflow Events (Internal)
- `pr.created`
- `pr.checks.completed`
- `pr.review.submitted`
- `pr.merged`
- `pr.closed`

### 4. Container Events (Internal)
- `container.started`
- `container.exited`
- `container.failed`
- `container.timeout`

### 5. Learning System Events (Internal)
- `pattern.detected`
- `confidence.threshold.reached`
- `quality.score.updated`

---

## How to Implement Event-Based Automation

### Step 1: Identify the Event
**Question:** What specific thing happening should trigger automation?

Examples:
- "When a PR gets 2 approvals"
- "When CI fails 3 times in a row"
- "When a task takes longer than 30 minutes"

### Step 2: Set Up Event Listener

**Option A: GitHub Webhook**
```typescript
// backend/src/routes/webhooks.ts
router.post('/webhooks/github', (req, res) => {
  const event = req.body;
  // Handle event
});
```

**Option B: Internal Event Emitter**
```typescript
// backend/src/services/someService.ts
this.emit('custom.event', data);

// backend/src/services/automationListener.ts
someService.on('custom.event', (data) => {
  // Handle event
});
```

### Step 3: Define the Automation Action
**Question:** What should happen when the event occurs?

Examples:
- Create a task
- Update task status
- Send notification
- Call external API
- Update metrics

### Step 4: Implement the Handler
```typescript
async function handleEvent(eventData) {
  // 1. Validate event
  if (!isValidEvent(eventData)) return;
  
  // 2. Extract relevant data
  const context = extractContext(eventData);
  
  // 3. Execute automation
  await executeAutomation(context);
  
  // 4. Log result
  logger.info({
    category: 'automation',
    action: 'event_handled',
    details: context
  });
}
```

---

## Best Practices for Event-Based Automation

### 1. **Idempotency**
Event might fire multiple times - make sure your automation can handle that:
```typescript
// Bad: Creates duplicate tasks
async function onPRCreated(pr) {
  await createReviewTask(pr.number);
}

// Good: Checks if task already exists
async function onPRCreated(pr) {
  const existing = await findTaskByPR(pr.number);
  if (!existing) {
    await createReviewTask(pr.number);
  }
}
```

### 2. **Error Handling**
Don't let one bad event crash the system:
```typescript
eventEmitter.on('some.event', async (data) => {
  try {
    await handleEvent(data);
  } catch (error) {
    logger.error({
      category: 'automation',
      action: 'event_handler_failed',
      error
    });
    // Don't throw - just log and continue
  }
});
```

### 3. **Rate Limiting**
Prevent event storms from overwhelming the system:
```typescript
const rateLimiter = new Map();

async function handleEvent(data) {
  const key = `${data.type}:${data.id}`;
  const lastRun = rateLimiter.get(key);
  
  // Only run once per minute
  if (lastRun && Date.now() - lastRun < 60000) {
    return;
  }
  
  rateLimiter.set(key, Date.now());
  await executeAutomation(data);
}
```

### 4. **Async Processing**
Don't block event processing:
```typescript
// Bad: Webhook times out waiting for task
router.post('/webhooks/github', async (req, res) => {
  await createTask(req.body); // Might take 10 seconds
  res.json({ ok: true });
});

// Good: Queue the work, respond immediately
router.post('/webhooks/github', async (req, res) => {
  // Respond to GitHub immediately
  res.json({ ok: true });
  
  // Process asynchronously
  setImmediate(async () => {
    await createTask(req.body);
  });
});
```

---

## Debugging Event-Based Systems

### Log Everything
```typescript
logger.info({
  category: 'event',
  action: 'received',
  event: event.type,
  details: event.data
});

logger.info({
  category: 'event',
  action: 'processing',
  event: event.type
});

logger.info({
  category: 'event',
  action: 'completed',
  event: event.type,
  duration: Date.now() - startTime
});
```

### Use Event Tracing
```typescript
// Add correlation ID to track event chain
const correlationId = generateId();

this.emit('task.created', { 
  task, 
  correlationId 
});

// Later events reference same ID
this.emit('task.started', { 
  task, 
  correlationId 
});
```

### Monitor Event Queues
```typescript
// Track events waiting to be processed
const eventQueue = [];

setInterval(() => {
  logger.info({
    category: 'monitoring',
    action: 'event_queue_depth',
    depth: eventQueue.length
  });
}, 60000);
```

---

## Summary

**Event-Based = Reactive**
- Something happens → System responds
- No schedules, no polling, no cron jobs
- Efficient: only runs when needed
- Scalable: handles high event volume

**Your System Already Does This**
- GitHub webhooks trigger PR workflows
- Task status changes trigger PR monitoring
- Container exit triggers task completion
- Failures trigger recovery tasks

**To Add More Automation**
1. Identify the event (what happens?)
2. Set up listener (how to detect it?)
3. Define action (what to do?)
4. Implement handler (make it happen)

**Key Benefit**
Event-based automation is **immediate** and **efficient** - it responds exactly when needed, not on arbitrary schedules.
