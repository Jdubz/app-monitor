# Dev-Monitor Troubleshooting Guide

**Last Updated:** October 25, 2025  
**Version:** 1.0.0

---

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

```bash
# Check if ports are available
lsof -i :5000    # Backend
lsof -i :5174    # Frontend

# Check if Docker is running (if using containers)
docker ps

# Check Node version
node --version   # Should be >= 18.0.0

# Check npm version
npm --version    # Should be >= 9.0.0

# Check for running dev-monitor processes
ps aux | grep dev-monitor
```

---

## Common Issues

### 1. Port Already in Use

**Symptom:** Error when starting backend or frontend:
```
Error: listen EADDRINUSE: address already in use :::5000
```

**Cause:** Another process is using the port.

**Solution:**

```bash
# Find process using the port
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or kill all Node processes (⚠️ use with caution)
pkill -f node

# Restart dev-monitor
npm run dev
```

**Prevention:** Use the safe-dev script that checks ports automatically:
```bash
cd backend && bash scripts/safe-dev.sh
```

---

### 2. Docker Connection Failed

**Symptom:** Docker-related errors:
```
Error: connect ENOENT /var/run/docker.sock
```

**Cause:** Docker daemon not running or socket not accessible.

**Solution:**

```bash
# Check if Docker is running
docker ps

# If not running, start Docker
# macOS: Start Docker Desktop
# Linux: sudo systemctl start docker

# Check Docker socket permissions
ls -l /var/run/docker.sock

# If permission denied, add your user to docker group (Linux)
sudo usermod -aG docker $USER
# Then logout and login again
```

---

### 3. Module Not Found

**Symptom:** Import errors when starting:
```
Error: Cannot find module '@/services/processManager'
```

**Cause:** Dependencies not installed or corrupted node_modules.

**Solution:**

```bash
# Clean install backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Clean install frontend
cd frontend
rm -rf node_modules package-lock.json
npm install

# Restart
npm run dev
```

---

### 4. Process Won't Start

**Symptom:** Process shows as "stopped" or "error" state.

**Causes & Solutions:**

#### Check Logs
```bash
# Backend logs
cd backend && cat logs/dev-monitor.log

# Check process-specific logs
ls -la logs/
cat logs/process-backend-*.json
```

#### Verify Configuration
```typescript
// Check process config in backend
const config = {
  id: 'my-service',
  command: 'npm',    // ✅ Correct
  args: ['run', 'dev'],
  cwd: '/path/to/service',  // ❌ Check this path exists
  autoRestart: true
};
```

#### Port Conflicts
```bash
# Check if service port is available
lsof -i :3000    # or whatever port your service uses

# Kill conflicting process
kill -9 <PID>
```

#### Missing Dependencies
```bash
# Navigate to service directory
cd /path/to/service

# Install dependencies
npm install

# Try running manually
npm run dev
```

---

### 5. WebSocket Disconnects

**Symptom:** Frontend shows "Disconnected" status, no real-time updates.

**Causes & Solutions:**

#### Backend Not Running
```bash
# Check if backend is running
lsof -i :5000

# Restart backend
cd backend && npm run dev
```

#### CORS Issues
```typescript
// backend/src/server.ts
// Verify CORS configuration
app.use(cors({
  origin: 'http://localhost:5174',  // Check this matches frontend URL
  credentials: true
}));
```

#### Firewall Blocking
```bash
# Check if firewall is blocking
sudo ufw status    # Linux
# Allow port 5000
sudo ufw allow 5000
```

#### Network Issues
```bash
# Test backend connectivity
curl http://localhost:5000/api/health

# Test WebSocket
wscat -c ws://localhost:5000
```

---

### 6. Build Errors

**Symptom:** TypeScript compilation errors during build.

**Solution:**

```bash
# Backend
cd backend

# Clean build directory
rm -rf dist

# Check TypeScript config
cat tsconfig.json

# Try building with verbose output
npx tsc --noEmit --listFiles

# If errors persist, check for type mismatches
npm run build 2>&1 | grep "error TS"
```

