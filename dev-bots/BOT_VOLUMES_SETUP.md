# Dev-Bot Volumes Setup

## Overview
This document describes the dev-bot volumes setup, which provides isolated workspace copies for each bot to work independently without conflicts.

## Structure

```
app-monitor/dev-bots/
├── volumes/
│   ├── bot-a/                      # Complete workspace for bot-a
│   │   ├── .env                    # Environment variables
│   │   ├── .env.backup
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── job-finder-BE/          # Cloned on staging branch
│   │   ├── job-finder-FE/          # Cloned on staging branch
│   │   ├── job-finder-shared-types/ # Cloned on staging branch
│   │   ├── job-finder-worker/      # Cloned on staging branch
│   │   └── app-monitor/            # Copy of app-monitor (volumes excluded)
│   │       └── dev-bots/
│   │           └── volumes/        # Empty to prevent recursion
│   │
│   └── bot-b/                      # Complete workspace for bot-b
│       └── (same structure as bot-a)
│
├── docker-compose.yml              # Combined compose for both bots
├── docker-compose.bot-a.yml        # Individual compose for bot-a
├── docker-compose.bot-b.yml        # Individual compose for bot-b
└── setup-bot-volumes.sh            # Script to create/recreate volumes
```

## Features

### ✅ Complete Workspace Isolation
- Each bot has its own complete copy of the entire workspace
- All repositories are cloned fresh from their remotes
- No shared state between bots

### ✅ Staging Branch Ready
- All repositories automatically checked out to `staging` branch
- Fresh clones ensure no local modifications

### ✅ Environment Files Included
- Root-level `.env` files copied to each bot
- Repository-specific `.env` files copied (e.g., `job-finder-FE/.env.development`)
- Secrets and credentials preserved

### ✅ Recursion Prevention
- The `volumes` directory inside each bot workspace is created but kept empty
- This prevents infinite recursion when copying the workspace

### ✅ Git Ignored
- All volumes are excluded from git via `.gitignore`
- Added to root `.gitignore` at line 15: `app-monitor/dev-bots/volumes/`

## Usage

### Initial Setup

```bash
cd app-monitor/dev-bots
./setup-bot-volumes.sh
```

This will:
1. Create `volumes/bot-a` and `volumes/bot-b` directories
2. Clone all repositories from their remotes
3. Checkout staging branch for each repo
4. Copy all environment files and secrets
5. Copy app-monitor directory (excluding volumes)

### Re-sync Volumes

To refresh the volumes with latest changes from the main workspace:

```bash
cd app-monitor/dev-bots
./setup-bot-volumes.sh
```

**⚠️ Warning:** This will delete and recreate the volumes, losing any bot-specific changes.

### Starting Bots

#### Start both bots:
```bash
cd app-monitor/dev-bots
docker-compose up -d
```

#### Start a specific bot:
```bash
cd app-monitor/dev-bots
docker-compose up -d bot-a
# or
docker-compose up -d bot-b
```

#### Using individual compose files:
```bash
cd app-monitor/dev-bots
docker-compose -f docker-compose.bot-a.yml up -d
# or
docker-compose -f docker-compose.bot-b.yml up -d
```

## Docker Volume Mounts

Each bot container mounts its volume at `/workspace`:

```yaml
volumes:
  - ./volumes/bot-a:/workspace:rw
```

The bot can then work on:
- `/workspace/job-finder-BE`
- `/workspace/job-finder-FE`
- `/workspace/job-finder-shared-types`
- `/workspace/job-finder-worker`
- `/workspace/app-monitor`

## Benefits

### 1. **True Parallel Development**
- Bots can work on different tasks simultaneously
- No git conflicts between bots
- Each bot has its own git state

### 2. **Clean Working Directories**
- Fresh clones ensure clean state
- No leftover files from previous tasks
- Consistent starting point

### 3. **Isolated Testing**
- Each bot can run tests without affecting others
- No shared node_modules or build artifacts
- Independent installations

