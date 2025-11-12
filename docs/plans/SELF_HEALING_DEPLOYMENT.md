# Self-Healing Deployment System - Future Enhancement

**Date:** 2025-11-12  
**Status:** PROPOSED - Future Implementation  
**Priority:** P3 - Enhancement

---

## Concept

Leverage the existing review/repair bot system to automatically fix failed deployments.

**Current State:**
- Deploy script has health checks and automatic rollback ✅
- Review/repair bots can fix code issues ✅
- **Gap:** Bots cannot access production environment or fix deploy scripts

**Proposed:**
- Special "prod-deploy-bot" with access to production folder
- Can update `.env`, deploy scripts, systemd configs
- Triggered on deployment failure
- Uses existing review/repair workflow

---

## Current Deployment Failure Handling

### What Exists Now

**Location:** `scripts/production/deploy.sh`

```bash
# Phase 7: Health checks
if ! PORT=${TARGET_PORT} "${SCRIPTS_DIR}/health-check.sh"; then
    log_error "Health checks failed on port ${TARGET_PORT}"
    log_info "Starting rollback..."
    "${SCRIPTS_DIR}/rollback.sh" "${ACTIVE_PORT}"
    exit 1
fi
```

**Behavior:**
1. New instance deployed to inactive port (e.g., 5002)
2. Health checks run (service, port, HTTP, database, Docker)
3. **If any check fails:**
   - Rollback triggered automatically
   - Old instance (5001) continues running
   - New instance (5002) stopped and cleaned up
   - Deployment marked as failed

**Result:** Zero downtime, but deployment fails and requires manual fix

---

## Existing Review/Repair System

**Location:** `backend/src/services/` (various files)

**Current Capabilities:**
- Analyze failed PR checks
- Review code for issues
- Create repair tasks
- Apply fixes automatically
- Re-run checks
- Self-healing loop

**Current Limitations:**
- Operates on git repository code
- Cannot access `/opt/app-monitor` (production folder)
- Cannot modify:
  - Production `.env` files
  - systemd configurations
  - nginx configs
  - Deploy scripts living in `/opt/app-monitor/scripts`

---

