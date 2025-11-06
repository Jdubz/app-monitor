# Dev-Monitor Backend Unit Test Checklist

## Testing Infrastructure

- [x] Vitest configured in package.json
- [x] Test scripts available (test, test:watch, test:coverage)
- [ ] Test setup/teardown utilities
- [ ] Mock factories for common dependencies

## Utils Tests

### portManager.ts

- [x] isPortInUse() - basic test exists
- [x] getPortInfo() - basic test exists
- [ ] getPortPid() - returns PID when port in use
- [ ] getPortPid() - returns null when port not in use
- [ ] killPortProcess() - graceful termination with SIGTERM
- [ ] killPortProcess() - force kill with SIGKILL
- [ ] killMultiplePorts() - kills multiple ports
- [ ] waitForPortFree() - waits for port to become available
- [ ] waitForPortFree() - times out correctly
- [ ] isDockerContainerRunning() - detects running container
- [ ] stopDockerContainer() - stops running container
- [ ] getDockerContainerPid() - returns container PID
- [ ] getDockerContainerInfo() - returns complete container info

### logger.ts

- [ ] Logger initialization creates log directory
- [ ] Logger writes to file correctly
- [ ] Logger.debug() only logs in development
- [ ] Logger.info() logs at all levels
- [ ] Logger.warn() logs warnings
- [ ] Logger.error() logs errors with stack traces
- [ ] Structured logging format validation
- [ ] Console output formatting (dev vs prod)
- [ ] Error formatting for Error objects
- [ ] Error formatting for unknown types
- [ ] Legacy Logger compatibility layer

### logFormatter.ts

- [ ] formatLogLine() skips empty lines
- [ ] formatLogLine() detects JSON logs
- [ ] formatLogLine() converts plain text to structured
- [ ] detectSeverity() detects ERROR correctly
- [ ] detectSeverity() detects WARNING correctly
- [ ] detectSeverity() defaults to INFO
- [ ] extractTimestamp() parses ISO timestamps
- [ ] stripAnsiCodes() removes color codes
- [ ] cleanMessage() removes prefixes
- [ ] detectCategory() detects service-specific categories
- [ ] detectAction() detects actions from message content
- [ ] LogFormatter class file writing

## Services Tests

### processManager.ts

- [ ] ProcessManager initializes correctly
- [ ] startService() starts a service
- [ ] startService() checks for existing process
- [ ] startService() handles port conflicts
- [ ] startService() clears conflicting ports
- [ ] startService() starts Docker containers
- [ ] stopService() graceful shutdown
- [ ] stopService() force shutdown
- [ ] restartService() stops then starts
- [ ] killService() force kills
- [ ] getServiceStatus() returns correct status
- [ ] getServiceStatus() detects Docker containers
- [ ] getServiceStatus() detects Firebase emulators by ports
- [ ] getAllStatuses() returns all service statuses
- [ ] Process event handlers (stdout, stderr, exit, error)
- [ ] Log file creation and writing
- [ ] Cleanup on SIGTERM/SIGINT
- [ ] Docker worker status detection
- [ ] Process group handling for signals

### scriptManager.ts

- [ ] ScriptManager initializes correctly
- [ ] startScript() starts script asynchronously
- [ ] startScript() returns execution immediately
- [ ] Script execution emits events (started, output, completed, failed)
- [ ] Script stdout capture
- [ ] Script stderr capture
- [ ] Script exit code handling
- [ ] getScripts() returns all scripts
- [ ] getExecutions() returns all executions
- [ ] getExecution() returns specific execution
- [ ] killScript() terminates running script
- [ ] clearHistory() clears completed executions
- [ ] executeScript() deprecated method still works

### claudeWorkersManager.ts

- [ ] ClaudeWorkersManager initializes correctly
- [ ] getStatus() returns system status
- [ ] createTask() creates new task
- [ ] createTask() validates required fields
- [ ] createTask() generates prompts from templates
- [ ] getTasks() returns all tasks
- [ ] getTask() returns specific task
- [ ] deleteTask() removes task
- [ ] startEphemeralWorker() creates worker container
- [ ] stopEphemeralWorker() destroys worker container
- [ ] Worker lifecycle management
- [ ] Task persistence integration
- [ ] Agent personality assignment
- [ ] Workspace sync integration
- [ ] Docker container management

### logWatcher.ts

- [ ] LogWatcher initializes correctly
- [ ] discoverLogFiles() finds all log files
- [ ] watchFile() sets up file watcher
- [ ] File change detection and parsing
- [ ] JSON log parsing
- [ ] Socket.IO event emission
- [ ] Multiple file watching
- [ ] File rotation handling
- [ ] getLogSources() returns watched files

### cloudLogging.ts

- [ ] CloudLogging initializes correctly
- [ ] streamLogs() streams from Cloud Logging
- [ ] Error handling for missing credentials
- [ ] Log entry parsing
- [ ] Filter application

### logRotation.ts

- [ ] Log rotation based on size
- [ ] Log rotation based on age
- [ ] Old log file deletion
- [ ] Configuration validation

### logStreamer.ts

- [ ] LogStreamer initializes correctly
- [ ] Socket.IO connection handling
- [ ] Log streaming to clients
- [ ] Client subscription management

## Config Tests

### config.ts

- [x] Config has required fields - basic test exists
- [x] Port validation - basic test exists
- [x] CORS origin validation - basic test exists
- [ ] Service configurations are valid
- [ ] Environment configurations are valid
- [ ] Script configurations are valid
- [ ] Path resolution correctness
- [ ] Environment variable loading

## Routes Tests

### api.ts

- [ ] GET /health returns healthy status
- [ ] GET /services/status returns all statuses
- [ ] GET /services/:serviceName/status returns service status
- [ ] POST /services/:serviceName/start starts service
- [ ] POST /services/:serviceName/stop stops service
- [ ] POST /services/:serviceName/kill kills service
- [ ] POST /services/:serviceName/restart restarts service
- [ ] Docker-specific endpoints
- [ ] Port management endpoints
- [ ] Log endpoints
- [ ] Script execution endpoints
- [ ] Claude workers endpoints
- [ ] Error handling for invalid services
- [ ] Error handling for server errors

## Integration Tests

- [ ] Service start/stop lifecycle
- [ ] Log file watching end-to-end
- [ ] Script execution end-to-end
- [ ] Claude workers task lifecycle
- [ ] Socket.IO real-time updates

## Coverage Goals

- [ ] Overall: 80%+ coverage
- [ ] Critical paths: 95%+ coverage
- [ ] Utils: 90%+ coverage
- [ ] Services: 85%+ coverage
- [ ] Routes: 80%+ coverage

## Test Quality Metrics

- [ ] All tests are isolated (no shared state)
- [ ] All async tests properly handle promises
- [ ] All file system operations are mocked
- [ ] All external dependencies are mocked
- [ ] All tests clean up resources (files, processes)
- [ ] All edge cases are covered
- [ ] All error paths are tested
