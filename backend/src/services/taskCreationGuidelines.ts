/**
 * Task Creation Guidelines Service
 * 
 * Ensures all tasks are detailed, specific, and actionable with comprehensive
 * guidelines for high-quality task creation
 */

// import { logger } from '../utils/logger.js';
import {
  EnhancedTaskData,
  ensureTaskMetadataFieldKeys,
  type TaskMetadataFieldKey
} from './taskMetadataFields.js';

export interface TaskCreationGuidelines {
  id: string;
  name: string;
  description: string;
  requiredFields: readonly TaskMetadataFieldKey[];
  optionalFields: readonly TaskMetadataFieldKey[];
  validationRules: ValidationRule[];
  examples: TaskExample[];
  bestPractices: string[];
  dryGuidelines: string[];
}

export interface ValidationRule {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface TaskExample {
  type: string;
  title: string;
  description: string;
  example: Record<string, unknown>;
}

type GuidelineType = 'implementation' | 'review' | 'testing' | 'feature';

type GuidelineFieldSet = {
  required: readonly TaskMetadataFieldKey[];
  optional: readonly TaskMetadataFieldKey[];
};

const BASE_REQUIRED_FIELDS = ensureTaskMetadataFieldKeys([
  'title',
  'description',
  'acceptanceCriteria',
  'validationSteps',
  'successMetrics',
  'assignedAgent'
] as const);

const BASE_OPTIONAL_FIELDS = ensureTaskMetadataFieldKeys([
  'files',
  'rollbackPlan',
  'documentationRequirements',
  'relatedTasks'
] as const);

const GUIDELINE_FIELD_DEFINITIONS: Readonly<Record<GuidelineType, GuidelineFieldSet>> = {
  feature: {
    required: ensureTaskMetadataFieldKeys([
      'title',
      'description',
      'acceptanceCriteria'
    ] as const),
    optional: ensureTaskMetadataFieldKeys([
      ...BASE_OPTIONAL_FIELDS,
      'validationSteps',
      'successMetrics',
      'assignedAgent',
      'estimatedEffort',
      'dependencies'
    ] as const)
  },
  implementation: {
    required: ensureTaskMetadataFieldKeys([
      ...BASE_REQUIRED_FIELDS,
      'architectureReferences',
      'estimatedEffort'
    ] as const),
    optional: ensureTaskMetadataFieldKeys([
      ...BASE_OPTIONAL_FIELDS,
      'dependencies',
      'prerequisites',
      'testingRequirements',
      'parentInitiative'
    ] as const)
  },
  review: {
    required: ensureTaskMetadataFieldKeys([
      ...BASE_REQUIRED_FIELDS,
      'testingRequirements'
    ] as const),
    optional: ensureTaskMetadataFieldKeys([
      ...BASE_OPTIONAL_FIELDS,
      'architectureReferences'
    ] as const)
  },
  testing: {
    required: ensureTaskMetadataFieldKeys([
      ...BASE_REQUIRED_FIELDS,
      'testingRequirements'
    ] as const),
    optional: ensureTaskMetadataFieldKeys([
      ...BASE_OPTIONAL_FIELDS,
      'estimatedEffort'
    ] as const)
  }
} as const;

export class TaskCreationGuidelinesManager {
  private guidelines: Map<string, TaskCreationGuidelines> = new Map();
  private validationRules: ValidationRule[] = [];
  private validProjects: string[] = [
    'dev-bots',
    'dev-monitor', 
    'job-finder-FE',
    'job-finder-BE',
    'job-finder-shared-types',
    'job-finder-worker',
    'docs',
    'scripts',
    'infrastructure'
  ];

  private validAgents: string[] = [
    'backend-specialist',
    'frontend-specialist',
    'review-specialist',
    'testing-specialist',
    'devops-specialist',
    'documentation-specialist'
  ];

  constructor() {
    this.initializeGuidelines();
    this.initializeValidationRules();
  }

