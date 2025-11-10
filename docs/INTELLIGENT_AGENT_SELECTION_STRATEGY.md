# Intelligent Agent Selection Strategy

**Date:** 2025-11-10T20:15:00Z  
**Status:** ✅ IMPLEMENTED (Phase 0 Complete)  
**Priority:** P0 (Blocks effective automation)  
**Owner:** Platform Tooling Team

---

## Problem Statement

**Previous State:** AgentTypeManager used simple rotation strategies (alternate, random, claude-only, codex-only) without considering task requirements or agent capabilities.

**✅ RESOLVED:** Now using `AgentSelector` with intelligent, rule-based selection that considers task category, complexity, and agent capabilities.

**Issue:** Not all agents are good at all tasks:
- **Codex** is bad at editing files (especially code) but great for analysis, review, planning, documentation
- **Claude** excels at code implementation and file editing
- **Copilot** (async delegation via `/delegate`) best for low-risk polish tasks (docs, formatting, deterministic fixes)

**Impact:** Wrong agent selection leads to:
- Failed tasks that could have succeeded with right agent
- Wasted API tokens on unsuitable agent
- Poor automation success rates
- Frustration when tasks retry with same wrong agent

---

## Agent Capabilities Matrix

### Claude (Sonnet 3.5)
**Best For:**
- ✅ Code implementation
- ✅ File editing (especially code)
- ✅ Complex multi-file changes
- ✅ Refactoring
- ✅ Bug fixes
- ✅ Feature implementation
- ✅ Test writing

**Poor For:**
- ❌ High-level analysis (gets too deep into details)
- ❌ Documentation-only tasks (overkill, expensive)

**Characteristics:**
- CLI tool: `claude`
- Container image: `dev-bot-claude:latest`
- Token cost: High (~$3-15/task)
- Speed: Fast (streaming)
- File editing: Excellent (uses search/replace)

---

### Codex (GPT-4)
**Best For:**
- ✅ Code analysis and review
- ✅ Planning and architecture
- ✅ Documentation writing
- ✅ API interactions
- ✅ CLI tooling usage
- ✅ Investigation and research
- ✅ Security analysis
- ✅ Test strategy planning

**Poor For:**
- ❌ Direct file editing (especially code)
- ❌ Complex refactoring
- ❌ Multi-file implementations

**Characteristics:**
- CLI tool: `codex`
- Container image: `dev-bot-codex:latest`
- Token cost: Medium (~$1-5/task)
- Speed: Moderate
- File editing: Limited (non-interactive only)
- Strengths: Analysis, planning, documentation

---

### GitHub Copilot (Asynchronous Delegation)
**Best For:**
- ✅ Documentation polish
- ✅ Code formatting
- ✅ Comment improvements
- ✅ Simple README updates
- ✅ Deterministic test fixes
- ✅ Low-risk refactoring

**Poor For:**
- ❌ Complex features
- ❌ Architecture changes
- ❌ Database migrations
- ❌ Security-sensitive changes

**Characteristics:**
- Method: `/delegate` comment on PR
- Cost: Free (GitHub Copilot subscription)
- Speed: Slow (async, minutes to hours)
- File editing: Good (GitHub UI-based)
- Gating: Requires human to issue `/delegate` command

---

## Intelligent Selection Logic

### Decision Tree

```
1. CHECK TASK TYPE
   ├─ "documentation" → Codex (or Copilot delegation if low-risk)
   ├─ "analysis" → Codex
   ├─ "review" → Codex
   ├─ "planning" → Codex
   ├─ "implementation" → Claude
   ├─ "bugfix" → Claude
   ├─ "refactoring" → Claude
   └─ "testing" → Claude (implementation) or Codex (strategy)

2. CHECK FILE PATTERNS
   ├─ "*.md" files only → Codex or Copilot
   ├─ "*.ts/*.js" files → Claude
   ├─ "*.sql" files → Claude (if DDL/DML) or Codex (if analysis)
   └─ Multiple file types → Claude

3. CHECK TASK COMPLEXITY
   ├─ Simple (1-2 files, <100 lines) → Copilot delegation (if PR exists)
   ├─ Medium (3-5 files, <500 lines) → Claude
   └─ Complex (>5 files, >500 lines) → Claude

4. CHECK TASK KEYWORDS
   ├─ Contains "analyze", "review", "investigate" → Codex
   ├─ Contains "implement", "add", "create", "fix" → Claude
   ├─ Contains "document", "explain", "describe" → Codex
   └─ Contains "polish", "format", "cleanup" → Copilot or Codex
```

