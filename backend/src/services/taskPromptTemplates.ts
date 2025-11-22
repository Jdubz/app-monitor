/**
 * Task Prompt Template Service for Dev-Monitor
 *
 * Provides a universal task template that works for all task types
 * Task-type-specific guidelines are loaded from taskTypeGuidelines.ts
 */

import { logger } from '../utils/logger.js';
import { Task } from './taskQueue.sqlite.js';
import { AgentPersonality } from './agentPersonalities.js';
import { getGuidelinesForTaskType, formatGuidelinesAsMarkdown } from './taskTypeGuidelines.js';
import { formatDocumentationForPrompt } from './workTargetDocumentation.js';
import { getTaskMetadataTemplateVariables } from './taskMetadataFields.js';

export interface TaskPromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  validationRules: string[];
}

export interface TaskContext {
  task: Task;
  agent: AgentPersonality;
  project: string;
  worktree: string;
  environment: 'development' | 'staging' | 'production';
}

type DocSuggestionRule = {
  pattern: RegExp;
  docs: readonly string[] | ((context: TaskContext) => string[]);
};

const BACKEND_PROJECTS = new Set(['backend', 'job-finder-be']);
const WORKER_PROJECTS = new Set(['worker', 'job-finder-worker']);

const DOC_SUGGESTION_RULES: DocSuggestionRule[] = [
  {
    pattern: /\b(test|testing|unit test|integration test|e2e|coverage)\b/i,
    docs: [
      '- [Testing Strategy](../docs/dev-bots/TESTING_STRATEGY.md)',
      '- [Testing and Task Summary](../docs/dev-bots/TESTING_AND_TASK_SUMMARY.md)'
    ]
  },
  {
    pattern: /\b(database|sqlite|sql|query|schema|migration)\b/i,
    docs: (context) => {
      const docs = [
        '- [Database Schema](../docs/architecture/database-schema.md)',
        '- [SQLite Integration Plan](../docs/dev-bots/SQLITE_INTEGRATION_PLAN.md)'
      ];
      if (BACKEND_PROJECTS.has(normalizeProject(context.project))) {
        docs.push('- [Firestore Setup](../docs/deployment/FIRESTORE_COMPLETE_SETUP.md)');
      }
      return docs;
    }
  },
  {
    pattern: /\b(docker|container|deployment|deploy|build)\b/i,
    docs: (context) => {
      const docs = ['- [Deployment Checklist](../docs/dev-bots/DEPLOYMENT_CHECKLIST.md)'];
      if (WORKER_PROJECTS.has(normalizeProject(context.project))) {
        docs.push('- [Worker Docker Development](../docs/development/WORKER_DOCKER_DEV.md)');
      }
      return docs;
    }
  },
  {
    pattern: /\b(api|endpoint|route|controller|rest|graphql)\b/i,
    docs: ['- [Backend Architecture](../docs/architecture/backend.md)']
  },
  {
    pattern: /\b(auth|authentication|login|security|jwt|token)\b/i,
    docs: ['- [Firebase Functions Guide](../docs/deployment/FIREBASE_FUNCTIONS_V2_PERMISSIONS_GUIDE.md)']
  },
  {
    pattern: /\b(ui|frontend|component|react|vue|angular)\b/i,
    docs: [
      '- [Frontend Architecture](../docs/architecture/frontend.md)',
      '- [Development Stack](../docs/development/DEVELOPMENT_STACK.md)'
    ]
  },
  {
    pattern: /\b(queue|task|bot|agent|worker|coordinator)\b/i,
    docs: [
      '- [Task Queue Architecture](../docs/dev-bots/task-queue.md)',
      '- [Coordinator Integration Analysis](../docs/dev-bots/COORDINATOR_INTEGRATION_ANALYSIS.md)'
    ]
  },
  {
    pattern: /\b(scope|complex|refactor|architecture)\b/i,
    docs: [
      '- [Scope Control System](../docs/dev-bots/SCOPE_CONTROL_SYSTEM.md)',
      '- [Mode Decision Tree](../docs/dev-bots/MODE_DECISION_TREE.md)'
    ]
  },
  {
    pattern: /\b(log|logging|logger|monitoring)\b/i,
    docs: [
      '- [Logging Architecture](../docs/operations/logging-architecture.md)',
      '- [Structured Logging Migration](../docs/operations/STRUCTURED_LOGGING_MIGRATION.md)'
    ]
  },
  {
    pattern: /\b(agent|claude|codex|comparison|metrics|performance)\b/i,
    docs: ['- [Bot Test Execution Findings](../docs/dev-bots/BOT_TEST_EXECUTION_FINDINGS_2025-11-06.md)']
  }
];

function normalizeProject(project?: string): string {
  return (project ?? '').toLowerCase();
}

export class TaskPromptTemplateManager {
  private template: TaskPromptTemplate;
  private variableProcessors: Map<string, (context: TaskContext) => string> = new Map();

  constructor() {
    this.template = this.createUniversalTemplate();
    this.initializeVariableProcessors();
    this.assertCanonicalVariableCoverage();
  }

  private createUniversalTemplate(): TaskPromptTemplate {
    return {
      id: 'universal-task-template',
      name: 'Universal Task Template',
      description: 'A comprehensive template that works for all task types',
      template: this.getUniversalTemplateString(),
      variables: this.buildTemplateVariableList(),
      validationRules: [
        'Must include all required variables',
        'Must have proper bash syntax',
        'Must include comprehensive workflow',
        'Must have quality checklist',
        'Must include git workflow instructions',
        'Must warn against --no-verify',
        'Must include success metrics',
        'Must include estimated effort guidance'
      ]
    };
  }

  private buildTemplateVariableList(): string[] {
    const metadataVariables = getTaskMetadataTemplateVariables();
    const contextualVariables = [
      'task.id',
      'task.typeGuidelines',
      'environment',
      'worktree',
      'workTarget.documentation'
    ];
    return Array.from(new Set([...metadataVariables, ...contextualVariables]));
  }

  private assertCanonicalVariableCoverage(): void {
    const metadataVariables = getTaskMetadataTemplateVariables();
    const missingVariables = metadataVariables.filter(
      (variable) => !this.variableProcessors.has(variable)
    );
    if (missingVariables.length > 0) {
      throw new Error(`Missing variable processors for task metadata fields: ${missingVariables.join(', ')}`);
    }
  }

