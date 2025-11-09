/**
 * Task Verification API Routes
 *
 * Provides endpoints for:
 * - Manually triggering task verification
 * - Retrieving verification results
 * - Getting verification statistics
 */

import { Router } from 'express';
import { getTaskVerificationService } from '../services/taskVerification.service.js';
import { getDatabase } from '../services/database.js';
import { logger } from '../utils/logger.js';
import { getTaskQueueService } from '../services/taskQueue.factory.js';

const router = Router();

/**
 * GET /api/verification/task/:taskId
 * Get verification results for a specific task
 */
router.get('/task/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    const db = getDatabase();

    // Check if we have stored verification results
    const verificationData = db.getVerificationResult(taskId);

    if (verificationData) {
      res.json({
        status: 'success',
        data: verificationData
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'No verification results found for this task'
      });
    }
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'get_verification_failed',
      message: `Failed to get verification for task ${taskId}`,
      error
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve verification results'
    });
  }
});

/**
 * POST /api/verification/verify/:taskId
 * Manually trigger verification for a task
 */
router.post('/verify/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { workspacePath } = req.body;

  try {
    const taskQueue = getTaskQueueService();
    const task = taskQueue.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        status: 'error',
        message: 'Task not found'
      });
    }

    const verificationService = getTaskVerificationService();

    // Use provided workspace path or default
    const workspace = workspacePath || process.cwd();

    logger.info({
      category: 'api',
      action: 'manual_verification_started',
      message: `Manually triggering verification for task ${taskId}`,
      details: { taskId, workspace }
    });

    // Run verification
    const result = await verificationService.verifyTask(
      task,
      workspace,
      task.output || ''
    );

    // Store result in database
    const db = getDatabase();
    db.storeVerificationResult(result);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'manual_verification_failed',
      message: `Failed to verify task ${taskId}`,
      error
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to run verification',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/verification/stats
 * Get verification statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const db = getDatabase();
    const taskQueue = getTaskQueueService();

    // Get all tasks (no time filter available in current API)
    const recentTasks = [
      ...taskQueue.getTasksByStatus('pending'),
      ...taskQueue.getTasksByStatus('running'),
      ...taskQueue.getTasksByStatus('completed'),
      ...taskQueue.getTasksByStatus('failed')
    ];

    // Calculate verification stats
    let totalVerified = 0;
    let totalPassed = 0;
    let totalAcceptanceCriteriaMet = 0;
    let totalCoverageChecks = 0;
    let totalCoveragePassed = 0;
    let totalScopeChecks = 0;
    let totalScopePassed = 0;
    let totalScore = 0;

    for (const task of recentTasks) {
      const verification = db.getVerificationResult(task.id);
      if (verification) {
        totalVerified++;
        if (verification.passed) totalPassed++;

        // Acceptance criteria stats
        if (verification.acceptanceCriteria) {
          totalAcceptanceCriteriaMet += verification.acceptanceCriteria.percentMet;
        }

        // Coverage stats
        if (verification.testCoverage) {
          totalCoverageChecks++;
          if (verification.testCoverage.meetsThreshold) {
            totalCoveragePassed++;
          }
        }

        // Scope stats
        if (verification.scopeBoundaries) {
          totalScopeChecks++;
          if (verification.scopeBoundaries.passed) {
            totalScopePassed++;
          }
        }

        totalScore += verification.overallScore;
      }
    }

    const stats = {
      totalTasks: recentTasks.length,
      totalVerified,
      verificationRate: recentTasks.length > 0 ?
        Math.round((totalVerified / recentTasks.length) * 100) : 0,
      passRate: totalVerified > 0 ?
        Math.round((totalPassed / totalVerified) * 100) : 0,
      averageScore: totalVerified > 0 ?
        Math.round(totalScore / totalVerified) : 0,
      acceptanceCriteria: {
        averageMetRate: totalVerified > 0 ?
          Math.round(totalAcceptanceCriteriaMet / totalVerified) : 0
      },
      testCoverage: {
        checksPerformed: totalCoverageChecks,
        passRate: totalCoverageChecks > 0 ?
          Math.round((totalCoveragePassed / totalCoverageChecks) * 100) : 0
      },
      scopeBoundaries: {
        checksPerformed: totalScopeChecks,
        passRate: totalScopeChecks > 0 ?
          Math.round((totalScopePassed / totalScopeChecks) * 100) : 0
      }
    };

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'get_verification_stats_failed',
      message: 'Failed to get verification statistics',
      error
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve verification statistics'
    });
  }
});

/**
 * GET /api/verification/recommendations/:taskId
 * Get verification recommendations for a task
 */
router.get('/recommendations/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    const db = getDatabase();
    const verification = db.getVerificationResult(taskId);

    if (!verification) {
      return res.status(404).json({
        status: 'error',
        message: 'No verification results found for this task'
      });
    }

    const recommendations = verification.recommendations || [];

    // Add additional recommendations based on the verification results
    const enhancedRecommendations = [...recommendations];

    if (verification.acceptanceCriteria && (verification.acceptanceCriteria as { percentMet: number; criteria: Array<{ met: boolean; text: string }> }).percentMet < 100) {
      const unmetCriteria = (verification.acceptanceCriteria as { criteria: Array<{ met: boolean; text: string }> }).criteria
        .filter((c) => !c.met)
        .map((c) => c.text);

      enhancedRecommendations.push(
        `Focus on completing these criteria: ${unmetCriteria.join(', ')}`
      );
    }

    if (verification.testCoverage && !verification.testCoverage.meetsThreshold) {
      enhancedRecommendations.push(
        `Run 'npm run test:coverage' and add tests for uncovered code`
      );
    }

    if (verification.scopeBoundaries && (verification.scopeBoundaries as { violationCount: number; violations: Array<{ file: string }> }).violationCount > 0) {
      enhancedRecommendations.push(
        `Review and revert changes to restricted files: ${
          (verification.scopeBoundaries as { violations: Array<{ file: string }> }).violations
            .slice(0, 3)
            .map((v) => v.file)
            .join(', ')
        }`
      );
    }

    res.json({
      status: 'success',
      data: {
        taskId,
        passed: verification.passed,
        overallScore: verification.overallScore,
        recommendations: enhancedRecommendations
      }
    });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'get_recommendations_failed',
      message: `Failed to get recommendations for task ${taskId}`,
      error
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve recommendations'
    });
  }
});

export default router;