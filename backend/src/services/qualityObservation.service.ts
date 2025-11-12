/**
 * Quality Observation Service
 *
 * Records quality observations without failing tasks. Instead of blocking task
 * completion, this service identifies improvement opportunities that can be
 * addressed by follow-up tasks on the same PR branch.
 *
 * Philosophy: "Observe, Record, and Improve"
 * - Never fail tasks for quality issues
 * - Record all observations for analysis
 * - Generate actionable improvement opportunities
 * - Track quality metrics over time
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type {
  TaskVerificationResult,
  AcceptanceCriteriaVerification,
  TestCoverageResult,
  ScopeBoundaryVerification,
  ScopeViolation
} from './taskVerification.service.js';
import type { QualityValidationResult, QualityGateResult } from './qualityGates.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ImprovementType = 'coverage' | 'lint' | 'test' | 'docs' | 'criteria' | 'scope' | 'typecheck' | 'build';
export type ImprovementPriority = 'critical' | 'high' | 'medium' | 'low';
export type ImprovementComplexity = 'trivial' | 'simple' | 'moderate' | 'complex';

/**
 * An opportunity to improve code quality
 */
export interface ImprovementOpportunity {
  type: ImprovementType;
  priority: ImprovementPriority;
  description: string;
  estimatedEffort: number; // minutes
  complexity: ImprovementComplexity;
  automatable: boolean;
  suggestedFix: string;
  affectedFiles?: string[];
  details?: Record<string, unknown>;
}

/**
 * Observation of acceptance criteria status
 */
export interface AcceptanceCriteriaObservation {
  totalCriteria: number;
  metCriteria: number;
  unmetCriteria: string[];
  percentMet: number;
  needsImprovement: boolean;
}

/**
 * Observation of test coverage status
 */
export interface TestCoverageObservation {
  currentCoverage: number;
  targetCoverage: number;
  gap: number;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  needsImprovement: boolean;
  uncoveredAreas?: string[];
}

/**
 * Observation of scope boundary compliance
 */
export interface ScopeBoundaryObservation {
  violationCount: number;
  violations: ScopeViolation[];
  filesChanged: number;
  filesCreated: number;
  needsImprovement: boolean;
}

/**
 * Observation of quality gate results
 */
export interface QualityGateObservation {
  gate: string;
  passed: boolean;
  score: number;
  issues?: string[];
  needsImprovement: boolean;
}

/**
 * Complete quality observation for a task
 *
 * NOTE: Branch names are available from GitHub via pr_number, not stored here
 * per design principle: "Any information available from GitHub should NOT be stored in our DB"
 */
export interface QualityObservation {
  taskId: string;
  prNumber?: number;
  timestamp: string;

  // Observations from various checks
  observations: {
    acceptanceCriteria?: AcceptanceCriteriaObservation;
    testCoverage?: TestCoverageObservation;
    scopeBoundaries?: ScopeBoundaryObservation;
    qualityGates?: QualityGateObservation[];
  };

  // Identified improvement opportunities
  improvementOpportunities: ImprovementOpportunity[];

  // Overall quality metrics
  overallScore: number;
  qualityLevel: 'excellent' | 'good' | 'fair' | 'needs-improvement';
  readyForMerge: boolean;
  blockers: string[];
}

// ============================================================================
// Quality Observation Service
// ============================================================================

export class QualityObservationService {
  private readonly EXCELLENT_THRESHOLD = 90;
  private readonly GOOD_THRESHOLD = 75;
  private readonly FAIR_THRESHOLD = 60;

