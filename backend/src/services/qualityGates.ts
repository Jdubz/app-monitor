import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Quality gate check result
 */
export interface QualityGateResult {
  gate: string;
  passed: boolean;
  score: number; // 0-100
  duration: number; // milliseconds
  output?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Complete quality gate validation result
 */
export interface QualityValidationResult {
  taskId: string;
  passed: boolean; // All gates passed
  overallScore: number; // Average of all scores
  gates: QualityGateResult[];
  duration: number;
  timestamp: string;
}

/**
 * Quality gate configuration
 */
export interface QualityGateConfig {
  name: string;
  enabled: boolean;
  required: boolean; // If true, failure blocks task completion
  weight: number; // Weight in overall score (1-10)
  timeout: number; // Max execution time in ms
}

/**
 * Service for validating code quality through multiple gates
 *
 * Quality Gates:
 * 1. Linting - ESLint/Prettier checks
 * 2. Testing - Run tests with safe-test-runner
 * 3. Type Checking - TypeScript compilation
 * 4. Documentation - Check for required docs
 * 5. Git - Verify proper commit message
 * 6. Build - Ensure code builds successfully
 */
export class QualityGateValidator extends EventEmitter {
  private defaultConfig: Map<string, QualityGateConfig> = new Map();

  constructor() {
    super();
    this.initializeDefaultConfig();
  }

  /**
   * Initialize default quality gate configuration
   */
  private initializeDefaultConfig(): void {
    this.defaultConfig.set('linting', {
      name: 'linting',
      enabled: true,
      required: true,
      weight: 8,
      timeout: 60000 // 1 minute
    });

    this.defaultConfig.set('testing', {
      name: 'testing',
      enabled: true,
      required: true,
      weight: 10,
      timeout: 300000 // 5 minutes
    });

    this.defaultConfig.set('typechecking', {
      name: 'typechecking',
      enabled: true,
      required: true,
      weight: 7,
      timeout: 120000 // 2 minutes
    });

    this.defaultConfig.set('documentation', {
      name: 'documentation',
      enabled: true,
      required: false,
      weight: 5,
      timeout: 10000 // 10 seconds
    });

    this.defaultConfig.set('gitcommit', {
      name: 'gitcommit',
      enabled: true,
      required: false,
      weight: 3,
      timeout: 5000 // 5 seconds
    });

    this.defaultConfig.set('build', {
      name: 'build',
      enabled: true,
      required: true,
      weight: 9,
      timeout: 180000 // 3 minutes
    });

    logger.info({
      category: 'quality-gates',
      action: 'default_config_initialized',
      message: 'Quality gate default configuration initialized'
    });
  }

