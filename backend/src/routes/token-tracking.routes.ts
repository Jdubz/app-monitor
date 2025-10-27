import express, { Request, Response } from 'express';
import { getTokenTrackingService, TokenBudget } from '../services/tokenTracking.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const tokenTracking = getTokenTrackingService();

/**
 * GET /token-tracking/summary
 * Get usage summary for all providers
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const summaries = tokenTracking.getAllSummaries();
    res.json({ summaries });
  } catch (error) {
    logger.error('Error getting token usage summaries:', error);
    res.status(500).json({ error: 'Failed to get token usage summaries' });
  }
});

/**
 * GET /token-tracking/summary/:provider
 * Get usage summary for a specific provider
 */
router.get('/summary/:provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const summary = tokenTracking.getDailySummary(provider);
    res.json(summary);
  } catch (error) {
    logger.error(`Error getting token usage summary for ${req.params.provider}:`, error);
    res.status(500).json({ error: 'Failed to get token usage summary' });
  }
});

/**
 * GET /token-tracking/budget/:provider
 * Get budget configuration for a provider
 */
router.get('/budget/:provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const budget = tokenTracking.getBudget(provider);

    if (!budget) {
      return res.status(404).json({ error: `No budget configured for provider: ${provider}` });
    }

    res.json(budget);
  } catch (error) {
    logger.error(`Error getting budget for ${req.params.provider}:`, error);
    res.status(500).json({ error: 'Failed to get budget' });
  }
});

/**
 * PUT /token-tracking/budget
 * Set or update budget for a provider
 */
router.put('/budget', (req: Request, res: Response) => {
  try {
    const budget: TokenBudget = req.body;

    // Validate budget
    if (!budget.provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    if (typeof budget.dailyLimit !== 'number' || budget.dailyLimit <= 0) {
      return res.status(400).json({ error: 'Daily limit must be a positive number' });
    }
    if (typeof budget.costPerMillionInput !== 'number' || budget.costPerMillionInput < 0) {
      return res.status(400).json({ error: 'Cost per million input must be a non-negative number' });
    }
    if (typeof budget.costPerMillionOutput !== 'number' || budget.costPerMillionOutput < 0) {
      return res.status(400).json({ error: 'Cost per million output must be a non-negative number' });
    }
    if (typeof budget.warningThreshold !== 'number' || budget.warningThreshold < 0 || budget.warningThreshold > 100) {
      return res.status(400).json({ error: 'Warning threshold must be between 0 and 100' });
    }

    tokenTracking.setBudget(budget);

    res.json({
      message: `Budget set for provider: ${budget.provider}`,
      budget
    });
  } catch (error) {
    logger.error('Error setting budget:', error);
    res.status(500).json({ error: 'Failed to set budget' });
  }
});

/**
 * GET /token-tracking/can-use/:provider
 * Check if a provider can be used (budget not exceeded)
 */
router.get('/can-use/:provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const canUse = tokenTracking.canUseProvider(provider);
    const remaining = tokenTracking.getRemainingTokens(provider);

    res.json({
      provider,
      canUse,
      remainingTokens: remaining
    });
  } catch (error) {
    logger.error(`Error checking if can use ${req.params.provider}:`, error);
    res.status(500).json({ error: 'Failed to check provider availability' });
  }
});

/**
 * GET /token-tracking/remaining/:provider
 * Get remaining tokens for a provider today
 */
router.get('/remaining/:provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const remaining = tokenTracking.getRemainingTokens(provider);
    const summary = tokenTracking.getDailySummary(provider);

    res.json({
      provider,
      remaining,
      limit: summary.budgetLimit,
      used: summary.totalTokens,
      percentUsed: summary.percentUsed
    });
  } catch (error) {
    logger.error(`Error getting remaining tokens for ${req.params.provider}:`, error);
    res.status(500).json({ error: 'Failed to get remaining tokens' });
  }
});

/**
 * POST /token-tracking/reset
 * Manually trigger daily reset (for testing purposes)
 */
router.post('/reset', (req: Request, res: Response) => {
  try {
    tokenTracking.resetDailyTracking();
    res.json({ message: 'Daily tracking reset' });
  } catch (error) {
    logger.error('Error resetting daily tracking:', error);
    res.status(500).json({ error: 'Failed to reset daily tracking' });
  }
});

export default router;
