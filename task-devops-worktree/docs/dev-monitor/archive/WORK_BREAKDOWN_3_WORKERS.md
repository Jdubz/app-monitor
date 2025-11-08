# Work Breakdown - 3 Workers (A, B, PM)
**Date**: October 22, 2025  
**Status**: 🎯 **READY FOR PARALLEL EXECUTION**

## Executive Summary

Split remaining dev-monitor issues into 3 distinct work streams to be tackled simultaneously by different workers, with clear service architecture boundaries to prevent collisions.

## Service Architecture Overview

### 🔥 **Firebase Emulators** (Worker A)
- **Type**: Node.js processes with Firebase CLI
- **Startup**: `firebase emulators:start`
- **Ports**: 4000, 4400, 8080, 9099, 9199, 5001
- **Logs**: JSON format, structured logging
- **Management**: Process-based, no containerization

### ⚡ **Vite Dev Server** (Worker B)  
- **Type**: Node.js development server
- **Startup**: `npm run dev` or `vite`
- **Ports**: 5173 (configurable)
- **Logs**: Plain text format, Vite output
- **Management**: Process-based, hot reload

### 🐳 **Docker Services** (PM)
- **Type**: Containerized applications
- **Startup**: `docker-compose up -d`
- **Ports**: Dynamic, mapped from host
- **Logs**: JSON format, structured logging
- **Management**: Container-based, orchestrated

---

## 🅰️ **WORKER A: Firebase Emulators & Process Management**

### **Scope**: Firebase Emulators service discovery and orchestration

### **Service Architecture**: Firebase Emulators
- **Process Type**: Node.js CLI processes
- **Startup Command**: `firebase emulators:start`
- **Port Management**: Multiple ports (4000, 4400, 8080, 9099, 9199, 5001)
- **Log Format**: JSON structured logs
- **Health Check**: HTTP endpoints on each port

### **Issues to Fix**:

#### 1. **Firebase Emulators Path Resolution** (P0)
**Problem**: Path resolution issues in service startup
```
Error starting container: Error: Command failed: cd ../job-finder-worker && docker-compose -f docker-compose.dev.yml up -d
/bin/sh: 1: cd: can't cd to ../job-finder-worker
```

**Root Cause**: Incorrect path resolution for Firebase emulators
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (Firebase emulator startup)
- `dev-monitor/backend/src/config.ts` (Firebase emulator paths)

**Deliverables**:
- Fix Firebase emulator startup paths
- Implement proper working directory resolution
- Test Firebase emulator startup/stop/restart

#### 2. **Firebase Emulators Status Detection** (P1)
**Problem**: Firebase emulators show as "stopped" when running
**Root Cause**: Status detection logic for multi-port services
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (status detection)
- `dev-monitor/backend/src/utils/portManager.ts` (port checking)

**Deliverables**:
- Fix Firebase emulator status detection
- Implement multi-port health checking
- Test status accuracy

#### 3. **Firebase Emulators Log Integration** (P1)
**Problem**: Firebase emulator logs not being captured
**Root Cause**: Log file path resolution for Firebase emulators
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (log file paths)
- `dev-monitor/backend/src/services/logWatcher.ts` (Firebase log discovery)

**Deliverables**:
- Fix Firebase emulator log file paths
- Ensure log files are created in `/logs/`
- Test log monitoring for Firebase emulators

### **Testing Requirements**:
```bash
# Test Firebase emulator startup
curl -X POST http://localhost:5000/api/services/firebase-emulators/start

# Test status detection
curl http://localhost:5000/api/services/status

# Test log file creation
ls -la logs/firebase-emulators.log
```

---

## 🅱️ **WORKER B: Vite Dev Server & Frontend Integration**

### **Scope**: Vite development server integration and frontend service management

### **Service Architecture**: Vite Dev Server
- **Process Type**: Node.js development server
- **Startup Command**: `npm run dev` or `vite`
- **Port Management**: Single port (5173)
- **Log Format**: Plain text format, Vite output
- **Health Check**: HTTP endpoint on port 5173

### **Issues to Fix**:

#### 1. **Vite Dev Server Path Resolution** (P0)
**Problem**: Path resolution issues for Vite dev server startup
**Root Cause**: Working directory and npm script path resolution
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (Vite startup)
- `dev-monitor/backend/src/config.ts` (Vite paths)

**Deliverables**:
- Fix Vite dev server startup paths
- Implement proper npm script execution
- Test Vite dev server startup/stop/restart

#### 2. **Vite Dev Server Status Detection** (P1)
**Problem**: Vite dev server status detection
**Root Cause**: Single-port service status checking
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (Vite status)
- `dev-monitor/backend/src/utils/portManager.ts` (port 5173 checking)

**Deliverables**:
- Fix Vite dev server status detection
- Implement port 5173 health checking
- Test status accuracy

#### 3. **Vite Dev Server Log Integration** (P1)
**Problem**: Vite dev server logs not being captured properly
**Root Cause**: Plain text log format handling
**Files to Modify**:
- `dev-monitor/backend/src/services/logWatcher.ts` (plain text log handling)
- `dev-monitor/backend/src/services/logStreamer.ts` (Vite log conversion)

