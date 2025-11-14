/**
 * Context Recipe Selector
 * 
 * Intelligently selects which context recipes to include based on:
 * - Task type
 * - Target files
 * - Manual overrides
 */

import type { TaskType } from '../types/task.types';

export interface RecipeSelectionOptions {
  taskType: TaskType;
  targetFiles?: string[];
  manualProfiles?: string[];
  includeOptional?: boolean;
}

export interface RecipeSelection {
  required: string[];
  recommended: string[];
  optional: string[];
  excluded: string[];
}

export class ContextRecipeSelector {
  /**
   * Task-type to recipe mapping
   * Defines which recipes are required/recommended for each task type
   */
  private static readonly TASK_TYPE_RECIPES: Record<TaskType, { required: string[]; recommended: string[] }> = {
    implementation: {
      required: ['scope-control', 'dev-monitor'],
      recommended: ['implementation-patterns', 'pr-workflow']
    },
    review: {
      required: ['scope-control', 'review-checklist'],
      recommended: ['dev-monitor', 'pr-workflow']
    },
    fix: {
      required: ['scope-control', 'fix-debugging', 'failure-recovery'],
      recommended: ['dev-monitor']
    },
    bug: {
      required: ['scope-control', 'fix-debugging', 'failure-recovery'],
      recommended: ['dev-monitor']
    },
    documentation: {
      required: ['scope-control'],
      recommended: ['dev-monitor']
    },
    refactor: {
      required: ['scope-control', 'dev-monitor'],
      recommended: ['implementation-patterns']
    },
    test: {
      required: ['scope-control', 'dev-monitor'],
      recommended: ['implementation-patterns']
    },
    analysis: {
      required: ['scope-control'],
      recommended: ['dev-monitor']
    },
    deployment: {
      required: ['scope-control', 'deployment', 'failure-recovery'],
      recommended: ['pr-workflow']
    },
    maintenance: {
      required: ['scope-control'],
      recommended: ['dev-monitor', 'failure-recovery']
    }
  };