  private initializeGuidelines(): void {
    // Feature Task Guidelines (Simplified)
    this.guidelines.set('feature', {
      id: 'feature',
      name: 'Feature Task Guidelines',
      description: 'Guidelines for creating simple feature tasks with minimal requirements',
      requiredFields: GUIDELINE_FIELD_DEFINITIONS.feature.required,
      optionalFields: GUIDELINE_FIELD_DEFINITIONS.feature.optional,
      validationRules: [
        {
          field: 'acceptanceCriteria',
          rule: 'minLength:1',
          message: 'Must have at least 1 acceptance criterion',
          severity: 'error'
        }
      ],
      examples: [
        {
          type: 'feature',
          title: 'Add user profile endpoint',
          description: 'Create a simple REST endpoint to fetch user profile data',
          example: {
            title: 'Add user profile endpoint',
            description: 'Create GET /api/users/:id endpoint that returns user profile information',
            acceptanceCriteria: [
              'GET /api/users/:id returns user data',
              'Returns 404 if user not found',
              'Returns proper JSON response'
            ],
            files: ['backend/src/routes/users.ts'],
            assignedAgent: 'backend-specialist'
          }
        }
      ],
      bestPractices: [
        'Keep tasks focused and small',
        'Include clear acceptance criteria',
        'Specify which files need changes'
      ],
      dryGuidelines: []
    });

    // Implementation Task Guidelines
    this.guidelines.set('implementation', {
      id: 'implementation',
      name: 'Implementation Task Guidelines',
      description: 'Guidelines for creating detailed implementation tasks',
      requiredFields: GUIDELINE_FIELD_DEFINITIONS.implementation.required,
      optionalFields: GUIDELINE_FIELD_DEFINITIONS.implementation.optional,
      validationRules: [
        {
          field: 'acceptanceCriteria',
          rule: 'minLength:3',
          message: 'Must have at least 3 specific acceptance criteria',
          severity: 'error'
        },
        {
          field: 'architectureReferences',
          rule: 'minLength:1',
          message: 'Must reference at least one architecture document or pattern',
          severity: 'error'
        },
      ],
      examples: [
        {
          type: 'implementation',
          title: 'User Authentication API Endpoint',
          description: 'Implement REST API endpoint for user authentication with JWT tokens',
          example: {
            title: 'User Authentication API Endpoint',
            description: 'Implement REST API endpoint for user authentication with JWT tokens, including login, logout, and token refresh functionality.',
            acceptanceCriteria: [
              'POST /api/auth/login returns JWT token for valid credentials',
              'POST /api/auth/logout invalidates the JWT token',
              'POST /api/auth/refresh returns new JWT token for valid refresh token',
              'All endpoints return appropriate HTTP status codes and error messages',
              'JWT tokens expire after 15 minutes, refresh tokens after 7 days'
            ],
            architectureReferences: [
              'docs/architecture/authentication.md',
              'docs/patterns/jwt-implementation.md',
              'docs/api/rest-standards.md'
            ],
            estimatedEffort: {
              hours: 8,
              complexity: 'medium',
              confidence: 'high'
            },
            files: [
              'src/auth/auth.controller.ts',
              'src/auth/auth.service.ts',
              'src/auth/auth.module.ts',
              'src/auth/dto/login.dto.ts',
              'src/auth/dto/refresh.dto.ts'
            ],
            validationSteps: [
              'Run unit tests for auth service',
              'Test API endpoints with Postman',
              'Verify JWT token generation and validation',
              'Test token expiration scenarios',
              'Verify error handling for invalid credentials'
            ],
            successMetrics: [
              'All acceptance criteria met',
              'Unit test coverage > 90%',
              'API response times < 200ms',
              'No security vulnerabilities detected'
            ]
          }
        }
      ],
      bestPractices: [
        'Be specific about input/output formats',
        'Include error handling requirements',
        'Specify performance expectations',
        'Reference existing patterns and conventions',
        'Include security considerations',
        'Define clear success criteria'
      ],
      dryGuidelines: [
        'MANDATORY: Search entire codebase for similar functionality before creating task',
        'Check existing utilities, services, and components that could be reused',
        'Specify which existing patterns should be extended rather than duplicated',
        'Include references to existing code that should be reused',
        'Document why new code is necessary if existing code cannot be reused',
        'Ensure task promotes code reuse and prevents duplication',
        'Reference existing architecture patterns and conventions',
        'Specify how new code will be made reusable for future tasks',
        'MANDATORY: Update existing documentation instead of creating new documentation files',
        'Specify which existing documentation should be updated to reflect changes',
        'Avoid documentation explosion by consolidating updates into existing docs'
      ]
    });

    // Review Task Guidelines
    this.guidelines.set('review', {
      id: 'review',
      name: 'Code Review Task Guidelines',
      description: 'Guidelines for creating comprehensive code review tasks',
      requiredFields: GUIDELINE_FIELD_DEFINITIONS.review.required,
      optionalFields: GUIDELINE_FIELD_DEFINITIONS.review.optional,
      validationRules: [
        {
          field: 'acceptanceCriteria',
          rule: 'minLength:5',
          message: 'Must have at least 5 review criteria',
          severity: 'error'
        }
      ],
      examples: [
        {
          type: 'review',
          title: 'Security Review of Authentication Module',
          description: 'Comprehensive security review of the authentication module for vulnerabilities and best practices',
          example: {
            title: 'Security Review of Authentication Module',
            description: 'Conduct thorough security review of authentication module including password handling, JWT implementation, and session management.',
            acceptanceCriteria: [
              'No hardcoded secrets or credentials found',
              'Password hashing uses bcrypt with appropriate salt rounds',
              'JWT tokens are properly signed and validated',
              'Session management follows secure practices',
              'Input validation prevents injection attacks',
              'Error messages do not leak sensitive information',
              'Rate limiting is implemented for auth endpoints'
            ],
            files: [
              'src/auth/auth.service.ts',
              'src/auth/auth.controller.ts',
              'src/auth/strategies/jwt.strategy.ts',
              'src/auth/guards/auth.guard.ts'
            ],
            validationSteps: [
              'Run security scanning tools',
              'Review code for common vulnerabilities',
              'Test authentication flows manually',
              'Verify error handling and logging',
              'Check for information disclosure'
            ],
            successMetrics: [
              'Zero critical security vulnerabilities',
              'All OWASP Top 10 items addressed',
              'Security scan passes with no high/critical issues',
              'Authentication flows tested and documented'
            ]
          }
        }
      ],
      bestPractices: [
        'Focus on security, performance, and maintainability',
        'Use automated tools where possible',
        'Document findings with severity levels',
        'Provide specific remediation suggestions',
        'Verify fixes are implemented correctly'
      ],
      dryGuidelines: [
        'MANDATORY: Identify existing code review patterns and templates',
        'Reference existing review checklists and standards',
        'Check for existing automated review tools and processes',
        'Specify which existing review patterns should be followed',
        'Include references to existing code that should be reviewed',
        'Document how review findings will prevent future duplication',
        'Ensure review promotes code reuse and identifies duplication',
        'Reference existing quality standards and conventions',
        'MANDATORY: Update existing review documentation instead of creating new files',
        'Specify which existing documentation should be updated with review findings',
        'Consolidate review updates into existing quality documentation'
      ]
    });

    // Testing Task Guidelines
    this.guidelines.set('testing', {
      id: 'testing',
      name: 'Testing Task Guidelines',
      description: 'Guidelines for creating comprehensive testing tasks',
      requiredFields: GUIDELINE_FIELD_DEFINITIONS.testing.required,
      optionalFields: GUIDELINE_FIELD_DEFINITIONS.testing.optional,
      validationRules: [
        {
          field: 'testingRequirements',
          rule: 'minLength:3',
          message: 'Must specify at least 3 testing requirements',
          severity: 'error'
        },
        {
          field: 'acceptanceCriteria',
          rule: 'minLength:4',
          message: 'Must have at least 4 test acceptance criteria',
          severity: 'error'
        }
      ],
      examples: [
        {
          type: 'testing',
          title: 'Unit Tests for User Service',
          description: 'Create comprehensive unit tests for the user service including all CRUD operations and edge cases',
          example: {
            title: 'Unit Tests for User Service',
            description: 'Implement comprehensive unit tests for user service covering all methods, error scenarios, and edge cases.',
            acceptanceCriteria: [
              'All public methods have unit tests',
              'Test coverage is at least 90%',
              'Error scenarios are tested',
              'Edge cases are covered',
              'Tests are maintainable and readable',
              'Mocking is used appropriately'
            ],
            testingRequirements: [
              'Use Jest testing framework',
              'Mock external dependencies',
              'Test both success and failure scenarios',
              'Include integration tests for database operations',
              'Test validation and error handling'
            ],
            files: [
              'src/users/users.service.spec.ts',
              'src/users/users.controller.spec.ts',
              'src/users/dto/user.dto.spec.ts'
            ],
            validationSteps: [
              'Run test suite and verify all tests pass',
              'Check test coverage report',
              'Review test quality and maintainability',
              'Verify error scenarios are tested',
              'Ensure tests run in CI/CD pipeline'
            ],
            successMetrics: [
              'Test coverage >= 90%',
              'All tests pass consistently',
              'No flaky tests',
              'Tests run in under 30 seconds',
              'Code quality metrics maintained'
            ]
          }
        }
      ],
      bestPractices: [
        'Test behavior, not implementation',
        'Use descriptive test names',
        'Follow AAA pattern (Arrange, Act, Assert)',
        'Mock external dependencies',
        'Test edge cases and error scenarios',
        'Maintain test data separately'
      ],
      dryGuidelines: [
        'MANDATORY: Check for existing test utilities and helpers',
        'Reference existing test patterns and frameworks',
        'Reuse existing test data and fixtures where possible',
        'Extend existing test utilities instead of creating new ones',
        'Check for existing test coverage tools and configurations',
        'Reference existing test standards and conventions',
        'Ensure new tests follow established patterns',
        'Document how new tests will be reusable for future testing',
        'MANDATORY: Update existing test documentation instead of creating new files',
        'Specify which existing documentation should be updated with test changes',
        'Consolidate test updates into existing testing documentation'
      ]
    });
  }

