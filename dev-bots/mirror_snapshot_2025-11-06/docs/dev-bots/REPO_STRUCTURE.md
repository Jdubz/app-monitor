# Repository Structure Guide

## 🏗️ Application Architecture

The Job Finder application is built as a **multi-repository monorepo** with 5 independent git repositories working together.

## 📁 Repository Overview

### 1. `job-finder-BE/` - Backend Services

**Purpose**: Firebase Functions backend API
**Technology**: TypeScript, Firebase Functions, Firestore
**Key Files**:

- `functions/src/index.ts` - Main entry point
- `functions/src/` - API endpoints and business logic
- `functions/package.json` - Dependencies
- `.env` - Environment configuration

**Responsibilities**:

- User authentication
- Job data management
- API endpoints
- Database operations
- Business logic

### 2. `job-finder-FE/` - Frontend Application

**Purpose**: React web application
**Technology**: React, TypeScript, Vite
**Key Files**:

- `src/App.tsx` - Main application component
- `src/components/` - React components
- `src/services/` - API services
- `package.json` - Dependencies

**Responsibilities**:

- User interface
- User interactions
- API communication
- State management
- Routing

### 3. `job-finder-worker/` - Background Processing

**Purpose**: Python worker for job processing
**Technology**: Python, Background tasks
**Key Files**:

- `main.py` - Main worker entry point
- `requirements.txt` - Python dependencies
- `config.py` - Configuration

**Responsibilities**:

- Job scraping
- Data processing
- Background tasks
- External API integration

### 4. `job-finder-shared-types/` - Type Definitions

**Purpose**: Shared TypeScript types across components
**Technology**: TypeScript
**Key Files**:

- `src/types/` - Type definitions
- `package.json` - Package configuration

**Responsibilities**:

- API contract definitions
- Data model types
- Interface definitions
- Type safety across components

### 5. `dev-monitor/` - Development Tools

**Purpose**: Development monitoring and management
**Technology**: Node.js, React
**Key Files**:

- `backend/src/` - Monitoring backend
- `frontend/src/` - Monitoring UI
- `package.json` - Dependencies

**Responsibilities**:

- System monitoring
- Development tools
- Claude Workers management
- Logging and debugging

## 🔄 Inter-Repository Dependencies

```
job-finder-shared-types
    ↑
    ├── job-finder-BE (uses types)
    ├── job-finder-FE (uses types)
    └── dev-monitor (uses types)

job-finder-BE
    ↑
    └── job-finder-FE (calls API)

job-finder-worker
    ↑
    └── job-finder-BE (receives processed data)

dev-monitor
    ↑
    └── All repos (monitors and manages)
```

## 🎯 Worker Responsibilities

### Worker A (Backend Focus)

**Primary Repositories**:

- `job-finder-BE/` - Main development focus
- `job-finder-worker/` - Secondary focus
- `job-finder-shared-types/` - Type updates

**Typical Tasks**:

- API endpoint development
- Database schema changes
- Business logic implementation
- Worker process improvements
- Type definition updates

### Worker B (Frontend Focus)

**Primary Repositories**:

- `job-finder-FE/` - Main development focus
- `dev-monitor/` - Secondary focus
- `job-finder-shared-types/` - Type updates

**Typical Tasks**:

- UI component development
- User experience improvements
- Frontend API integration
- Development tool enhancements
- Type definition updates

## 🔧 Development Workflow

### 1. Type Changes (Most Common)

When updating shared types:

1. Modify `job-finder-shared-types/`
2. Update dependent repositories
3. Test across all components

### 2. API Changes

When changing backend APIs:

1. Update `job-finder-shared-types/` (types)
2. Implement in `job-finder-BE/`
3. Update `job-finder-FE/` (frontend calls)
4. Test end-to-end

### 3. New Features

For new features:

1. Plan across repositories
2. Start with types if needed
3. Implement backend logic
4. Implement frontend UI
5. Add monitoring if needed

## 📋 Repository-Specific Guidelines

### Backend (`job-finder-BE/`)

- Follow Firebase Functions patterns
- Use proper error handling
- Implement proper authentication
- Write comprehensive tests
- Document API endpoints

### Frontend (`job-finder-FE/`)

- Follow React best practices
- Use TypeScript strictly
- Implement proper error boundaries
- Write component tests
- Follow accessibility guidelines

### Worker (`job-finder-worker/`)

- Handle errors gracefully
- Implement proper logging
- Use environment variables
- Write unit tests
- Document configuration

### Shared Types (`job-finder-shared-types/`)

- Keep types minimal and focused
- Use clear naming conventions
- Document complex types
- Version changes carefully
- Test type compatibility

### Dev Monitor (`dev-monitor/`)

- Keep monitoring lightweight
- Use efficient data collection
- Implement proper error handling
- Write comprehensive tests
- Document monitoring features

## 🚨 Common Pitfalls

1. **Type Mismatches**: Always update shared types first
2. **API Breaking Changes**: Coordinate between BE and FE
3. **Environment Differences**: Use consistent environment setup
4. **Dependency Conflicts**: Keep dependencies aligned
5. **Testing Gaps**: Test across repository boundaries

## 🔍 Debugging Tips

1. **Check Type Definitions**: Start with shared types
2. **Verify API Contracts**: Ensure BE and FE match
3. **Check Environment**: Verify all environment variables
4. **Review Dependencies**: Ensure all packages are compatible
5. **Test Integration**: Test cross-repository functionality

## 📚 Additional Resources

- `docs/` - Detailed documentation for each component
- `issues/` - Current issues and requirements
- `README.md` - Project overview and setup
- `WORKER_ONBOARDING.md` - Worker-specific instructions

---

**Remember**: Each repository is independent but they work together. Always consider the impact of your changes on other components.
