/**
 * Task Verification Service
 *
 * Provides automated verification of task completion against acceptance criteria,
 * test coverage requirements, and scope boundaries. Integrates with existing
 * TaskCompletionService to ensure tasks meet all requirements before marking complete.
 *
 * Key Features:
 * - Acceptance criteria parsing and verification
 * - Test coverage extraction and threshold checking
 * - Git diff analysis for scope boundary enforcement
 * - Integration with existing quality gates
 */

import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AcceptanceCriterion {
  text: string;
  met: boolean;
  evidence?: string;
}

export interface AcceptanceCriteriaVerification {
  taskId: string;
  criteria: AcceptanceCriterion[];
  allMet: boolean;
  totalCriteria: number;
  metCount: number;
  percentMet: number;
}

export interface TestCoverageResult {
  passed: boolean;
  totalCoverage: number;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  statementCoverage: number;
  threshold: number;
  meetsThreshold: boolean;
  raw?: string;
}

export interface GitDiffAnalysis {
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  filesModified: string[];
  totalChanges: number;
  violations: ScopeViolation[];
}

export interface ScopeViolation {
  type: 'mustNotChange' | 'mustNotAffect' | 'doNotCreate' | 'doNotModify';
  file: string;
  message: string;
}

export interface ScopeBoundaryVerification {
  taskId: string;
  passed: boolean;
  gitDiff: GitDiffAnalysis;
  violations: ScopeViolation[];
  violationCount: number;
}

export interface TaskVerificationResult {
  taskId: string;
  passed: boolean;
  acceptanceCriteria: AcceptanceCriteriaVerification;
  testCoverage?: TestCoverageResult;
  scopeBoundaries?: ScopeBoundaryVerification;
  overallScore: number;
  timestamp: string;
  recommendations?: string[];
}

// ============================================================================
// Task Verification Service
// ============================================================================

export class TaskVerificationService {
  private readonly COVERAGE_THRESHOLD = 80; // Default 80% coverage requirement

  /**
   * Perform comprehensive task verification
   */
  async verifyTask(
    task: Task,
    workspacePath: string,
    taskOutput?: string
  ): Promise<TaskVerificationResult> {
    const startTime = Date.now();

    logger.info({
      category: 'verification',
      action: 'verification_started',
      message: `Starting comprehensive verification for task ${task.id}`,
      details: {
        taskId: task.id,
        taskTitle: task.title,
        workspacePath
      }
    });

    // 1. Verify acceptance criteria
    const acceptanceCriteria = await this.verifyAcceptanceCriteria(task, taskOutput || '', workspacePath);

    // 2. Verify test coverage (if tests were run)
    let testCoverage: TestCoverageResult | undefined;
    if (this.shouldCheckTestCoverage(task)) {
      testCoverage = await this.verifyTestCoverage(workspacePath, task);
    }

    // 3. Verify scope boundaries (if defined)
    let scopeBoundaries: ScopeBoundaryVerification | undefined;
    if (this.hasScopeBoundaries(task)) {
      scopeBoundaries = await this.verifyScopeBoundaries(task, workspacePath);
    }

    // Calculate overall verification result
    const passed = this.calculateOverallResult(acceptanceCriteria, testCoverage, scopeBoundaries);
    const overallScore = this.calculateOverallScore(acceptanceCriteria, testCoverage, scopeBoundaries);
    const recommendations = this.generateRecommendations(acceptanceCriteria, testCoverage, scopeBoundaries);

    const result: TaskVerificationResult = {
      taskId: task.id,
      passed,
      acceptanceCriteria,
      testCoverage,
      scopeBoundaries,
      overallScore,
      timestamp: new Date().toISOString(),
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };

    const duration = Date.now() - startTime;

    logger.info({
      category: 'verification',
      action: 'verification_completed',
      message: `Task verification completed for ${task.id}`,
      details: {
        passed,
        overallScore,
        duration,
        acceptanceCriteriaMet: acceptanceCriteria.percentMet,
        testCoverage: testCoverage?.totalCoverage,
        scopeViolations: scopeBoundaries?.violationCount
      }
    });

    return result;
  }