  private initializeValidationRules(): void {
    this.validationRules = [
      // Title validation
      {
        field: 'title',
        rule: 'required',
        message: 'Task title is required',
        severity: 'error'
      },
      {
        field: 'title',
        rule: 'minLength:10',
        message: 'Task title must be at least 10 characters',
        severity: 'error'
      },
      {
        field: 'title',
        rule: 'maxLength:100',
        message: 'Task title must be less than 100 characters',
        severity: 'warning'
      },

      // Description validation
      {
        field: 'description',
        rule: 'required',
        message: 'Task description is required',
        severity: 'error'
      },
      {
        field: 'description',
        rule: 'minLength:50',
        message: 'Task description must be at least 50 characters',
        severity: 'error'
      },
      {
        field: 'description',
        rule: 'maxLength:1000',
        message: 'Task description should be less than 1000 characters',
        severity: 'warning'
      },

      // Acceptance criteria validation
      {
        field: 'acceptanceCriteria',
        rule: 'required',
        message: 'Acceptance criteria are required',
        severity: 'error'
      },
      {
        field: 'acceptanceCriteria',
        rule: 'minLength:3',
        message: 'Must have at least 3 acceptance criteria',
        severity: 'error'
      },
      {
        field: 'acceptanceCriteria',
        rule: 'maxLength:10',
        message: 'Should have no more than 10 acceptance criteria',
        severity: 'warning'
      },


      // Project validation
      {
        field: 'project',
        rule: 'required',
        message: 'Target project is required',
        severity: 'error'
      },
      {
        field: 'project',
        rule: 'validProject',
        message: 'Project must be one of the valid project options',
        severity: 'error'
      },

      // Agent assignment validation
      {
        field: 'assignedAgent',
        rule: 'required',
        message: 'Assigned agent is required',
        severity: 'error'
      },
      {
        field: 'assignedAgent',
        rule: 'validAgent',
        message: 'Assigned agent must be a valid agent personality',
        severity: 'error'
      },

      // Effort estimation validation
      {
        field: 'estimatedEffort',
        rule: 'required',
        message: 'Effort estimation is required',
        severity: 'error'
      },
      {
        field: 'estimatedEffort.hours',
        rule: 'min:1',
        message: 'Estimated hours must be at least 1',
        severity: 'error'
      },
      {
        field: 'estimatedEffort.hours',
        rule: 'max:40',
        message: 'Estimated hours should not exceed 40 (break into smaller tasks)',
        severity: 'warning'
      }
    ];
  }