---

## Implementation Status

### ✅ Phase 1: Task Classification System
**Status:** COMPLETE (2025-11-10)

**Completed:**
- ✅ Added classification fields to tasks table (`task_category`, `file_patterns`, `estimated_complexity`, `preferred_agent`, `classification_reasoning`)
- ✅ Created TaskClassifier service (`backend/src/services/taskClassifier.ts`)
- ✅ Integrated auto-classification in TaskQueueService.createTask()
- ✅ 17 comprehensive tests (100% coverage)

**Implementation Details:**
- Category inference using regex keyword matching
- File pattern extraction from task description
- Complexity estimation based on file count and scope keywords
- Preferred agent suggestion based on classification
- Detailed reasoning logged for audit trail

**Files:**
- `backend/src/services/taskClassifier.ts` (270 lines)
- `backend/tests/taskClassifier.test.ts` (570 lines, 17 tests)
- `backend/migrations/007_add_task_classification.sql`

---

### ✅ Phase 2: Intelligent AgentSelector
**Status:** COMPLETE (2025-11-10)

**Completed:**
- ✅ Created AgentSelector service (`backend/src/services/agentSelector.ts`)
- ✅ Integrated with TaskExecutionService for intelligent selection
- ✅ 20 comprehensive tests (100% coverage)
- ✅ 9 intelligent selection rules implemented

**Selection Rules:**
1. Documentation tasks → Codex
2. Analysis/Planning/Review → Codex
3. Markdown-only files → Codex
4. Code files (.ts/.js/.py) → Claude
5. Previous agent failure → Try alternate agent
6. Complex tasks → Claude
7. Fallback for CodexAgent → Claude
8. Explicit preferred_agent → Use preferred
9. Default fallback → Claude

**Implementation Details:**
- Rule-based selection (O(9) constant time)
- Considers task classification, file patterns, complexity, retry history
- Logs detailed selection reasoning
- Handles edge cases and fallbacks

**Files:**
- `backend/src/services/agentSelector.ts` (280 lines)
- `backend/tests/agentSelector.test.ts` (700 lines, 20 tests)

---

### 🔄 Phase 3: Learning & Optimization (Future)
**Status:** PLANNED for Phase 0.5

**Goals:**
- Track success rates by agent/category
- Optimize rules based on historical data
- Add machine learning for pattern detection
- Monitor classification accuracy

---

## Original Implementation Plan

### Phase 1: Task Classification System (2-3 days) - ✅ COMPLETE

**Goal:** Add intelligent classification to TaskQueue

**Tasks:**
1. **Add classification fields to tasks table**
   ```sql
   ALTER TABLE tasks ADD COLUMN task_category TEXT 
     CHECK(task_category IN ('implementation', 'analysis', 'documentation', 'review', 'planning'));
   ALTER TABLE tasks ADD COLUMN file_patterns TEXT; -- JSON array
   ALTER TABLE tasks ADD COLUMN estimated_complexity TEXT 
     CHECK(estimated_complexity IN ('simple', 'medium', 'complex'));
   ```