### 4. **Easy Reset**
- Simply re-run the setup script to reset a bot's workspace
- No complex cleanup needed

### 5. **Better Debugging**
- Easy to inspect each bot's workspace
- Clear separation of bot activities
- Logs and outputs stay isolated

## Script Details: `setup-bot-volumes.sh`

### What it does:
1. ✅ Verifies workspace structure
2. ✅ Creates volumes directory
3. ✅ For each bot (bot-a, bot-b):
   - Removes existing volume if present
   - Copies root-level files (`.env`, `package.json`, etc.)
   - Clones each repository from remote
   - Checks out staging branch
   - Copies repository-specific env files and secrets
   - Copies app-monitor (excluding volumes directory)
   - Creates empty volumes directory in bot workspace

### Repositories cloned:
- `job-finder-BE`
- `job-finder-FE`
- `job-finder-shared-types`
- `job-finder-worker`

### Files copied:
- `.env`
- `.env.backup`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `README.md`
- All repository `.env.*` files
- All secret files (credentials.json, service-account.json, etc.)

### Excluded from copy:
- `dev-bots/volumes` (prevents recursion)
- `node_modules`
- `.next`
- `dist`
- `build`

## Troubleshooting

### Volumes not created
- Ensure you're running the script from `app-monitor/dev-bots` directory
- Check that all repos have remote URLs configured
- Verify you have internet access to clone from GitHub

### Staging branch not found
- The script will create the branch from `origin/staging` if it doesn't exist locally
- If origin/staging doesn't exist, the bot will stay on the default branch

### Disk space issues
- Each bot volume is approximately the size of your workspace
- Ensure you have at least 2-3GB free space per bot
- Run `df -h` to check available space

### Permission issues
- Ensure the script is executable: `chmod +x setup-bot-volumes.sh`
- Check file ownership after creation
- May need to adjust Docker user/group IDs in docker-compose

## Next Steps

### Quick Start with Makefile (Recommended)

From the `app-monitor` directory, use these convenient Makefile commands:

```bash
# Build the dev-bot Docker image
make bot-build

# Sync workspace to bot volumes
make bot-sync

# Start bot-a in interactive mode
make bot-a

# Start bot-b in interactive mode
make bot-b

# Or start both bots at once
make bot-start

# Check bot status
make bot-status

# Enter a bot's shell
make bot-shell-a
make bot-shell-b

# View logs
make bot-logs-a
make bot-logs-b

# Stop bots
make bot-stop

# Clean up everything
make bot-clean
```

### Manual Docker Commands (Alternative)

1. Build the Docker image:
   ```bash
   cd app-monitor/dev-bots/docker
   docker build -t claude-worker:latest .
   ```

2. Start the bots:
   ```bash
   cd app-monitor/dev-bots
   docker-compose up -d
   ```

3. Verify bots are running:
   ```bash
   docker ps
   docker exec -it dev-bot-a bash
   docker exec -it dev-bot-b bash
   ```

4. Check workspace inside bot:
   ```bash
   docker exec -it dev-bot-a ls -la /workspace
   docker exec -it dev-bot-a bash -c "cd /workspace/job-finder-BE && git branch"
   ```

## Integration with Evolution Plan

This setup fulfills **Task 1.0.3** from the Evolution Plan V2 Refined:
- ✅ Setup Separate Repo Clones
- ✅ All clones on staging branch
- ✅ Docker containers mount correct directories
- ✅ Bots can work independently without conflicts
- ✅ No more worktree references in code

## Maintenance

### When to re-run setup:
- After major dependency updates in the main workspace
- When env files change and bots need new secrets
- To reset a bot to a clean state
- When switching to a different branch across all repos

### Backup considerations:
- Volumes are git-ignored and not backed up
- Recreate from scratch using the setup script
- Bot-specific changes should be committed and pushed before re-sync

## Security Notes

- ⚠️ Volumes contain secret files and env variables
- ⚠️ Ensure volumes directory is in .gitignore
- ⚠️ Never commit the volumes directory
- ⚠️ Restrict access to the volumes directory on the host