  /**
   * Validate task data against guidelines
   */
  public validateTaskData(taskData: Partial<EnhancedTaskData>, taskType: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    const guidelines = this.guidelines.get(taskType);
    if (!guidelines) {
      errors.push(`No guidelines found for task type: ${taskType}`);
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check required fields
    for (const field of guidelines.requiredFields) {
      if (!taskData[field as keyof EnhancedTaskData]) {
        errors.push(`Required field missing: ${field}`);
      }
    }

    // Apply validation rules
    for (const rule of this.validationRules) {
      const value = this.getNestedValue(taskData, rule.field);
      if (value !== undefined) {
        const result = this.applyValidationRule(rule, value);
        if (result === 'error') {
          errors.push(rule.message);
        } else if (result === 'warning') {
          warnings.push(rule.message);
        }
      }
    }

    // Apply type-specific validation rules
    for (const rule of guidelines.validationRules) {
      const value = this.getNestedValue(taskData, rule.field);
      if (value !== undefined) {
        const result = this.applyValidationRule(rule, value);
        if (result === 'error') {
          errors.push(rule.message);
        } else if (result === 'warning') {
          warnings.push(rule.message);
        }
      }
    }

    // Generate suggestions based on best practices
    suggestions.push(...this.generateSuggestions(taskData, guidelines));

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Get guidelines for a specific task type
   */
  public getGuidelines(taskType: string): TaskCreationGuidelines | undefined {
    return this.guidelines.get(taskType);
  }

  /**
   * Get all available guidelines
   */
  public getAllGuidelines(): TaskCreationGuidelines[] {
    return Array.from(this.guidelines.values());
  }

  /**
   * Get example task for a specific type
   */
  public getExampleTask(taskType: string): TaskExample | undefined {
    const guidelines = this.guidelines.get(taskType);
    return guidelines?.examples[0];
  }

  /**
   * Generate task creation checklist
   */
  public generateTaskChecklist(taskType: string): string[] {
    const guidelines = this.guidelines.get(taskType);
    if (!guidelines) return [];

    const checklist: string[] = [
      '✅ Task has clear, specific title',
      '✅ Description is detailed and actionable',
      '✅ Acceptance criteria are explicit and testable',
      '✅ Architecture references are provided',
      '✅ Files to modify are specified',
      '✅ Effort estimation is realistic',
      '✅ Validation steps are defined',
      '✅ Success metrics are measurable',
      '✅ Repository is specified (single repo only)',
      '✅ Task is atomic (one focused change)',
      '✅ No room for interpretation or shortcuts',
      '✅ Part of larger plan with long-term goals',
      '✅ Assumes no pre-existing context',
      '✅ Includes rollback plan if needed'
    ];

    // Add type-specific checklist items
    if (taskType === 'implementation') {
      checklist.push(
        '✅ Code follows established patterns',
        '✅ Error handling is specified',
        '✅ Performance requirements are defined',
        '✅ Security considerations are addressed'
      );
    } else if (taskType === 'review') {
      checklist.push(
        '✅ Review scope is clearly defined',
        '✅ Security aspects are covered',
        '✅ Performance implications are considered',
        '✅ Maintainability is assessed'
      );
    } else if (taskType === 'testing') {
      checklist.push(
        '✅ Test coverage requirements are specified',
        '✅ Test scenarios are comprehensive',
        '✅ Edge cases are covered',
        '✅ Test data requirements are defined'
      );
    }

    return checklist;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => (current as Record<string, unknown>)?.[key], obj as unknown);
  }

  private applyValidationRule(rule: ValidationRule, value: unknown): 'error' | 'warning' | 'info' | null {
    switch (rule.rule) {
      case 'required':
        return value === undefined || value === null || value === '' ? rule.severity : null;
      case 'minLength:3':
        return Array.isArray(value) && value.length < 3 ? rule.severity : null;
      case 'minLength:1':
        return Array.isArray(value) && value.length < 1 ? rule.severity : null;
      case 'minLength:4':
        return Array.isArray(value) && value.length < 4 ? rule.severity : null;
      case 'minLength:5':
        return Array.isArray(value) && value.length < 5 ? rule.severity : null;
      case 'minLength:10':
        return typeof value === 'string' && value.length < 10 ? rule.severity : null;
      case 'minLength:50':
        return typeof value === 'string' && value.length < 50 ? rule.severity : null;
      case 'maxLength:10':
        return Array.isArray(value) && value.length > 10 ? rule.severity : null;
      case 'maxLength:100':
        return typeof value === 'string' && value.length > 100 ? rule.severity : null;
      case 'maxLength:1000':
        return typeof value === 'string' && value.length > 1000 ? rule.severity : null;
      case 'min:1':
        return typeof value === 'number' && value < 1 ? rule.severity : null;
      case 'max:40':
        return typeof value === 'number' && value > 40 ? rule.severity : null;
      case 'singleRepository':
        return typeof value === 'string' && value.includes(',') ? rule.severity : null;
      case 'validProject':
        return typeof value === 'string' && !this.validProjects.includes(value) ? rule.severity : null;
      case 'validAgent':
        return typeof value === 'string' && !this.validAgents.includes(value) ? rule.severity : null;
      default:
        return null;
    }
  }

  private generateSuggestions(taskData: Partial<EnhancedTaskData>, guidelines: TaskCreationGuidelines): string[] {
    const suggestions: string[] = [];

    // Check for missing optional but recommended fields
    if (!taskData.prerequisites) {
      suggestions.push('Consider adding prerequisites to help with task setup');
    }
    if (!taskData.rollbackPlan) {
      suggestions.push('Consider adding a rollback plan for complex changes');
    }
    if (!taskData.parentInitiative) {
      suggestions.push('Consider linking to parent initiative or long-term goal');
    }
    if (!taskData.assumptions) {
      suggestions.push('Consider documenting assumptions to avoid misunderstandings');
    }
    if (!taskData.risks) {
      suggestions.push('Consider identifying potential risks and mitigation strategies');
    }

    // Type-specific suggestions
    if (guidelines.id === 'implementation') {
      if (!taskData.testingRequirements) {
        suggestions.push('Consider specifying testing requirements for implementation');
      }
      if (!taskData.documentationRequirements) {
        suggestions.push('Consider specifying documentation requirements');
      }
    }

    return suggestions;
  }

  public getValidProjects(): string[] {
    return [...this.validProjects];
  }

  public getValidAgents(): string[] {
    return [...this.validAgents];
  }
}
