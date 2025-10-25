/**
 * Task Type Specific Guidelines
 *
 * Defines specific considerations, checklists, and best practices for different task types
 * Referenced by the universal task template
 */

import { logger } from '../utils/logger.js';

export interface TaskTypeGuideline {
  type: string;
  name: string;
  description: string;
  specificConsiderations: string[];
  qualityChecklist: string[];
  commonPitfalls: string[];
  bestPractices: string[];
}

export const TASK_TYPE_GUIDELINES: Record<string, TaskTypeGuideline> = {
  'implementation': {
    type: 'implementation',
    name: 'Implementation',
    description: 'Adding new features or functionality',
    specificConsiderations: [
      'Follow existing code patterns and architecture',
      'Ensure proper error handling for all edge cases',
      'Add comprehensive input validation',
      'Include appropriate logging for debugging',
      'Consider performance implications',
      'Implement security best practices'
    ],
    qualityChecklist: [
      'Code follows project architecture patterns',
      'Error handling is comprehensive',
      'Input validation is implemented',
      'Security best practices followed',
      'No hardcoded secrets or credentials',
      'Logging is appropriate and helpful',
      'Performance impact is acceptable',
      'Code is readable and maintainable'
    ],
    commonPitfalls: [
      'Skipping edge case handling',
      'Hardcoding values instead of using configuration',
      'Not considering performance at scale',
      'Missing error handling',
      'Insufficient logging for debugging'
    ],
    bestPractices: [
      'Write self-documenting code with clear variable names',
      'Keep functions small and focused',
      'Use dependency injection for testability',
      'Follow SOLID principles',
      'Add code comments for complex logic'
    ]
  },

  'backend-implementation': {
    type: 'backend-implementation',
    name: 'Backend Implementation',
    description: 'Backend API and server-side development',
    specificConsiderations: [
      'Ensure API endpoints follow RESTful conventions',
      'Implement proper authentication and authorization',
      'Validate all input data server-side',
      'Use appropriate HTTP status codes',
      'Optimize database queries (use indexes, avoid N+1)',
      'Add rate limiting where appropriate',
      'Return consistent error response format',
      'Document API endpoints (OpenAPI/Swagger)'
    ],
    qualityChecklist: [
      'API follows REST conventions',
      'Authentication/authorization implemented correctly',
      'All inputs validated server-side',
      'HTTP status codes used appropriately',
      'Database queries optimized',
      'Error responses are consistent and helpful',
      'API is properly documented',
      'No SQL injection vulnerabilities'
    ],
    commonPitfalls: [
      'Not validating input on the server (trusting client)',
      'Using GET requests for state-changing operations',
      'Exposing sensitive data in API responses',
      'Not handling database connection failures',
      'Missing pagination for large datasets'
    ],
    bestPractices: [
      'Use parameterized queries to prevent SQL injection',
      'Implement request validation middleware',
      'Use connection pooling for database',
      'Return appropriate error codes (400, 401, 403, 404, 500)',
      'Add request logging for debugging'
    ]
  },

  'frontend-implementation': {
    type: 'frontend-implementation',
    name: 'Frontend Implementation',
    description: 'UI components and user interface development',
    specificConsiderations: [
      'Ensure responsive design (mobile, tablet, desktop)',
      'Implement accessibility features (WCAG 2.1 AA)',
      'Follow design system and component patterns',
      'Handle loading and error states gracefully',
      'Optimize performance (lazy loading, code splitting)',
      'Test across different browsers',
      'Use design tokens instead of hardcoded values',
      'Implement proper keyboard navigation'
    ],
    qualityChecklist: [
      'Responsive design works on all screen sizes',
      'Accessibility requirements met (ARIA labels, keyboard nav, screen reader)',
      'Design system patterns followed',
      'Loading states are user-friendly',
      'Error states handled gracefully',
      'Performance optimized (Lighthouse score >90)',
      'Cross-browser compatibility verified',
      'Components are reusable',
      'No hardcoded styles (use design tokens)'
    ],
    commonPitfalls: [
      'Not testing on mobile devices',
      'Missing accessibility attributes',
      'Hardcoding colors and spacing',
      'Not handling loading/error states',
      'Creating non-reusable components'
    ],
    bestPractices: [
      'Use mobile-first approach for responsive design',
      'Always add ARIA labels for interactive elements',
      'Extract reusable components',
      'Use semantic HTML elements',
      'Test with keyboard navigation only'
    ]
  },

  'review': {
    type: 'review',
    name: 'Code Review',
    description: 'Reviewing code for quality, security, and best practices',
    specificConsiderations: [
      'Review code structure and organization',
      'Check for security vulnerabilities',
      'Verify test coverage is adequate',
      'Ensure documentation is updated',
      'Look for performance issues',
      'Verify accessibility standards (for frontend)',
      'Check for code duplication',
      'Ensure error handling is comprehensive'
    ],
    qualityChecklist: [
      'All critical issues identified and documented',
      'Security concerns flagged',
      'Performance issues noted',
      'Test coverage evaluated',
      'Documentation completeness checked',
      'Positive feedback included',
      'Constructive recommendations provided',
      'Review is thorough yet timely'
    ],
    commonPitfalls: [
      'Being too nitpicky about style',
      'Not providing constructive feedback',
      'Missing security vulnerabilities',
      'Not checking test coverage',
      'Forgetting to give positive feedback'
    ],
    bestPractices: [
      'Categorize issues by severity (critical, major, minor)',
      'Always include positive feedback',
      'Explain WHY something should change',
      'Suggest specific improvements',
      'Focus on important issues, not just style'
    ]
  },

  'testing': {
    type: 'testing',
    name: 'Testing',
    description: 'Writing and maintaining test suites',
    specificConsiderations: [
      'Write unit tests for individual functions',
      'Create integration tests for workflows',
      'Test edge cases and error conditions',
      'Ensure test data is realistic',
      'Make tests maintainable and readable',
      'Avoid flaky tests',
      'Mock external dependencies appropriately',
      'Aim for meaningful coverage, not just high percentages'
    ],
    qualityChecklist: [
      'Unit tests cover all functions',
      'Integration tests cover main workflows',
      'Edge cases are tested',
      'Error conditions are tested',
      'Tests are deterministic (not flaky)',
      'Test data is realistic',
      'Tests are maintainable',
      'Coverage meets project requirements',
      'Tests run quickly'
    ],
    commonPitfalls: [
      'Writing tests that test the test framework',
      'Not testing error conditions',
      'Creating flaky tests',
      'Over-mocking (testing mocks instead of real behavior)',
      'Chasing coverage percentage instead of meaningful tests'
    ],
    bestPractices: [
      'Follow AAA pattern (Arrange, Act, Assert)',
      'One assertion per test (when possible)',
      'Use descriptive test names',
      'Keep tests independent',
      'Clean up test data after each test'
    ]
  },

  'refactoring': {
    type: 'refactoring',
    name: 'Refactoring',
    description: 'Improving code structure without changing behavior',
    specificConsiderations: [
      'Ensure behavior remains unchanged',
      'Run full test suite before and after',
      'Make small, incremental changes',
      'Keep commits focused',
      'Document why refactoring is needed',
      'Consider backwards compatibility',
      'Update documentation to match new structure'
    ],
    qualityChecklist: [
      'All existing tests still pass',
      'No behavior changes introduced',
      'Code is more maintainable after refactoring',
      'Complexity reduced',
      'Duplication removed',
      'Documentation updated',
      'Performance maintained or improved'
    ],
    commonPitfalls: [
      'Changing behavior while refactoring',
      'Making too many changes at once',
      'Not running tests frequently',
      'Breaking backwards compatibility',
      'Not updating documentation'
    ],
    bestPractices: [
      'Run tests after each small change',
      'Use automated refactoring tools when available',
      'Keep changes focused on one improvement',
      'Commit frequently',
      'Consider creating feature flag for large refactors'
    ]
  },

  'bugfix': {
    type: 'bugfix',
    name: 'Bug Fix',
    description: 'Fixing defects and issues',
    specificConsiderations: [
      'Understand root cause before fixing',
      'Add test to prevent regression',
      'Check if bug exists in multiple places',
      'Consider if fix needs backporting',
      'Document the bug and fix',
      'Verify fix doesn\'t break other features',
      'Check if similar bugs exist elsewhere'
    ],
    qualityChecklist: [
      'Root cause identified',
      'Regression test added',
      'Fix is minimal and focused',
      'No new bugs introduced',
      'Related areas checked for similar issues',
      'Fix documented in commit message',
      'All tests pass'
    ],
    commonPitfalls: [
      'Fixing symptoms instead of root cause',
      'Not adding regression test',
      'Breaking other features',
      'Making fix too broad',
      'Not checking for similar bugs elsewhere'
    ],
    bestPractices: [
      'Write failing test first (TDD)',
      'Keep fix minimal and focused',
      'Check git blame to understand context',
      'Add comments explaining the fix',
      'Consider if documentation needs updating'
    ]
  },

  'documentation': {
    type: 'documentation',
    name: 'Documentation',
    description: 'Writing or updating documentation',
    specificConsiderations: [
      'Write for your audience (beginners vs experts)',
      'Include code examples',
      'Keep documentation up to date with code',
      'Use clear, concise language',
      'Include diagrams where helpful',
      'Test all code examples',
      'Organize with clear hierarchy',
      'Add table of contents for long docs'
    ],
    qualityChecklist: [
      'Documentation is accurate',
      'Examples are tested and work',
      'Writing is clear and concise',
      'Audience is appropriate',
      'Formatting is consistent',
      'Links work correctly',
      'Diagrams are helpful and up to date',
      'Easy to navigate'
    ],
    commonPitfalls: [
      'Letting documentation get out of date',
      'Not testing code examples',
      'Writing for wrong audience',
      'Too much or too little detail',
      'Poor organization'
    ],
    bestPractices: [
      'Test all code examples',
      'Use consistent formatting',
      'Include "quick start" section',
      'Add "last updated" dates',
      'Link to related documentation'
    ]
  },

  'devops': {
    type: 'devops',
    name: 'DevOps/Infrastructure',
    description: 'Infrastructure, deployment, and operational tasks',
    specificConsiderations: [
      'Ensure changes are reversible',
      'Test in non-production first',
      'Document infrastructure as code',
      'Consider security implications',
      'Plan for monitoring and alerting',
      'Consider cost implications',
      'Ensure high availability',
      'Plan disaster recovery'
    ],
    qualityChecklist: [
      'Infrastructure as code is versioned',
      'Changes tested in staging',
      'Rollback plan documented',
      'Monitoring/alerting configured',
      'Security best practices followed',
      'Documentation updated',
      'Cost impact considered',
      'High availability maintained'
    ],
    commonPitfalls: [
      'Not testing in staging first',
      'No rollback plan',
      'Missing monitoring',
      'Hardcoding credentials',
      'Not considering costs'
    ],
    bestPractices: [
      'Use infrastructure as code',
      'Version all configuration',
      'Automate deployments',
      'Implement proper secrets management',
      'Set up comprehensive monitoring'
    ]
  }
};

