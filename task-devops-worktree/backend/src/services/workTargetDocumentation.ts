/**
 * Work Target Documentation Configuration
 *
 * Provides intelligent documentation discovery for each work target (project/module).
 * Helps bots understand where to start their investigation based on task context.
 *
 * This configuration drives:
 * - Starting point recommendations for investigations
 * - Relevant architecture documentation
 * - Key files and patterns to review
 * - Common pitfalls and gotchas for each target
 */

export interface DocumentationReference {
  path: string;
  title: string;
  description: string;
  priority: 'critical' | 'recommended' | 'optional';
}

export interface InvestigationStartingPoint {
  type: 'directory' | 'file' | 'pattern';
  location: string;
  description: string;
  searchHints?: string[];
}

export interface WorkTargetConfig {
  name: string;
  description: string;

  // Documentation to read FIRST
  gettingStarted: DocumentationReference[];

  // Architecture and design docs
  architecture: DocumentationReference[];

  // Where to start investigating when working on this target
  investigationStartingPoints: InvestigationStartingPoint[];

  // Common patterns and conventions
  conventions: {
    fileNaming?: string;
    directoryStructure?: string;
    commonPatterns?: string[];
  };

  // Known gotchas and pitfalls
  gotchas: string[];

  // Key files that bots should be aware of
  keyFiles: {
    path: string;
    purpose: string;
  }[];
}

/**
 * Documentation configuration for all work targets
 */
export const WORK_TARGET_DOCS: Record<string, WorkTargetConfig> = {
  'dev-bots': {
    name: 'Dev-Bots System',
    description: 'Autonomous AI agents for code tasks with Docker isolation',

    gettingStarted: [
      {
        path: '../docs/dev-bots/README.md',
        title: 'Dev-Bots Overview',
        description: 'System introduction, architecture, and workflow',
        priority: 'critical'
      },
      {
        path: '../docs/dev-bots/architecture/system-overview.md',
        title: 'Architecture Overview',
        description: 'Core components and how they interact',
        priority: 'critical'
      }
    ],

    architecture: [
      {
        path: '../docs/dev-bots/task-queue.md',
        title: 'Task Queue Architecture',
        description: 'SQLite-based task queue with ACID guarantees',
        priority: 'critical'
      },
      {
        path: '../docs/dev-bots/architecture/context-isolation.md',
        title: 'Context Isolation Strategy',
        description: 'How bots are isolated in Docker containers',
        priority: 'recommended'
      },
      {
        path: '../docs/dev-bots/SQLITE_INTEGRATION_PLAN.md',
        title: 'SQLite Integration',
        description: 'Database schema and integration approach',
        priority: 'recommended'
      }
    ],

    investigationStartingPoints: [
      {
        type: 'file',
        location: 'backend/src/services/devBotsManager.ts',
        description: 'Main orchestrator - start here for task execution flow',
        searchHints: ['executeTaskWithDockerRun', 'addTask', 'assignTasks']
      },
      {
        type: 'file',
        location: 'backend/src/services/taskQueue.sqlite.ts',
        description: 'Task persistence and queue management',
        searchHints: ['getNextTask', 'completeTask', 'getAgentComparisonMetrics']
      },
      {
        type: 'file',
        location: 'backend/src/services/taskPromptTemplates.ts',
        description: 'How tasks are converted to bot prompts',
        searchHints: ['generatePrompt', 'processVariables']
      },
      {
        type: 'directory',
        location: 'backend/src/routes/dev-bots.routes.ts',
        description: 'API endpoints for dev-bots system',
        searchHints: ['POST /tasks', 'GET /metrics', 'POST /assign']
      }
    ],

    conventions: {
      fileNaming: 'camelCase for files, kebab-case for routes',
      directoryStructure: 'services/ for business logic, routes/ for API, utils/ for helpers',
      commonPatterns: [
        'Use SQLite transactions for atomic operations',
        'Log with structured format: category, action, message, details',
        'Docker containers are ephemeral - mount volumes for persistence',
        'Tasks have agent_type field to track Claude vs Codex'
      ]
    },

    gotchas: [
      'Docker containers are --rm (ephemeral) - save logs to artifacts/',
      'SQLite uses WAL mode - concurrent reads are safe, writes are serialized',
      'Task validation is now relaxed - only title, description, acceptanceCriteria, assignedAgent required',
      'Agent rotation uses "alternate" strategy by default (switch between Claude/Codex)',
      'Container workspace is mounted at /workspace with rw permissions',
      'MCP servers are pre-configured - use them instead of shell commands when possible',
      'Both Claude and Codex CLIs installed - agent comparison fully functional'
    ],

    keyFiles: [
      {
        path: 'backend/src/services/devBotsManager.ts',
        purpose: 'Main orchestrator for dev-bots system'
      },
      {
        path: 'backend/src/services/taskQueue.sqlite.ts',
        purpose: 'Task queue database layer'
      },
      {
        path: 'backend/src/services/agentPersonalities.ts',
        purpose: 'Agent personality definitions'
      },
      {
        path: 'backend/src/services/taskPromptTemplates.ts',
        purpose: 'Prompt generation for tasks'
      }
    ]
  },

  'dev-monitor': {
    name: 'Development Monitor',
    description: 'Real-time monitoring dashboard for development activities',

    gettingStarted: [
      {
        path: '../docs/development/DEV_MONITOR_REQUIREMENTS.md',
        title: 'Requirements Document',
        description: 'What the dev monitor should do',
        priority: 'critical'
      }
    ],

    architecture: [
      {
        path: '../docs/operations/logging-architecture.md',
        title: 'Logging Architecture',
        description: 'Structured logging system design',
        priority: 'critical'
      }
    ],

    investigationStartingPoints: [
      {
        type: 'directory',
        location: 'backend/src/services/',
        description: 'Core monitoring services',
        searchHints: ['devMonitor', 'metrics', 'logging']
      }
    ],

    conventions: {
      commonPatterns: [
        'Use structured logging with category, action, message format',
        'Real-time updates via WebSocket or SSE'
      ]
    },

    gotchas: [
      'Monitor should not impact application performance',
      'Be careful with log volume in production'
    ],

    keyFiles: []
  },

  'backend': {
    name: 'Backend API',
    description: 'Main backend service with Express.js',

    gettingStarted: [
      {
        path: '../docs/architecture/backend.md',
        title: 'Backend Architecture',
        description: 'Overall backend structure and patterns',
        priority: 'critical'
      }
    ],

    architecture: [
      {
        path: '../docs/architecture/database-schema.md',
        title: 'Database Schema',
        description: 'Data models and relationships',
        priority: 'critical'
      }
    ],

    investigationStartingPoints: [
      {
        type: 'file',
        location: 'backend/src/server.ts',
        description: 'Application entry point',
        searchHints: ['Express app setup', 'middleware', 'routes']
      },
      {
        type: 'directory',
        location: 'backend/src/routes/',
        description: 'API route definitions',
        searchHints: ['router', 'endpoints']
      }
    ],

    conventions: {
      directoryStructure: 'routes/ for endpoints, services/ for business logic, utils/ for helpers',
      commonPatterns: [
        'Use async/await for async operations',
        'Return 400 for client errors, 500 for server errors',
        'Log all requests with structured format'
      ]
    },

    gotchas: [
      'Always validate user input before processing',
      'Use transactions for multi-step database operations',
      'Don\'t expose stack traces in production'
    ],

    keyFiles: [
      {
        path: 'backend/src/server.ts',
        purpose: 'Application entry point'
      }
    ]
  },

  'frontend': {
    name: 'Frontend Application',
    description: 'React-based frontend application',

    gettingStarted: [
      {
        path: '../docs/architecture/frontend.md',
        title: 'Frontend Architecture',
        description: 'Component structure and state management',
        priority: 'critical'
      }
    ],

    architecture: [
      {
        path: '../docs/development/DEVELOPMENT_STACK.md',
        title: 'Development Stack',
        description: 'Technologies and tools used',
        priority: 'recommended'
      }
    ],

    investigationStartingPoints: [
      {
        type: 'directory',
        location: 'frontend/src/components/',
        description: 'React components',
        searchHints: ['jsx', 'tsx', 'hooks']
      }
    ],

    conventions: {
      fileNaming: 'PascalCase for components, camelCase for utilities',
      commonPatterns: [
        'Use functional components with hooks',
        'Keep components small and focused',
        'Extract reusable logic into custom hooks'
      ]
    },

    gotchas: [
      'Avoid prop drilling - use context or state management',
      'Memoize expensive computations with useMemo',
      'Clean up subscriptions in useEffect'
    ],

    keyFiles: []
  }
};

