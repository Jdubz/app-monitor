# Documentation System Philosophy & Guidelines

**Purpose:** Define the strict rules for creating, maintaining, and pruning documentation to maximize development velocity and minimize documentation sprawl.

**Core Principle:** If documentation doesn't directly contribute to development velocity, it should be deleted.

---

## Philosophy

### Documentation is a Liability, Not an Asset

- Every document created is **technical debt** that must be maintained
- Documentation becomes **outdated** the moment it's written
- More documentation ≠ better documentation
- **Delete-first mentality**: When in doubt, delete it

### What Documentation is NOT

❌ **Status reports** - Code and commits are the status  
❌ **Implementation summaries** - "What we did" has no future value  
❌ **Meeting notes** - Unless actionable tasks extracted  
❌ **Analysis without action** - Investigation without next steps  
❌ **Duplicate information** - If it exists elsewhere, delete  
❌ **Historical records** - Git history is sufficient  
❌ **Vanity docs** - Impressive-looking but unused  

### What Documentation IS

✅ **Architecture decisions** - Why the system is designed this way  
✅ **Workflow guides** - How to execute specific processes  
✅ **Decision-making frameworks** - Rules for autonomous agents  
✅ **Outstanding work** - Task lists, plans, roadmaps  
✅ **Technical designs** - Specs for upcoming features  
✅ **Action-oriented analysis** - Investigation + specific next steps  

---

## Allowed Document Types

### 1. Architecture Documents (`/architecture/`)

**Purpose:** Explain system design and constraints

**Required Elements:**
- Why this design was chosen (trade-offs)
- High-level restrictions and rules
- Component relationships
- Non-negotiable constraints

**Examples:**
- `master-design-intent.md` - Core philosophy and restrictions
- `system-overview.md` - Component architecture
- `dev-bots-overview.md` - Bot system design

**Prohibited:**
- Implementation details (those go in code comments)
- Step-by-step tutorials (those go in guides)
- Historical "how we got here" narratives

**Lifespan:** Permanent, updated as architecture evolves

---

### 2. Workflow Guides (`/guides/`)

**Purpose:** Operational how-tos for specific tasks

**Required Elements:**
- Clear goal statement
- Prerequisites
- Step-by-step instructions
- Expected outcomes
- Common pitfalls

**Examples:**
- `PRODUCTION_DEPLOYMENT.md` - How to deploy
- `MINIMAL_TASK_SUBMISSION_GUIDE.md` - How to submit tasks
- `FRONTEND_DEVELOPMENT.md` - Frontend development workflow

**Prohibited:**
- "Why" explanations (link to architecture docs instead)
- Multiple ways to do the same thing (pick one, delete others)
- Outdated workflows (update or delete)

**Lifespan:** Permanent, updated when process changes

**Deletion Trigger:** Workflow no longer used or automated away

---

### 3. Plans & Roadmaps (`/plans/`)

**Purpose:** Outstanding work not yet implemented

**Required Elements:**
- **Clear scope** - What will be done
- **Success criteria** - When is it complete?
- **Task breakdown** - Actionable items
- **Priority level** - P0, P1, P2, P3

**Examples:**
- `APP_MONITOR_STABILIZATION_PLAN.md` - Current phase work
- `PRIORITIZED_FEATURE_ROADMAP.md` - Future features

**Prohibited:**
- "Nice to have" ideas without priority
- Vague aspirations without actionable tasks
- Completed work still marked as "planned"

**Lifespan:** Temporary - **DELETE when complete**

**Deletion Trigger:** All tasks completed OR plan abandoned

---

### 4. Technical Designs (`/technicalDesigns/`)

**Purpose:** Detailed specifications for upcoming features

**Required Elements:**
- Problem statement
- Proposed solution
- API contracts / interfaces
- Database schema changes
- Migration strategy
- Success metrics

**Examples:**
- `staged-task-queue.md` - Task queue design
- `error-detection-and-recovery-design.md` - Error handling design

**Prohibited:**
- Designs for features that will never be built
- Multiple competing designs (pick one, delete others)
- Designs for already-implemented features (delete after implementation)

**Lifespan:** Temporary during planning, permanent after implementation

**Deletion Trigger:** Feature abandoned OR fully documented in architecture docs

---

### 5. Analysis Documents (`/analysis/`)

**Purpose:** Investigation results with specific action items

**Required Elements:**
- **Problem being investigated**
- **Findings** (concise)
- **Action items** - Specific next steps with owners
- **Deletion date** - When this analysis expires

**Format:**
```markdown
# Analysis: [Problem]

## Investigation
[2-3 paragraphs max]

## Findings
- Finding 1
- Finding 2

## Action Items
- [ ] Task 1 (Owner: X, Priority: P1)
- [ ] Task 2 (Owner: Y, Priority: P2)

## Delete After
[Date or trigger event]
```

**Prohibited:**
- Open-ended exploration without conclusions
- Analysis without action items
- Historical "what we learned" narratives

**Lifespan:** **Maximum 30 days**

**Hard Limit:** Max 5 files in `/analysis/` - oldest deleted when limit reached

**Deletion Triggers:**
- Action items completed
- 30 days elapsed
- Analysis superseded by new investigation

---

## Folder Structure

```
docs/
├── architecture/          # Permanent design decisions
│   ├── master-design-intent.md (MUST be <200 lines)
│   └── system-overview.md
├── guides/                # Permanent operational how-tos
│   ├── PRODUCTION_DEPLOYMENT.md
│   └── FRONTEND_DEVELOPMENT.md
├── plans/                 # DELETE when complete
│   └── current-phase-plan.md
├── technicalDesigns/      # Specs for upcoming features
│   └── feature-name.md
├── analysis/              # Action-oriented investigations (max 5, max 30 days)
│   └── problem-investigation.md
└── setup/                 # Environment configuration guides
    └── ENVIRONMENT_SETUP.md
```

