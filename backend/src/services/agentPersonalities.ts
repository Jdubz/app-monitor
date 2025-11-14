/**
 * Agent Personalities Service for Dev-Monitor
 *
 * Defines different agent personalities and their specializations
 * Integrates with the existing DevBotsManager
 */

export interface AgentPersonality {
  id: string;
  name: string;
  role: string;
  description: string;
  specialties: string[];
  expertise: {
    primary: string[];
    secondary: string[];
    tools: string[];
  };
  personality: {
    communicationStyle: 'formal' | 'casual' | 'technical' | 'collaborative';
    approach: 'methodical' | 'creative' | 'analytical' | 'pragmatic';
    focus: 'quality' | 'speed' | 'innovation' | 'reliability';
  };
  onboarding: {
    requiredReading: string[];
    setupSteps: string[];
    validationChecks: string[];
  };
  taskPreferences: {
    preferredTypes: string[];
    avoidedTypes: string[];
    complexityRange: 'simple' | 'medium' | 'complex' | 'any';
  };
}

export interface TaskTypeMapping {
  taskType: string;
  recommendedAgents: string[];
  fallbackAgents: string[];
  requiredSkills: string[];
}

export class AgentPersonalityManager {
  private personalities: Map<string, AgentPersonality> = new Map();
  private taskTypeMappings: Map<string, TaskTypeMapping> = new Map();

  constructor() {
    this.initializePersonalities();
    this.initializeTaskMappings();
  }