  /**
   * File pattern to recipe mapping
   * Auto-includes recipes based on target files
   */
  private static readonly FILE_PATTERN_RECIPES: Array<{ pattern: RegExp; profiles: string[] }> = [
    // Frontend patterns
    { pattern: /^frontend\//i, profiles: ['dev-monitor'] },
    { pattern: /\.tsx?$/i, profiles: ['implementation-patterns'] },
    
    // Backend patterns
    { pattern: /^backend\/src\/services\//i, profiles: ['implementation-patterns'] },
    { pattern: /\.service\.ts$/i, profiles: ['implementation-patterns'] },
    
    // Database patterns
    { pattern: /^backend\/migrations\//i, profiles: ['deployment'] },
    { pattern: /database/i, profiles: ['deployment'] },
    
    // Docker/deployment
    { pattern: /dockerfile/i, profiles: ['deployment'] },
    { pattern: /docker-compose/i, profiles: ['deployment'] },
    { pattern: /\.sh$/i, profiles: ['deployment'] },
    
    // PR workflow
    { pattern: /\.github\/workflows\//i, profiles: ['pr-workflow', 'deployment'] },
    
    // Tests
    { pattern: /\.test\.ts$/i, profiles: ['implementation-patterns'] },
    { pattern: /\.spec\.ts$/i, profiles: ['implementation-patterns'] },
    { pattern: /__tests__\//i, profiles: ['implementation-patterns'] },
    
    // Documentation
    { pattern: /\.md$/i, profiles: [] }, // No extra recipes for docs
    
    // Configuration
    { pattern: /package\.json$/i, profiles: ['deployment'] },
    { pattern: /tsconfig\.json$/i, profiles: ['implementation-patterns'] }
  ];

  /**
   * Select context recipes for a task
   */
  static selectRecipes(options: RecipeSelectionOptions): RecipeSelection {
    const { taskType, targetFiles = [], manualProfiles = [], includeOptional = false } = options;

    // Start with task-type recipes
    const taskRecipes = this.TASK_TYPE_RECIPES[taskType] || { required: ['scope-control'], recommended: [] };
    const required = new Set<string>(taskRecipes.required);
    const recommended = new Set<string>(taskRecipes.recommended);
    const optional = new Set<string>();

    // Add file-pattern-based recipes
    for (const file of targetFiles) {
      for (const { pattern, profiles } of this.FILE_PATTERN_RECIPES) {
        if (pattern.test(file)) {
          profiles.forEach(profile => {
            if (!required.has(profile)) {
              recommended.add(profile);
            }
          });
        }
      }
    }

    // Handle manual profile overrides
    const manualSet = new Set(manualProfiles);
    manualSet.forEach(profile => {
      required.add(profile); // Manual profiles are always required
    });

    // Add optional profiles if requested
    if (includeOptional) {
      // Deployment is optional for most tasks unless explicitly required
      if (!required.has('deployment') && !recommended.has('deployment')) {
        optional.add('deployment');
      }
      
      // PR workflow is optional for non-PR tasks
      if (!required.has('pr-workflow') && !recommended.has('pr-workflow')) {
        optional.add('pr-workflow');
      }
    }

    // Determine excluded profiles (all profiles not included)
    const allProfiles = new Set([
      'scope-control',
      'dev-monitor',
      'pr-workflow',
      'failure-recovery',
      'deployment',
      'implementation-patterns',
      'review-checklist',
      'fix-debugging'
    ]);

    const included = new Set([...required, ...recommended, ...optional]);
    const excluded = new Set([...allProfiles].filter(p => !included.has(p)));

    return {
      required: Array.from(required),
      recommended: Array.from(recommended),
      optional: Array.from(optional),
      excluded: Array.from(excluded)
    };
  }

  /**
   * Get a combined list of profiles to include
   * By default includes required + recommended
   */
  static getProfilesToInclude(options: RecipeSelectionOptions, includeOptional = false): string[] {
    const selection = this.selectRecipes(options);
    const profiles = [...selection.required, ...selection.recommended];
    
    if (includeOptional) {
      profiles.push(...selection.optional);
    }

    // Remove duplicates and return
    return Array.from(new Set(profiles));
  }

  /**
   * Check if a profile is relevant for a task
   */
  static isProfileRelevant(profile: string, options: RecipeSelectionOptions): boolean {
    const selection = this.selectRecipes(options);
    return selection.required.includes(profile) || 
           selection.recommended.includes(profile) ||
           selection.optional.includes(profile);
  }

  /**
   * Get explanation for why profiles were selected
   */
  static explainSelection(options: RecipeSelectionOptions): string {
    const selection = this.selectRecipes(options);
    const lines: string[] = [];

    lines.push(`Profile Selection for ${options.taskType} task:`);
    lines.push('');

    if (selection.required.length > 0) {
      lines.push(`Required (${selection.required.length}):`);
      selection.required.forEach(p => lines.push(`  - ${p}`));
      lines.push('');
    }

    if (selection.recommended.length > 0) {
      lines.push(`Recommended (${selection.recommended.length}):`);
      selection.recommended.forEach(p => lines.push(`  - ${p}`));
      lines.push('');
    }

    if (selection.optional.length > 0) {
      lines.push(`Optional (${selection.optional.length}):`);
      selection.optional.forEach(p => lines.push(`  - ${p}`));
      lines.push('');
    }

    if (options.targetFiles && options.targetFiles.length > 0) {
      lines.push('File-based additions:');
      for (const file of options.targetFiles) {
        for (const { pattern, profiles } of this.FILE_PATTERN_RECIPES) {
          if (pattern.test(file) && profiles.length > 0) {
            lines.push(`  ${file} → ${profiles.join(', ')}`);
          }
        }
      }
    }

    return lines.join('\n');
  }
}
