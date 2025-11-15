# Claude Workers Task Examples

## 📝 Task Creation Examples

This document provides comprehensive examples of different types of tasks that can be created with the Claude Workers system.

## 🚀 Basic Task Examples

### 1. Feature Development Task
```json
{
  "type": "feature",
  "title": "Add user authentication to dashboard",
  "documentation": "Implement JWT-based authentication for the dashboard using Firebase Auth. Users should be able to log in, log out, and access protected routes.",
  "acceptanceCriteria": [
    "User can log in with email/password",
    "JWT tokens are properly generated and validated",
    "Protected routes redirect to login when not authenticated",
    "User can log out and tokens are invalidated",
    "Authentication state persists across page refreshes"
  ],
  "assignedAgent": "backend-specialist",
  "files": [
    "src/auth/auth.service.ts",
    "src/auth/auth.controller.ts",
    "src/middleware/auth.middleware.ts"
  ],
  "dependencies": ["firebase-admin", "jsonwebtoken"],
  "project": "job-finder-BE",
  "priority": 5,
  "estimatedEffort": {
    "hours": 6,
    "complexity": "medium",
    "confidence": "high"
  },
  "contextBoundaries": {
    "mustNotChange": ["src/database/schema.sql"],
    "mustNotAffect": ["src/api/public-routes.ts"],
    "integrationPoints": ["src/middleware/", "src/routes/"]
  }
}
```

### 2. Bug Fix Task
```json
{
  "type": "bug-fix",
  "title": "Fix memory leak in data processing service",
  "documentation": "The data processing service is experiencing memory leaks during large file processing. Memory usage grows continuously and eventually crashes the service.",
  "acceptanceCriteria": [
    "Memory usage remains stable during large file processing",
    "No memory leaks detected in heap analysis",
    "Service can process files up to 100MB without issues",
    "All existing tests pass",
    "Performance is not significantly degraded"
  ],
  "assignedAgent": "backend-specialist",
  "files": [
    "src/services/data-processor.ts",
    "src/utils/file-handler.ts"
  ],
  "project": "job-finder-BE",
  "priority": 8,
  "estimatedEffort": {
    "hours": 4,
    "complexity": "medium",
    "confidence": "medium"
  },
  "testingRequirements": [
    "Unit tests for memory usage",
    "Integration tests with large files",
    "Performance benchmarks"
  ]
}
```

### 3. Frontend Component Task
```json
{
  "type": "feature",
  "title": "Create reusable data table component",
  "documentation": "Build a reusable data table component with sorting, filtering, and pagination. The component should be flexible enough to work with different data types and be accessible.",
  "acceptanceCriteria": [
    "Component supports sorting by any column",
    "Filtering works with text and number inputs",
    "Pagination handles large datasets efficiently",
    "Component is fully accessible (WCAG 2.1 AA)",
    "Component is responsive and works on mobile",
    "Component has comprehensive TypeScript types"
  ],
  "assignedAgent": "frontend-specialist",
  "files": [
    "src/components/DataTable/DataTable.tsx",
    "src/components/DataTable/DataTable.module.css",
    "src/components/DataTable/DataTable.types.ts",
    "src/components/DataTable/DataTable.test.tsx"
  ],
  "dependencies": ["@types/react", "clsx"],
  "project": "job-finder-FE",
  "priority": 6,
  "estimatedEffort": {
    "hours": 8,
    "complexity": "medium",
    "confidence": "high"
  },
  "testingRequirements": [
    "Unit tests for all component methods",
    "Accessibility tests with screen reader",
    "Visual regression tests",
    "Performance tests with large datasets"
  ]
}
```

## 🔍 Review and Testing Tasks