**Deliverables**:
- Fix Vite dev server log file paths
- Ensure plain text logs are converted to structured format
- Test log monitoring for Vite dev server

### **Testing Requirements**:
```bash
# Test Vite dev server startup
curl -X POST http://localhost:5000/api/services/frontend-dev/start

# Test status detection
curl http://localhost:5000/api/services/status

# Test log file creation
ls -la logs/frontend.log
```

---

## 👑 **PM: Docker Services & System Orchestration**

### **Scope**: Docker container management and system-wide orchestration

### **Service Architecture**: Docker Services
- **Process Type**: Containerized applications
- **Startup Command**: `docker-compose up -d`
- **Port Management**: Dynamic port mapping
- **Log Format**: JSON structured logs
- **Health Check**: Container status and internal health endpoints

### **Issues to Fix**:

#### 1. **Docker Service Orchestration** (P0)
**Problem**: Docker container startup and management
**Root Cause**: Docker Compose integration and container lifecycle
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (Docker integration)
- `dev-monitor/backend/src/utils/portManager.ts` (Docker port management)

**Deliverables**:
- Fix Docker container startup/stop/restart
- Implement proper Docker Compose integration
- Test Docker service orchestration

#### 2. **Docker Service Status Detection** (P1)
**Problem**: Docker container status detection
**Root Cause**: Container status vs service status confusion
**Files to Modify**:
- `dev-monitor/backend/src/services/processManager.ts` (Docker status)
- `dev-monitor/backend/src/utils/portManager.ts` (container status)

**Deliverables**:
- Fix Docker container status detection
- Implement container health checking
- Test status accuracy for Docker services

#### 3. **System-Wide Log Integration** (P1)
**Problem**: Log file creation and rotation system
**Root Cause**: Log directory structure and file creation
**Files to Modify**:
- `dev-monitor/backend/src/services/logRotation.ts` (log file management)
- `dev-monitor/backend/src/services/logWatcher.ts` (log discovery)

**Deliverables**:
- Fix log file creation in `/logs/` directory
- Implement proper log rotation
- Test system-wide log monitoring

### **Testing Requirements**:
```bash
# Test Docker service startup
curl -X POST http://localhost:5000/api/services/python-worker/start

# Test status detection
curl http://localhost:5000/api/services/status

# Test log file creation
ls -la logs/
```

---

## 🚫 **Collision Prevention**

### **File Ownership**:
- **Worker A**: `processManager.ts` (Firebase emulator sections only)
- **Worker B**: `processManager.ts` (Vite dev server sections only)  
- **PM**: `processManager.ts` (Docker sections only)

### **Service Boundaries**:
- **Worker A**: Firebase emulators (ports 4000, 4400, 8080, 9099, 9199, 5001)
- **Worker B**: Vite dev server (port 5173)
- **PM**: Docker services (dynamic ports)

### **Log File Boundaries**:
- **Worker A**: `logs/firebase-emulators.log`
- **Worker B**: `logs/frontend.log`
- **PM**: `logs/worker.log`, `logs/dev-monitor-backend.log`

### **API Endpoint Boundaries**:
- **Worker A**: `/api/services/firebase-emulators/*`
- **Worker B**: `/api/services/frontend-dev/*`
- **PM**: `/api/services/python-worker/*`, `/api/services/*` (system-wide)

---

## 📋 **Execution Plan**

### **Phase 1: Parallel Development** (Day 1)
- **Worker A**: Fix Firebase emulator path resolution
- **Worker B**: Fix Vite dev server path resolution  
- **PM**: Fix Docker service orchestration

### **Phase 2: Status Detection** (Day 2)
- **Worker A**: Fix Firebase emulator status detection
- **Worker B**: Fix Vite dev server status detection
- **PM**: Fix Docker service status detection

### **Phase 3: Log Integration** (Day 3)
- **Worker A**: Fix Firebase emulator log integration
- **Worker B**: Fix Vite dev server log integration
- **PM**: Fix system-wide log integration

### **Phase 4: Integration Testing** (Day 4)
- **All Workers**: Test complete service orchestration
- **PM**: Coordinate end-to-end testing
- **All Workers**: Fix any integration issues

---

## 🎯 **Success Criteria**

### **Worker A Success**:
- Firebase emulators start/stop/restart correctly
- Status detection accurate for Firebase emulators
- Log files created and monitored for Firebase emulators

### **Worker B Success**:
- Vite dev server start/stop/restart correctly
- Status detection accurate for Vite dev server
- Log files created and monitored for Vite dev server

### **PM Success**:
- Docker services start/stop/restart correctly
- Status detection accurate for Docker services
- System-wide log integration working
- Complete service orchestration functional

---

## 🚀 **Ready for Parallel Execution**

All work streams are clearly separated with no file collisions, service boundaries defined, and success criteria established. Each worker can proceed independently while maintaining system integrity.
