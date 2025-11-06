# Claude Workers Agent Personalities

## 👥 Agent Overview

The Claude Workers system features 6 specialized AI agent personalities, each optimized for specific types of development tasks. Each agent has unique skills, specializations, and focuses.

## 🤖 Agent Personalities

### 1. Alex - Backend Specialist

**Focus**: Reliability and System Architecture

**Primary Skills**:

- Node.js, TypeScript, JavaScript
- PostgreSQL, Redis, MongoDB
- Docker, Kubernetes, AWS
- API development, database design
- System architecture, microservices

**Specialties**:

- RESTful API development
- Database schema design
- Authentication and authorization
- Performance optimization
- Infrastructure as code

**Task Types**:

- API endpoint development
- Database migrations
- Authentication systems
- Performance improvements
- Infrastructure setup

**Code Patterns**:

```typescript
// Preferred patterns
- Express.js with TypeScript
- Prisma ORM for database
- JWT for authentication
- Docker for containerization
- AWS services integration
```

### 2. Sam - Frontend Specialist

**Focus**: Quality and User Experience

**Primary Skills**:

- React, TypeScript, JavaScript
- CSS, HTML, Tailwind CSS
- Next.js, Vite, Webpack
- UI/UX design principles
- Responsive design

**Specialties**:

- Component development
- State management (Redux, Zustand)
- Styling and theming
- Performance optimization
- Accessibility (a11y)

**Task Types**:

- React component development
- UI/UX improvements
- Styling and theming
- Performance optimization
- Accessibility enhancements

**Code Patterns**:

```typescript
// Preferred patterns
- Functional components with hooks
- TypeScript interfaces
- Tailwind CSS for styling
- React Query for data fetching
- Storybook for component documentation
```

### 3. Casey - Review Specialist

**Focus**: Quality and Security

**Primary Skills**:

- Code analysis and review
- Security tools and practices
- Testing frameworks
- Code quality metrics
- Static analysis tools

**Specialties**:

- Code review and analysis
- Security vulnerability detection
- Code quality assessment
- Best practices enforcement
- Performance analysis

**Task Types**:

- Code reviews
- Security audits
- Quality assessments
- Performance reviews
- Best practices enforcement

**Tools Used**:

```bash
# Security and quality tools
- ESLint, Prettier
- SonarQube, CodeClimate
- Snyk, OWASP ZAP
- Jest, Vitest
- Lighthouse
```

### 4. Taylor - Testing Specialist

**Focus**: Quality and Test Automation

**Primary Skills**:

- Test frameworks (Jest, Vitest, Playwright)
- Test automation tools
- QA methodologies
- Test design and implementation
- CI/CD integration

**Specialties**:

- Unit test development
- Integration testing
- End-to-end testing
- Test automation
- Quality assurance

**Task Types**:

- Test suite development
- Test automation setup
- QA process improvement
- Test coverage analysis
- CI/CD pipeline testing

**Testing Patterns**:

```typescript
// Preferred testing patterns
- Jest for unit tests
- Playwright for E2E tests
- React Testing Library for component tests
- 80% minimum coverage requirement
- TDD/BDD methodologies
```

### 5. Jordan - DevOps Specialist

**Focus**: Reliability and Infrastructure

**Primary Skills**:

- Docker, Kubernetes, Terraform
- CI/CD pipelines
- Cloud platforms (AWS, GCP, Azure)
- Infrastructure as code
- Monitoring and logging

**Specialties**:

- Container orchestration
- Infrastructure automation
- Deployment strategies
- Monitoring and alerting
- Security and compliance

**Task Types**:

- Infrastructure setup
- CI/CD pipeline development
- Container optimization
- Monitoring implementation
- Security hardening

**DevOps Patterns**:

```yaml
# Preferred patterns
- Docker multi-stage builds
- Kubernetes deployments
- Terraform for infrastructure
- GitHub Actions for CI/CD
- Prometheus + Grafana for monitoring
```

### 6. Morgan - Documentation Specialist

**Focus**: Quality and Clarity

**Primary Skills**:

- Technical writing
- Documentation tools
- API documentation
- User guides and tutorials
- Knowledge management

**Specialties**:

- API documentation
- Technical writing
- User experience documentation
- Process documentation
- Knowledge base management

**Task Types**:

- API documentation
- User guide creation
- Process documentation
- Technical writing
- Knowledge base updates

**Documentation Patterns**:

```markdown
# Preferred documentation patterns

- Markdown for documentation
- OpenAPI/Swagger for APIs
- JSDoc for code documentation
- Storybook for component docs
- GitBook or Docusaurus for sites
```

## 🎯 Agent Assignment Logic

### Automatic Assignment

The system automatically assigns tasks to agents based on:

1. **Task Type Matching**:
   - `feature` → Backend or Frontend specialist
   - `bug-fix` → Backend or Frontend specialist
   - `review` → Review specialist
   - `test` → Testing specialist
   - `infrastructure` → DevOps specialist
   - `documentation` → Documentation specialist

2. **Skill Requirements**:
   - Project-specific skills (React, Node.js, etc.)
   - Technology stack alignment
   - Complexity level matching

3. **Load Balancing**:
   - Agent availability
   - Current workload
   - Historical performance

### Manual Assignment

Tasks can be manually assigned to specific agents:

```json
{
  "assignedAgent": "backend-specialist",
  "priority": "high",
  "notes": "Requires backend expertise"
}
```

## 📊 Agent Performance Metrics

### Key Performance Indicators

- **Task Completion Rate**: % of tasks completed successfully
- **Average Task Time**: Time taken to complete tasks
- **Quality Score**: Based on code quality and testing
- **Scope Adherence**: How well tasks stay within scope
- **Client Satisfaction**: Feedback from task creators

### Performance Tracking

```typescript
interface AgentPerformance {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  successRate: number;
  averageTime: number;
  qualityScore: number;
  scopeViolations: number;
  lastActive: string;
}
```

## 🔄 Agent Learning & Adaptation

### Learning Mechanisms

1. **Task Feedback**: Agents learn from task completion feedback
2. **Pattern Recognition**: Identify successful task patterns
3. **Skill Development**: Improve based on task outcomes
4. **Scope Learning**: Better understand scope boundaries

### Adaptation Features

- **Dynamic Skill Updates**: Agents improve skills over time
- **Pattern Recognition**: Learn from successful task patterns
- **Scope Refinement**: Better scope understanding
- **Performance Optimization**: Improve based on metrics

## 🛠️ Agent Configuration

### Agent Settings

```json
{
  "agents": {
    "backend-specialist": {
      "name": "Alex",
      "type": "backend",
      "skills": ["nodejs", "typescript", "postgresql"],
      "maxConcurrentTasks": 2,
      "preferredTaskTypes": ["feature", "bug-fix"],
      "timeout": 300000
    }
  }
}
```

### Custom Agent Creation

New agents can be created with custom skills and specializations:

```json
{
  "name": "Custom Agent",
  "type": "custom",
  "skills": ["python", "machine-learning", "data-analysis"],
  "specialties": ["ML model development", "Data processing"],
  "maxConcurrentTasks": 1
}
```

## 📚 Related Documentation

- [API Endpoints](endpoints.md)
- [Task Creation Guidelines](task-creation-guidelines.md)
- [Task Prompt Template](task-prompt-template.md)
- [System Architecture](../architecture/system-overview.md)
- [Learning System](../learning/learning-system-analysis.md)

---

**Last Updated**: 2025-01-27  
**Total Agents**: 6  
**Agent Types**: Backend, Frontend, Review, Testing, DevOps, Documentation
