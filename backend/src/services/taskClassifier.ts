/**
 * Task Classification Service
 * 
 * Automatically classifies tasks to enable intelligent agent selection.
 * Analyzes task title, description, and mentioned files to determine:
 * - Category (implementation, analysis, documentation, review, planning)
 * - File patterns (file extensions involved)
 * - Estimated complexity (simple, medium, complex)
 * 
 * Part of Phase 0: Intelligent Agent Selection Strategy
 */

import { logger } from '../utils/logger.js';

export type TaskCategory = 'implementation' | 'analysis' | 'documentation' | 'review' | 'planning';
export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface TaskClassification {
  category: TaskCategory;
  filePatterns: string[];
  complexity: TaskComplexity;
  confidence: number; // 0-1 score of classification confidence
  reasoning: string; // Human-readable explanation
}

export interface ClassifiableTask {
  title: string;
  description?: string;
  type?: string;
}

export class TaskClassifier {
  /**
   * Classify a task based on its title and description
   */
  classifyTask(task: ClassifiableTask): TaskClassification {
    const category = this.inferCategory(task);
    const filePatterns = this.extractFilePatterns(task);
    const complexity = this.estimateComplexity(task, filePatterns);
    const confidence = this.calculateConfidence(task, category);
    const reasoning = this.generateReasoning(task, category, filePatterns, complexity);

    logger.debug({
      category: 'classification',
      action: 'task_classified',
      message: `Task classified as ${category} (${complexity} complexity)`,
      details: {
        title: task.title,
        category,
        complexity,
        file_patterns: filePatterns,
        confidence,
        reasoning
      }
    });

    return {
      category,
      filePatterns,
      complexity,
      confidence,
      reasoning
    };
  }

  /**
   * Infer task category from title and description using keyword matching
   */
  private inferCategory(task: ClassifiableTask): TaskCategory {
    const title = task.title.toLowerCase();
    const description = (task.description || '').toLowerCase();
    const combined = `${title} ${description}`;

    // Review keywords (check first before analysis)
    if (/\b(review|pr.*review|code.*review)\b/.test(combined)) {
      return 'review';
    }

    // Analysis keywords
    if (/\b(analyze|investigate|audit|inspect|examine|assess)\b/.test(combined)) {
      return 'analysis';
    }

    // Documentation keywords
    if (/\b(document|explain|describe|write.*docs?|update.*readme|api.*docs?)\b/.test(combined)) {
      return 'documentation';
    }

    // Planning keywords
    if (/\b(plan|design|architect|spec|specification|strategy|roadmap)\b/.test(combined)) {
      return 'planning';
    }

    // Implementation keywords (including bugfixes)
    if (/\b(implement|add|create|build|develop|fix|bug|issue|error|refactor)\b/.test(combined)) {
      return 'implementation';
    }

    // Check task type field as fallback
    if (task.type) {
      const type = task.type.toLowerCase();
      if (type.includes('documentation')) return 'documentation';
      if (type.includes('analysis') || type.includes('review')) return 'analysis';
      if (type.includes('planning')) return 'planning';
    }

    // Default to implementation if unclear
    return 'implementation';
  }

  /**
   * Extract file patterns (extensions) mentioned in task description
   */
  private extractFilePatterns(task: ClassifiableTask): string[] {
    const description = task.description || '';
    
    // Match file extensions in various formats
    // e.g., "file.ts", "*.md", ".tsx", "TypeScript files"
    const patterns: Set<string> = new Set();

    // Direct file mentions with extensions
    const fileRegex = /[a-zA-Z0-9_/-]+\.(ts|js|md|sql|json|yaml|yml|tsx|jsx|py|go|css|scss|html|txt|sh)\b/gi;
    const fileMatches = description.match(fileRegex) || [];
    
    fileMatches.forEach(file => {
      const ext = file.split('.').pop()?.toLowerCase();
      if (ext) patterns.add(ext);
    });

    // Pattern mentions like "*.ts" or "TypeScript files"
    const patternRegex = /[*]?\.(ts|js|md|sql|json|yaml|yml|tsx|jsx|py|go|css|scss|html)\b/gi;
    const patternMatches = description.match(patternRegex) || [];
    
    patternMatches.forEach(pattern => {
      const ext = pattern.replace(/[*.]/g, '').toLowerCase();
      if (ext) patterns.add(ext);
    });

    // Language/technology mentions
    if (/\btypescript\b/i.test(description)) patterns.add('ts');
    if (/\bjavascript\b/i.test(description)) patterns.add('js');
    if (/\breact\b/i.test(description)) patterns.add('tsx');
    if (/\bmarkdown\b/i.test(description)) patterns.add('md');
    if (/\bsql\b/i.test(description)) patterns.add('sql');
    if (/\bpython\b/i.test(description)) patterns.add('py');

    return Array.from(patterns);
  }