#### Common Type Errors

**Issue:** `Property 'X' does not exist on type 'Y'`
```typescript
// Check if types are imported correctly
import { ProcessConfig } from './types';

// Use type assertions if necessary
const config = data as ProcessConfig;
```

**Issue:** `Cannot find module`
```typescript
// Check import paths
import { foo } from '../services/foo.js';  // ✅ Include .js extension
import { foo } from '../services/foo';     // ❌ Missing extension
```

---

### 7. Tests Failing

**Symptom:** Tests fail when running `npm test`.

**Solutions:**

#### Run Different Test Types
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific test file
npx vitest run src/services/processManager.test.ts
```

#### Docker Tests Failing
```bash
# Ensure Docker is running
docker ps

# Pull required images
docker pull alpine:latest

# Check Docker permissions
docker run --rm alpine echo "Docker works!"
```

#### Port Conflicts in Tests
```bash
# Tests may fail if ports are in use
lsof -i :3010    # Common test port

# Kill conflicting processes
pkill -f test
```

#### Clean Test Environment
```bash
# Remove test artifacts
rm -rf coverage/
rm -f tasks.json.test

# Clear test containers
docker rm -f $(docker ps -aq --filter "label=dev-monitor-test")
```

---

### 8. Hot Reload Not Working

**Symptom:** Changes don't reflect immediately.

**Solutions:**

#### Backend Hot Reload
```bash
# Check if nodemon is running
ps aux | grep nodemon

# Restart with verbose logging
cd backend
DEBUG=* npm run dev

# Check nodemon config
cat nodemon.json
```

#### Frontend Hot Reload
```bash
# Check Vite dev server
ps aux | grep vite

# Clear Vite cache
cd frontend
rm -rf node_modules/.vite

# Restart
npm run dev
```

#### File System Watchers (Linux)
```bash
# Increase max watchers
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

### 9. Memory Issues

**Symptom:** High memory usage or out of memory errors.

**Solutions:**

#### Check Memory Usage
```bash
# Monitor Node processes
ps aux | grep node | awk '{print $2, $4, $11}'

# Check overall system memory
free -h    # Linux
top        # macOS/Linux
```

#### Increase Node Memory
```bash
# Set memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or in package.json script
"dev": "NODE_OPTIONS='--max-old-space-size=4096' tsx src/server.ts"
```

#### Find Memory Leaks
```bash
# Use Node inspector
node --inspect src/server.ts

# Open Chrome DevTools
# chrome://inspect
# Take heap snapshots to find leaks
```

#### Clean Up Resources
```typescript
// Ensure cleanup in code
afterEach(async () => {
  await processManager.stopAll();
  await dockerManager.removeAll();
});
```

---

### 10. Performance Issues

**Symptom:** Slow responses, laggy UI.

**Solutions:**

#### Check API Response Times
```bash
# Test endpoint performance
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:5000/api/services/status

# curl-format.txt:
time_namelookup:  %{time_namelookup}
time_connect:  %{time_connect}
time_total:  %{time_total}
```

#### Profile Backend
```bash
# Run with profiler
node --prof src/server.ts

# Generate profile
node --prof-process isolate-*-v8.log > profile.txt
```

#### Check Database/File I/O
```bash
# Monitor file operations
sudo iotop    # Linux

# Check if tasks.json is too large
ls -lh tasks.json

# Archive old tasks
mv tasks.json tasks.backup.json
echo '{"tasks":[]}' > tasks.json
```

#### Optimize Log Streaming
```typescript
// Implement log buffering
const logBuffer = [];
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 1000;

function bufferLog(log) {
  logBuffer.push(log);
  
  if (logBuffer.length >= BATCH_SIZE) {
    flushLogs();
  }
}

setInterval(flushLogs, BATCH_INTERVAL);
```

---

## Platform-Specific Issues

### macOS

#### Docker Socket Location
```bash
# Docker Desktop uses different socket
export DOCKER_HOST=unix:///var/run/docker.sock

# Or in .env
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock
```