### 4. Code Review Task
```json
{
  "type": "review",
  "title": "Review authentication implementation for security vulnerabilities",
  "documentation": "Conduct a comprehensive security review of the authentication system. Check for common vulnerabilities like SQL injection, XSS, CSRF, and improper session management.",
  "acceptanceCriteria": [
    "No SQL injection vulnerabilities found",
    "No XSS vulnerabilities in user inputs",
    "CSRF protection is properly implemented",
    "Session management follows security best practices",
    "Password hashing uses strong algorithms",
    "JWT tokens are properly secured"
  ],
  "assignedAgent": "review-specialist",
  "files": [
    "src/auth/",
    "src/middleware/",
    "src/routes/auth.ts"
  ],
  "project": "job-finder-BE",
  "priority": 9,
  "estimatedEffort": {
    "hours": 3,
    "complexity": "high",
    "confidence": "high"
  },
  "tools": ["ESLint security rules", "Snyk", "OWASP ZAP"]
}
```

### 5. Testing Task
```json
{
  "type": "test",
  "title": "Implement comprehensive test suite for user management API",
  "documentation": "Create a complete test suite for the user management API endpoints. Include unit tests, integration tests, and end-to-end tests with proper coverage.",
  "acceptanceCriteria": [
    "Unit tests cover all service methods",
    "Integration tests cover all API endpoints",
    "E2E tests cover complete user workflows",
    "Test coverage is at least 80%",
    "All edge cases are tested",
    "Tests are maintainable and well-documented"
  ],
  "assignedAgent": "testing-specialist",
  "files": [
    "src/api/users/",
    "src/services/user.service.ts",
    "tests/unit/users/",
    "tests/integration/users/",
    "tests/e2e/users/"
  ],
  "project": "job-finder-BE",
  "priority": 7,
  "estimatedEffort": {
    "hours": 5,
    "complexity": "medium",
    "confidence": "high"
  },
  "testingRequirements": [
    "Jest for unit tests",
    "Supertest for API testing",
    "Playwright for E2E tests",
    "80% minimum coverage"
  ]
}
```

## 🏗️ Infrastructure and DevOps Tasks

### 6. Infrastructure Task
```json
{
  "type": "infrastructure",
  "title": "Set up CI/CD pipeline with automated testing and deployment",
  "documentation": "Create a complete CI/CD pipeline using GitHub Actions that runs tests, builds Docker images, and deploys to staging and production environments.",
  "acceptanceCriteria": [
    "Pipeline runs on every PR and main branch push",
    "All tests must pass before deployment",
    "Docker images are built and pushed to registry",
    "Staging deployment happens automatically",
    "Production deployment requires manual approval",
    "Pipeline includes security scanning"
  ],
  "assignedAgent": "devops-specialist",
  "files": [
    ".github/workflows/ci-cd.yml",
    "Dockerfile",
    "docker-compose.yml",
    "scripts/deploy.sh"
  ],
  "project": "job-finder-BE",
  "priority": 8,
  "estimatedEffort": {
    "hours": 6,
    "complexity": "medium",
    "confidence": "high"
  },
  "tools": ["GitHub Actions", "Docker", "AWS ECS", "Snyk"]
}
```

### 7. Documentation Task
```json
{
  "type": "documentation",
  "title": "Create comprehensive API documentation with OpenAPI specification",
  "documentation": "Generate complete API documentation using OpenAPI 3.0 specification. Include all endpoints, request/response schemas, authentication, and examples.",
  "acceptanceCriteria": [
    "All API endpoints are documented",
    "Request/response schemas are complete",
    "Authentication methods are documented",
    "Examples are provided for all endpoints",
    "Documentation is interactive and testable",
    "Documentation is hosted and accessible"
  ],
  "assignedAgent": "documentation-specialist",
  "files": [
    "docs/api/openapi.yaml",
    "src/swagger/",
    "docs/api/README.md"
  ],
  "project": "job-finder-BE",
  "priority": 4,
  "estimatedEffort": {
    "hours": 4,
    "complexity": "low",
    "confidence": "high"
  },
  "tools": ["OpenAPI 3.0", "Swagger UI", "JSDoc"]
}
```

## 🔧 Advanced Task Examples