  /**
   * Estimate task complexity based on description and file patterns
   */
  private estimateComplexity(task: ClassifiableTask, filePatterns: string[]): TaskComplexity {
    const description = task.description || '';
    const title = task.title.toLowerCase();
    
    // Count file mentions as proxy for scope
    const fileCount = filePatterns.length;
    
    // Check for scope indicators in both title and description
    const combined = `${title} ${description.toLowerCase()}`;
    const hasLargeScope = /\b(entire|all|every|multiple.*files?|refactor|rewrite|migrate|system)\b/i.test(combined);
    const hasSmallScope = /\b(single|one|simple|small|minor|quick|fix.*typo)\b/i.test(combined);
    
    // Check description length
    const descriptionLength = description.length;
    
    // Simple complexity
    if (hasSmallScope || (fileCount <= 2 && descriptionLength < 200)) {
      return 'simple';
    }
    
    // Complex complexity
    if (hasLargeScope || fileCount > 5 || descriptionLength > 1000) {
      return 'complex';
    }
    
    // Medium complexity (default)
    return 'medium';
  }

  /**
   * Calculate confidence score for classification (0-1)
   */
  private calculateConfidence(task: ClassifiableTask, category: TaskCategory): number {
    const description = task.description || '';
    
    // Lower confidence for empty descriptions
    if (!description || description.length < 20) {
      return 0.5;
    }
    
    // Higher confidence for clear keyword matches
    const title = task.title.toLowerCase();
    const combined = `${title} ${description.toLowerCase()}`;
    
    // Strong indicators
    const strongMatches: Record<TaskCategory, RegExp> = {
      implementation: /\b(implement|add|create|build|fix|bug)\b/,
      analysis: /\b(analyze|review|investigate|audit)\b/,
      documentation: /\b(document|explain|write.*docs?|readme)\b/,
      review: /\b(review|pr.*review|code.*review)\b/,
      planning: /\b(plan|design|architect|spec)\b/
    };
    
    if (strongMatches[category].test(combined)) {
      return 0.9;
    }
    
    // Medium confidence for weaker matches
    return 0.7;
  }

  /**
   * Generate human-readable reasoning for classification
   */
  private generateReasoning(
    task: ClassifiableTask,
    category: TaskCategory,
    filePatterns: string[],
    complexity: TaskComplexity
  ): string {
    const parts: string[] = [];
    
    // Category reasoning
    const title = task.title.toLowerCase();
    if (title.includes('implement') || title.includes('add') || title.includes('create')) {
      parts.push('Title indicates implementation work');
    } else if (title.includes('analyze') || title.includes('review')) {
      parts.push('Title indicates analysis/review work');
    } else if (title.includes('document') || title.includes('update.*docs')) {
      parts.push('Title indicates documentation work');
    } else if (title.includes('plan') || title.includes('design')) {
      parts.push('Title indicates planning work');
    }
    
    // File pattern reasoning
    if (filePatterns.length > 0) {
      parts.push(`Involves ${filePatterns.join(', ')} files`);
    }
    
    // Complexity reasoning
    if (complexity === 'simple') {
      parts.push('Small scope (few files)');
    } else if (complexity === 'complex') {
      parts.push('Large scope (many files or broad changes)');
    }
    
    return parts.join('; ');
  }

  /**
   * Classify multiple tasks efficiently
   */
  classifyBatch(tasks: ClassifiableTask[]): Map<ClassifiableTask, TaskClassification> {
    const results = new Map<ClassifiableTask, TaskClassification>();
    
    for (const task of tasks) {
      results.set(task, this.classifyTask(task));
    }
    
    logger.info({
      category: 'classification',
      action: 'batch_classified',
      message: `Classified ${tasks.length} tasks`,
      details: {
        total: tasks.length,
        by_category: this.getCategoryDistribution(Array.from(results.values()))
      }
    });
    
    return results;
  }

  /**
   * Get distribution of categories from classifications
   */
  private getCategoryDistribution(classifications: TaskClassification[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const classification of classifications) {
      distribution[classification.category] = (distribution[classification.category] || 0) + 1;
    }
    
    return distribution;
  }
}
