# Analysis: Interactive Session Agent Launch Failures

**Purpose:** Investigation and fix for interactive sessions starting with no agent running and permission errors.

**Delete After:** 2025-12-16 (30 days) or when all action items verified in production

---

## Problem

Interactive session tab had two critical issues:
1. Container started with no agent running (codex selected but shell was empty)
2. Permission denied when trying to start Claude: `EACCES: permission denied, mkdir '/home/worker/.claude/debug'`

## Investigation

Root causes identified:
1. **Missing working directory** - `DevBotContainerPresets.interactiveSession()` didn't set working directory, preventing proper agent launch
2. **User mismatch** - Code configured for `worker` user (uid 1001) but Dockerfile creates `node` user (uid 1000)
3. **Missing tmpfs mounts** - Only `.claude` had tmpfs mount, `.codex` and `.gemini` were missing

## Findings

- Container builder default command was `tail -f /dev/null` (idle state)
- Agent command was set but working directory wasn't, causing silent failure
- All tmpfs paths referenced `/home/worker/*` instead of `/home/node/*`
- Environment variables set `HOME=/home/worker` and `USER=worker` incorrectly

## Action Items

- [x] Fix tmpfs mount paths to `/home/node/*` (backend/src/services/devbot/DevBotContainerBuilder.ts)
- [x] Fix tmpfs ownership to uid=1000/gid=1000 (backend/src/services/devbot/DevBotContainerBuilder.ts)
- [x] Add tmpfs mounts for `.codex` and `.gemini` (backend/src/services/devbot/DevBotContainerBuilder.ts)
- [x] Add `.workingDirectory('/workspace')` to interactive preset (backend/src/services/interactiveSessionOrchestrator.ts)
- [x] Fix HOME and USER env vars to use `node` (backend/src/services/interactiveSessionOrchestrator.ts)
- [x] Verify backend builds successfully
- [x] Verify all tests pass (1461 tests passed)
- [ ] Manual test in development (start codex session, verify agent launches)
- [ ] Manual test in development (start claude session, verify no permission errors)
- [ ] Manual test in development (start gemini session, verify works)

## Files Changed

- `backend/src/services/devbot/DevBotContainerBuilder.ts` - Fixed tmpfs mounts for all agents
- `backend/src/services/interactiveSessionOrchestrator.ts` - Fixed working directory and env vars

## Delete After

Delete when:
- All manual tests completed successfully
- OR 30 days elapsed (2025-12-16)
- OR superseded by new interactive session analysis