  private getUniversalTemplateString(): string {
    return `# 🎯 Task Assignment

## ⚠️ CRITICAL: Read This Entire Prompt BEFORE Starting
**DO NOT start coding until you have read and understood ALL sections of this prompt.**

## Task Overview
**Agent**: {{agent.name}} ({{agent.role}})
**Task ID**: {{task.id}}
**Title**: {{task.title}}
**Type**: {{task.type}}
**Repository**: {{repository}}
**Environment**: {{environment}}

## 📝 Phase 1 Planning Output (MANDATORY)
- Create artifacts dir: \`mkdir -p /workspace/.artifacts\`
- Write planning JSON to \`/workspace/.artifacts/phase.json\` with EXACT keys:
  {
    "obsolete": false,
    "obsolete_reason": "",
    "task_realigned": false,
    "realignment_details": "",
    "dependencies": [],
    "architecture_notes": "Short summary of approach and risks",
    "estimated_complexity": "low"
  }
- Keep \`architecture_notes\` concise (<= 500 chars). Do this before implementation.

## 🧭 Phase Artifact Requirements (All Phases)
- ALWAYS write JSON artifacts to \`/workspace/.artifacts/phase.json\` for the current phase.
- Overwrite the file each phase with the structure below:
  - **Phase 1 (planning)**: the JSON above.
  - **Phase 2 (implementation)**:
    \`\`\`json
    {
      "pr_number": 0,
      "pr_url": "",
      "branch_name": "",
      "commits": 1,
      "files_changed": []
    }
    \`\`\`
  - **Phase 3 (review)**:
    \`\`\`json
    {
      "issues": [
        {
          "fingerprint": "sha256:...",
          "severity": "major",
          "file": "path",
          "line": 1,
          "description": "",
          "blocking": true
        }
      ],
      "total_issues": 1,
      "blocking_issues": 1,
      "review_passed": false
    }
    \`\`\`
  - **Phase 4 (fixes)**:
    \`\`\`json
    {
      "fixes_applied": [
        {
          "fingerprint": "sha256:...",
          "resolution": "",
          "files_modified": [""],
          "commits": ["hash"]
        }
      ],
      "unresolved_fingerprints": [],
      "all_issues_addressed": true
    }
    \`\`\`
  - **Phase 5 (tests)**:
    \`\`\`json
    {
      "all_tests_passing": true,
      "coverage_delta": 0,
      "test_summary": {
        "unit": { "total": 0, "passed": 0, "failed": 0 },
        "integration": { "total": 0, "passed": 0, "failed": 0 },
        "e2e": { "total": 0, "passed": 0, "failed": 0 }
      },
      "lint_passing": true,
      "type_check_passing": true,
      "build_passing": true,
      "failures": []
    }
    \`\`\`
  - **Phase 6/7**: include any cleanup/shepherding metadata you produce; keep JSON well-formed.
- If you also emit Markdown, still write the JSON file—validators read \`phase.json\`.

## 🚨 Common Failure Modes to AVOID (Learn from Past Mistakes)

### ❌ FAILURE MODE 1: Inventing Features Not Requested
**Problem**: Adding "nice to have" features or extra functionality beyond requirements
**Example**: Asked for 6 tables, created 8 tables (adding unrequested extras)
**Prevention**:
- Read acceptance criteria word-for-word
- If criteria says "EXACTLY 6 tables", create EXACTLY 6, no more
- When in doubt, do LESS not MORE

### ❌ FAILURE MODE 2: Skipping Investigation Phase
**Problem**: Writing code without first checking if similar functionality exists
**Example**: Creating new validation function when one already exists in utils/
**Prevention**:
- ALWAYS run grep/find commands to search for existing patterns
- READ existing similar files before writing new code
- Document what you found and why you can/cannot reuse it

### ❌ FAILURE MODE 3: Git Workflow Failure
**Problem**: Not creating PR or not providing PR number
**Example**: Task completes but no PR created, or PR number not captured
**Prevention**:
- Creating a PR is NOT optional - it's MANDATORY for all code tasks
- Run \`gh pr create\` to create PR to main (NOT staging)
- MUST capture and output PR_NUMBER, PR_URL, and PR_BRANCH
- Verify PR creation succeeded and output is formatted correctly

### ❌ FAILURE MODE 4: Completing with Questions Instead of Implementation
**Problem**: Asking user for more information instead of implementing based on prompt
**Example**: "Should I add feature X?" when prompt already specifies requirements
**Prevention**:
- This prompt contains ALL information you need
- If acceptance criteria are clear, implement them
- Only ask questions if there's a true blocker or ambiguity

### ❌ FAILURE MODE 5: Over-Engineering Simple Tasks
**Problem**: Building entire systems when asked for simple changes
**Example**: Asked to add a button, created entire component library
**Prevention**:
- Implement ONLY what's in acceptance criteria
- Simple tasks need simple solutions
- Respect scope boundaries - do not expand

## 🎯 Strategic Context & Purpose
**Parent Initiative:** {{task.parentInitiative}}

**This task contributes to the following long-term goals:**
{{task.longTermGoals}}

**Related Tasks You Should Know About:**
{{task.relatedTasks}}

**Why This Matters:** Understanding the strategic context helps you make better technical decisions and identify opportunities to establish patterns for future work.

## 🔌 Available MCP Capabilities

Your container is pre-configured with Model Context Protocol servers that provide enhanced capabilities:

### 📁 Filesystem MCP
- **Read files** efficiently without cat/grep commands
- **Write files** with atomic operations
- **Search across files** for patterns
- **List directories** and file trees
- Scoped to \`/workspace\` directory

### 🔀 Git MCP
- **Check status** without running git commands
- **View diffs** and commit history
- **Manage branches** and track changes
- **Inspect repository** state and metadata
- Automatic integration with workspace

### 🗄️ SQLite MCP
- **Query databases** directly (task queue, metrics)
- **Inspect schema** and table structure
- **Execute SQL** for analysis
- **Manage databases** in workspace

### 🌐 Fetch MCP
- **Fetch web content** (documentation, APIs)
- **Make HTTP requests** (GET/POST)
- **Access external resources** for context
- **Validate URLs** and endpoints

**💡 Tip:** These MCP servers are faster and more reliable than shell commands. Use them when available!

## 📋 PRE-TASK SELF-ASSESSMENT (Complete BEFORE Starting)

Before you begin implementation, answer these questions to verify you understand the task:

1. **Scope Check**: Can you state in one sentence what this task accomplishes?
   - If NO: Re-read the task description and acceptance criteria

2. **Investigation Check**: Do you know what existing code to review before implementing?
   - If NO: Review the investigation section below

3. **Boundaries Check**: Do you know what you MUST NOT change or create?
   - If NO: Review the context boundaries and constraints sections

4. **Git Workflow Check**: Do you know you MUST create a PR to main (NOT push to staging)?
   - If NO: Review Step 4 of the development workflow - PR creation is mandatory

5. **Success Metrics Check**: Can you list the measurable outcomes that define success?
   - If NO: Review the Success Metrics section

**If you answered NO to any question above, STOP and re-read those sections before proceeding.**

## 🔍 CRITICAL: Code Reuse Analysis (MANDATORY FIRST STEP)

**BEFORE writing ANY code, you MUST perform a comprehensive codebase analysis:**

### **Step 1: Search for Existing Patterns**
\`\`\`bash
# Search for similar functionality (replace 'similar' with your actual search terms)
find . -name "*.ts" -o -name "*.js" -o -name "*.py" | xargs grep -l "function.*your_search_term"
find . -name "*.ts" -o -name "*.js" -o -name "*.py" | xargs grep -l "class.*your_search_term"
find . -name "*.ts" -o -name "*.js" -o -name "*.py" | xargs grep -l "def.*your_search_term"
\`\`\`

### **Step 2: Check Key Directories for Existing Code**
- **Utilities**: \`src/utils/\`, \`lib/\`, \`helpers/\`, \`common/\`, \`shared/\`
- **Services**: \`src/services/\`, \`src/api/\`, \`src/controllers/\`, \`src/handlers/\`
- **Components**: \`src/components/\`, \`src/ui/\`, \`src/views/\`, \`src/widgets/\`
- **Repositories**: \`src/repositories/\`, \`src/dao/\`, \`src/data/\`
- **Types/Interfaces**: \`src/types/\`, \`src/interfaces/\`, \`src/models/\`

### **Step 3: Document Your Findings**
For each piece of code you plan to write, document:
1. **What existing code you found** that could be reused
2. **Why you can/cannot reuse** the existing code
3. **What you will extend** from existing patterns
4. **What new reusable patterns** you will create

### **Step 4: Reuse Decision Matrix**
- ✅ **Can reuse existing code**: Extend, configure, or compose existing functionality
- ✅ **Can extend existing patterns**: Modify existing code to be more reusable
- ✅ **Can create reusable utilities**: Extract common functionality for future use
- ❌ **Cannot reuse**: Only if you've thoroughly searched and documented why

## 📋 Task Description
{{task.description}}

## 📦 Context Bundle (Read These First!)
{{task.contextBundle}}

## 📚 Required Reading (Read BEFORE Starting)
{{task.documentation}}

**Essential Project Documentation:**
{{task.architecture_references}}

**Work Target Guide for {{repository}}:**
{{workTarget.documentation}}

**Additional Context:**
- Review the complete [Documentation Index](../docs/README.md) for comprehensive guides
- Read \`README.md\` in the \`{{repository}}\` directory for project-specific setup
- See task-type-specific guidelines below

## ✅ Acceptance Criteria (Qualitative)
The task is considered complete when ALL of the following are true:

{{task.acceptance_criteriaList}}

## 📊 Success Metrics (Quantitative - MUST ACHIEVE ALL)
These are MEASURABLE outcomes that define task success:

{{task.success_metrics}}

**Validation:** Before marking task complete, verify EVERY metric above is achieved. If any metric cannot be met, STOP and report why.

## ⏱️ Estimated Effort & Complexity
{{task.estimatedEffort}}

**Time Management Best Practices:**
- Set a timer and track your progress
- If you hit the scope alert threshold, STOP and report - don't continue indefinitely
- Don't over-engineer - deliver quality within time constraints
- If task is simpler than estimated, document time savings
- If task is more complex than estimated, document why and request guidance

## 🎓 Required Skills & Knowledge Check
This task requires expertise in:

{{task.requiredSkills}}

**Self-Assessment Before Starting:**
- ✅ Skills you possess: Proceed with confidence
- ⚠️ Skills you're learning: Review documentation and examples first
- ❌ Missing critical skills: Consider requesting help or reassignment

**Learning Resources:** If you need to learn a required skill, budget extra time and document your learning process.

## 🔧 Technical Context

**Files to Modify:**
{{task.files}}

**Dependencies:**
{{task.dependencies}}

**Additional Notes:**
{{task.notes}}

## ⚠️ Context Boundaries (DO NOT VIOLATE)
{{task.contextBoundaries}}

## 🚧 Known Blockers
{{task.blockers}}

## ⚠️ Identified Risks
{{task.risks}}

## 📋 Prerequisites
Complete these BEFORE starting work:

{{task.prerequisites}}

## 💭 Assumptions (VERIFY BEFORE Starting)
**IMPORTANT:** The following assumptions were made during task planning. Verify each one before proceeding:

{{task.assumptions}}

**If ANY assumption is false:** STOP and report immediately - the task may need re-planning or re-scoping.

## 🤔 Alternatives Already Considered
The following approaches were evaluated and NOT chosen for specific reasons:

{{task.alternatives}}

**Important:** Unless you discover blocking issues with the chosen approach, proceed as planned. These alternatives were already discussed and rejected for good reasons.

{{task.typeGuidelines}}

## 🔄 Development Workflow (MANDATORY - Follow Exactly)

### Step 1: Workspace Setup
\`\`\`bash
# Navigate to project directory
cd {{repository}}

{{task.branchSetupInstructions}}

# Fetch all branches to check for conflicts
git fetch --all

{{task.branchSetupNote}}
\`\`\`

**CRITICAL:** {{task.branchSetupCritical}}

### Step 2: Implementation
Work on the task according to the acceptance criteria and technical requirements.

**Development Guidelines:**
- Follow existing code patterns and architecture
- Write clean, readable, maintainable code
- Keep changes focused on the task requirements
- Refer to task-type-specific guidelines above

## 🔄 DRY (Don't Repeat Yourself) - MANDATORY CODE REUSE CHECKLIST

**BEFORE writing ANY new code, you MUST:**

### 1. **Search for Existing Patterns** (MANDATORY FIRST STEP)
\`\`\`bash
# Search for similar functionality across the codebase
grep -r "function.*similar.*name" . --include="*.ts" --include="*.js" --include="*.py"
grep -r "class.*similar.*name" . --include="*.ts" --include="*.js" --include="*.py"
grep -r "def.*similar.*name" . --include="*.py"
grep -r "export.*similar.*name" . --include="*.ts" --include="*.js"
\`\`\`

### 2. **Check for Existing Utilities** (ALWAYS CHECK FIRST)
- **Shared utilities**: Look in \`src/utils/\`, \`lib/\`, \`helpers/\`, \`common/\` directories
- **Existing services**: Check \`src/services/\`, \`src/api/\`, \`src/controllers/\`
- **Existing components**: Check \`src/components/\`, \`src/ui/\`, \`src/views/\`
- **Existing functions**: Search for similar function names across the entire codebase
- **Existing classes**: Look for similar class implementations
- **Existing constants**: Check for existing configuration, enums, or constants

### 3. **Reuse Before Create** (MANDATORY RULE)
- ✅ **ALWAYS** check if similar functionality already exists
- ✅ **ALWAYS** extend existing classes/functions instead of creating new ones
- ✅ **ALWAYS** use existing utilities, helpers, and shared code
- ✅ **ALWAYS** refactor existing code to be more reusable if needed
- ❌ **NEVER** create duplicate functionality when existing code can be reused
- ❌ **NEVER** copy-paste code from other files without refactoring
- ❌ **NEVER** create new utilities when existing ones can be extended

### 4. **Code Reuse Patterns to Follow**

#### **For Functions/Methods:**
\`\`\`typescript
// ❌ WRONG: Creating duplicate function
function validateUserInput(input: string) { /* validation logic */ }

// ✅ CORRECT: Extending existing utility
import { validateInput } from '../utils/validation';
const validateUserInput = (input: string) => validateInput(input, 'user');
\`\`\`

#### **For Components:**
\`\`\`typescript
// ❌ WRONG: Creating duplicate component
const NewButton = ({ onClick, children }) => { /* button logic */ }

// ✅ CORRECT: Extending existing component
import { Button } from '../components/Button';
const NewButton = (props) => <Button {...props} variant="new" />;
\`\`\`

#### **For API Endpoints:**
\`\`\`typescript
// ❌ WRONG: Creating duplicate endpoint logic
app.get('/new-endpoint', (req, res) => { /* duplicate logic */ })

// ✅ CORRECT: Reusing existing handler
import { handleGetRequest } from '../utils/apiHandlers';
app.get('/new-endpoint', handleGetRequest);
\`\`\`

#### **For Database Operations:**
\`\`\`typescript
// ❌ WRONG: Duplicate database logic
const saveUser = async (user) => { /* duplicate save logic */ }

// ✅ CORRECT: Extending existing repository
import { UserRepository } from '../repositories/UserRepository';
const saveUser = (user) => UserRepository.save(user);
\`\`\`

### 5. **Refactoring for Reusability** (WHEN NEEDED)
If existing code is not reusable enough:

1. **Extract common functionality** into shared utilities
2. **Create generic functions** that can handle multiple use cases
3. **Use configuration objects** to make functions more flexible
4. **Create base classes** for common patterns
5. **Use composition over inheritance** when possible

### 6. **Update Existing Architecture Documentation**
Instead of creating new documentation, **ALWAYS update existing architecture documents** to reflect your changes:

- **Update existing architecture docs** in \`docs/architecture/\` to include new patterns
- **Update existing API documentation** to reflect new endpoints or changes
- **Update existing component documentation** to include new components or modifications
- **Update existing service documentation** to reflect new functionality
- **Update existing README files** to include new setup steps or dependencies
- **Update existing code comments** to reflect changes and new patterns

**DO NOT create new documentation files** unless absolutely necessary for new architectural patterns that don't fit existing documentation structure.

### 7. **Code Review Checklist for DRY**
Before committing, verify:
- [ ] I searched the entire codebase for similar functionality
- [ ] I checked all utility directories (\`utils/\`, \`helpers/\`, \`common/\`)
- [ ] I extended existing code instead of duplicating it
- [ ] I created reusable patterns where appropriate
- [ ] I updated existing architecture documentation instead of creating new docs
- [ ] I didn't copy-paste code without refactoring
- [ ] I made existing code more reusable if needed

### 8. **Common Duplication Patterns to Avoid**
- **Duplicate API handlers** - Use existing handler patterns
- **Duplicate validation logic** - Create reusable validation utilities
- **Duplicate database queries** - Use existing repositories
- **Duplicate UI components** - Extend existing components
- **Duplicate error handling** - Use centralized error handling
- **Duplicate configuration** - Use existing config patterns
- **Duplicate logging** - Use existing logging utilities
- **Duplicate testing patterns** - Use existing test utilities

### 9. **When Creating New Code is Acceptable**
Only create new code when:
- **No similar functionality exists** after thorough search
- **Existing code cannot be extended** without breaking changes
- **The new code will be reused** by multiple parts of the system
- **You document why** existing code couldn't be reused
- **You make the new code reusable** for future use

**MANDATORY: Unit Regression Testing**
For ANY new code, functionality, or changes, you MUST:

1. **Write Unit Tests** for all new functions, methods, and components
2. **Write Integration Tests** for any new API endpoints or workflows
3. **Write Regression Tests** to prevent future breaking changes
4. **Update Existing Tests** if you modify existing functionality
5. **Ensure Test Coverage** meets project standards (minimum 80%)

**Test Requirements:**
- **New Functions**: Unit tests for all new functions/methods
- **New Components**: Component tests for UI elements
- **New APIs**: Integration tests for endpoints
- **New Workflows**: End-to-end tests for complete processes
- **Bug Fixes**: Regression tests to prevent reoccurrence
- **Refactoring**: Update tests to match new structure

**Test File Naming:**
- Unit tests: *.test.ts or *.spec.ts
- Integration tests: *.integration.test.ts
- E2E tests: *.e2e.test.ts
- Test utilities: test-utils.ts or test-helpers.ts

### Step 3: Pre-Commit Validation
BEFORE committing, ensure quality standards are met:

\`\`\`bash
# Ensure your feature branch is rebased on the latest main
git fetch origin main
git rebase origin/main

# If conflicts occur, resolve them carefully and rerun all tests

# Run linting (MUST pass)
npm run lint
# OR for Python projects:
# black . && flake8

# Run tests (MUST pass)
npm test
# OR for Python projects:
# pytest

# Run test coverage (MUST meet minimum 80%)
npm run test:coverage
# OR for Python projects:
# pytest --cov=src --cov-report=html --cov-fail-under=80

# If project has type checking:
npm run type-check
# OR for Python:
# mypy .

# If project has build step:
npm run build
\`\`\`

**CRITICAL RULES:**
- ❌ NEVER use \`--no-verify\` flag
- ❌ NEVER skip linting or tests
- ❌ NEVER commit without writing tests for new code
- ❌ NEVER skip test coverage requirements
- ✅ ALWAYS fix all linter errors
- ✅ ALWAYS ensure all tests pass
- ✅ ALWAYS write unit tests for new functionality
- ✅ ALWAYS write regression tests for bug fixes
- ✅ ALWAYS meet minimum 80% test coverage
- ✅ ALWAYS resolve merge conflicts before committing

### Step 4: {{task.prWorkflowTitle}}
{{task.prWorkflowDescription}}

\`\`\`bash
# Step 4.0: Sync with Latest Main (CRITICAL - Prevents Duplicate Work)
echo "Syncing with latest main to avoid duplicate work..."
git fetch origin main

# Check how far behind main we are
BEHIND_COUNT=$$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

if [ "${'$'}BEHIND_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: main is ${'$'}BEHIND_COUNT commits ahead since you started"
  echo "This means other PRs may have been merged while you were working"

  # Check for potential duplicate work
  CHANGED_FILES=$$(git diff --name-only HEAD)
  DUPLICATE_WORK_DETECTED=false

  for file in ${'$'}CHANGED_FILES; do
    if git diff HEAD..origin/main --quiet -- "${'$'}file" 2>/dev/null; then
      :  # File not modified in main, OK
    else
      echo "⚠️  File ${'$'}file was also modified in main - potential duplicate work"
      DUPLICATE_WORK_DETECTED=true
    fi
  done

  if [ "${'$'}DUPLICATE_WORK_DETECTED" = "true" ]; then
    echo ""
    echo "⚠️  DUPLICATE WORK WARNING"
    echo "Some files you modified were also changed in main."
    echo "This will be flagged in the PR description for review."
    echo ""
  fi

  # Try to rebase onto latest main to incorporate new changes
  echo "Attempting to rebase onto latest main..."
  if git rebase origin/main; then
    echo "✅ Successfully rebased onto latest main"
    REBASE_FAILED=false
  else
    echo "❌ Rebase failed - conflicts detected"
    echo "Aborting rebase. Will create PR with conflict markers for review."
    git rebase --abort
    REBASE_FAILED=true
  fi
else
  echo "✅ Your branch is up to date with main"
  REBASE_FAILED=false
  DUPLICATE_WORK_DETECTED=false
fi

# Step 4.1: {{task.branchCreationStep}}
{{task.branchCreationContent}}

# Step 4.2: Stage and Commit Changes
git add .

# Verify what will be committed
git status
git diff --cached --stat

# Commit with descriptive message
git commit -m "{{task.type}}: {{task.title}}

{{task.description}}

Acceptance criteria:
{{task.acceptance_criteriaList}}

Files modified: {{task.files}}

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
"

# Step 4.3: {{task.pushStep}}
{{task.pushContent}}

# Verify push succeeded
git log --oneline -1
git status

# Step 4.4: {{task.prCreationStep}}

{{task.prCreationContent}}

# Step 4.5: {{task.prOutputStep}}
{{task.prOutputContent}}
\`\`\`

{{task.prVerificationContent}}

**After PR Creation:**
- The PR monitoring system will automatically watch for CI checks
- Copilot reviews will be monitored automatically
- If checks pass and no blocking comments, PR will auto-merge
- If issues found, followup tasks will be created automatically

### Step 5: Post-PR Creation Verification
**DO NOT** manually merge the PR - the system handles this automatically.

Verify:
- [ ] PR created successfully with correct base (main) and head (feature branch)
- [ ] PR number captured and output in the required format
- [ ] Initial CI checks triggered (visible in PR)
- [ ] PR description includes task ID for traceability

## 🧪 Testing Requirements
{{task.testingRequirements}}

**MANDATORY: Unit Regression Testing Guidelines**

### **Test Coverage Requirements**
- **Minimum Coverage**: 80% code coverage for all new code
- **Critical Paths**: 100% coverage for business logic and API endpoints
- **Edge Cases**: Test all error conditions and boundary values
- **Integration**: Test all external dependencies and integrations

### **Test Types Required**

#### **1. Unit Tests (MANDATORY for all new functions)**
Example unit test structure:
- describe('FunctionName', () => {
-   it('should handle normal case', () => {
-     // Test normal functionality
-   });
-   it('should handle edge cases', () => {
-     // Test boundary conditions
-   });
-   it('should handle error conditions', () => {
-     // Test error scenarios
-   });
- });

#### **2. Integration Tests (MANDATORY for APIs and workflows)**
Example integration test:
- describe('API Endpoint Integration', () => {
-   it('should process request successfully', async () => {
-     // Test complete workflow
-   });
-   it('should handle validation errors', async () => {
-     // Test error handling
-   });
- });

#### **3. Regression Tests (MANDATORY for bug fixes)**
Example regression test:
- describe('Bug Fix Regression', () => {
-   it('should prevent the original bug from reoccurring', () => {
-     // Test that the specific bug is fixed
-   });
-   it('should maintain existing functionality', () => {
-     // Test that nothing else broke
-   });
- });

### **Test Quality Standards**
- **Descriptive Names**: Test names should clearly describe what they test
- **Single Responsibility**: Each test should test one specific behavior
- **Independent**: Tests should not depend on each other
- **Fast**: Unit tests should run quickly (< 100ms each)
- **Reliable**: Tests should be deterministic and not flaky

### **Test File Organization**
\`\`\`
src/
  components/
    MyComponent.tsx
    MyComponent.test.tsx
  services/
    myService.ts
    myService.test.ts
  utils/
    helpers.ts
    helpers.test.ts
\`\`\`

### **Test Execution Requirements**
- **Pre-commit**: All tests must pass before committing
- **CI/CD**: Tests must pass in automated pipeline
- **Coverage**: Coverage reports must meet minimum thresholds
- **Performance**: Tests should not significantly slow down development

## 📝 Documentation Requirements - UPDATE EXISTING DOCS
{{task.documentationRequirements}}

**CRITICAL: Update Existing Documentation Instead of Creating New Files**

### **Mandatory Documentation Updates:**
- [ ] **Update existing architecture docs** in \`docs/architecture/\` to reflect your changes
- [ ] **Update existing API documentation** if you modified endpoints or added new ones
- [ ] **Update existing component documentation** if you added or modified components
- [ ] **Update existing service documentation** if you added new services or modified existing ones
- [ ] **Update existing README files** to include new setup steps, dependencies, or usage instructions
- [ ] **Update existing code comments** to reflect changes and document new patterns
- [ ] **Update existing configuration documentation** if you added new configuration options

### **Documentation Update Guidelines:**
- **Find the most relevant existing documentation** that covers your changes
- **Update that documentation** to include your new patterns, components, or functionality
- **Maintain consistency** with existing documentation style and structure
- **Add examples** of how to use new functionality within existing documentation
- **Cross-reference** related documentation sections

### **When Creating New Documentation is Acceptable:**
Only create new documentation files when:
- **No existing documentation** covers the new architectural pattern
- **The new pattern is significant enough** to warrant its own documentation section
- **Existing documentation structure** cannot accommodate the new information
- **You have explicit approval** to create new documentation

**DO NOT create new documentation files** for:
- Small feature additions that fit existing documentation
- Minor API changes that can be documented in existing API docs
- Component additions that can be documented in existing component docs
- Service modifications that can be documented in existing service docs

## ✓ Validation Steps
Before marking task complete, verify:

{{task.validation_steps}}

## 🔄 Rollback Plan (If Issues Arise)
{{task.rollbackPlan}}

## ✅ Final Success Checklist
Before marking this task as complete, verify ALL of the following:

## 🔍 PRE-COMPLETION VALIDATION (Answer These Questions)

**STOP: Before checking boxes below, honestly answer these critical questions:**

1. **Did you READ existing code before writing new code?**
   - If NO: You may have duplicated existing functionality - go back and check

2. **Did you create EXACTLY what was requested (no more, no less)?**
   - If NO: Remove extra features or add missing requirements

3. **Did you commit and push your feature branch to origin?**
   - Run: \`git log --oneline -1\` - Do you see your latest commit?
   - Run: \`git status\` - Does it say "up to date with origin/<your-branch>"?
   - If NO to either: complete the git workflow before proceeding

4. **Did you write and run TESTS for your changes?**
   - If NO: Write tests now before marking complete

5. **Did all tests and linters PASS without using --no-verify?**
   - If NO: Fix failures before marking complete

**If you answered NO to ANY question above, the task is NOT complete. Go back and address the issues.**

### Acceptance Criteria (Qualitative)
- [ ] All acceptance criteria met

### Success Metrics (Quantitative) - VERIFY EACH ONE
{{task.success_metrics}}

### Quality Standards
- [ ] Code follows project patterns and conventions
- [ ] All linters pass (no \`--no-verify\` used)
- [ ] All tests pass
- [ ] **Unit tests written for all new functions and components**
- [ ] **Integration tests written for all new APIs and workflows**
- [ ] **Regression tests written for any bug fixes**
- [ ] **Test coverage meets minimum 80% threshold**
- [ ] **All new test files follow naming conventions**
- [ ] **Tests are fast, reliable, and independent**

### DRY (Don't Repeat Yourself) Validation
- [ ] **Searched entire codebase for similar functionality before writing new code**
- [ ] **Checked all utility directories** (\`utils/\`, \`helpers/\`, \`common/\`, \`services/\`)
- [ ] **Extended existing code instead of duplicating it**
- [ ] **Reused existing utilities, services, and components where possible**
- [ ] **Created reusable patterns for future use**
- [ ] **Documented reuse decisions and why new code was necessary**
- [ ] **No copy-paste code without proper refactoring**
- [ ] **Made existing code more reusable if needed**
- [ ] **Avoided common duplication patterns** (API handlers, validation, DB queries, UI components)
- [ ] **New code is designed to be reusable by other parts of the system**

### Process & Integration
- [ ] No merge conflicts remaining
- [ ] Feature branch pushed to origin and PR opened (gh pr create)
- [ ] **Existing documentation updated** instead of creating new files
- [ ] **Architecture docs updated** to reflect new patterns and changes
- [ ] **API docs updated** if endpoints were modified or added
- [ ] **Component docs updated** if components were added or modified
- [ ] **Service docs updated** if services were added or modified
- [ ] **README files updated** with new setup steps or dependencies
- [ ] **Code comments updated** to reflect changes and new patterns
- [ ] No new security vulnerabilities introduced
- [ ] Performance impact is acceptable
- [ ] Context boundaries respected (nothing changed that shouldn't be)
- [ ] Task-type-specific quality checklist completed (see above)
- [ ] All assumptions were verified and documented
- [ ] Time tracking: Actual time vs estimated documented

## 📡 CRITICAL: Report Task Completion

**AFTER you have completed all work (successfully OR unsuccessfully), you MUST report the result:**

### If Task Completed Successfully:
\`\`\`bash
curl -X POST https://app-monitor.joshwentworth.com/api/dev-bots/tasks/{{task.id}}/report-completion \\
  -H "Content-Type: application/json" \\
  -d '{"success": true, "summary": "Brief 1-sentence description of what was accomplished"}'
\`\`\`

### If Task Failed:
\`\`\`bash
curl -X POST https://app-monitor.joshwentworth.com/api/dev-bots/tasks/{{task.id}}/report-completion \\
  -H "Content-Type: application/json" \\
  -d '{"success": false, "summary": "Brief 1-sentence description of what went wrong"}'
\`\`\`

**This reporting step is MANDATORY** - it allows the system to accurately track task completion regardless of exit codes or output parsing.

## 🎯 Agent Expertise Note
As {{agent.name}}, you bring expertise in: {{agent.role}}

Use your specialized knowledge to ensure this implementation follows best practices for your area of expertise.
`;
  }