  /**
   * Verify acceptance criteria are met
   */
  private async verifyAcceptanceCriteria(
    task: Task,
    taskOutput: string,
    workspacePath: string
  ): Promise<AcceptanceCriteriaVerification> {
    const criteria: AcceptanceCriterion[] = [];

    if (!task.acceptance_criteria || !Array.isArray(task.acceptance_criteria)) {
      // No specific criteria defined
      return {
        taskId: task.id,
        criteria: [{
          text: 'Task completed as described',
          met: true,
          evidence: 'No specific criteria defined, assuming task description fulfilled'
        }],
        allMet: true,
        totalCriteria: 1,
        metCount: 1,
        percentMet: 100
      };
    }

    // Parse each criterion and look for evidence
    for (const criterion of task.acceptance_criteria) {
      const criterionResult = await this.checkSingleCriterion(
        criterion,
        taskOutput,
        workspacePath,
        task
      );
      criteria.push(criterionResult);
    }

    const metCount = criteria.filter(c => c.met).length;
    const totalCriteria = criteria.length;
    const percentMet = totalCriteria > 0 ? Math.round((metCount / totalCriteria) * 100) : 0;

    return {
      taskId: task.id,
      criteria,
      allMet: metCount === totalCriteria,
      totalCriteria,
      metCount,
      percentMet
    };
  }