  private initializePersonalities(): void {
    // Backend Implementation Specialist
    this.personalities.set('backend-specialist', {
      id: 'backend-specialist',
      name: 'Backend Specialist',
      role: 'Backend Development & API Implementation',
      description: 'Expert in server-side development, database design, and system architecture',
      specialties: [
        'api-development',
        'database-design',
        'system-architecture',
        'performance-optimization',
        'security-implementation',
        'microservices',
        'cloud-deployment'
      ],
      expertise: {
        primary: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Docker', 'AWS'],
        secondary: ['Python', 'Go', 'MongoDB', 'Kubernetes', 'Terraform'],
        tools: ['Git', 'Docker', 'Postman', 'VS Code', 'Database Tools']
      },
      personality: {
        communicationStyle: 'technical',
        approach: 'methodical',
        focus: 'reliability'
      },
      onboarding: {
        requiredReading: [
          'BACKEND_ARCHITECTURE.md',
          'API_DESIGN_GUIDELINES.md',
          'DATABASE_SCHEMA.md',
          'SECURITY_BEST_PRACTICES.md'
        ],
        setupSteps: [
          'Verify database connections',
          'Check API endpoints',
          'Validate environment variables',
          'Test authentication systems'
        ],
        validationChecks: [
          'Code follows backend patterns',
          'API endpoints are properly documented',
          'Database queries are optimized',
          'Security measures are implemented'
        ]
      },
      taskPreferences: {
        preferredTypes: ['implementation', 'api-development', 'database-design', 'system-integration'],
        avoidedTypes: ['ui-design', 'frontend-styling', 'user-experience'],
        complexityRange: 'any'
      }
    });

    // Frontend Implementation Specialist
    this.personalities.set('frontend-specialist', {
      id: 'frontend-specialist',
      name: 'Frontend Specialist',
      role: 'Frontend Development & User Interface',
      description: 'Expert in user interface development, responsive design, and user experience',
      specialties: [
        'ui-development',
        'responsive-design',
        'user-experience',
        'component-architecture',
        'state-management',
        'performance-optimization',
        'accessibility'
      ],
      expertise: {
        primary: ['React', 'TypeScript', 'CSS', 'HTML', 'JavaScript', 'Tailwind CSS'],
        secondary: ['Vue.js', 'Angular', 'SASS', 'Webpack', 'Vite', 'Jest'],
        tools: ['VS Code', 'Chrome DevTools', 'Figma', 'Storybook', 'Git']
      },
      personality: {
        communicationStyle: 'collaborative',
        approach: 'creative',
        focus: 'quality'
      },
      onboarding: {
        requiredReading: [
          'FRONTEND_ARCHITECTURE.md',
          'UI_COMPONENT_GUIDELINES.md',
          'DESIGN_SYSTEM.md',
          'ACCESSIBILITY_GUIDELINES.md'
        ],
        setupSteps: [
          'Verify build system',
          'Check component library',
          'Validate design tokens',
          'Test responsive breakpoints'
        ],
        validationChecks: [
          'Components are reusable',
          'Design system is followed',
          'Accessibility standards met',
          'Performance is optimized'
        ]
      },
      taskPreferences: {
        preferredTypes: ['implementation', 'ui-development', 'component-creation', 'styling'],
        avoidedTypes: ['database-design', 'server-configuration', 'api-development'],
        complexityRange: 'any'
      }
    });

    // Code Review Specialist
    this.personalities.set('review-specialist', {
      id: 'review-specialist',
      name: 'Code Review Specialist',
      role: 'Code Quality & Security Review',
      description: 'Expert in code review, security analysis, and quality assurance',
      specialties: [
        'code-review',
        'security-analysis',
        'quality-assurance',
        'performance-review',
        'best-practices',
        'vulnerability-assessment',
        'testing-review'
      ],
      expertise: {
        primary: ['Code Analysis', 'Security Tools', 'Testing Frameworks', 'Static Analysis'],
        secondary: ['Penetration Testing', 'Performance Profiling', 'Code Metrics'],
        tools: ['SonarQube', 'ESLint', 'Security Scanners', 'Code Review Tools']
      },
      personality: {
        communicationStyle: 'formal',
        approach: 'analytical',
        focus: 'quality'
      },
      onboarding: {
        requiredReading: [
          'CODE_REVIEW_GUIDELINES.md',
          'SECURITY_CHECKLIST.md',
          'QUALITY_STANDARDS.md',
          'TESTING_REQUIREMENTS.md'
        ],
        setupSteps: [
          'Configure review tools',
          'Set up security scanners',
          'Validate testing frameworks',
          'Check code quality metrics'
        ],
        validationChecks: [
          'Security vulnerabilities identified',
          'Code quality issues found',
          'Best practices followed',
          'Test coverage adequate'
        ]
      },
      taskPreferences: {
        preferredTypes: ['review', 'security-analysis', 'quality-assurance', 'testing'],
        avoidedTypes: ['implementation', 'feature-development'],
        complexityRange: 'any'
      }
    });

    // Testing Specialist
    this.personalities.set('testing-specialist', {
      id: 'testing-specialist',
      name: 'Testing Specialist',
      role: 'Test Development & Quality Assurance',
      description: 'Expert in test automation, quality assurance, and testing strategies',
      specialties: [
        'test-automation',
        'unit-testing',
        'integration-testing',
        'e2e-testing',
        'performance-testing',
        'test-strategy',
        'quality-metrics'
      ],
      expertise: {
        primary: ['Jest', 'Cypress', 'Playwright', 'Testing Library', 'Mocha', 'Chai'],
        secondary: ['Selenium', 'K6', 'Artillery', 'TestCafe', 'Puppeteer'],
        tools: ['VS Code', 'Test Runners', 'CI/CD Tools', 'Coverage Tools']
      },
      personality: {
        communicationStyle: 'technical',
        approach: 'methodical',
        focus: 'reliability'
      },
      onboarding: {
        requiredReading: [
          'TESTING_STRATEGY.md',
          'TEST_AUTOMATION_GUIDE.md',
          'QUALITY_METRICS.md',
          'CI_CD_TESTING.md'
        ],
        setupSteps: [
          'Verify test frameworks',
          'Check test data setup',
          'Validate CI/CD integration',
          'Test coverage reporting'
        ],
        validationChecks: [
          'Tests are comprehensive',
          'Coverage meets requirements',
          'Tests are maintainable',
          'CI/CD integration works'
        ]
      },
      taskPreferences: {
        preferredTypes: ['testing', 'test-automation', 'quality-assurance', 'test-strategy'],
        avoidedTypes: ['implementation', 'feature-development'],
        complexityRange: 'any'
      }
    });

    // DevOps Specialist
    this.personalities.set('devops-specialist', {
      id: 'devops-specialist',
      name: 'DevOps Specialist',
      role: 'Infrastructure & Deployment',
      description: 'Expert in infrastructure, deployment, and system operations',
      specialties: [
        'infrastructure-as-code',
        'deployment-automation',
        'monitoring',
        'scaling',
        'security-hardening',
        'ci-cd',
        'cloud-management'
      ],
      expertise: {
        primary: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GitHub Actions', 'Monitoring'],
        secondary: ['Azure', 'GCP', 'Ansible', 'Jenkins', 'Prometheus', 'Grafana'],
        tools: ['Terraform', 'Docker', 'Kubernetes', 'Cloud CLIs', 'Monitoring Tools']
      },
      personality: {
        communicationStyle: 'technical',
        approach: 'pragmatic',
        focus: 'reliability'
      },
      onboarding: {
        requiredReading: [
          'INFRASTRUCTURE_GUIDE.md',
          'DEPLOYMENT_PROCEDURES.md',
          'MONITORING_SETUP.md',
          'SECURITY_HARDENING.md'
        ],
        setupSteps: [
          'Verify infrastructure state',
          'Check deployment pipelines',
          'Validate monitoring systems',
          'Test backup procedures'
        ],
        validationChecks: [
          'Infrastructure is properly configured',
          'Deployments are automated',
          'Monitoring is comprehensive',
          'Security measures are in place'
        ]
      },
      taskPreferences: {
        preferredTypes: ['deployment', 'infrastructure', 'monitoring', 'ci-cd'],
        avoidedTypes: ['ui-development', 'feature-implementation'],
        complexityRange: 'any'
      }
    });

    // Documentation Specialist
    this.personalities.set('documentation-specialist', {
      id: 'documentation-specialist',
      name: 'Documentation Specialist',
      role: 'Technical Writing & Documentation',
      description: 'Expert in technical writing, documentation, and knowledge management',
      specialties: [
        'technical-writing',
        'api-documentation',
        'user-guides',
        'knowledge-management',
        'content-strategy',
        'documentation-automation',
        'information-architecture'
      ],
      expertise: {
        primary: ['Markdown', 'GitBook', 'Swagger', 'JSDoc', 'Technical Writing'],
        secondary: ['Confluence', 'Notion', 'Docusaurus', 'VuePress'],
        tools: ['VS Code', 'Git', 'Documentation Tools', 'Diagram Tools']
      },
      personality: {
        communicationStyle: 'formal',
        approach: 'methodical',
        focus: 'quality'
      },
      onboarding: {
        requiredReading: [
          'DOCUMENTATION_STANDARDS.md',
          'WRITING_GUIDELINES.md',
          'API_DOCUMENTATION_TEMPLATE.md',
          'CONTENT_STRATEGY.md'
        ],
        setupSteps: [
          'Verify documentation tools',
          'Check content templates',
          'Validate publishing pipeline',
          'Test documentation site'
        ],
        validationChecks: [
          'Documentation is comprehensive',
          'Writing follows guidelines',
          'Content is up-to-date',
          'Navigation is clear'
        ]
      },
      taskPreferences: {
        preferredTypes: ['documentation', 'technical-writing', 'api-docs', 'user-guides'],
        avoidedTypes: ['implementation', 'testing', 'deployment'],
        complexityRange: 'any'
      }
    });

    // Gemini Pro Specialist
    this.personalities.set('gemini-1.5-pro', {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      role: 'Advanced Development & Analysis',
      description: 'A powerful, next-generation model for complex development and analysis tasks.',
      specialties: [
        'code-generation',
        'refactoring',
        'bug-fixing',
        'documentation',
        'testing',
        'research'
      ],
      expertise: {
        primary: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'C++'],
        secondary: ['Rust', 'Swift', 'Kotlin', 'Ruby', 'PHP'],
        tools: ['Git', 'Docker', 'VS Code', 'Jira', 'Confluence']
      },
      personality: {
        communicationStyle: 'technical',
        approach: 'analytical',
        focus: 'quality'
      },
      onboarding: {
        requiredReading: [
          'GEMINI_API_GUIDE.md',
          'BEST_PRACTICES_FOR_PROMPTING.md'
        ],
        setupSteps: [
          'Verify API key',
          'Check model access',
          'Test basic prompts'
        ],
        validationChecks: [
          'Code is well-structured',
          'Solutions are efficient',
          'Documentation is clear'
        ]
      },
      taskPreferences: {
        preferredTypes: ['implementation', 'refactoring', 'bug-fixing', 'research'],
        avoidedTypes: ['ui-design'],
        complexityRange: 'any'
      }
    });
  }

  private initializeTaskMappings(): void {
    // Implementation tasks
    this.taskTypeMappings.set('implementation', {
      taskType: 'implementation',
      recommendedAgents: ['backend-specialist', 'frontend-specialist'],
      fallbackAgents: ['devops-specialist'],
      requiredSkills: ['development', 'problem-solving', 'code-writing']
    });

    // Review tasks
    this.taskTypeMappings.set('review', {
      taskType: 'review',
      recommendedAgents: ['review-specialist'],
      fallbackAgents: ['backend-specialist', 'frontend-specialist'],
      requiredSkills: ['code-analysis', 'quality-assessment', 'security-knowledge']
    });

    // Testing tasks
    this.taskTypeMappings.set('testing', {
      taskType: 'testing',
      recommendedAgents: ['testing-specialist'],
      fallbackAgents: ['review-specialist', 'backend-specialist'],
      requiredSkills: ['test-automation', 'quality-assurance', 'testing-frameworks']
    });

    // Deployment tasks
    this.taskTypeMappings.set('deployment', {
      taskType: 'deployment',
      recommendedAgents: ['devops-specialist'],
      fallbackAgents: ['backend-specialist'],
      requiredSkills: ['infrastructure', 'deployment', 'monitoring']
    });

    // Documentation tasks
    this.taskTypeMappings.set('documentation', {
      taskType: 'documentation',
      recommendedAgents: ['documentation-specialist'],
      fallbackAgents: ['backend-specialist', 'frontend-specialist'],
      requiredSkills: ['technical-writing', 'documentation', 'communication']
    });

    // API development
    this.taskTypeMappings.set('api-development', {
      taskType: 'api-development',
      recommendedAgents: ['backend-specialist'],
      fallbackAgents: ['devops-specialist'],
      requiredSkills: ['api-design', 'backend-development', 'database-knowledge']
    });

    // UI development
    this.taskTypeMappings.set('ui-development', {
      taskType: 'ui-development',
      recommendedAgents: ['frontend-specialist'],
      fallbackAgents: ['documentation-specialist'],
      requiredSkills: ['frontend-development', 'ui-design', 'user-experience']
    });
  }

  /**
   * Get agent personality by ID
   */
  public getPersonality(agentId: string): AgentPersonality | undefined {
    return this.personalities.get(agentId);
  }

  /**
   * Get all available personalities
   */
  public getAllPersonalities(): AgentPersonality[] {
    return Array.from(this.personalities.values());
  }

  /**
   * Get recommended agents for a task type
   */
  public getRecommendedAgents(taskType: string): string[] {
    const mapping = this.taskTypeMappings.get(taskType);
    return mapping ? mapping.recommendedAgents : [];
  }

  /**
   * Get fallback agents for a task type
   */
  public getFallbackAgents(taskType: string): string[] {
    const mapping = this.taskTypeMappings.get(taskType);
    return mapping ? mapping.fallbackAgents : [];
  }

  /**
   * Find the best agent for a task based on type and requirements
   */
  public findBestAgent(taskType: string, requirements: string[] = []): string | null {
    const mapping = this.taskTypeMappings.get(taskType);
    if (!mapping) {
      return null;
    }

    // First try recommended agents
    for (const agentId of mapping.recommendedAgents) {
      const personality = this.personalities.get(agentId);
      if (personality && this.agentMeetsRequirements(personality, requirements)) {
        return agentId;
      }
    }

    // Then try fallback agents
    for (const agentId of mapping.fallbackAgents) {
      const personality = this.personalities.get(agentId);
      if (personality && this.agentMeetsRequirements(personality, requirements)) {
        return agentId;
      }
    }

    return null;
  }

  /**
   * Check if agent meets requirements
   */
  private agentMeetsRequirements(personality: AgentPersonality, requirements: string[]): boolean {
    if (requirements.length === 0) {
      return true;
    }

    const allSkills = [
      ...personality.specialties,
      ...personality.expertise.primary,
      ...personality.expertise.secondary
    ];

    return requirements.every(req => 
      allSkills.some(skill => 
        skill.toLowerCase().includes(req.toLowerCase()) ||
        req.toLowerCase().includes(skill.toLowerCase())
      )
    );
  }

  /**
   * Get onboarding instructions for an agent
   */
  public getOnboardingInstructions(agentId: string): {
    requiredReading: string[];
    setupSteps: string[];
    validationChecks: string[];
  } | null {
    const personality = this.personalities.get(agentId);
    return personality ? personality.onboarding : null;
  }

  /**
   * Get agent preferences for task assignment
   */
  public getAgentPreferences(agentId: string): {
    preferredTypes: string[];
    avoidedTypes: string[];
    complexityRange: string;
  } | null {
    const personality = this.personalities.get(agentId);
    return personality ? personality.taskPreferences : null;
  }

  /**
   * Add a new personality
   */
  public addPersonality(personality: AgentPersonality): void {
    this.personalities.set(personality.id, personality);
  }

  /**
   * Update an existing personality
   */
  public updatePersonality(agentId: string, updates: Partial<AgentPersonality>): void {
    const existing = this.personalities.get(agentId);
    if (existing) {
      this.personalities.set(agentId, { ...existing, ...updates });
    }
  }

  /**
   * Remove a personality
   */
  public removePersonality(agentId: string): boolean {
    return this.personalities.delete(agentId);
  }
}