**Prohibited Folders:**
- ❌ `/archive/` - Use git history instead
- ❌ `/completed/` - Delete, don't archive
- ❌ `/drafts/` - Work in progress should be in branches
- ❌ `/meeting-notes/` - Extract action items, delete rest
- ❌ `/investigation/` - Use `/analysis/` with deletion dates
- ❌ `/implementation/` - Implementation details belong in code

---

## Naming Conventions

### File Names

**DO:**
- `SCREAMING_CASE.md` for top-level important docs
- `kebab-case.md` for technical/subordinate docs
- Descriptive names: `error-recovery-design.md`

**DON'T:**
- Version numbers: `plan-v2.md` (use git history)
- Dates: `analysis-2025-11-15.md` (use git commits)
- Status markers: `COMPLETED.md`, `DRAFT.md`, `WIP.md`
- Vague names: `notes.md`, `thoughts.md`, `ideas.md`

### Headers

Every document MUST start with:
```markdown
# [Title]

**Purpose:** [One sentence describing why this exists]

[If temporary: **Delete After:** [Date or trigger]]

---
```

---

## Enforcement Rules

### Hard Limits (CI-Enforced)

- ❌ No `/archive/` directories
- ❌ No versioned docs (`-v2.md`, `-new.md`, `-old.md`)
- ❌ No completion markers (`COMPLETED.md`, `DONE.md`)
- ❌ No databases in docs/ (`.db` files)
- ❌ `master-design-intent.md` > 200 lines
- ❌ `/analysis/` > 5 files
- ❌ Total docs > 60 files

### Soft Limits (Review Required)

- ⚠️ `/guides/` > 25 files → Consolidate related guides
- ⚠️ `/plans/` > 10 files → Delete completed/abandoned plans
- ⚠️ `/technicalDesigns/` > 20 files → Archive to architecture or delete

---

## Document Lifecycle

### 1. Creation

**Before creating a document, ask:**
1. Does this already exist? (If yes, update existing)
2. Will this be read more than once?
3. Does this have specific action items OR architecture value?
4. Can this information live in code comments instead?

**If all answers aren't "YES", don't create the document.**

### 2. Maintenance

**Every document review (quarterly):**
- Is this still accurate? (If no, update or delete)
- Has this been referenced in 90 days? (If no, consider deleting)
- Does this duplicate other docs? (If yes, consolidate)
- Is this actionable? (If no, delete)

### 3. Deletion

**Delete immediately when:**
- Plan/roadmap completed
- Analysis action items finished
- Workflow automated away
- Information moved to code
- Feature abandoned
- Document hasn't been opened in 6 months

**How to delete:**
```bash
git rm docs/path/to/file.md
git commit -m "docs: delete [reason]"
```

**Never archive.** If you need it later, use `git log` and `git show`.

---

## Agent Guidelines

### For Autonomous Agents

**When creating documentation:**
1. Check if document already exists (update, don't duplicate)
2. Verify document type is allowed (see "Allowed Document Types")
3. Include required elements for that type
4. Add deletion trigger if temporary
5. Keep under 300 lines (split if longer)

**When updating documentation:**
1. Only update if information changed or clarification needed
2. Don't add "last updated" timestamps (git provides this)
3. Don't add change logs (git provides this)
4. Remove obsolete sections, don't comment them out

**Prohibited actions:**
- ❌ Creating summary/status/completion documents
- ❌ Creating versioned copies instead of updating
- ❌ Adding TODO sections without converting to tasks
- ❌ Creating analysis without action items
- ❌ Writing "what we did" implementation summaries

### For Human Developers

**Monthly documentation audit:**
```bash
# Find documents not modified in 90 days
find docs -name "*.md" -mtime +90

# Review and delete stale docs
git rm [file]
```

**Pre-commit checklist:**
- [ ] Is this document necessary?
- [ ] Does it have a clear purpose?
- [ ] Does it follow naming conventions?
- [ ] Is it in the correct folder?
- [ ] Does it have a deletion trigger (if temporary)?

---

## Special Cases

### README Files

**Allowed in:**
- `/docs/README.md` - Navigation index ONLY
- `/docs/[folder]/README.md` - Folder index ONLY

**Prohibited:**
- README files that duplicate content from other docs
- README files with implementation details
- README files with historical narratives

**Format:**
```markdown
# [Folder Name]

Quick index of documents in this folder.

## Documents

- **[file.md]** - [One sentence description]
- **[file2.md]** - [One sentence description]
```

### Context Management Docs

**Recipes and profiles** in `backend/src/context-management/`:
- These are CODE, not documentation
- Should be versioned and tested
- Changes require code review

---

## Migration from Current State

**Immediate actions:**

1. **Delete `/implementation/` folder** - All completed work summaries (no value)
2. **Review `/analysis/`** - Convert to action items or delete
3. **Audit `/plans/`** - Delete completed plans
4. **Consolidate guides** - Merge duplicate how-tos
5. **Review `/technicalDesigns/`** - Delete designs for abandoned features

**Validation:**
```bash
# Run documentation audit
npm run docs:audit

# Should pass CI checks
npm run docs:validate
```

---

## Summary: The Rule of Three

Every document must answer YES to all three:

1. **Is it actionable?** (Guides, plans, designs with tasks)
2. **Is it architectural?** (Design decisions, constraints)
3. **Will it be referenced?** (Used by developers or agents)

**If any answer is NO → DELETE**

---

**Remember:** The best documentation is the documentation you don't need to write. Code, types, and tests are self-documenting. Only create docs when absolutely necessary for development velocity.
