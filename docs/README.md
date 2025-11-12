# App Monitor Documentation

Comprehensive documentation for the App Monitor developer tool and autonomous development platform.

**Version:** 0.2.0
**Last Updated:** 2025-11-11
**Status:** Pre-POC Stabilization

---

## 📋 Recent Updates

**2025-11-12 Production Stability:**
- 🚨 **CRITICAL:** Zero-downtime deployment plan created
- Production unstable during deploys/restarts
- See [Zero-Downtime Deployment Plan](./plans/ZERO_DOWNTIME_DEPLOYMENT_PLAN.md)
- Redis-based state sharing + graceful shutdown required

**2025-11-11 Documentation Review:**
- ✅ Fixed 15+ broken documentation links
- ✅ Verified database consolidation complete
- ✅ Updated plan statuses to reflect reality
- 📄 See [Documentation Review Summary](./DOCUMENTATION_REVIEW_SUMMARY.md) for details
- 📄 See [Critical Improvements Report](./CRITICAL_IMPROVEMENTS_2025-11-11.md) for technical details

**2025-11-12 Quick Wins Completed:**
- ✅ Automated link checker added to CI
- ✅ 5 completed plans archived (30 → 25 active)
- ✅ Legacy databases cleaned up

---

## Quick Navigation

### Essential Documentation
- [Architecture Overview](./architecture/README.md) - Complete system design and components
- [Setup Guide](./setup/README.md) - Detailed installation, configuration, and troubleshooting
- [Planning & Roadmap](./plans/PRIORITIZED_FEATURE_ROADMAP.md) - Prioritized tasks and long-term vision

### Development
- [Development Guide](../CONTRIBUTING.md) - Developer workflows and best practices
- [Contributing Guide](../CONTRIBUTING.md) - Git hooks, CI/CD, contribution guidelines