  /**
   * Create a quality observation from verification and quality gate results
   */
  async observeQuality(
    task: Task,
    verificationResult?: TaskVerificationResult,
    qualityGateResult?: QualityValidationResult
  ): Promise<QualityObservation> {
    logger.info({
      category: 'quality-observation',
      action: 'observation_started',
      message: `Creating quality observation for task ${task.id}`,
      details: {
        taskId: task.id,
        hasVerification: !!verificationResult,
        hasQualityGates: !!qualityGateResult
      }
    });

    const observation: QualityObservation = {
      taskId: task.id,
      prNumber: task.pr_number,
      timestamp: new Date().toISOString(),
      observations: {},
      improvementOpportunities: [],
      overallScore: 0,
      qualityLevel: 'needs-improvement',
      readyForMerge: false,
      blockers: []
    };

    // Observe acceptance criteria
    if (verificationResult?.acceptanceCriteria) {
      observation.observations.acceptanceCriteria = this.observeAcceptanceCriteria(
        verificationResult.acceptanceCriteria
      );
    }

    // Observe test coverage
    if (verificationResult?.testCoverage) {
      observation.observations.testCoverage = this.observeTestCoverage(
        verificationResult.testCoverage
      );
    }

    // Observe scope boundaries
    if (verificationResult?.scopeBoundaries) {
      observation.observations.scopeBoundaries = this.observeScopeBoundaries(
        verificationResult.scopeBoundaries
      );
    }

    // Observe quality gates
    if (qualityGateResult?.gates) {
      observation.observations.qualityGates = this.observeQualityGates(
        qualityGateResult.gates
      );
    }

    // Generate improvement opportunities
    observation.improvementOpportunities = this.generateImprovementOpportunities(
      observation.observations,
      task
    );

    // Calculate overall quality metrics
    observation.overallScore = this.calculateOverallScore(observation.observations);
    observation.qualityLevel = this.determineQualityLevel(observation.overallScore);
    observation.readyForMerge = this.isReadyForMerge(observation);
    observation.blockers = this.identifyBlockers(observation);

    logger.info({
      category: 'quality-observation',
      action: 'observation_completed',
      message: `Quality observation completed for task ${task.id}`,
      details: {
        overallScore: observation.overallScore,
        qualityLevel: observation.qualityLevel,
        improvementCount: observation.improvementOpportunities.length,
        readyForMerge: observation.readyForMerge,
        blockerCount: observation.blockers.length
      }
    });

    return observation;
  }

  /**
   * Observe acceptance criteria status
   */
  private observeAcceptanceCriteria(
    criteria: AcceptanceCriteriaVerification
  ): AcceptanceCriteriaObservation {
    const unmetCriteria = criteria.criteria
      .filter(c => !c.met)
      .map(c => c.text);

    return {
      totalCriteria: criteria.totalCriteria,
      metCriteria: criteria.metCount,
      unmetCriteria,
      percentMet: criteria.percentMet,
      needsImprovement: criteria.percentMet < 100
    };
  }

  /**
   * Observe test coverage status
   */
  private observeTestCoverage(coverage: TestCoverageResult): TestCoverageObservation {
    const gap = coverage.threshold - coverage.totalCoverage;

    return {
      currentCoverage: coverage.totalCoverage,
      targetCoverage: coverage.threshold,
      gap: Math.max(0, gap),
      lineCoverage: coverage.lineCoverage,
      branchCoverage: coverage.branchCoverage,
      functionCoverage: coverage.functionCoverage,
      needsImprovement: !coverage.meetsThreshold
    };
  }

  /**
   * Observe scope boundary compliance
   */
  private observeScopeBoundaries(
    boundaries: ScopeBoundaryVerification
  ): ScopeBoundaryObservation {
    return {
      violationCount: boundaries.violationCount,
      violations: boundaries.violations,
      filesChanged: boundaries.gitDiff.filesChanged.length,
      filesCreated: boundaries.gitDiff.filesCreated.length,
      needsImprovement: boundaries.violationCount > 0
    };
  }

  /**
   * Observe quality gate results
   */
  private observeQualityGates(gates: QualityGateResult[]): QualityGateObservation[] {
    return gates.map(gate => ({
      gate: gate.gate,
      passed: gate.passed,
      score: gate.score,
      issues: gate.error ? [gate.error] : undefined,
      needsImprovement: !gate.passed
    }));
  }

