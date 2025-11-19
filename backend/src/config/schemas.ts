/**
 * Configuration Schemas
 *
 * TypeScript types and schema definitions for hardcoded configuration values.
 * These provide type safety and documentation for configuration that's currently
 * hardcoded but may be externalized in the future.
 */

/**
 * Valid project identifiers
 */
export const VALID_PROJECTS = ['app-monitor', 'dev-bots', 'shared'] as const;
export type ValidProject = typeof VALID_PROJECTS[number];

/**
 * Valid agent identifiers with their capabilities
 */
export const VALID_AGENTS = {
  'claude-sonnet': {
    description: 'Claude Sonnet 4 - Balanced performance and capabilities',
    capabilities: ['implementation', 'review', 'analysis', 'fix'],
    costTier: 'medium'
  },
  'claude-opus': {
    description: 'Claude Opus 4 - Highest capability for complex tasks',
    capabilities: ['implementation', 'review', 'analysis', 'fix', 'architecture'],
    costTier: 'high'
  },
  'claude-haiku': {
    description: 'Claude Haiku - Fast and cost-effective for simple tasks',
    capabilities: ['review', 'fix', 'simple-implementation'],
    costTier: 'low'
  },
  'backend-specialist': {
    description: 'Specialized for backend/API development',
    capabilities: ['implementation', 'review', 'fix'],
    costTier: 'medium'
  },
  'frontend-specialist': {
    description: 'Specialized for frontend/UI development',
    capabilities: ['implementation', 'review', 'fix'],
    costTier: 'medium'
  }
} as const;

export type ValidAgent = keyof typeof VALID_AGENTS;

/**
 * Risk pattern definitions for task auto-detection
 * Used to identify high-risk changes that need extra scrutiny
 */
export interface RiskPattern {
  pattern: RegExp;
  riskLevel: 'high' | 'medium' | 'low';
  category: string;
  description: string;
}

export const RISK_PATTERNS: readonly RiskPattern[] = [
  {
    pattern: /auth|login|password|token|session/i,
    riskLevel: 'high',
    category: 'security',
    description: 'Authentication or security-related changes'
  },
  {
    pattern: /payment|billing|transaction|stripe/i,
    riskLevel: 'high',
    category: 'financial',
    description: 'Payment or financial transaction logic'
  },
  {
    pattern: /database|migration|schema|sql/i,
    riskLevel: 'high',
    category: 'data',
    description: 'Database schema or migration changes'
  },
  {
    pattern: /permissions?|access|role|admin/i,
    riskLevel: 'high',
    category: 'authorization',
    description: 'Permission or access control changes'
  },
  {
    pattern: /crypto|encrypt|decrypt|hash/i,
    riskLevel: 'high',
    category: 'cryptography',
    description: 'Cryptographic operations'
  },
  {
    pattern: /api|endpoint|route/i,
    riskLevel: 'medium',
    category: 'api',
    description: 'API endpoint or route changes'
  },
  {
    pattern: /config|environment|\.env/i,
    riskLevel: 'medium',
    category: 'configuration',
    description: 'Configuration changes'
  }
] as const;

/**
 * Context profile identifiers
 * Maps to YAML files in context-recipes/
 */
export const CONTEXT_PROFILES = [
  'scope-control',
  'dev-monitor',
  'pr-workflow',
  'failure-recovery',
  'implementation-patterns',
  'review-checklist',
  'fix-debugging'
] as const;

export type ContextProfile = typeof CONTEXT_PROFILES[number];

/**
 * File count thresholds for risk assessment
 */
export const FILE_COUNT_THRESHOLDS = {
  low: 3,
  medium: 10,
  high: 20
} as const;

/**
 * Helper function to check if a project is valid
 */
export function isValidProject(project: string): project is ValidProject {
  return (VALID_PROJECTS as readonly string[]).includes(project);
}

/**
 * Helper function to check if an agent is valid
 */
export function isValidAgent(agent: string): agent is ValidAgent {
  return agent in VALID_AGENTS;
}

/**
 * Helper function to check if a profile is valid
 */
export function isValidContextProfile(profile: string): profile is ContextProfile {
  return (CONTEXT_PROFILES as readonly string[]).includes(profile);
}

/**
 * Get agent capabilities
 */
export function getAgentCapabilities(agent: ValidAgent) {
  return VALID_AGENTS[agent].capabilities;
}

/**
 * Get agent description
 */
export function getAgentDescription(agent: ValidAgent) {
  return VALID_AGENTS[agent].description;
}

/**
 * Check if task type matches file content
 */
export function assessRiskFromContent(content: string): {
  level: 'high' | 'medium' | 'low' | 'minimal';
  matches: Array<{ pattern: string; category: string; description: string }>;
} {
  const matches: Array<{ pattern: string; category: string; description: string }> = [];
  let highestRisk: 'high' | 'medium' | 'low' | 'minimal' = 'minimal';

  for (const riskPattern of RISK_PATTERNS) {
    if (riskPattern.pattern.test(content)) {
      matches.push({
        pattern: riskPattern.pattern.source,
        category: riskPattern.category,
        description: riskPattern.description
      });

      if (riskPattern.riskLevel === 'high') {
        highestRisk = 'high';
      } else if (riskPattern.riskLevel === 'medium' && highestRisk !== 'high') {
        highestRisk = 'medium';
      } else if (riskPattern.riskLevel === 'low' && highestRisk === 'minimal') {
        highestRisk = 'low';
      }
    }
  }

  return { level: highestRisk, matches };
}