### Planning & Strategy
- [Stabilization Plan](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase (v0.2.0) details
- [Capability Roadmap](./plans/APP_MONITOR_CAPABILITY_ROADMAP.md) - Feature swimlanes and autonomy phases
- [Planning Overview](./plans/README.md) - All planning documents

### Migration & History
- [Migration Guide](./MIGRATION_GUIDE.md) - From dev-monitor to app-monitor
- [Session Summaries](./sessions/) - Historical implementation and fix sessions
- [Recovery Complete](./sessions/RECOVERY_COMPLETE.md) - System recovery documentation (Oct 25, 2025)

---

## Documentation Structure

### Core Documentation (Start Here)

#### `/architecture.md`
Complete system architecture covering:
- System vision and evolution phases
- Component relationships and data flow
- Technology stack (backend, frontend, dev-bots)
- Security and safety mechanisms
- API contracts and design decisions

#### `/setup.md`
Comprehensive setup guide including:
- Prerequisites and installation
- Configuration (log sources, ports, services)
- Verification and testing procedures
- Production setup instructions
- Troubleshooting common issues

#### `/next-steps.md`
Roadmap and task prioritization:
- Current status and recent accomplishments
- Immediate priorities (critical path)
- Stabilization tasks (detailed breakdown)
- POC phase plans
- Autonomy phase vision
- Success metrics and priority matrix

### Planning Documentation (`/plans/`)

Strategic planning and evolution documents:
- **APP_MONITOR_STABILIZATION_PLAN.md** - v0.2.0 stabilization workstreams
- **APP_MONITOR_CAPABILITY_ROADMAP.md** - Feature swimlanes (Stabilize → POC → Autonomy)
- **BOT_PROMPT_ENGINEERING_V3.md** - Prompt engineering strategy
- **BOT_EXECUTION_FINDINGS_2025-11-06.md** - Recent execution analysis
- **DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md** - Pipeline improvements
- **CONTEXT_BLOB_PRELOADING.md** - Context management strategy
- See [plans/README.md](./plans/README.md) for complete list

### Dev-Bots Documentation (`/dev-bots/`)

Autonomous development system documentation:
- **README.md** - Dev-bots overview and quick start
- **architecture/** - System design and context isolation
- **api/** - API endpoints and agent personalities
- **analysis/** - Comprehensive analysis and quick reference
- **deployment/** - Deployment checklists and orchestration
- **examples/** - Task examples and templates
- **healing/** - Healing system design
- **learning/** - Learning system analysis
- **scope-control/** - Scope control system
- See [dev-bots/docs/README.md](./dev-bots/README.md) for complete structure

### Dev-Monitor Documentation (`/dev-monitor/`)

Original dev-monitor documentation (legacy):
- **REFACTORING_DOCUMENTATION.md** - Historical refactoring notes
- **E2E_TESTING_GUIDE.md** - End-to-end testing strategies
- **STATUS.md** - Historical status tracking
- Phase completion summaries (Phase 3, 4)
- Implementation review summaries

### Session Documentation (`/sessions/`)

Historical implementation and fix sessions:
- **RECOVERY_COMPLETE.md** - System recovery (Oct 25, 2025)
- **FRONTEND_FIX_SUMMARY.md** - Frontend fixes
- **GIT_HOOKS_SETUP_SUMMARY.md** - Git hooks implementation
- **WEBSOCKET_FIX.md** - WebSocket issues resolution
- **TEST_CONFIG_AUDIT.md** - Test configuration audit
- Other session summaries and implementation notes

### Other Documentation

- **MIGRATION_GUIDE.md** - Migration from dev-monitor/claude-workers
- **DEVELOPMENT.md** - Detailed development workflows
- **GOOGLE_CLOUD_LOGGING_PERMISSIONS.md** - GCP IAM setup for logging
- **PLANNING_SUMMARY.md** - Planning document summary
- **ANALYSIS_INDEX.md** - Analysis documents index

---

## Document Categories

### By Topic

**Architecture & Design**
- [architecture/](./architecture/README.md) - System architecture
- [master-design-intent.md](./architecture/master-design-intent.md) - Master design document
- [dev-bots-overview.md](./architecture/dev-bots-overview.md) - Dev-bots architecture

**Setup & Configuration**
- [setup/](./setup/README.md) - Complete setup guide
- [guides/MIGRATION_GUIDE.md](./guides/MIGRATION_GUIDE.md) - Migration instructions
- Backend config in `../backend/config/log-sources.json`

**Development & Contributing**
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - Development guide
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contributing guidelines
- [guides/e2e-testing-guide.md](./guides/e2e-testing-guide.md) - E2E testing

**Planning & Roadmap**
- [plans/PRIORITIZED_FEATURE_ROADMAP.md](./plans/PRIORITIZED_FEATURE_ROADMAP.md) - Prioritized roadmap
- [plans/](./plans/) - All planning documents
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Implementation status overview

**Dev-Bots & Automation**
- [architecture/dev-bots-overview.md](./architecture/dev-bots-overview.md) - Dev-bots documentation
- [guides/api-reference.md](./guides/api-reference.md) - API reference
- [guides/task-examples.md](./guides/task-examples.md) - Task examples

### By Audience

**New Contributors**
1. Start with [../README.md](../README.md) - Project overview
2. Read [setup/README.md](./setup/README.md) - Get system running
3. Review [../CONTRIBUTING.md](../CONTRIBUTING.md) - Learn workflows
4. Check [plans/PRIORITIZED_FEATURE_ROADMAP.md](./plans/PRIORITIZED_FEATURE_ROADMAP.md) - Pick a task

**Experienced Developers**
1. [architecture/README.md](./architecture/README.md) - Understand system design
2. [plans/APP_MONITOR_STABILIZATION_PLAN.md](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current work
3. [plans/PRIORITIZED_FEATURE_ROADMAP.md](./plans/PRIORITIZED_FEATURE_ROADMAP.md) - Prioritized tasks
4. [architecture/dev-bots-overview.md](./architecture/dev-bots-overview.md) - Deep dive into dev-bots

**Planning & Strategy**
1. [plans/APP_MONITOR_CAPABILITY_ROADMAP.md](./plans/APP_MONITOR_CAPABILITY_ROADMAP.md) - Long-term vision
2. [plans/APP_MONITOR_STABILIZATION_PLAN.md](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase
3. [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Implementation status
4. [plans/README.md](./plans/README.md) - All planning docs

---

## Key Concepts

### Project Context
- **Not public-facing** - Internal developer tool only
- **Development-focused** - Not deployed to production
- **Evolving platform** - From monitoring tool to autonomous development system

### Current Phase: Pre-POC Stabilization (v0.2.0)
**Goal:** Restore green builds/tests and establish foundations for autonomous continuous task queue

**Completion:** 85% production-ready
- Backend: 543/543 tests passing ✅
- Frontend: Build and tests passing ✅
- Infrastructure: Ephemeral containers, safety mechanisms ✅

### Evolution Phases
1. **Stabilization** (Current) - Restore health, establish foundations
2. **POC** (Next) - Prove autonomous continuous task queue
3. **Autonomy** (Future) - Self-building, self-improving system

---

## Finding What You Need

### Common Questions

**"How do I set up the system?"**
→ [setup/README.md](./setup/README.md)

**"What's the architecture?"**
→ [architecture/README.md](./architecture/README.md)

**"What should I work on next?"**
→ [plans/PRIORITIZED_FEATURE_ROADMAP.md](./plans/PRIORITIZED_FEATURE_ROADMAP.md) or [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)

**"How do I contribute?"**
→ [../CONTRIBUTING.md](../CONTRIBUTING.md)

**"What are dev-bots?"**
→ [architecture/dev-bots-overview.md](./architecture/dev-bots-overview.md)

**"How do I troubleshoot issues?"**
→ [setup/ENVIRONMENT_SETUP.md](./setup/ENVIRONMENT_SETUP.md)

**"What's the long-term vision?"**
→ [plans/APP_MONITOR_CAPABILITY_ROADMAP.md](./plans/APP_MONITOR_CAPABILITY_ROADMAP.md)

---

## Documentation Standards

### File Organization
- **Root docs/** - Essential documentation (README, implementation status)
- **docs/architecture/** - System architecture and design documents
- **docs/setup/** - Setup and configuration guides
- **docs/guides/** - Operational guides and tutorials
- **docs/plans/** - Strategic planning documents
- **docs/investigations/** - Investigation and analysis documents
- **docs/archive/** - Historical documentation

### Naming Conventions
- `*.md` - All documentation in Markdown
- `UPPERCASE_WITH_UNDERSCORES.md` - Planning and formal documents
- `lowercase-with-dashes.md` - Technical documentation
- `README.md` - Directory overview and navigation

### Document Structure
All major documents should include:
1. Title and metadata (version, date, status)
2. Table of contents (for longer docs)
3. Clear sections with headers
4. Cross-references to related docs
5. Last updated date

---

## Contributing to Documentation

### When to Update Documentation

**Always update documentation when:**
- Adding new features or components
- Changing architecture or workflows
- Fixing bugs that affected documented behavior
- Adding new configuration options
- Creating new planning documents

**Documentation checklist:**
- [ ] Update relevant technical docs
- [ ] Update architecture if system design changed
- [ ] Update setup guide if installation changed
- [ ] Update next-steps if priorities shifted
- [ ] Update README navigation if structure changed

### Documentation Review Process

1. **Technical accuracy** - Verify against actual code
2. **Completeness** - No missing information
3. **Clarity** - Easy to understand
4. **Cross-references** - Links work and are relevant
5. **Formatting** - Consistent style and structure

---

## Document Maintenance

### Regular Updates
- **Weekly**: Update [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) with completed tasks
- **Monthly**: Review and update [plans/APP_MONITOR_STABILIZATION_PLAN.md](./plans/APP_MONITOR_STABILIZATION_PLAN.md)
- **Per phase**: Update [architecture/](./architecture/) for major changes
- **As needed**: Investigation notes in [investigations/](./investigations/)

### Deprecation Process
1. Mark document as deprecated with notice at top
2. Link to replacement documentation
3. Move to appropriate archive after 1 month
4. Update all cross-references

### Archive Structure
- **docs/archive/** - Archived documentation organized by topic

---

## Getting Help

### Documentation Issues
- Missing documentation? Create an issue
- Found an error? Submit a PR with correction
- Need clarification? Ask in discussions

### Support Resources
- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community help
- **Documentation** - Start here first

---

**Version:** 2.0
**Last Updated:** 2025-11-11
**Maintained by:** Platform Tooling
