# App Monitor Documentation

**Last Updated:** 2025-11-15

## Quick Navigation

### 🎯 Start Here
- [Master Design Intent](architecture/master-design-intent.md) - THE source of truth for architecture
- [Prioritized Roadmap](plans/PRIORITIZED_FEATURE_ROADMAP.md) - What to work on next
- [Stabilization Plan](plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase priorities

### 📖 Common Tasks
- **Setup:** [Environment Setup](setup/ENVIRONMENT_SETUP.md) | [Production Deployment](guides/PRODUCTION_DEPLOYMENT.md)
- **Development:** [Task Submission](guides/TASK_SUBMISSION_GUIDE.md) | [Frontend Dev](guides/FRONTEND_DEVELOPMENT.md)
- **Reference:** [API Docs](guides/API_REFERENCE.md) | [Agent Personalities](guides/agent-personalities.md)

## Documentation Structure

### `/architecture` - System Design
Core architecture and design decisions.
- **master-design-intent.md** - Authoritative architecture document
- **system-overview.md** - Component relationships and data flow

### `/plans` - Active Roadmaps
Current and upcoming work plans.
- **PRIORITIZED_FEATURE_ROADMAP.md** - Feature priorities and timeline
- **APP_MONITOR_STABILIZATION_PLAN.md** - Pre-POC stabilization work
- **CONTEXT_MANAGEMENT_COMPLETION_PLAN.md** - Context system roadmap

### `/technicalDesigns` - Unimplemented Features
Designs for features not yet implemented.
- **integrated-planning-system-implementation-plan.md** - Planning system design
- **agent-selector-gemini-offload.md** - Gemini delegation strategy
- **error-detection-and-recovery-design.md** - Recovery system design
- **staged-task-queue.md** - Queue architecture (implemented, kept for reference)

### `/guides` - How-To & Reference
Practical guides for development and operations.
- **Task Management:** submission, execution, examples
- **Development:** frontend, API, authentication, webhooks
- **Deployment:** production setup, CI/CD, Docker
- **Troubleshooting:** failure recovery, logging

### `/setup` - Installation & Configuration
Environment setup and deployment instructions.
- **ENVIRONMENT_SETUP.md** - Development environment
- **PRODUCTION_SETUP_QUICKSTART.md** - Production deployment
- **CI_CD_SETUP.md** - Continuous integration
- **ENV_CONFIGURATION_UPDATE.md** - Environment variable guide

### `/analysis` - Technical Analysis
In-depth analysis of system components (kept for reference).
- **ECOSYSTEM_ANALYSIS.md** - Related repositories and integration points

## Documentation Principles

1. **Actionable** - Every document should guide action or decision-making
2. **Current** - Remove completed work that provides no ongoing value
3. **Organized** - Clear hierarchy: Architecture → Plans → Designs → Guides
4. **Concise** - Direct communication, minimal fluff

## Finding What You Need

**I want to...**
- *Understand the system* → Start with `architecture/master-design-intent.md`
- *Know what to build next* → See `plans/PRIORITIZED_FEATURE_ROADMAP.md`
- *Submit a task* → Use `guides/TASK_SUBMISSION_GUIDE.md`
- *Deploy to production* → Follow `guides/PRODUCTION_DEPLOYMENT.md`
- *Set up dev environment* → See `setup/ENVIRONMENT_SETUP.md`
- *Understand a feature design* → Check `technicalDesigns/`

## Maintenance

- **Remove** completed work with no future reference value
- **Consolidate** duplicate or overlapping documentation
- **Update** architecture docs when fundamental changes occur
- **Archive** historical analysis that doesn't inform future decisions
