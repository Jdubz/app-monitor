# App Monitor Documentation

Comprehensive documentation for the App Monitor developer tool and autonomous development platform.

**Version:** 0.2.0
**Last Updated:** 2025-11-12 17:56 UTC
**Status:** Pre-POC Stabilization

---

## 📋 Recent Updates

**2025-11-12 Staged Queue System - COMPLETE ✅**
- ✅ Chain-aware task scheduling with concurrency limits (MAX_DEV_BOTS)
- ✅ Two-stage queues: implementation (new chains) + followup (REVIEW/FIX)
- ✅ ChainTracker service for full chain lifecycle management
- ✅ ChainStatusPanel UI with real-time monitoring and manual intervention
- ✅ API endpoints for stats, blocked chains, and unblocking
- ✅ Schema migrations 012-015 (staged queue + Phase 2A cleanup)
- ✅ All 936 backend tests passing
- 📚 See [Technical Design](./technicalDesigns/staged-task-queue.md) (now marked complete)

**2025-11-12 Documentation Organized:**
- ✅ Updated all staged queue documentation to reflect completed status
- ✅ Cleaned up outdated documentation
- ✅ Organized docs structure for clarity

**2025-11-12 Deployment Documentation Consolidated:**
- ✅ Updated [Production Deployment Guide](./guides/PRODUCTION_DEPLOYMENT.md)
- ✅ Comprehensive blue-green deployment documentation
- ✅ Health checks, graceful shutdown, troubleshooting
- ✅ Removed redundant deployment status docs

**2025-11-12 Production Stability:**
- ✅ Zero-downtime deployment infrastructure complete
- ✅ Blue-green deployment working (ports 5001 ↔ 5002)
- ✅ Health-gated traffic switching
- See [Production Deployment Guide](./guides/PRODUCTION_DEPLOYMENT.md)

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
- [Planning Overview](./plans/README.md) - All planning documents

### Migration & History
- [Migration Guide](./guides/MIGRATION_GUIDE.md) - From dev-monitor to app-monitor

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
- **BOT_PROMPT_ENGINEERING_V3.md** - Prompt engineering strategy
- **DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md** - Pipeline improvements
- See [plans/README.md](./plans/README.md) for complete list

### Other Documentation

- **guides/** - Operational guides (migration, deployment, API reference, testing)
- **setup/** - Setup and configuration documentation
- **DATABASE_MIGRATION_SAFETY.md** - Database migration safety mechanisms
- **database-migrations.md** - Migration management system

---

## Document Categories

### By Topic

**Architecture & Design**
- [architecture/](./architecture/README.md) - System architecture
- [master-design-intent.md](./architecture/master-design-intent.md) - Master design document

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

**Dev-Bots & Automation**
- [guides/api-reference.md](./guides/api-reference.md) - API reference
- [guides/task-examples.md](./guides/task-examples.md) - Task examples

**Analysis & Investigations**
- [analysis/](./analysis/README.md) - Analysis reports and investigations

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

**Planning & Strategy**
1. [plans/APP_MONITOR_STABILIZATION_PLAN.md](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase
2. [plans/README.md](./plans/README.md) - All planning docs

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
→ [plans/PRIORITIZED_FEATURE_ROADMAP.md](./plans/PRIORITIZED_FEATURE_ROADMAP.md)

**"How do I contribute?"**
→ [../CONTRIBUTING.md](../CONTRIBUTING.md)

**"How do I troubleshoot issues?"**
→ [setup/ENVIRONMENT_SETUP.md](./setup/ENVIRONMENT_SETUP.md)

---

## Documentation Standards

### File Organization
- **Root docs/** - Essential documentation (README)
- **docs/architecture/** - System architecture and design documents
- **docs/setup/** - Setup and configuration guides
- **docs/guides/** - Operational guides and tutorials
- **docs/plans/** - Strategic planning documents
- **docs/analysis/** - Analysis, investigation, and verification documents

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
- **Monthly**: Review and update [plans/APP_MONITOR_STABILIZATION_PLAN.md](./plans/APP_MONITOR_STABILIZATION_PLAN.md)
- **Per phase**: Update [architecture/](./architecture/) for major changes
- **As needed**: Investigation notes in [analysis/](./analysis/)

### Deprecation Process
1. Mark document as deprecated with notice at top
2. Link to replacement documentation
3. Delete deprecated documentation after replacement is validated
4. Update all cross-references

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