  /**
   * Generate improvement opportunities from observations
   */
  private generateImprovementOpportunities(
    observations: QualityObservation['observations'],
    task: Task
  ): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];

    // Acceptance criteria improvements
    if (observations.acceptanceCriteria?.needsImprovement) {
      opportunities.push({
        type: 'criteria',
        priority: 'high',
        description: `Complete ${observations.acceptanceCriteria.unmetCriteria.length} unmet acceptance criteria`,
        estimatedEffort: observations.acceptanceCriteria.unmetCriteria.length * 15,
        complexity: 'moderate',
        automatable: false,
        suggestedFix: `Address the following criteria: ${observations.acceptanceCriteria.unmetCriteria.slice(0, 3).join('; ')}`,
        details: {
          unmetCriteria: observations.acceptanceCriteria.unmetCriteria
        }
      });
    }

    // Test coverage improvements
    if (observations.testCoverage?.needsImprovement) {
      const gap = observations.testCoverage.gap;
      opportunities.push({
        type: 'coverage',
        priority: gap > 20 ? 'critical' : gap > 10 ? 'high' : 'medium',
        description: `Increase test coverage by ${gap.toFixed(1)}% to meet ${observations.testCoverage.targetCoverage}% threshold`,
        estimatedEffort: Math.ceil(gap * 2), // ~2 minutes per percentage point
        complexity: gap > 20 ? 'complex' : gap > 10 ? 'moderate' : 'simple',
        automatable: false,
        suggestedFix: 'Run npm run test:coverage to identify uncovered code, then add unit tests for critical paths',
        affectedFiles: task.files,
        details: {
          currentCoverage: observations.testCoverage.currentCoverage,
          targetCoverage: observations.testCoverage.targetCoverage,
          branchCoverage: observations.testCoverage.branchCoverage
        }
      });
    }

    // Scope boundary improvements
    if (observations.scopeBoundaries?.needsImprovement) {
      observations.scopeBoundaries.violations.forEach(violation => {
        opportunities.push({
          type: 'scope',
          priority: 'high',
          description: `Fix scope violation: ${violation.message}`,
          estimatedEffort: 10,
          complexity: 'simple',
          automatable: false,
          suggestedFix: `Revert or move changes in ${violation.file} to comply with scope boundaries`,
          affectedFiles: [violation.file],
          details: {
            violationType: violation.type,
            file: violation.file
          }
        });
      });
    }

    // Quality gate improvements
    if (observations.qualityGates) {
      observations.qualityGates.forEach(gate => {
        if (gate.needsImprovement) {
          const opportunity = this.createQualityGateOpportunity(gate);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }
      });
    }

    // Sort by priority and estimated effort
    return opportunities.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.estimatedEffort - b.estimatedEffort;
    });
  }

  /**
   * Create improvement opportunity from quality gate result
   */
  private createQualityGateOpportunity(gate: QualityGateObservation): ImprovementOpportunity | null {
    switch (gate.gate.toLowerCase()) {
      case 'linting':
        return {
          type: 'lint',
          priority: 'high',
          description: 'Fix linting errors',
          estimatedEffort: 10,
          complexity: 'simple',
          automatable: true,
          suggestedFix: 'Run npm run lint -- --fix to auto-fix most issues',
          details: { gate: gate.gate, score: gate.score }
        };

      case 'typechecking':
        return {
          type: 'typecheck',
          priority: 'high',
          description: 'Fix TypeScript errors',
          estimatedEffort: 20,
          complexity: 'moderate',
          automatable: false,
          suggestedFix: 'Run npx tsc --noEmit to see errors, then fix type issues',
          details: { gate: gate.gate, score: gate.score }
        };

      case 'testing':
        return {
          type: 'test',
          priority: 'critical',
          description: 'Fix failing tests',
          estimatedEffort: 30,
          complexity: 'moderate',
          automatable: false,
          suggestedFix: 'Run npm test to identify failures, fix broken tests',
          details: { gate: gate.gate, score: gate.score }
        };

      case 'documentation':
        return {
          type: 'docs',
          priority: 'medium',
          description: 'Update documentation',
          estimatedEffort: 15,
          complexity: 'simple',
          automatable: false,
          suggestedFix: 'Add README.md or update existing documentation to reflect changes',
          details: { gate: gate.gate, score: gate.score }
        };

      case 'build':
        return {
          type: 'build',
          priority: 'critical',
          description: 'Fix build errors',
          estimatedEffort: 25,
          complexity: 'moderate',
          automatable: false,
          suggestedFix: 'Run npm run build to see errors, fix compilation issues',
          details: { gate: gate.gate, score: gate.score }
        };

      default:
        return null;
    }
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateOverallScore(observations: QualityObservation['observations']): number {
    let totalWeight = 0;
    let weightedScore = 0;

    // Acceptance criteria (30% weight)
    if (observations.acceptanceCriteria) {
      const weight = 30;
      totalWeight += weight;
      weightedScore += observations.acceptanceCriteria.percentMet * (weight / 100);
    }

    // Test coverage (30% weight)
    if (observations.testCoverage) {
      const weight = 30;
      totalWeight += weight;
      const coverageScore = Math.min(100, (observations.testCoverage.currentCoverage / observations.testCoverage.targetCoverage) * 100);
      weightedScore += coverageScore * (weight / 100);
    }

    // Quality gates (30% weight)
    if (observations.qualityGates && observations.qualityGates.length > 0) {
      const weight = 30;
      totalWeight += weight;
      const avgGateScore = observations.qualityGates.reduce((sum, g) => sum + g.score, 0) / observations.qualityGates.length;
      weightedScore += avgGateScore * (weight / 100);
    }

    // Scope boundaries (10% weight)
    if (observations.scopeBoundaries) {
      const weight = 10;
      totalWeight += weight;
      const scopeScore = observations.scopeBoundaries.violationCount === 0 ? 100 : 0;
      weightedScore += scopeScore * (weight / 100);
    }

    // Normalize if not all components present
    if (totalWeight === 0) return 0;
    if (totalWeight < 100) {
      weightedScore = (weightedScore / totalWeight) * 100;
    }

    return Math.round(weightedScore);
  }

  /**
   * Determine quality level from score
   */
  private determineQualityLevel(score: number): QualityObservation['qualityLevel'] {
    if (score >= this.EXCELLENT_THRESHOLD) return 'excellent';
    if (score >= this.GOOD_THRESHOLD) return 'good';
    if (score >= this.FAIR_THRESHOLD) return 'fair';
    return 'needs-improvement';
  }

  /**
   * Determine if work is ready for merge
   */
  private isReadyForMerge(observation: QualityObservation): boolean {
    // Must have good or excellent quality
    if (observation.overallScore < this.GOOD_THRESHOLD) {
      return false;
    }

    // All acceptance criteria must be met
    if (observation.observations.acceptanceCriteria?.needsImprovement) {
      return false;
    }

    // Critical quality gates must pass
    const criticalGates = observation.observations.qualityGates?.filter(g =>
      ['testing', 'build', 'linting'].includes(g.gate.toLowerCase())
    );

    if (criticalGates?.some(g => !g.passed)) {
      return false;
    }

    // No scope violations
    if (observation.observations.scopeBoundaries?.needsImprovement) {
      return false;
    }

    return true;
  }

  /**
   * Identify blockers preventing merge
   */
  private identifyBlockers(observation: QualityObservation): string[] {
    const blockers: string[] = [];

    if (observation.observations.acceptanceCriteria?.needsImprovement) {
      blockers.push(`${observation.observations.acceptanceCriteria.unmetCriteria.length} acceptance criteria not met`);
    }

    const criticalGates = observation.observations.qualityGates?.filter(g =>
      ['testing', 'build'].includes(g.gate.toLowerCase()) && !g.passed
    );

    if (criticalGates && criticalGates.length > 0) {
      criticalGates.forEach(gate => {
        blockers.push(`${gate.gate} failing`);
      });
    }

    if (observation.observations.scopeBoundaries?.violationCount) {
      blockers.push(`${observation.observations.scopeBoundaries.violationCount} scope violations`);
    }

    return blockers;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let qualityObservationServiceInstance: QualityObservationService | null = null;

/**
 * Get the singleton quality observation service
 */
export function getQualityObservationService(): QualityObservationService {
  if (!qualityObservationServiceInstance) {
    qualityObservationServiceInstance = new QualityObservationService();
  }
  return qualityObservationServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetQualityObservationService(): void {
  qualityObservationServiceInstance = null;
}
