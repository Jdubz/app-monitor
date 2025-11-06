# Dev-Bot Makefile Commands Quick Reference

All commands should be run from the `app-monitor` directory.

## 🚀 Getting Started

```bash
# 1. Build the dev-bot Docker image
make bot-build

# 2. Sync workspace to bot volumes (creates complete copies)
make bot-sync

# 3. Start both bots
make bot-start
```

## 📦 Image Management

| Command            | Description                                 |
| ------------------ | ------------------------------------------- |
| `make bot-build`   | Build the dev-bot Docker image from scratch |
| `make bot-rebuild` | Stop, rebuild, and restart all bots         |

## 🔄 Volume Management

| Command         | Description                                              |
| --------------- | -------------------------------------------------------- |
| `make bot-sync` | Sync entire workspace to bot volumes (recreates volumes) |

**⚠️ Warning:** `bot-sync` will delete and recreate bot volumes, losing any bot-specific changes.

## ▶️ Starting Bots

| Command          | Description                       |
| ---------------- | --------------------------------- |
| `make bot-a`     | Start only bot-a in detached mode |
| `make bot-b`     | Start only bot-b in detached mode |
| `make bot-start` | Start both bots simultaneously    |

## ⏹️ Stopping Bots

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `make bot-stop`  | Stop all dev-bots (preserves volumes) |
| `make bot-clean` | Stop bots and remove all volumes      |

## 🔁 Restarting Bots

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `make bot-restart-a` | Restart only bot-a                 |
| `make bot-restart-b` | Restart only bot-b                 |
| `make bot-rebuild`   | Rebuild image and restart all bots |

## 📊 Monitoring

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `make bot-status` | Show running status of all bots |
| `make bot-logs-a` | Follow bot-a logs in real-time  |
| `make bot-logs-b` | Follow bot-b logs in real-time  |

**Tip:** Press `Ctrl+C` to exit log following.

## 💻 Interactive Shell Access

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `make bot-shell-a` | Open interactive bash shell in bot-a |
| `make bot-shell-b` | Open interactive bash shell in bot-b |

**Example session:**

```bash
$ make bot-shell-a
Entering bot-a shell...
worker@bot-a:/workspace$ ls
job-finder-BE  job-finder-FE  job-finder-shared-types  job-finder-worker  app-monitor
worker@bot-a:/workspace$ cd job-finder-BE
worker@bot-a:/workspace/job-finder-BE$ git status
worker@bot-a:/workspace/job-finder-BE$ exit
```

## 🧹 Cleanup

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `make bot-stop`  | Stop bots but keep volumes   |
| `make bot-clean` | Stop bots and delete volumes |

## 📋 Common Workflows

### First Time Setup

```bash
make bot-build      # Build the image
make bot-sync       # Create volumes
make bot-start      # Start bots
make bot-status     # Verify they're running
```

### Daily Development

```bash
make bot-start      # Start bots
make bot-shell-a    # Enter bot-a to work
# ... do work ...
make bot-stop       # Stop when done
```

### Testing Changes

```bash
make bot-sync       # Sync latest workspace changes
make bot-restart-a  # Restart to pick up changes
make bot-logs-a     # Monitor for issues
```

### Troubleshooting

```bash
make bot-status     # Check if bots are running
make bot-logs-a     # Check logs for errors
make bot-shell-a    # Enter shell to investigate
make bot-clean      # Nuclear option: clean everything
make bot-rebuild    # Rebuild from scratch
```

### Working with One Bot

```bash
make bot-a          # Start only bot-a
make bot-shell-a    # Enter bot-a
make bot-logs-a     # View bot-a logs
make bot-restart-a  # Restart bot-a
```

## 🔍 Debugging Tips

### Check if containers are running

```bash
make bot-status
```

### View recent logs

```bash
make bot-logs-a
# or
docker logs dev-bot-a --tail 100
```

### Check container health

```bash
docker inspect dev-bot-a | grep -A 10 Health
```

### Verify volumes are mounted

```bash
make bot-shell-a
ls -la /workspace
```

### Check git status in bot

```bash
make bot-shell-a
cd /workspace/job-finder-BE
git status
git branch
```

## 🎯 Best Practices

1. **Always sync before starting:** Run `make bot-sync` to ensure bots have latest code
2. **Use bot-status regularly:** Check `make bot-status` to verify bots are running
3. **Clean up when done:** Run `make bot-stop` when finished to free resources
4. **Check logs for errors:** Use `make bot-logs-a` or `make bot-logs-b` to monitor activity
5. **One bot at a time:** For testing, start one bot with `make bot-a` to save resources

## 🆘 Troubleshooting

### Bot won't start

```bash
make bot-clean      # Clean up everything
make bot-build      # Rebuild image
make bot-sync       # Recreate volumes
make bot-start      # Try again
```

### Volume is stale

```bash
make bot-stop       # Stop bots
make bot-sync       # Resync volumes
make bot-start      # Restart
```

### Image is corrupted

```bash
docker rmi claude-worker:latest
make bot-build
```

### Out of disk space

```bash
make bot-clean                          # Clean bot volumes
docker system prune -a --volumes        # Clean all Docker data
```

## 📚 Related Documentation

- [BOT_VOLUMES_SETUP.md](./BOT_VOLUMES_SETUP.md) - Detailed volume setup documentation
- [docker-compose.yml](./docker-compose.yml) - Docker Compose configuration
- [Dockerfile](./docker/Dockerfile) - Dev-bot image definition

## 💡 Tips & Tricks

### Quick status check

```bash
watch -n 5 'make bot-status'
```

### Follow logs from both bots

```bash
cd dev-bots
docker-compose logs -f
```

### Execute command in bot without entering shell

```bash
docker exec dev-bot-a ls -la /workspace
docker exec dev-bot-a git -C /workspace/job-finder-BE status
```

### Copy files from bot to host

```bash
docker cp dev-bot-a:/workspace/logs/error.log ./local-error.log
```

### Copy files from host to bot

```bash
docker cp ./config.json dev-bot-a:/workspace/config.json
```

## 🔗 Additional Commands

For a complete list of all available commands:

```bash
cd app-monitor
make help
```