  /**
   * Check if a single acceptance criterion is met
   */
  private async checkSingleCriterion(
    criterion: string,
    taskOutput: string,
    workspacePath: string,
    _task: Task
  ): Promise<AcceptanceCriterion> {
    const lowerCriterion = criterion.toLowerCase();
    const lowerOutput = taskOutput.toLowerCase();

    // Check for common patterns in acceptance criteria
    let met = false;
    let evidence: string | undefined;

    // Pattern 1: File/feature creation
    if (lowerCriterion.includes('create') || lowerCriterion.includes('add') || lowerCriterion.includes('implement')) {
      const filePattern = /(?:create|add|implement)(?:ed)?\s+(?:a\s+)?(?:new\s+)?(\w+)/i;
      const match = criterion.match(filePattern);
      if (match) {
        const target = match[1];
        if (lowerOutput.includes(target.toLowerCase())) {
          met = true;
          evidence = `Found reference to ${target} in output`;
        }

        // Also check git status for new files
        try {
          const gitStatus = execSync('git status --porcelain', {
            cwd: workspacePath,
            encoding: 'utf-8'
          });
          if (gitStatus.includes('A  ') || gitStatus.includes('?? ')) {
            met = true;
            evidence = `New files detected in git status`;
          }
        } catch (error) {
          // Git command failed, continue with other checks
        }
      }
    }

    // Pattern 2: Test-related criteria
    if (lowerCriterion.includes('test') && lowerCriterion.includes('pass')) {
      if (lowerOutput.includes('tests pass') ||
          lowerOutput.includes('passing') ||
          lowerOutput.includes('✓') ||
          lowerOutput.match(/\d+\s+pass/)) {
        met = true;
        evidence = 'Test execution detected in output';
      }
    }

    // Pattern 3: Update/modify criteria
    if (lowerCriterion.includes('update') || lowerCriterion.includes('modify') || lowerCriterion.includes('fix')) {
      const filePattern = /(?:update|modify|fix)(?:ed)?\s+(?:the\s+)?(\w+)/i;
      const match = criterion.match(filePattern);
      if (match) {
        const target = match[1];

        // Check git diff for modifications
        try {
          const gitDiff = execSync('git diff --name-only HEAD', {
            cwd: workspacePath,
            encoding: 'utf-8'
          });

          if (gitDiff.toLowerCase().includes(target.toLowerCase())) {
            met = true;
            evidence = `${target} found in modified files`;
          }
        } catch (error) {
          // Git command failed, check output
          if (lowerOutput.includes(target.toLowerCase()) &&
              (lowerOutput.includes('updated') || lowerOutput.includes('modified') || lowerOutput.includes('fixed'))) {
            met = true;
            evidence = `${target} modification mentioned in output`;
          }
        }
      }
    }

    // Pattern 4: Documentation criteria
    if (lowerCriterion.includes('document') || lowerCriterion.includes('readme')) {
      if (lowerOutput.includes('readme') ||
          lowerOutput.includes('documentation') ||
          lowerOutput.includes('.md')) {
        met = true;
        evidence = 'Documentation updates detected';
      }
    }

    // Pattern 5: Build/compile success
    if (lowerCriterion.includes('build') || lowerCriterion.includes('compile')) {
      const buildIndicators = [
        'build successful',
        'build succeeded',
        'build success',
        'build: success',
        'build completed successfully',
        'build completed without errors',
        'build completed',
        'build finished successfully',
        'build finished without errors',
        'build passed',
        'build ok',
        'build status: success',
        'compiled successfully',
        'compile success',
        'compile succeeded'
      ];

      const hasIndicator = buildIndicators.some(indicator => lowerOutput.includes(indicator));
      const completedWithoutErrors = lowerOutput.includes('build completed') &&
        (lowerOutput.includes('without errors') || lowerOutput.includes('no errors'));

      if (hasIndicator || completedWithoutErrors) {
        met = true;
        evidence = 'Build success detected in output';
      }
    }

    // Pattern 6: No errors/warnings
    if (lowerCriterion.includes('no error') || lowerCriterion.includes('no warning')) {
      if (!lowerOutput.includes('error:') && !lowerOutput.includes('warning:')) {
        met = true;
        evidence = 'No errors or warnings found in output';
      }
    }

    // Pattern 7: Coverage requirement
    if (lowerCriterion.includes('coverage') && lowerCriterion.match(/\d+%/)) {
      const requiredCoverage = parseInt(lowerCriterion.match(/(\d+)%/)![1]);
      const coverageMatch = lowerOutput.match(/coverage[:\s]+(\d+\.?\d*)%/i);
      if (coverageMatch) {
        const actualCoverage = parseFloat(coverageMatch[1]);
        if (actualCoverage >= requiredCoverage) {
          met = true;
          evidence = `Coverage ${actualCoverage}% meets requirement of ${requiredCoverage}%`;
        }
      }
    }

    // Fallback: Check if criterion text appears in output (weak check)
    if (!met && lowerOutput.includes(lowerCriterion.replace(/[^\w\s]/g, '').substring(0, 20))) {
      met = true;
      evidence = 'Criterion text found in output (weak match)';
    }

    return {
      text: criterion,
      met,
      evidence
    };
  }