  private initializeVariableProcessors(): void {
    // Agent information
    this.variableProcessors.set('agent.name', (context) => context.agent.name);
    this.variableProcessors.set('agent.role', (context) => context.agent.role);
    this.variableProcessors.set('agent.id', (context) => context.agent.id);
    this.variableProcessors.set('agent.expertise', (context) => {
      // Format agent expertise from the AgentPersonality structure
      const expertise = context.agent.expertise;
      if (!expertise) return 'General development expertise';

      const primary = expertise.primary?.join(', ') || '';
      const secondary = expertise.secondary?.length ? ` (${expertise.secondary.join(', ')})` : '';
      return primary + secondary || 'General development expertise';
    });

    // Basic task information
    this.variableProcessors.set('task.id', (context) => context.task.id);
    this.variableProcessors.set('task.type', (context) => context.task.type);
    this.variableProcessors.set('task.title', (context) => context.task.title || 'Untitled Task');
    this.variableProcessors.set('task.description', (context) => context.task.description || 'No detailed description provided');
    this.variableProcessors.set('task.documentation', (context) => context.task.documentation || 'See project README and architecture docs');
    this.variableProcessors.set('task.acceptance_criteria', (context) => {
      if (!context.task.acceptance_criteria) return 'Task completed as described';
      if (Array.isArray(context.task.acceptance_criteria)) {
        return context.task.acceptance_criteria.join(', ');
      }
      return String(context.task.acceptance_criteria);
    });
    this.variableProcessors.set('task.notes', (context) => context.task.notes || 'No additional notes');

    // Files and dependencies
    this.variableProcessors.set('task.files', (context) =>
      context.task.files && context.task.files.length > 0
        ? context.task.files.join(', ')
        : 'Files will be determined during implementation');
    this.variableProcessors.set('task.dependencies', (context) =>
      context.task.dependencies && context.task.dependencies.length > 0
        ? context.task.dependencies.join(', ')
        : 'None specified');

    // Enhanced task fields
    this.variableProcessors.set('task.acceptance_criteriaList', (context) =>
      context.task.acceptance_criteria && Array.isArray(context.task.acceptance_criteria) && context.task.acceptance_criteria.length > 0
        ? context.task.acceptance_criteria.map((c: string) => `- [ ] ${c}`).join('\n')
        : '- [ ] Task completed as described');
    this.variableProcessors.set('task.architecture_references', (context) => {
      // Get system-specific architecture documentation links
      const systemArchDocs = this.getSystemArchitectureDocs(context.project);

      // Get intelligent documentation suggestions based on task content
      const intelligentDocs = this.discoverRelevantDocumentation(context);

      // Combine custom architecture references with system-specific docs
      const customRefs = context.task.architecture_references && context.task.architecture_references.length > 0
        ? context.task.architecture_references.map((r: string) => `- ${r}`)
        : [];

      // Build final documentation list
      const allDocs = [
        ...customRefs,
        ...systemArchDocs,
        ...intelligentDocs,
        '- [Complete Documentation Index](../docs/README.md)',
        '- [System Architecture Overview](../docs/architecture/system-overview.md)',
        '- [Development Workflow](../docs/development/workflow.md)'
      ];

      // Remove duplicates
      const uniqueDocs = [...new Set(allDocs)];

      return uniqueDocs.join('\n');
    });
    this.variableProcessors.set('task.prerequisites', (context) =>
      context.task.prerequisites && context.task.prerequisites.length > 0
        ? context.task.prerequisites.map((p: string) => `- [ ] ${p}`).join('\n')
        : '- [ ] None specified');
    this.variableProcessors.set('task.contextBoundaries', (context) => {
      if (!context.task.context_boundaries) return '- No specific boundaries defined';
      const { mustNotChange = [], mustNotAffect = [], integrationPoints = [] } = context.task.context_boundaries;
      return `**Must NOT Change:**\n${mustNotChange.map((i: string) => `- ${i}`).join('\n') || '- None specified'}\n\n**Must NOT Affect:**\n${mustNotAffect.map((i: string) => `- ${i}`).join('\n') || '- None specified'}\n\n**Integration Points:**\n${integrationPoints.map((i: string) => `- ${i}`).join('\n') || '- None specified'}`;
    });
    this.variableProcessors.set('task.validation_steps', (context) =>
      context.task.validation_steps && context.task.validation_steps.length > 0
        ? context.task.validation_steps.map((v: string) => `- [ ] ${v}`).join('\n')
        : '- [ ] Run all tests\n- [ ] Run linters\n- [ ] Manual verification');
    this.variableProcessors.set('task.testingRequirements', (context) =>
      context.task.testing_requirements && context.task.testing_requirements.length > 0
        ? context.task.testing_requirements.map((t: string) => `- [ ] ${t}`).join('\n')
        : '- [ ] Unit tests pass\n- [ ] Integration tests pass');
    this.variableProcessors.set('task.documentationRequirements', (context) =>
      context.task.documentation_requirements && context.task.documentation_requirements.length > 0
        ? context.task.documentation_requirements.map((d: string) => `- [ ] ${d}`).join('\n')
        : '- [ ] Code comments added\n- [ ] README updated if needed');
    this.variableProcessors.set('task.rollbackPlan', (context) =>
      context.task.rollback_plan && context.task.rollback_plan.length > 0
        ? context.task.rollback_plan.map((r: string) => `- ${r}`).join('\n')
        : '- Revert commit if issues found\n- Run git reset --hard if needed\n- Notify team of rollback');
    this.variableProcessors.set('task.blockers', (context) =>
      context.task.blockers && context.task.blockers.length > 0
        ? context.task.blockers.map((b: string) => `- ⚠️ ${b}`).join('\n')
        : '- No known blockers');
    this.variableProcessors.set('task.risks', (context) =>
      context.task.risks && context.task.risks.length > 0
        ? context.task.risks.map((r: string) => `- ⚠️ ${r}`).join('\n')
        : '- No identified risks');

    // NEW: Enhanced field processors (all UI form fields now included)

    // 1. Long-term goals - strategic context
    this.variableProcessors.set('task.longTermGoals', (context) =>
      context.task.long_term_goals && context.task.long_term_goals.length > 0
        ? context.task.long_term_goals.map((g: string) => `- ${g}`).join('\n')
        : '- None specified - this is a standalone task with no long-term strategic goals');

    // 2. Estimated effort - time and complexity guidance
    this.variableProcessors.set('task.estimatedEffort', (context) => {
      if (!context.task.estimated_effort) {
        return '**Time Estimate:** Not estimated\n**Complexity:** Unknown\n**Confidence:** N/A\n\n**Note:** No time estimate provided. Use your best judgment for scope.';
      }

      const { hours, complexity, confidence } = context.task.estimated_effort;
      const scopeAlert = Math.ceil(hours * 1.5);

      return `**Time Estimate:** ${hours} hours
**Complexity Level:** ${complexity} ${this.getComplexityGuidance(complexity)}
**Confidence:** ${confidence} ${this.getConfidenceGuidance(confidence)}

**Scope Alert Threshold:** ${scopeAlert} hours (1.5x estimate)
- If you exceed ${scopeAlert} hours, STOP and report
- Document actual time spent vs. estimate in completion notes
- If significantly under/over estimate, note why for future planning`;
    });

    // 3. Success metrics - measurable outcomes
    this.variableProcessors.set('task.success_metrics', (context) =>
      context.task.success_metrics && context.task.success_metrics.length > 0
        ? context.task.success_metrics.map((m: string) => `- [ ] ${m}`).join('\n')
        : '- [ ] All acceptance criteria met\n- [ ] All tests pass\n- [ ] Code review approved');

    // 4. Required skills - expertise validation
    this.variableProcessors.set('task.requiredSkills', (context) =>
      context.task.required_skills && context.task.required_skills.length > 0
        ? context.task.required_skills.map((s: string) => `- ${s}`).join('\n')
        : '- General development skills\n- Ability to read documentation\n- Problem-solving skills');

    // 5. Parent initiative - strategic alignment (using plan_id)
    this.variableProcessors.set('task.parentInitiative', (context) =>
      context.task.plan_id || 'No parent initiative specified - this is an independent task');

    // 6. Related tasks - coordination context
    this.variableProcessors.set('task.relatedTasks', (context) => {
      if (!context.task.related_tasks || context.task.related_tasks.length === 0) {
        return '- None - this task is independent and has no direct dependencies or dependents';
      }

      return context.task.related_tasks.map((t: string) => {
        // Add helpful markers if task describes relationship
        if (t.toLowerCase().includes('depend')) return `- 🔗 ${t}`;
        if (t.toLowerCase().includes('block')) return `- 🚫 ${t}`;
        if (t.toLowerCase().includes('similar') || t.toLowerCase().includes('reference')) return `- 📋 ${t}`;
        return `- ${t}`;
      }).join('\n');
    });

    // 7. Assumptions - verification checklist
    this.variableProcessors.set('task.assumptions', (context) =>
      context.task.assumptions && context.task.assumptions.length > 0
        ? context.task.assumptions.map((a: string) => `- [ ] ${a}`).join('\n')
        : '- [ ] No assumptions documented - proceed with standard approach');

    // 8. Alternatives - decision context
    this.variableProcessors.set('task.alternatives', (context) => {
      if (!context.task.alternatives || context.task.alternatives.length === 0) {
        return '- No alternatives were formally considered\n- If you identify better approaches during implementation, document them for future reference';
      }

      return context.task.alternatives.map((a: string) => `- ❌ ${a}`).join('\n');
    });

    // Task-type-specific guidelines
    this.variableProcessors.set('task.typeGuidelines', (context) => {
      try {
        const guidelines = getGuidelinesForTaskType(context.task.type);
        return formatGuidelinesAsMarkdown(guidelines);
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'failed_to_get_guidelines_for_task_type',
          message: `Failed to get guidelines for task type ${context.task.type}`,
          error
        });
        return `## 📋 Task Type: ${context.task.type}\n\nGeneric task guidelines apply.`;
      }
    });

    // Project and environment
    this.variableProcessors.set('repository', (context) => context.project);
    this.variableProcessors.set('worktree', (context) => context.worktree);
    this.variableProcessors.set('environment', (context) => context.environment);

    // Work target documentation from configuration
    this.variableProcessors.set('workTarget.documentation', (context) => {
      return formatDocumentationForPrompt(context.project);
    });

    // Conditional git workflow variables based on task type (fix vs new implementation)
    this.variableProcessors.set('task.branchSetupInstructions', (context) => {
      if (context.task.followup_for_pr) {
        // Validate PR number to prevent command injection
        const prNumber = parseInt(String(context.task.followup_for_pr), 10);
        if (isNaN(prNumber) || prNumber <= 0) {
          throw new Error(`Invalid PR number: ${context.task.followup_for_pr}`);
        }
        return `# CRITICAL: This is a FIX task for an existing PR #${prNumber}
# Fetch the PR branch name from GitHub
PR_BRANCH=$(gh pr view ${prNumber} --json headRefName --jq .headRefName)
# Checkout the PR branch to make fixes
git checkout "$PR_BRANCH"
# Pull latest changes from the PR branch
git pull origin "$PR_BRANCH"`;
      } else {
        return `# ALWAYS start from main branch (for PR-based workflow)
git checkout main
# ALWAYS pull latest changes to avoid duplicate work
git pull origin main`;
      }
    });

    this.variableProcessors.set('task.branchSetupNote', (context) => {
      if (context.task.followup_for_pr) {
        return `# You will push fixes to the existing PR branch in Step 4
# This updates the existing PR automatically`;
      } else {
        return `# You will create a feature branch in Step 4 after making changes
# This ensures you're always starting from the latest main`;
      }
    });

    this.variableProcessors.set('task.branchSetupCritical', (context) => {
      if (context.task.followup_for_pr) {
        return `You are working on PR #${context.task.followup_for_pr}. Never create a new branch - work directly on the PR branch!`;
      } else {
        return `Never skip \`git pull origin main\` - you must have the latest code to avoid duplicate work!`;
      }
    });

    this.variableProcessors.set('task.prWorkflowTitle', (context) => {
      if (context.task.followup_for_pr) {
        return 'Push Fixes to Existing PR';
      } else {
        return 'Create PR (MANDATORY - DO NOT PUSH DIRECTLY TO STAGING)';
      }
    });

    this.variableProcessors.set('task.prWorkflowDescription', (context) => {
      if (context.task.followup_for_pr) {
        return `**CRITICAL: Push to the PR branch to update PR #${context.task.followup_for_pr}!**`;
      } else {
        return '**CRITICAL: You MUST create a Pull Request to main, NOT push to staging!**';
      }
    });

    this.variableProcessors.set('task.branchCreationStep', (context) => {
      if (context.task.followup_for_pr) {
        return 'Verify PR Branch';
      } else {
        return 'Create Feature Branch';
      }
    });

    this.variableProcessors.set('task.branchCreationContent', (context) => {
      if (context.task.followup_for_pr) {
        // Validate PR number to prevent command injection
        const prNumber = parseInt(String(context.task.followup_for_pr), 10);
        if (isNaN(prNumber) || prNumber <= 0) {
          throw new Error(`Invalid PR number: ${context.task.followup_for_pr}`);
        }
        return `# Verify you're on the correct PR branch
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH=$(gh pr view ${prNumber} --json headRefName --jq .headRefName)
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "ERROR: Not on correct branch! Expected $EXPECTED_BRANCH, got $CURRENT_BRANCH"
  exit 1
fi
echo "✅ Confirmed on PR branch: $EXPECTED_BRANCH"
BRANCH_NAME="$EXPECTED_BRANCH"`;
      } else {
        return `# Extract short UUID from task ID
TASK_ID="{{task.id}}"
SHORT_ID="\${TASK_ID##*-}"
BRANCH_NAME="task-{{task.type}}-\${SHORT_ID}"
echo "Creating feature branch: \${BRANCH_NAME}"
git checkout -b "\${BRANCH_NAME}"`;
      }
    });

    this.variableProcessors.set('task.pushStep', (context) => {
      if (context.task.followup_for_pr) {
        return 'Push to PR Branch';
      } else {
        return 'Push Feature Branch';
      }
    });

    this.variableProcessors.set('task.pushContent', (context) => {
      if (context.task.followup_for_pr) {
        return `# Push to the existing PR branch (this will update the PR)
git push origin "\${BRANCH_NAME}"`;
      } else {
        return `# Push new feature branch
git push -u origin "\${BRANCH_NAME}"`;
      }
    });

    this.variableProcessors.set('task.prCreationStep', (context) => {
      if (context.task.followup_for_pr) {
        return 'Verify PR Updated';
      } else {
        return 'Create Pull Request';
      }
    });

    this.variableProcessors.set('task.prCreationContent', (context) => {
      if (context.task.followup_for_pr) {
        return `# This is a fix task - outputting existing PR information
echo "✅ Pushed fixes to existing PR #${context.task.followup_for_pr}"
echo "The PR has been updated with your fixes"`;
      } else {
        return `# Build PR description with warnings
PR_BODY="## Summary
This PR implements {{task.title}}

$(cat <<'ACCEPTANCE'
## Acceptance Criteria
{{task.acceptance_criteria}}
ACCEPTANCE
)

## Test plan
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Manual testing completed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
"

# Create PR with error handling - MANDATORY
echo "Creating PR..."
if ! gh pr create --base main --head "\${BRANCH_NAME}" \\
  --title "{{task.type}}: {{task.title}}" \\
  --body "$PR_BODY"; then
  echo "❌ ERROR: Failed to create PR"
  echo "GitHub CLI authentication or network issue"
  echo "Branch \${BRANCH_NAME} was pushed but PR creation failed"
  echo ""
  echo "Debugging info:"
  gh auth status || echo "gh auth failed"
  exit 1  # Exit with error to trigger failure recovery
fi

echo "PR created successfully, capturing metadata..."`;
      }
    });

    this.variableProcessors.set('task.prOutputStep', (context) => {
      if (context.task.followup_for_pr) {
        return 'Output PR Link';
      } else {
        return 'Verify and Output PR';
      }
    });

    this.variableProcessors.set('task.prOutputContent', (context) => {
      const viewTarget = context.task.followup_for_pr ? `${context.task.followup_for_pr}` : '"${BRANCH_NAME}"';
      const actionVerb = context.task.followup_for_pr ? 'updated' : 'created';

      return `# Capture PR metadata for reporting
PR_NUMBER=$(gh pr view ${viewTarget} --json number --jq .number)
PR_URL=$(gh pr view ${viewTarget} --json url --jq .url)
PR_BRANCH=$(gh pr view ${viewTarget} --json headRefName --jq .headRefName)

# Verify PR metadata was captured
if [ -z "$PR_NUMBER" ] || [ -z "$PR_URL" ]; then
  echo "❌ ERROR: Failed to retrieve PR metadata"
  echo "This usually means PR ${actionVerb} failed or gh CLI cannot access GitHub"
  gh auth status || echo "gh auth verification failed"
  exit 1
fi

echo "✅ PR ${actionVerb}: $PR_URL"
echo "PR_NUMBER: $PR_NUMBER"
echo "PR_URL: $PR_URL"
echo "PR_BRANCH: $PR_BRANCH"`;
    });

    this.variableProcessors.set('task.prVerificationContent', (context) => {
      if (context.task.followup_for_pr) {
        return `
**VERIFICATION CHECKLIST:**
- [ ] Pushed to PR branch
- [ ] PR #${context.task.followup_for_pr} shows your new commits
- [ ] CI checks are running on the PR`;
      } else {
        return `
**VERIFICATION CHECKLIST:**
- [ ] PR created successfully
- [ ] PR is targeting \`main\` branch (NOT staging)
- [ ] PR description includes task details
- [ ] CI checks are running`;
      }
    });

    // Context Bundle processor
    this.variableProcessors.set('task.contextBundle', (context) => {
      // Skip if task has no context bundle metadata
      if (!context.task.context_bundle_id && !context.task.context_profiles) {
        return 'No context bundle available for this task.';
      }

      const profiles = context.task.context_profiles || [];
      const bundlePath = '/workspace/context';

      let output = `This task has a curated context bundle with the following profiles:\n\n`;

      if (profiles.length > 0) {
        profiles.forEach((profile) => {
          const fileName = `${profile}.md`;
          const displayName = profile
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          output += `### 📄 ${displayName}\n`;
          output += `**File**: \`${bundlePath}/${fileName}\`\n`;
          output += `**Purpose**: ${this.getProfilePurpose(profile)}\n`;
          output += `**When to Read**: ${this.getProfileGuidance(profile)}\n\n`;
        });

        output += `\n**💡 How to Use Context Files:**\n`;
        output += `1. Read the relevant context files BEFORE implementing\n`;
        output += `2. Use the file paths above (context files are at \`${bundlePath}/\`)\n`;
        output += `3. Context files contain investigation steps, constraints, and patterns\n`;
        output += `4. Follow the guidance in these files to avoid common mistakes\n\n`;
        output += `**⚠️ Important**: These files are READ-ONLY references. Do not modify them.\n`;
      } else {
        output += `Context bundle ID: ${context.task.context_bundle_id}\n`;
        output += `No specific profiles loaded. Context files available at: \`${bundlePath}/\`\n`;
      }

      return output;
    });
  }

  /**
   * Get the purpose description for a context profile
   */
  private getProfilePurpose(profile: string): string {
    const purposes: Record<string, string> = {
      'scope-control': 'Prevents scope creep and feature invention',
      'dev-monitor': 'Development best practices and patterns',
      'pr-workflow': 'Git and PR workflow guidelines',
      'failure-recovery': 'Error handling and recovery patterns',
      'deployment': 'Deployment and production guidelines',
      'testing': 'Testing strategies and requirements',
      'security': 'Security best practices and constraints'
    };
    return purposes[profile] || 'Context-specific guidance';
  }

  /**
   * Get guidance on when to read a context profile
   */
  private getProfileGuidance(profile: string): string {
    const guidance: Record<string, string> = {
      'scope-control': 'Read BEFORE planning implementation to understand boundaries',
      'dev-monitor': 'Read BEFORE coding to follow established patterns',
      'pr-workflow': 'Read BEFORE creating branches/PRs',
      'failure-recovery': 'Read BEFORE implementing error handling',
      'deployment': 'Read BEFORE making deployment-related changes',
      'testing': 'Read BEFORE writing tests',
      'security': 'Read BEFORE handling auth, data, or sensitive operations'
    };
    return guidance[profile] || 'Read before relevant implementation steps';
  }

  /**
   * Get guidance text for complexity level
   */
  private getComplexityGuidance(complexity: string): string {
    switch (complexity.toLowerCase()) {
      case 'simple':
        return '(straightforward implementation, well-understood patterns)';
      case 'medium':
        return '(requires some design decisions, moderate technical challenges)';
      case 'complex':
        return '(significant design work, multiple integration points, technical challenges)';
      case 'expert':
        return '(cutting-edge tech, architectural decisions, high risk/impact)';
      default:
        return '';
    }
  }

  /**
   * Get guidance text for confidence level
   */
  private getConfidenceGuidance(confidence: string | undefined): string {
    if (!confidence) return '';
    switch (confidence.toLowerCase()) {
      case 'low':
        return '(significant unknowns, estimate may be off by 2-3x)';
      case 'medium':
        return '(some unknowns, estimate may vary by 50%)';
      case 'high':
        return '(well-understood scope, estimate should be accurate)';
      default:
        return '';
    }
  }

  /**
   * Generate a prompt for a task using the universal template
   */
  public generatePrompt(context: TaskContext): string {
    return this.processTemplate(this.template.template, context);
  }


  /**
   * Process a template with context variables
   */
  private processTemplate(template: string, context: TaskContext): string {
    let processedTemplate = template;
    const maxPasses = 4;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let updatedTemplate = processedTemplate;

      this.variableProcessors.forEach((processor, variable) => {
        const placeholder = `{{${variable}}}`;
        if (!updatedTemplate.includes(placeholder)) {
          return;
        }
        const value = processor(context);
        updatedTemplate = updatedTemplate.split(placeholder).join(value);
      });

      processedTemplate = updatedTemplate;
      if (!processedTemplate.includes('{{')) {
        break;
      }
    }

    return processedTemplate;
  }

  /**
   * Get the universal template
   */
  public getTemplate(): TaskPromptTemplate {
    return this.template;
  }

  /**
   * Get system-specific architecture documentation links based on project
   */
  private getSystemArchitectureDocs(project: string): string[] {
    const archDocs: string[] = [];
    
    switch (project.toLowerCase()) {
      case 'job-finder-be':
      case 'backend':
        archDocs.push(
          '- [Backend Architecture](../docs/architecture/backend.md)',
          '- [Database Schema](../docs/architecture/database-schema.md)',
          '- [Firebase Functions Guide](../docs/deployment/FIREBASE_FUNCTIONS_V2_PERMISSIONS_GUIDE.md)',
          '- [Firestore Setup](../docs/deployment/FIRESTORE_COMPLETE_SETUP.md)'
        );
        break;
        
      case 'job-finder-fe':
      case 'frontend':
        archDocs.push(
          '- [Frontend Architecture](../docs/architecture/frontend.md)',
          '- [Development Stack](../docs/development/DEVELOPMENT_STACK.md)',
          '- [Frontend Deployment](../docs/deployment/FE_DEPLOYMENT_PLAN.md)'
        );
        break;
        
      case 'job-finder-worker':
      case 'worker':
        archDocs.push(
          '- [Worker Architecture](../docs/architecture/worker.md)',
          '- [Worker Docker Development](../docs/development/WORKER_DOCKER_DEV.md)',
          '- [Worker Analysis](../docs/development/WORKFLOW_ANALYSIS_WORKER.md)'
        );
        break;
        
      case 'dev-monitor':
        archDocs.push(
          '- [Dev Monitor Requirements](../docs/development/DEV_MONITOR_REQUIREMENTS.md)',
          '- [Dev Monitor UI Proposal](../docs/development/DEV_MANAGEMENT_UI_PROPOSAL.md)',
          '- [Logging Architecture](../docs/operations/logging-architecture.md)',
          '- [Structured Logging Migration](../docs/operations/STRUCTURED_LOGGING_MIGRATION.md)'
        );
        break;

      case 'dev-bots':
        archDocs.push(
          '- [Dev-Bots README](../docs/dev-bots/README.md)',
          '- [System Architecture Overview](../docs/dev-bots/architecture/system-overview.md)',
          '- [Context Isolation](../docs/dev-bots/architecture/context-isolation.md)',
          '- [Implementation Guide](../docs/dev-bots/implementation/implementation-guide.md)',
          '- [Task Queue Architecture](../docs/dev-bots/task-queue.md)',
          '- [SQLite Integration Plan](../docs/dev-bots/SQLITE_INTEGRATION_PLAN.md)',
          '- [Scope Control System](../docs/dev-bots/SCOPE_CONTROL_SYSTEM.md)',
          '- [Testing Strategy](../docs/dev-bots/TESTING_STRATEGY.md)',
          '- [Timeout Handling Strategy](../docs/dev-bots/TIMEOUT_HANDLING_STRATEGY.md)'
        );
        break;
        
      case 'job-finder-shared-types':
      case 'shared-types':
        archDocs.push(
          '- [Shared Types Documentation](../docs/development/NPM_PUBLISHING_SETUP.md)',
          '- [Package Management](../docs/development/MCP_SERVER_RECOMMENDATIONS.md)'
        );
        break;
        
      default:
        // Generic architecture docs for unknown projects
        archDocs.push(
          '- [System Architecture Overview](../docs/architecture/system-overview.md)',
          '- [Architecture Reality](../docs/architecture/architecture-reality.md)'
        );
    }
    
    return archDocs;
  }

  /**
   * Intelligently discover relevant documentation based on task content
   * Analyzes task title, description, and type to suggest helpful docs
   */
  private discoverRelevantDocumentation(context: TaskContext): string[] {
    const searchText = `${context.task.title} ${context.task.description || ''} ${context.task.type || ''}`.toLowerCase();

    return DOC_SUGGESTION_RULES.reduce<string[]>((docs, rule) => {
      if (rule.pattern.test(searchText)) {
        const entries = typeof rule.docs === 'function' ? rule.docs(context) : rule.docs;
        docs.push(...entries);
      }
      return docs;
    }, []);
  }
}