#### Permission Denied
```bash
# Fix permissions for Docker socket
sudo chmod 666 /var/run/docker.sock
```

### Linux

#### Docker Permission Denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply changes
newgrp docker

# Or run with sudo (not recommended)
sudo npm run dev
```

#### Systemd Integration
```bash
# Create systemd service
sudo nano /etc/systemd/system/dev-monitor.service

[Unit]
Description=Dev Monitor
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/dev-monitor
ExecStart=/usr/bin/npm run dev
Restart=on-failure

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable dev-monitor
sudo systemctl start dev-monitor
```

### Windows (WSL)

#### Docker Integration
```bash
# Use Docker Desktop with WSL integration
# Enable in Docker Desktop settings

# Check WSL version
wsl --version

# Update WSL if needed
wsl --update
```

#### File Permissions
```bash
# WSL file permissions can be tricky
chmod +x scripts/*.sh

# If still issues, copy to WSL filesystem
cp -r dev-monitor /home/yourusername/
```

---

## Debugging Tips

### Enable Debug Logging

```bash
# Backend
DEBUG=* npm run dev

# Specific module
DEBUG=express:* npm run dev
DEBUG=socket.io:* npm run dev
```

### Use VSCode Debugger

```json
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "tsx",
      "args": ["src/server.ts"],
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Check Logs

```bash
# Backend logs
tail -f backend/logs/dev-monitor.log

# Process logs
tail -f backend/logs/process-*.json

# Frontend console (in browser DevTools)
# Ctrl+Shift+I or Cmd+Option+I
```

### Network Debugging

```bash
# Monitor network traffic
tcpdump -i lo port 5000

# Check WebSocket frames
# Use browser DevTools → Network → WS
```

---

## Getting Help

### Before Asking for Help

1. ✅ Check this troubleshooting guide
2. ✅ Check logs: `backend/logs/dev-monitor.log`
3. ✅ Try restarting: `pkill node && npm run dev`
4. ✅ Check GitHub issues: [repo-issues-url]
5. ✅ Search documentation: `grep -r "your-issue" docs/`

### When Asking for Help

Include:

1. **Error Message:** Full error text
2. **Logs:** Relevant log excerpts
3. **Environment:**
   - OS and version
   - Node version
   - Docker version
   - dev-monitor version

4. **Steps to Reproduce:**
   ```
   1. Start dev-monitor
   2. Click "Start Service"
   3. Error appears in console
   ```

5. **What You've Tried:**
   - Restarted services
   - Checked ports
   - Reviewed logs

---

## FAQ

### Q: Can I run dev-monitor on a remote server?

**A:** It's designed for local development. For remote use, you'd need to:
- Add authentication
- Configure firewall rules
- Use HTTPS
- Setup reverse proxy

**Not recommended** for security reasons.

### Q: How do I backup my tasks?

**A:** Tasks are stored in `tasks.json`:
```bash
cp tasks.json tasks.backup.json
```

### Q: Can I run multiple dev-monitor instances?

**A:** Not recommended. The tool prevents multiple instances by default. If needed:
- Use different ports (PORT=5001, VITE_PORT=5175)
- Use different data directories
- Better: Use different project directories

### Q: How do I clear all logs?

**A:**
```bash
cd backend
rm -f logs/*.log logs/*.json
```

### Q: Can I customize which services are available?

**A:** Yes, edit service configurations in backend code or add a `services.json` config file (future feature).

---

## Performance Benchmarks

**Expected Performance:**
- API Response: < 50ms
- WebSocket Latency: < 100ms
- Memory Usage: < 200MB
- Process Start Time: 2-5s

**If you're seeing worse performance, investigate using the debugging tips above.**

---

## Still Need Help?

- **Documentation:** Check `docs/` directory
- **Architecture:** See `ARCHITECTURE.md`
- **Testing:** See `TESTING_GUIDE.md`
- **Code:** Browse `backend/src/` and `frontend/src/`

---

**Last Updated:** October 25, 2025  
**Contributing:** Feel free to add solutions as you discover them!