## Proposed Solution: Prod-Deploy-Bot

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Deployment Fails                                        │
│ - Health check failure                                  │
│ - Service won't start                                   │
│ - Build error                                           │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ Rollback (Existing)                                     │
│ - Old instance continues                                │
│ - New instance stopped                                  │
│ - GitHub deployment status: failure                     │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ NEW: Create Deployment Repair Task                      │
│ {                                                        │
│   type: "deployment_repair",                            │
│   failed_port: 5002,                                    │
│   active_port: 5001,                                    │
│   error_logs: "...",                                    │
│   health_check_failures: ["database connectivity"],    │
│   deployment_id: "abc123"                               │
│ }                                                        │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ NEW: Prod-Deploy-Bot Container                          │
│                                                          │
│ Special Mounts:                                          │
│ - /opt/app-monitor/shared/.env (rw)                    │
│ - /opt/app-monitor/scripts (rw)                         │
│ - /etc/systemd/system/app-monitor-backend@.service (ro)│
│ - GitHub repo (rw)                                       │
│                                                          │
│ Capabilities:                                            │
│ - Analyze deployment logs                               │
│ - Check .env for missing vars                           │
│ - Fix build errors in package.json                      │
│ - Update deploy scripts                                  │
│ - Suggest systemd changes (can't modify directly)       │
│                                                          │
│ Constraints:                                             │
│ - Read-only systemd (security)                          │
│ - Can propose changes via PR                            │
│ - Requires human approval for:                          │
│   * systemd changes                                     │
│   * nginx changes                                       │
│   * Security-sensitive .env vars                        │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ Bot Analysis & Repair                                   │
│                                                          │
│ Common Fixes:                                            │
│ 1. Missing .env variables                               │
│    - Check logs for "undefined" errors                  │
│    - Add missing vars to /opt/app-monitor/shared/.env  │
│    - Restart deployment                                  │
│                                                          │
│ 2. Build errors                                          │
│    - npm dependency conflicts                           │
│    - TypeScript errors                                   │
│    - Missing files                                       │
│    - Fix in repo, push, redeploy                        │
│                                                          │
│ 3. Database migration needed                             │
│    - Detect schema changes                              │
│    - Run migrations                                      │
│    - Restart deployment                                  │
│                                                          │
│ 4. Port conflicts                                        │
│    - Orphaned processes detected                        │
│    - Run cleanup-processes.sh                           │
│    - Restart deployment                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ Automated Re-Deployment                                 │
│ - If fix applied successfully                           │
│ - Trigger new deployment                                │
│ - Health checks run again                               │
│ - If passes → traffic switched                          │
│ - If fails again → escalate to human                    │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Basic Failure Detection (1 day)
**Goal:** Capture deployment failure details

**Tasks:**
- [ ] Update deploy.sh to save failure details to database
- [ ] Store:
  - Failed port number
  - Active port number
  - Health check results
  - Last 100 lines of service logs
  - Deployment ID
- [ ] Create `deployment_failures` table
- [ ] GitHub deployment status updated with error details

### Phase 2: Create Deployment Repair Task (1 day)
**Goal:** Automatically create repair task on deployment failure

**Tasks:**
- [ ] Add deployment failure webhook handler
- [ ] Create task with type `deployment_repair`
- [ ] Attach failure context
- [ ] Route to specialized agent selector

### Phase 3: Prod-Deploy-Bot Agent (2 days)
**Goal:** Create specialized bot that can access production folder

**Tasks:**
- [ ] Create `prod-deploy-bot` agent type
- [ ] Container configuration with production mounts:
  ```yaml
  volumes:
    - /opt/app-monitor/shared/.env:/prod/shared/.env:rw
    - /opt/app-monitor/scripts:/prod/scripts:rw
    - /etc/systemd/system/app-monitor-backend@.service:/prod/systemd/service:ro
  ```
- [ ] Agent prompt specialized for deployment debugging
- [ ] Access to systemd logs: `journalctl -u app-monitor-backend@<PORT>`

### Phase 4: Repair Strategies (2 days)
**Goal:** Implement common fix patterns

**Fix Patterns:**

**A. Missing Environment Variables**
```typescript
// Bot detects: "process.env.VITE_PASSWORD is undefined"
// Action:
1. Check /prod/shared/.env for VITE_PASSWORD
2. If missing, prompt user for value (secure input)
3. Add to .env
4. No code push needed, just restart deployment
```

**B. Dependency Issues**
```typescript
// Bot detects: "Cannot find module '@types/node'"
// Action:
1. Update package.json in repo
2. Commit and push
3. GitHub workflow rebuilds
4. Re-trigger deployment
```

**C. Database Schema Mismatch**
```typescript
// Bot detects: "column 'new_field' does not exist"
// Action:
1. Detect migration needed
2. Run migration script
3. Restart deployment (no code change needed)
```

**D. Build Failures**
```typescript
// Bot detects: "TypeScript compilation error"
// Action:
1. Analyze error
2. Fix code in repo
3. Create PR or direct push
4. Await CI/CD
5. Auto-redeploy when ready
```

### Phase 5: Auto-Retry Logic (1 day)
**Goal:** Automatically retry deployment after fix

**Tasks:**
- [ ] After bot applies fix, trigger deployment retry
- [ ] Limit retries to 3 attempts
- [ ] Escalate to human after 3 failures
- [ ] Track repair history in database

### Phase 6: Security & Approval Gates (1 day)
**Goal:** Prevent unsafe automated changes

**Approval Required For:**
- systemd service changes (read-only mount prevents direct edit)
- nginx configuration changes
- Database passwords or API keys
- Firewall or security rules

**Auto-Approved:**
- Application environment variables (non-sensitive)
- Dependency updates
- Code fixes
- Log level changes

---

## Security Considerations

### What Prod-Deploy-Bot CAN Do
- ✅ Read production logs
- ✅ Modify `/opt/app-monitor/shared/.env` (application config)
- ✅ Update deployment scripts in `/opt/app-monitor/scripts`
- ✅ Push code fixes to repository
- ✅ Trigger re-deployment
- ✅ Run database migrations (if scripted)

### What Prod-Deploy-Bot CANNOT Do
- ❌ Modify systemd service files (read-only mount)
- ❌ Change nginx configs
- ❌ Sudo commands
- ❌ Install system packages
- ❌ Modify firewall rules
- ❌ Access production database credentials (except through app)

### Safety Mechanisms
1. **Read-only mounts** for critical system files
2. **Human approval** for security-sensitive changes
3. **Retry limits** to prevent infinite loop
4. **Change logging** - all modifications tracked
5. **Rollback capability** - can revert bot changes
6. **Sandboxed execution** - bot runs in container

---

## Example Scenarios

### Scenario 1: Missing Environment Variable

**Failure:**
```
Health check failed: HTTP endpoint returned 500
Logs: "Error: VITE_PASSWORD is not defined"
```

**Bot Analysis:**
1. Parses logs, identifies missing `VITE_PASSWORD`
2. Checks `/prod/shared/.env`, confirms missing
3. Checks git history for when it was added to frontend
4. Determines it's a required frontend build variable

**Bot Action:**
```bash
# Prompts user securely for password
echo "VITE_PASSWORD=<user_input>" >> /opt/app-monitor/shared/.env

# Triggers rebuild (deploy script re-runs)
# Frontend build now has access to VITE_PASSWORD
```

**Outcome:** Deployment succeeds on retry

---

### Scenario 2: Dependency Version Conflict

**Failure:**
```
Build failed: npm ERR! Cannot resolve peer dependency
```

**Bot Analysis:**
1. Reads package.json
2. Identifies conflicting peer dependencies
3. Researches compatible versions

**Bot Action:**
```bash
# In repo
git checkout -b fix/deployment-dependency-conflict
# Update package.json with compatible versions
git commit -m "fix: resolve peer dependency conflict"
git push
# Create PR or auto-merge if permitted
```

**Outcome:** CI/CD rebuilds, deployment re-triggered, succeeds

---

### Scenario 3: Database Migration Needed

**Failure:**
```
Health check failed: Database connectivity
Logs: "Column 'new_column' does not exist"
```

**Bot Analysis:**
1. Compares deployed schema to current schema
2. Identifies missing migration
3. Locates migration script

**Bot Action:**
```bash
# Run migration
cd /opt/app-monitor/current/backend
npm run migrate

# Retry deployment (no rebuild needed)
```

**Outcome:** Database updated, deployment succeeds

---

## Metrics to Track

### Deployment Reliability
- Total deployments
- Failed deployments
- Auto-fixed deployments
- Human-intervention-required deployments
- Mean time to recovery (with vs without bot)

### Bot Effectiveness
- Fix success rate per category
- Average fix time
- Retry attempts before success
- False positive fixes (made it worse)

---

## Future Enhancements

### Advanced Capabilities
1. **Predictive Failures**
   - Analyze deployment patterns
   - Warn before likely failures
   - Suggest pre-deployment checks

2. **Progressive Rollout**
   - Deploy to single instance first
   - Monitor for errors
   - Auto-proceed or rollback
   - Canary deployment strategy

3. **Integration Testing**
   - Run smoke tests post-deployment
   - Validate critical paths
   - Auto-rollback if tests fail

4. **Cost Analysis**
   - Track deployment frequency
   - Measure resource usage
   - Optimize build/deploy pipeline

---

## Dependencies

### Required
- Existing review/repair bot system ✅
- Docker container infrastructure ✅
- Task queue system ✅
- Database for tracking ✅

### New
- Prod-deploy-bot agent configuration
- Production folder mount permissions
- Deployment failure webhook
- Auto-retry orchestration

---

## Timeline

| Phase | Effort | Priority |
|-------|--------|----------|
| Basic failure detection | 1 day | P2 |
| Create repair tasks | 1 day | P2 |
| Prod-deploy-bot agent | 2 days | P3 |
| Repair strategies | 2 days | P3 |
| Auto-retry logic | 1 day | P3 |
| Security & approvals | 1 day | P3 |

**Total:** 8 days
**Priority:** P3 (nice to have, not critical)

---

## Current vs Proposed

### Current (Fully Implemented)
```
Deploy → Health Check → FAIL → Rollback → Manual Fix → Redeploy
Time: Hours to days (depends on availability)
```

### Proposed (Self-Healing)
```
Deploy → Health Check → FAIL → Rollback → Bot Analyzes → Bot Fixes → Auto-Redeploy
Time: Minutes to hours (automated)
```

---

## Decision: Should We Build This?

### Arguments FOR
- ✅ Faster recovery from deployment failures
- ✅ Leverages existing review/repair system
- ✅ Reduces manual intervention
- ✅ Learns from failures
- ✅ Documents common issues

### Arguments AGAINST
- ❌ Complex to implement (8 days)
- ❌ Security concerns (production access)
- ❌ Current rollback works well
- ❌ May introduce automation risks
- ❌ P3 priority (many higher priorities)

### Recommendation

**DEFER** - Document but don't implement now

**Reasons:**
1. Current deployment with rollback is reliable
2. Deployments are infrequent (not a pain point)
3. Higher priority work exists (PR automation, UI refactor)
4. Can revisit if deployment failures become frequent
5. Good to have documented for future consideration

**Alternative:**
- Keep current rollback mechanism
- Improve deployment error messages
- Create deployment debugging runbook
- Manual fixes are acceptable for now

---

## References

- **Deployment Script:** `scripts/production/deploy.sh`
- **Health Checks:** `scripts/production/health-check.sh`
- **Rollback:** `scripts/production/rollback.sh`
- **Review/Repair System:** `backend/src/services/` (various files)
- **Agent System:** `backend/src/services/agentSelector.ts`
