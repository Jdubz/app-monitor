# Make Commands Quick Reference

## 🚀 **Quick Start Commands**

```bash
# Complete setup
make setup

# Start autonomous Docker orchestration
make start

# Run all tests
make test

# Check system status
make status
```

## 📋 **Essential Commands**

### **Setup & Installation**
```bash
make install          # Install dependencies
make setup            # Complete system setup
make setup-worktrees  # Setup Git worktrees
make setup-testing    # Setup testing framework
```

### **Testing**
```bash
make test             # Run all tests
make test-unit        # Run unit tests
make test-integration # Run integration tests
make test-e2e         # Run E2E tests
make test-performance # Run performance tests
make test-coverage    # Run with coverage
make test-watch       # Run in watch mode
make test-ui          # Run with UI
```

### **System Management**
```bash
make start            # Start autonomous Docker orchestration
make start-local      # Start local development mode
make start-autonomous # Start autonomous mode
make start-docker     # Start Docker mode
make stop             # Stop all services
make restart          # Restart all services
```

### **Status & Monitoring**
```bash
make status           # Check system status
make logs             # Show system logs
make logs-orchestrator # Show orchestrator logs
make logs-api         # Show API logs
make logs-workers     # Show worker logs
make monitor          # Start monitoring dashboard
make health           # Check system health
```

## 🐳 **Docker Commands**

```bash
make docker-build     # Build Docker images
make docker-pull      # Pull Docker images
make docker-clean     # Clean Docker resources
make docker-scale     # Scale workers (usage: make docker-scale WORKER=worker-a COUNT=3)
```

## 🛠️ **Development Commands**

```bash
make dev              # Start development environment
make dev-docker       # Start development with Docker
make quick-start      # Quick start for development
make quick-test       # Quick test run
make quick-deploy     # Quick deployment
```

## 🚀 **Deployment Commands**

```bash
make deploy           # Deploy to production
make deploy-docker    # Deploy with Docker
```

## 🧹 **Maintenance Commands**

```bash
make clean            # Clean generated files
make clean-all        # Clean everything including dependencies
make backup           # Backup system state
make restore          # Restore from backup (usage: make restore BACKUP=backup-20231022-120000.tar.gz)
```

## 🔍 **Validation Commands**

```bash
make validate         # Validate system configuration
make validate-docker  # Validate Docker setup
make health           # Check system health
```

## 📊 **Performance Commands**

```bash
make benchmark        # Run performance benchmarks
make stress-test      # Run stress tests
```

## 🔒 **Security Commands**

```bash
make security-scan    # Run security scan
make security-fix     # Fix security issues
```

## 🌍 **Environment Commands**

```bash
make env-check        # Check environment variables
make env-setup        # Setup environment variables
```

## 📚 **Documentation Commands**

```bash
make docs             # Generate documentation
make docs-serve       # Serve documentation
```

## ℹ️ **Information Commands**

```bash
make help             # Show help message
make info             # Show system information
make commands         # Show all available commands
```

## 🎯 **Common Workflows**

### **Development Workflow**
```bash
make setup            # Initial setup
make dev              # Start development
make test-watch       # Run tests in watch mode
```

### **Testing Workflow**
```bash
make test-unit        # Run unit tests
make test-integration # Run integration tests
make test-e2e         # Run E2E tests
make test-coverage    # Check coverage
```

### **Deployment Workflow**
```bash
make test             # Run all tests
make deploy           # Deploy to production
make status           # Check deployment status
```

### **Docker Workflow**
```bash
make docker-build     # Build images
make start-docker     # Start with Docker
make docker-scale WORKER=worker-a COUNT=3 # Scale workers
make docker-clean     # Clean up
```

### **Monitoring Workflow**
```bash
make start            # Start system
make monitor          # Open monitoring dashboard
make logs             # Check logs
make health           # Check health
```

## 🚨 **Troubleshooting Commands**

```bash
make stop             # Stop all services
make clean            # Clean generated files
make restart          # Restart all services
make validate         # Validate configuration
make health           # Check system health
```

## 📈 **Performance Monitoring**

```bash
make monitor          # Open monitoring dashboard
make benchmark        # Run benchmarks
make stress-test      # Run stress tests
make logs             # Monitor logs
```

## 🔧 **Advanced Usage**

### **Custom Scaling**
```bash
make docker-scale WORKER=worker-a COUNT=5
make docker-scale WORKER=worker-b COUNT=3
make docker-scale WORKER=copilot COUNT=2
```

### **Backup and Restore**
```bash
make backup           # Create backup
make restore BACKUP=backup-20231022-120000.tar.gz
```

### **Environment Setup**
```bash
make env-setup        # Setup environment
make env-check        # Check environment
```

## 🎉 **Quick Reference**

| Command | Description |
|---------|-------------|
| `make help` | Show all commands |
| `make setup` | Complete setup |
| `make start` | Start system |
| `make test` | Run tests |
| `make status` | Check status |
| `make stop` | Stop system |
| `make clean` | Clean files |
| `make logs` | Show logs |
| `make health` | Check health |

## 🚀 **Getting Started**

1. **First Time Setup**
   ```bash
   make setup
   make env-setup
   # Ensure ~/.claude/.credentials.json exists (read-only mount for dev-bots)
   ```

2. **Start Development**
   ```bash
   make dev
   make test-watch
   ```

3. **Deploy to Production**
   ```bash
   make test
   make deploy
   make status
   ```

4. **Monitor System**
   ```bash
   make monitor
   make logs
   make health
   ```

**That's it! The Make commands make the Claude Worker Coordination System easy to use and manage!** 🎉