/**
 * Get documentation configuration for a specific work target
 */
export function getWorkTargetDocs(target: string): WorkTargetConfig | undefined {
  return WORK_TARGET_DOCS[target.toLowerCase()];
}

/**
 * Get starting point recommendations for investigation
 */
export function getInvestigationStartingPoints(target: string): InvestigationStartingPoint[] {
  const config = getWorkTargetDocs(target);
  return config?.investigationStartingPoints || [];
}

/**
 * Get critical documentation that should be read first
 */
export function getCriticalDocumentation(target: string): DocumentationReference[] {
  const config = getWorkTargetDocs(target);
  if (!config) return [];

  return [
    ...config.gettingStarted.filter(d => d.priority === 'critical'),
    ...config.architecture.filter(d => d.priority === 'critical')
  ];
}

/**
 * Format documentation references as markdown for bot prompts
 */
export function formatDocumentationForPrompt(target: string): string {
  const config = getWorkTargetDocs(target);
  if (!config) return '- No specific documentation configured for this target';

  const sections: string[] = [];

  // Critical docs
  const critical = getCriticalDocumentation(target);
  if (critical.length > 0) {
    sections.push('**📚 Start Here (Critical Documentation):**');
    critical.forEach(doc => {
      sections.push(`- [${doc.title}](${doc.path}) - ${doc.description}`);
    });
    sections.push('');
  }

  // Investigation starting points
  if (config.investigationStartingPoints.length > 0) {
    sections.push('**🔍 Investigation Starting Points:**');
    config.investigationStartingPoints.forEach(point => {
      sections.push(`- \`${point.location}\` - ${point.description}`);
      if (point.searchHints && point.searchHints.length > 0) {
        sections.push(`  - Search for: ${point.searchHints.join(', ')}`);
      }
    });
    sections.push('');
  }

  // Gotchas
  if (config.gotchas.length > 0) {
    sections.push('**⚠️ Important Gotchas:**');
    config.gotchas.forEach(gotcha => {
      sections.push(`- ${gotcha}`);
    });
    sections.push('');
  }

  // Common patterns
  if (config.conventions.commonPatterns && config.conventions.commonPatterns.length > 0) {
    sections.push('**📋 Common Patterns:**');
    config.conventions.commonPatterns.forEach(pattern => {
      sections.push(`- ${pattern}`);
    });
  }

  return sections.join('\n');
}