/**
 * Get guidelines for a specific task type
 */
export function getGuidelinesForTaskType(taskType: string): TaskTypeGuideline {
  // Try exact match first
  if (TASK_TYPE_GUIDELINES[taskType]) {
    return TASK_TYPE_GUIDELINES[taskType];
  }

  // Try partial match (e.g., "api-development" → "implementation")
  if (taskType.includes('implementation')) {
    return TASK_TYPE_GUIDELINES['implementation'];
  }
  if (taskType.includes('review')) {
    return TASK_TYPE_GUIDELINES['review'];
  }
  if (taskType.includes('test')) {
    return TASK_TYPE_GUIDELINES['testing'];
  }
  if (taskType.includes('refactor')) {
    return TASK_TYPE_GUIDELINES['refactoring'];
  }
  if (taskType.includes('fix') || taskType.includes('bug')) {
    return TASK_TYPE_GUIDELINES['bugfix'];
  }
  if (taskType.includes('doc')) {
    return TASK_TYPE_GUIDELINES['documentation'];
  }
  if (taskType.includes('devops') || taskType.includes('infra') || taskType.includes('deploy')) {
    return TASK_TYPE_GUIDELINES['devops'];
  }

  // Default to generic implementation
  return TASK_TYPE_GUIDELINES['implementation'];
}

/**
 * Format guidelines as markdown for inclusion in task prompt
 */
export function formatGuidelinesAsMarkdown(guidelines: TaskTypeGuideline): string {
  try {
    return `
## 📋 Task Type: ${guidelines.name}

${guidelines.description}

### Specific Considerations for ${guidelines.name}

${guidelines.specificConsiderations?.map(c => `- ${c}`).join('\n') || '- No specific considerations documented'}

### Quality Checklist for ${guidelines.name}

${guidelines.qualityChecklist?.map(c => `- [ ] ${c}`).join('\n') || '- No quality checklist available'}

### Common Pitfalls to Avoid

${guidelines.commonPitfalls?.map(p => `- ⚠️ ${p}`).join('\n') || '- No common pitfalls documented'}

### Best Practices

${guidelines.bestPractices?.map(p => `- ✅ ${p}`).join('\n') || '- No best practices documented'}
    `.trim();
  } catch (error) {
    logger.error({
      category: 'process',
      action: 'failed_to_format_guidelines_as_markdown',
      message: `Failed to format guidelines as markdown:`,
      error
    });
    return `## 📋 Task Type: ${guidelines.name}\n\nGuidelines formatting failed. Please refer to project documentation.`;
  }
}