### 8. Refactoring Task
```json
{
  "type": "refactor",
  "title": "Refactor legacy authentication code to use modern patterns",
  "documentation": "Refactor the existing authentication system to use modern patterns like dependency injection, proper error handling, and clean architecture principles.",
  "acceptanceCriteria": [
    "Code follows clean architecture principles",
    "Dependency injection is properly implemented",
    "Error handling is consistent and comprehensive",
    "Code is more testable and maintainable",
    "All existing functionality is preserved",
    "Performance is not degraded"
  ],
  "assignedAgent": "backend-specialist",
  "files": [
    "src/auth/",
    "src/middleware/",
    "src/routes/auth.ts"
  ],
  "project": "job-finder-BE",
  "priority": 6,
  "estimatedEffort": {
    "hours": 8,
    "complexity": "high",
    "confidence": "medium"
  },
  "contextBoundaries": {
    "mustNotChange": ["src/database/schema.sql"],
    "mustNotAffect": ["src/api/public-routes.ts"],
    "integrationPoints": ["src/middleware/", "src/routes/"]
  }
}
```

### 9. Performance Optimization Task
```json
{
  "type": "performance",
  "title": "Optimize database queries and implement caching",
  "documentation": "Analyze and optimize slow database queries, implement Redis caching for frequently accessed data, and improve overall application performance.",
  "acceptanceCriteria": [
    "Database query response time reduced by 50%",
    "Redis caching is implemented for hot data",
    "Cache invalidation strategy is properly implemented",
    "Application response time improved by 30%",
    "Memory usage is optimized",
    "All performance tests pass"
  ],
  "assignedAgent": "backend-specialist",
  "files": [
    "src/services/",
    "src/cache/",
    "src/database/queries/"
  ],
  "dependencies": ["redis", "ioredis"],
  "project": "job-finder-BE",
  "priority": 7,
  "estimatedEffort": {
    "hours": 6,
    "complexity": "medium",
    "confidence": "high"
  },
  "testingRequirements": [
    "Performance benchmarks",
    "Load testing",
    "Cache hit rate monitoring"
  ]
}
```

## 📊 Task Templates by Type

### Feature Development Template
```json
{
  "type": "feature",
  "title": "[Feature Name]",
  "documentation": "[Detailed description of the feature]",
  "acceptanceCriteria": [
    "[Specific, measurable criteria]"
  ],
  "assignedAgent": "[appropriate-specialist]",
  "files": ["[relevant files]"],
  "dependencies": ["[required packages]"],
  "project": "[target-project]",
  "priority": 5,
  "estimatedEffort": {
    "hours": 4,
    "complexity": "medium",
    "confidence": "high"
  }
}
```

### Bug Fix Template
```json
{
  "type": "bug-fix",
  "title": "Fix [specific issue]",
  "documentation": "[Description of the bug and its impact]",
  "acceptanceCriteria": [
    "[Specific fix requirements]"
  ],
  "assignedAgent": "[appropriate-specialist]",
  "files": ["[files to modify]"],
  "project": "[target-project]",
  "priority": 8,
  "estimatedEffort": {
    "hours": 2,
    "complexity": "low",
    "confidence": "high"
  }
}
```

## 🎯 Best Practices

### Task Creation Guidelines
1. **Clear Titles**: Use descriptive, specific titles
2. **Detailed Documentation**: Provide comprehensive context
3. **Specific Acceptance Criteria**: Make criteria measurable
4. **Appropriate Agent Assignment**: Match task type to agent skills
5. **Realistic Effort Estimates**: Be honest about complexity
6. **Proper Scope Boundaries**: Define what should and shouldn't change

### Common Mistakes to Avoid
1. **Vague Requirements**: "Make it better" is not specific enough
2. **Missing Context**: Don't assume the agent knows the codebase
3. **Unrealistic Expectations**: Don't ask for 8 hours of work in 2 hours
4. **Poor Agent Matching**: Don't assign frontend tasks to backend specialists
5. **Missing Dependencies**: List all required packages and tools

## 📚 Related Documentation

- [API Reference](api-reference.md)
- [Agent Personalities](agent-personalities.md)
- [Task Submission Guide](MINIMAL_TASK_SUBMISSION_GUIDE.md)

---

**Last Updated**: 2025-01-27  
**Total Examples**: 9  
**Task Types Covered**: All 8 supported types