2. **Create TaskClassifier service**
   ```typescript
   export class TaskClassifier {
     classifyTask(task: Task): TaskClassification {
       const category = this.inferCategory(task);
       const filePatterns = this.extractFilePatterns(task);
       const complexity = this.estimateComplexity(task);
       
       return { category, filePatterns, complexity };
     }
     
     private inferCategory(task: Task): TaskCategory {
       const title = task.title.toLowerCase();
       const description = task.description.toLowerCase();
       const combined = `${title} ${description}`;
       
       // Keyword matching
       if (/\b(analyze|review|investigate|audit)\b/.test(combined)) {
         return 'analysis';
       }
       if (/\b(document|explain|describe|write.*docs?)\b/.test(combined)) {
         return 'documentation';
       }
       if (/\b(plan|design|architect|spec)\b/.test(combined)) {
         return 'planning';
       }
       if (/\b(implement|add|create|build|develop)\b/.test(combined)) {
         return 'implementation';
       }
       if (/\b(fix|bug|issue|error)\b/.test(combined)) {
         return 'implementation'; // Bugfixes are implementation
       }
       
       // Default to implementation if unclear
       return 'implementation';
     }
     
     private extractFilePatterns(task: Task): string[] {
       // Parse task description for file mentions
       const fileRegex = /[a-zA-Z0-9_-]+\.(ts|js|md|sql|json|yaml|tsx|jsx)/g;
       const matches = task.description.match(fileRegex) || [];
       
       // Get unique extensions
       const extensions = [...new Set(matches.map(f => f.split('.').pop()).filter((ext): ext is string => ext !== undefined))];
       return extensions;
     }
     
     private estimateComplexity(task: Task): TaskComplexity {
       const description = task.description;
       
       // Count file mentions
       const fileCount = (description.match(/\.(ts|js|md|sql|json)/g) || []).length;
       
       // Estimate lines
       const hasLargeScope = /\b(entire|all|every|multiple.*files?)\b/.test(description);
       
       if (fileCount <= 2 && !hasLargeScope) return 'simple';
       if (fileCount <= 5 && !hasLargeScope) return 'medium';
       return 'complex';
     }
   }
   ```

3. **Classify tasks on creation**
   ```typescript
   // In taskQueue.createTask()
   async createTask(taskData: CreateTaskInput): Promise<Task> {
     const classification = this.classifier.classifyTask(taskData);
     
     const task = {
       ...taskData,
       task_category: classification.category,
       file_patterns: JSON.stringify(classification.filePatterns),
       estimated_complexity: classification.complexity
     };
     
     return await this.db.insert(task);
   }
   ```

**Estimated Time:** 2-3 days

---

### Phase 2: Intelligent AgentSelector (2-3 days)

**Goal:** Replace simple rotation with intelligent selection

**Tasks:**
1. **Create AgentSelector service**
   ```typescript
   export interface AgentSelectionCriteria {
     taskCategory: TaskCategory;
     filePatterns: string[];
     complexity: TaskComplexity;
     previousAttempts?: { agent: AgentType; result: 'success' | 'failure' }[];
   }
   
   export class AgentSelector {
     selectAgent(criteria: AgentSelectionCriteria): AgentType {
       // Rule 1: Documentation → Codex
       if (criteria.taskCategory === 'documentation') {
         return 'codex';
       }
       
       // Rule 2: Analysis/Planning/Review → Codex
       if (['analysis', 'planning', 'review'].includes(criteria.taskCategory)) {
         return 'codex';
       }
       
       // Rule 3: Only markdown files → Codex
       const onlyMarkdown = criteria.filePatterns.every(p => p === 'md');
       if (onlyMarkdown && criteria.filePatterns.length > 0) {
         return 'codex';
       }
       
       // Rule 4: Code files → Claude
       const hasCodeFiles = criteria.filePatterns.some(p => 
         ['ts', 'js', 'tsx', 'jsx', 'py', 'go'].includes(p)
       );
       if (hasCodeFiles) {
         return 'claude';
       }
       
       // Rule 5: Previous failure with agent → Try other agent
       if (criteria.previousAttempts) {
         const lastAttempt = criteria.previousAttempts[criteria.previousAttempts.length - 1];
         if (lastAttempt?.result === 'failure') {
           return lastAttempt.agent === 'claude' ? 'codex' : 'claude';
         }
       }
       
       // Default: Claude for implementation
       return 'claude';
     }
     
     explainSelection(criteria: AgentSelectionCriteria, selected: AgentType): string {
       // Return human-readable explanation of why this agent was chosen
       if (criteria.taskCategory === 'documentation') {
         return `Selected ${selected} because task is documentation (Codex excels at writing docs)`;
       }
       if (selected === 'codex' && criteria.taskCategory === 'analysis') {
         return `Selected ${selected} because task requires analysis (Codex better at high-level review)`;
       }
       if (selected === 'claude' && criteria.filePatterns.some(p => p.includes('ts'))) {
         return `Selected ${selected} because task involves code editing (Claude excels at file editing)`;
       }
       return `Selected ${selected} based on default implementation strategy`;
     }
   }
   ```