  /**
   * Validate quality for a task
   */
  async validateTask(taskId: string, workspacePath: string, project: string): Promise<QualityValidationResult> {
    const startTime = Date.now();

    logger.info({
      category: 'quality-gates',
      action: 'validation_started',
      message: `Starting quality validation for task ${taskId}`,
      details: { workspacePath, project }
    });

    const results: QualityGateResult[] = [];

    // Run each enabled gate
    for (const [gateKey, config] of this.defaultConfig) {
      if (!config.enabled) {
        continue;
      }

      try {
        let result: QualityGateResult;

        switch (gateKey) {
          case 'linting':
            result = await this.runLintingGate(workspacePath, project, config);
            break;
          case 'testing':
            result = await this.runTestingGate(workspacePath, project, config);
            break;
          case 'typechecking':
            result = await this.runTypeCheckGate(workspacePath, project, config);
            break;
          case 'documentation':
            result = await this.runDocumentationGate(workspacePath, project, config);
            break;
          case 'gitcommit':
            result = await this.runGitGate(workspacePath, project, config);
            break;
          case 'build':
            result = await this.runBuildGate(workspacePath, project, config);
            break;
          default:
            logger.warn({
              category: 'quality-gates',
              action: 'unknown_gate_encountered',
              message: `Unknown quality gate configured: ${gateKey}`
            });
            continue;
        }

        results.push(result);

        // Emit gate result
        this.emit('gate_completed', { taskId, gate: gateKey, result });

        // If required gate failed, we can stop early (optional)
        if (config.required && !result.passed) {
          logger.warn({
            category: 'quality-gates',
            action: 'required_gate_failed',
            message: `Required gate ${config.name} failed for task ${taskId}`
          });
        }
      } catch (error) {
        logger.error({
          category: 'quality-gates',
          action: 'gate_error',
          message: `Error running gate ${config.name} for task ${taskId}`,
          error
        });

        results.push({
          gate: config.name,
          passed: false,
          score: 0,
          duration: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Calculate overall result
    const passed = results.every(r => {
      const config = this.defaultConfig.get(r.gate.toLowerCase());
      return !config?.required || r.passed;
    });

    const overallScore = this.calculateOverallScore(results);
    const duration = Date.now() - startTime;

    const validationResult: QualityValidationResult = {
      taskId,
      passed,
      overallScore,
      gates: results,
      duration,
      timestamp: new Date().toISOString()
    };

    logger.info({
      category: 'quality-gates',
      action: 'validation_completed',
      message: `Quality validation completed for task ${taskId}`,
      details: {
        passed,
        overallScore,
        duration,
        gatesPassed: results.filter(r => r.passed).length,
        gatesTotal: results.length
      }
    });

    this.emit('validation_completed', validationResult);

    return validationResult;
  }

  /**
   * Run linting gate (ESLint)
   */
  private async runLintingGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      const { exitCode, stdout, stderr } = await this.executeCommand(
        'npm',
        ['run', 'lint'],
        projectPath,
        config.timeout
      );

      const passed = exitCode === 0;
      const score = passed ? 100 : Math.max(0, 100 - (stderr.split('\n').filter(l => l.includes('error')).length * 10));

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        output: stdout,
        error: stderr,
        details: {
          exitCode,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run testing gate (safe-test-runner)
   */
  private async runTestingGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      const { exitCode, stdout, stderr } = await this.executeCommand(
        'npm',
        ['test'],
        projectPath,
        config.timeout
      );

      const passed = exitCode === 0;

      // Try to extract test stats from output
      const testMatch = stdout.match(/(\d+) passed/);
      const failMatch = stdout.match(/(\d+) failed/);
      const testsPassed = testMatch ? parseInt(testMatch[1], 10) : 0;
      const testsFailed = failMatch ? parseInt(failMatch[1], 10) : 0;
      const totalTests = testsPassed + testsFailed;

      const score = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : (passed ? 100 : 0);

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        output: stdout,
        error: stderr,
        details: {
          exitCode,
          testsPassed,
          testsFailed,
          totalTests,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run type checking gate (TypeScript)
   */
  private async runTypeCheckGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      const { exitCode, stdout, stderr } = await this.executeCommand(
        'npx',
        ['tsc', '--noEmit'],
        projectPath,
        config.timeout
      );

      const passed = exitCode === 0;
      const errorCount = stderr.split('\n').filter(l => l.includes('error TS')).length;
      const score = passed ? 100 : Math.max(0, 100 - (errorCount * 5));

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        output: stdout,
        error: stderr,
        details: {
          exitCode,
          errorCount,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run documentation gate
   */
  private async runDocumentationGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      // Check for README.md
      const readmePath = path.join(projectPath, 'README.md');
      const hasReadme = fs.existsSync(readmePath);

      // Check for package.json description
      const packageJsonPath = path.join(projectPath, 'package.json');
      let hasDescription = false;
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        hasDescription = !!packageJson.description;
      }

      const score = (hasReadme ? 60 : 0) + (hasDescription ? 40 : 0);
      const passed = score >= 60; // At least README required

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        details: {
          hasReadme,
          hasDescription,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run git commit gate
   */
  private async runGitGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      // Get last commit message
      const { stdout } = await this.executeCommand(
        'git',
        ['log', '-1', '--pretty=%B'],
        projectPath,
        config.timeout
      );

      const commitMessage = stdout.trim();

      // Check for conventional commit format (optional)
      const hasConventionalFormat = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?:/.test(commitMessage);

      // Check for minimum length
      const hasMinLength = commitMessage.length >= 10;

      // Check for AI co-author
      const hasAICoAuthor = commitMessage.includes('Co-Authored-By: Claude') ||
                           commitMessage.includes('Generated with');

      let score = 0;
      if (hasMinLength) score += 40;
      if (hasConventionalFormat) score += 30;
      if (hasAICoAuthor) score += 30;

      const passed = score >= 40; // At least minimum length

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        output: commitMessage,
        details: {
          hasConventionalFormat,
          hasMinLength,
          hasAICoAuthor,
          messageLength: commitMessage.length,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run build gate
   */
  private async runBuildGate(workspacePath: string, project: string, config: QualityGateConfig): Promise<QualityGateResult> {
    const startTime = Date.now();
    const projectPath = path.join(workspacePath, project);

    try {
      const { exitCode, stdout, stderr } = await this.executeCommand(
        'npm',
        ['run', 'build'],
        projectPath,
        config.timeout
      );

      const passed = exitCode === 0;
      const score = passed ? 100 : 0;

      return {
        gate: config.name,
        passed,
        score,
        duration: Date.now() - startTime,
        output: stdout,
        error: stderr,
        details: {
          exitCode,
          projectPath
        }
      };
    } catch (error) {
      return {
        gate: config.name,
        passed: false,
        score: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute a command with timeout
   */
  private executeCommand(command: string, args: string[], cwd: string, timeout: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        shell: true,
        timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutTimer = setTimeout(() => {
        if (typeof (proc as any).kill === 'function') {
          (proc as any).kill();
        }
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.on('close', (exitCode) => {
        clearTimeout(timeoutTimer);
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutTimer);
        reject(error);
      });
    });
  }

  /**
   * Calculate overall score from gate results
   */
  private calculateOverallScore(results: QualityGateResult[]): number {
    if (results.length === 0) return 0;

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const result of results) {
      const config = this.defaultConfig.get(result.gate.toLowerCase());
      if (config) {
        totalWeightedScore += result.score * config.weight;
        totalWeight += config.weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
  }

  /**
   * Get gate configuration
   */
  getGateConfig(gate: string): QualityGateConfig | undefined {
    return this.defaultConfig.get(gate.toLowerCase());
  }

  /**
   * Update gate configuration
   */
  setGateConfig(gate: string, config: Partial<QualityGateConfig>): void {
    const existing = this.defaultConfig.get(gate.toLowerCase());
    if (existing) {
      this.defaultConfig.set(gate.toLowerCase(), { ...existing, ...config });
      logger.info({
        category: 'quality-gates',
        action: 'gate_configuration_updated',
        message: `Updated configuration for gate ${gate}`
      });
    } else {
      logger.warn({
        category: 'quality-gates',
        action: 'gate_not_found',
        message: `Attempted to update missing gate ${gate}`
      });
    }
  }

  /**
   * Get all gate configurations
   */
  getAllGateConfigs(): Map<string, QualityGateConfig> {
    return new Map(this.defaultConfig);
  }
}

// Singleton instance
let qualityGateInstance: QualityGateValidator | null = null;

/**
 * Get the singleton quality gate validator instance
 */
export function getQualityGateValidator(): QualityGateValidator {
  if (!qualityGateInstance) {
    qualityGateInstance = new QualityGateValidator();
  }
  return qualityGateInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetQualityGateValidator(): void {
  qualityGateInstance = null;
}