  /**
   * Verify test coverage meets requirements
   */
  private async verifyTestCoverage(
    workspacePath: string,
    task: Task
  ): Promise<TestCoverageResult> {
    try {
      // Determine which workspace to check (backend or frontend)
      const isBackend = task.files?.some(f => f.includes('backend')) ||
                       task.assigned_agent?.includes('backend');
      const projectPath = isBackend ?
        `${workspacePath}/backend` :
        `${workspacePath}/frontend`;

      // Run coverage command
      logger.info({
        category: 'verification',
        action: 'running_coverage_check',
        message: `Running test coverage for ${isBackend ? 'backend' : 'frontend'}`,
        details: { projectPath }
      });

      const coverageOutput = execSync('npm run test:coverage', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 120000 // 2 minute timeout
      });

      // Parse coverage output (Vitest format)
      return this.parseCoverageOutput(coverageOutput);

    } catch (error) {
      logger.error({
        category: 'verification',
        action: 'coverage_check_failed',
        message: 'Failed to run test coverage',
        error
      });

      // Return failed result
      return {
        passed: false,
        totalCoverage: 0,
        lineCoverage: 0,
        branchCoverage: 0,
        functionCoverage: 0,
        statementCoverage: 0,
        threshold: this.COVERAGE_THRESHOLD,
        meetsThreshold: false,
        raw: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Parse coverage output from vitest
   */
  private parseCoverageOutput(output: string): TestCoverageResult {
    // Vitest coverage output format:
    // Coverage summary:
    // Statements   : 85.23% ( 234/275 )
    // Branches     : 78.45% ( 123/157 )
    // Functions    : 82.11% ( 89/108 )
    // Lines        : 85.23% ( 234/275 )

    const statementsMatch = output.match(/Statements\s*:\s*(\d+\.?\d*)%/);
    const branchesMatch = output.match(/Branches\s*:\s*(\d+\.?\d*)%/);
    const functionsMatch = output.match(/Functions\s*:\s*(\d+\.?\d*)%/);
    const linesMatch = output.match(/Lines\s*:\s*(\d+\.?\d*)%/);

    const statementCoverage = statementsMatch ? parseFloat(statementsMatch[1]) : 0;
    const branchCoverage = branchesMatch ? parseFloat(branchesMatch[1]) : 0;
    const functionCoverage = functionsMatch ? parseFloat(functionsMatch[1]) : 0;
    const lineCoverage = linesMatch ? parseFloat(linesMatch[1]) : 0;

    // Total coverage is typically the average or we can use line coverage as the main metric
    const totalCoverage = lineCoverage || statementCoverage;
    const meetsThreshold = totalCoverage >= this.COVERAGE_THRESHOLD;

    return {
      passed: meetsThreshold,
      totalCoverage,
      lineCoverage,
      branchCoverage,
      functionCoverage,
      statementCoverage,
      threshold: this.COVERAGE_THRESHOLD,
      meetsThreshold,
      raw: output.substring(0, 1000) // Keep first 1000 chars for reference
    };
  }

  /**
   * Verify scope boundaries are respected
   */
  private async verifyScopeBoundaries(
    task: Task,
    workspacePath: string
  ): Promise<ScopeBoundaryVerification> {
    const gitDiff = await this.analyzeGitDiff(workspacePath);
    const violations: ScopeViolation[] = [];

    // Check context boundaries if defined
    if (task.context_boundaries) {
      // Check mustNotChange files
      if (task.context_boundaries.mustNotChange) {
        for (const protectedFile of task.context_boundaries.mustNotChange) {
          if (gitDiff.filesModified.some(f => f.includes(protectedFile))) {
            violations.push({
              type: 'mustNotChange',
              file: protectedFile,
              message: `Protected file "${protectedFile}" was modified`
            });
          }
        }
      }

      // Check mustNotAffect patterns
      if (task.context_boundaries.mustNotAffect) {
        for (const pattern of task.context_boundaries.mustNotAffect) {
          const affectedFiles = gitDiff.filesChanged.filter(f => f.includes(pattern));
          for (const file of affectedFiles) {
            violations.push({
              type: 'mustNotAffect',
              file,
              message: `File "${file}" affects protected area "${pattern}"`
            });
          }
        }
      }
    }

    // Check doNotCreate restrictions (from task template)
    const taskTemplate = task as any;
    if (taskTemplate.doNotCreate && Array.isArray(taskTemplate.doNotCreate)) {
      for (const restriction of taskTemplate.doNotCreate) {
        const createdFiles = gitDiff.filesCreated.filter(f => f.includes(restriction));
        for (const file of createdFiles) {
          violations.push({
            type: 'doNotCreate',
            file,
            message: `File creation restricted: "${restriction}"`
          });
        }
      }
    }

    // Check doNotModify restrictions
    if (taskTemplate.doNotModify && Array.isArray(taskTemplate.doNotModify)) {
      for (const restriction of taskTemplate.doNotModify) {
        const modifiedFiles = gitDiff.filesModified.filter(f => f.includes(restriction));
        for (const file of modifiedFiles) {
          violations.push({
            type: 'doNotModify',
            file,
            message: `File modification restricted: "${restriction}"`
          });
        }
      }
    }

    return {
      taskId: task.id,
      passed: violations.length === 0,
      gitDiff,
      violations,
      violationCount: violations.length
    };
  }

  /**
   * Analyze git diff to understand what changed
   */
  private async analyzeGitDiff(workspacePath: string): Promise<GitDiffAnalysis> {
    try {
      // Get list of all changed files
      const diffOutput = execSync('git diff --name-status HEAD', {
        cwd: workspacePath,
        encoding: 'utf-8'
      });

      const filesCreated: string[] = [];
      const filesModified: string[] = [];
      const filesDeleted: string[] = [];

      // Parse git diff output
      const lines = diffOutput.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');

        if (!filePath) continue;

        switch (status) {
          case 'A': // Added
            filesCreated.push(filePath);
            break;
          case 'M': // Modified
            filesModified.push(filePath);
            break;
          case 'D': // Deleted
            filesDeleted.push(filePath);
            break;
          case 'R': // Renamed (treat as modified)
            filesModified.push(filePath);
            break;
        }
      }

      // Also check for untracked files
      const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
        cwd: workspacePath,
        encoding: 'utf-8'
      });

      const untrackedFiles = untrackedOutput.split('\n').filter(f => f.trim());
      filesCreated.push(...untrackedFiles);

      const filesChanged = [...filesCreated, ...filesModified, ...filesDeleted];

      return {
        filesChanged,
        filesCreated,
        filesDeleted,
        filesModified,
        totalChanges: filesChanged.length,
        violations: [] // Populated by boundary checks
      };
    } catch (error) {
      logger.error({
        category: 'verification',
        action: 'git_diff_analysis_failed',
        message: 'Failed to analyze git diff',
        error
      });

      // Return empty analysis on error
      return {
        filesChanged: [],
        filesCreated: [],
        filesDeleted: [],
        filesModified: [],
        totalChanges: 0,
        violations: []
      };
    }
  }

  /**
   * Check if task should have test coverage verified
   */
  private shouldCheckTestCoverage(task: Task): boolean {
    const hasCodeFiles = task.files?.some(f =>
      f.endsWith('.ts') || f.endsWith('.tsx') ||
      f.endsWith('.js') || f.endsWith('.jsx')
    ) || false;

    const hasTestRequirement = Array.isArray(task.testing_requirements) &&
      task.testing_requirements.length > 0;

    const hasCoverageCriterion = Array.isArray(task.acceptance_criteria) &&
      task.acceptance_criteria.some(criterion =>
        /coverage/.test(criterion.toLowerCase())
      );

    return hasCodeFiles || hasTestRequirement || hasCoverageCriterion;
  }

  /**
   * Check if task has scope boundaries defined
   */
  private hasScopeBoundaries(task: Task): boolean {
    const boundaries = task.context_boundaries;
    const hasContextBoundaries = !!(
      boundaries &&
      (
        (Array.isArray(boundaries.mustNotChange) && boundaries.mustNotChange.length > 0) ||
        (Array.isArray(boundaries.mustNotAffect) && boundaries.mustNotAffect.length > 0) ||
        (Array.isArray((boundaries as any).integrationPoints) && (boundaries as any).integrationPoints.length > 0)
      )
    );

    const taskTemplate = task as any;
    const hasTemplateRestrictions = !!(
      (Array.isArray(taskTemplate.doNotCreate) && taskTemplate.doNotCreate.length > 0) ||
      (Array.isArray(taskTemplate.doNotModify) && taskTemplate.doNotModify.length > 0)
    );

    return hasContextBoundaries || hasTemplateRestrictions;
  }

  /**
   * Calculate overall verification result
   */
  private calculateOverallResult(
    acceptanceCriteria: AcceptanceCriteriaVerification,
    testCoverage?: TestCoverageResult,
    scopeBoundaries?: ScopeBoundaryVerification
  ): boolean {
    // All acceptance criteria must be met
    if (!acceptanceCriteria.allMet) {
      return false;
    }

    // Test coverage must meet threshold if checked
    if (testCoverage && !testCoverage.meetsThreshold) {
      return false;
    }

    // No scope violations allowed
    if (scopeBoundaries && !scopeBoundaries.passed) {
      return false;
    }

    return true;
  }

  /**
   * Calculate overall verification score (0-100)
   */
  private calculateOverallScore(
    acceptanceCriteria: AcceptanceCriteriaVerification,
    testCoverage?: TestCoverageResult,
    scopeBoundaries?: ScopeBoundaryVerification
  ): number {
    let totalWeight = 0;
    let weightedScore = 0;

    // Acceptance criteria (weight: 40%)
    const acWeight = 40;
    totalWeight += acWeight;
    weightedScore += acceptanceCriteria.percentMet * (acWeight / 100);

    // Test coverage (weight: 40% if present)
    if (testCoverage) {
      const coverageWeight = 40;
      totalWeight += coverageWeight;
      const coverageScore = Math.min(100, (testCoverage.totalCoverage / testCoverage.threshold) * 100);
      weightedScore += coverageScore * (coverageWeight / 100);
    }

    // Scope boundaries (weight: 20% if present)
    if (scopeBoundaries) {
      const boundaryWeight = 20;
      totalWeight += boundaryWeight;
      const boundaryScore = scopeBoundaries.passed ? 100 : 0;
      weightedScore += boundaryScore * (boundaryWeight / 100);
    }

    // Normalize score if not all components present
    if (totalWeight < 100) {
      weightedScore = (weightedScore / totalWeight) * 100;
    }

    return Math.round(weightedScore);
  }

  /**
   * Generate recommendations based on verification results
   */
  private generateRecommendations(
    acceptanceCriteria: AcceptanceCriteriaVerification,
    testCoverage?: TestCoverageResult,
    scopeBoundaries?: ScopeBoundaryVerification
  ): string[] {
    const recommendations: string[] = [];

    // Acceptance criteria recommendations
    if (!acceptanceCriteria.allMet) {
      const unmetCriteria = acceptanceCriteria.criteria
        .filter(c => !c.met)
        .map(c => c.text);

      recommendations.push(
        `Complete unmet acceptance criteria: ${unmetCriteria.join(', ')}`
      );
    }

    // Test coverage recommendations
    if (testCoverage && !testCoverage.meetsThreshold) {
      const deficit = testCoverage.threshold - testCoverage.totalCoverage;
      recommendations.push(
        `Increase test coverage by ${deficit.toFixed(1)}% to meet ${testCoverage.threshold}% threshold`
      );

      if (testCoverage.branchCoverage < 70) {
        recommendations.push('Focus on branch coverage - test edge cases and error conditions');
      }

      if (testCoverage.functionCoverage < testCoverage.statementCoverage) {
        recommendations.push('Some functions lack tests - ensure all functions have at least one test');
      }
    }

    // Scope boundary recommendations
    if (scopeBoundaries && !scopeBoundaries.passed) {
      const violationTypes = new Set(scopeBoundaries.violations.map(v => v.type));

      if (violationTypes.has('mustNotChange')) {
        recommendations.push('Revert changes to protected files');
      }

      if (violationTypes.has('doNotCreate')) {
        recommendations.push('Remove newly created files that violate restrictions');
      }

      if (scopeBoundaries.violations.length > 5) {
        recommendations.push('Consider breaking this task into smaller, more focused changes');
      }
    }

    // General recommendations
    if (acceptanceCriteria.percentMet < 50) {
      recommendations.push('Review task requirements - less than half of criteria are met');
    }

    return recommendations;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let verificationServiceInstance: TaskVerificationService | null = null;

/**
 * Get the singleton task verification service
 */
export function getTaskVerificationService(): TaskVerificationService {
  if (!verificationServiceInstance) {
    verificationServiceInstance = new TaskVerificationService();
  }
  return verificationServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTaskVerificationService(): void {
  verificationServiceInstance = null;
}