2. **Integrate with TaskExecutionService**
   ```typescript
   // In TaskExecutionService.assignTask()
   async assignTask(task: Task): Promise<void> {
     const criteria = {
       taskCategory: task.task_category,
       filePatterns: JSON.parse(task.file_patterns || '[]'),
       complexity: task.estimated_complexity,
       previousAttempts: await this.getTaskExecutionHistory(task.id)
     };
     
     const agentType = this.agentSelector.selectAgent(criteria);
     const explanation = this.agentSelector.explainSelection(criteria, agentType);
     
     logger.info({
       category: 'automation',
       action: 'agent_selected',
       message: explanation,
       details: {
         task_id: task.id,
         agent_type: agentType,
         category: task.task_category,
         complexity: task.estimated_complexity
       }
     });
     
     // Execute with selected agent
     await this.executeWithAgent(task, agentType);
   }
   ```

3. **Add selection metrics**
   - Track success rates by agent + task category
   - Adjust selection logic based on empirical data

**Original Plan:** Replace AgentTypeManager with intelligent selection

**Actual Implementation:**
```typescript
// AgentSelector provides intelligent, rule-based selection
export class AgentSelector {
  selectAgent(criteria: AgentSelectionCriteria): AgentType {
    // 9 intelligent rules considering:
    // - Task category (documentation, analysis, implementation, etc.)
    // - File patterns (.md, .ts, .js, etc.)
    // - Complexity (simple, medium, complex)
    // - Retry history (avoid repeating failures)
    // - Explicit preferences (preferred_agent field)
  }
  
  explainSelection(criteria, selected): string {
    // Returns human-readable reasoning
  }
}
```

**Integration:**
```typescript
// In TaskExecutionService.executeTaskWithDockerRun()
const classification = await this.taskQueue.getTaskClassification(task.id);
const agentType = this.agentSelector.selectAgent({
  taskCategory: classification.task_category,
  filePatterns: JSON.parse(classification.file_patterns || '[]'),
  complexity: classification.estimated_complexity,
  previousAttempts: retryHistory
});

// Logs reasoning and executes with selected agent
```

---

### 🔄 Phase 3: Copilot Delegation Integration (Future)
**Status:** NOT IMPLEMENTED (Low Priority)

**Goal:** Enable async delegation for low-risk tasks

**Tasks:**
1. **Add delegation capability to PRMonitorService**
   ```typescript
   export class PRMonitorService {
     async shouldDelegate(task: Task, pr: PRStatus): boolean {
       // Only delegate simple, low-risk tasks
       return (
         task.estimated_complexity === 'simple' &&
         task.task_category === 'documentation' &&
         pr.status === 'open' &&
         task.priority <= 5 // Low priority
       );
     }
     
     async delegateToCopilot(prNumber: number, task: Task): Promise<void> {
       const instructions = this.buildDelegationInstructions(task);
       
       await this.githubPR.createComment(prNumber, {
         body: `/delegate ${instructions}`
       });
       
       await this.taskQueue.updateTask(task.id, {
         status: 'delegated',
         notes: `Delegated to GitHub Copilot via PR #${prNumber}`
       });
       
       logger.info({
         category: 'delegation',
         action: 'copilot_delegated',
         message: `Delegated task ${task.id} to Copilot on PR #${prNumber}`,
         details: { task_id: task.id, pr_number: prNumber }
       });
     }
   }
   ```

2. **Monitor delegation results**
   - Webhook detects Copilot PR updates
   - Track delegation success/failure rates
   - Auto-escalate to Claude if Copilot fails

**Estimated Time:** 1-2 days

---

### Phase 4: Learning & Optimization (1 day)

**Goal:** Improve selection over time based on outcomes

**Tasks:**
1. **Track agent performance by task category**
   ```sql
   -- Analytics query
   SELECT 
     task_category,
     agent_type,
     COUNT(*) as total,
     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes,
     AVG(duration_ms) as avg_duration
   FROM task_automation_runs
   JOIN tasks ON tasks.id = task_automation_runs.task_id
   GROUP BY task_category, agent_type;
   ```

2. **Adjust selection weights**
   - If Codex fails on documentation → try Claude next time
   - If Claude succeeds 95%+ on bugfixes → increase confidence

3. **Add override mechanism**
   ```typescript
   // Allow manual agent override in task creation
   interface CreateTaskInput {
     // ... existing fields
     preferred_agent?: AgentType; // Override intelligent selection
   }
   ```

**Estimated Time:** 1 day

---

## Timeline Summary

| Phase | Description | Duration |
|-------|-------------|----------|
| 1 | Task Classification | 2-3 days |
| 2 | Intelligent Selection | 2-3 days |
| 3 | Copilot Delegation | 1-2 days |
| 4 | Learning & Optimization | 1 day |

**Total:** 6-9 days (~1.5 weeks)

---

## Integration with Existing Systems

### AgentTypeManager (Existing)
- **Keep:** Basic agent type enum, Docker image mapping
- **Replace:** `chooseAgentType()` logic with `AgentSelector`
- **Extend:** Add `explainSelection()` method

### AgentPersonalities (Existing)
- **Keep:** Personality definitions
- **Use:** `taskPreferences` field to inform selection
- **Extend:** Add codex and copilot personalities

### TaskQueue (Existing)
- **Add:** Classification fields (task_category, file_patterns, complexity)
- **Add:** Classification on task creation
- **Keep:** Existing agent_type tracking

### TaskExecutionService (Existing)
- **Replace:** `agentTypeManager.chooseAgentType()` call
- **Add:** `agentSelector.selectAgent()` call
- **Add:** Selection explanation logging

---

## Success Metrics

**Target Improvements:**
- Automation success rate: 70% → 85%+
- Average retries per task: 1.5 → 0.8
- Documentation task success: 50% → 95% (Codex vs Claude)
- Code implementation success: 75% → 90% (Claude optimization)

**Monitoring:**
- Success rate by agent + category (weekly dashboard)
- Agent selection distribution (ensure not 100% one agent)
- Retry pattern analysis (which agent failed, which succeeded)

---

## Example Selection Scenarios

### Scenario 1: Documentation Task
```
Task: "Update API documentation for new endpoints"
Category: documentation
File Patterns: ["md"]
Complexity: simple

→ Selected: Codex
→ Reason: Documentation tasks, markdown files only
```

### Scenario 2: Bug Fix
```
Task: "Fix login authentication bug in backend"
Category: implementation (bugfix)
File Patterns: ["ts"]
Complexity: medium

→ Selected: Claude
→ Reason: Code editing required, TypeScript files
```

### Scenario 3: Code Review
```
Task: "Review PR #42 for security issues"
Category: review
File Patterns: ["ts", "js"]
Complexity: medium

→ Selected: Codex
→ Reason: Analysis task, security review
```

### Scenario 4: Complex Refactoring
```
Task: "Refactor authentication service to use JWT"
Category: implementation
File Patterns: ["ts", "sql"]
Complexity: complex

→ Selected: Claude
→ Reason: Multi-file code changes, complex implementation
```

### Scenario 5: Simple Docs Polish
```
Task: "Fix typos in README"
Category: documentation
File Patterns: ["md"]
Complexity: simple
PR: #45 (open)

→ Selected: Copilot (delegation)
→ Reason: Simple, low-risk, PR already exists
→ Method: `/delegate Fix typos and improve formatting`
```

---

## Risk Mitigation

**Risk 1:** Agent selection logic too complex
- Mitigation: Start simple (category-based), iterate based on data

**Risk 2:** Classification inaccurate
- Mitigation: Manual override option, learn from corrections

**Risk 3:** Codex still tries to edit files
- Mitigation: Prompt engineering, tool restrictions in container

**Risk 4:** Selection overhead slows task assignment
- Mitigation: Cache classification, async selection

---

## Next Steps

1. **Immediate:** Review this plan with team
2. **Week 1:** Implement Phase 1 (classification)
3. **Week 1-2:** Implement Phase 2 (intelligent selection)
4. **Week 2:** Implement Phase 3 (delegation) + Phase 4 (learning)
5. **Week 3:** Monitor metrics, tune selection logic

---

**Created:** 2025-11-10T20:15:00Z  
**Priority:** P0 (Required for Phase 2 of Dev-Bot Pipeline)  
**Blocks:** Effective automation, success rate improvements  
**Owner:** Platform Tooling Team
