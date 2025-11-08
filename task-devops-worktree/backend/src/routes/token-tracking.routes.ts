import express, { Request, Response } from 'express';
import {
  ApiError,
  TokenBudgetResponse,
  TokenBudgetUpdateResponse,
  TokenCanUseResponse,
  TokenRemainingResponse,
  TokenResetResponse,
  TokenSummariesResponse,
  TokenSummaryResponse,
} from '@app-monitor/api-contracts';
import { getTokenTrackingService, TokenBudget } from '../services/tokenTracking.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const tokenTracking = getTokenTrackingService();

const respondSuccess = <T>(res: Response, data: T, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

const respondError = (res: Response, status: number, error: string, message?: string) => {
  const payload: ApiError = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  return res.status(status).json(payload);
};

/**
 * GET /token-tracking/summary
 * Get usage summary for all providers
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const summaries = tokenTracking.getAllSummaries();
    respondSuccess(res, { summaries } satisfies TokenSummariesResponse['data']);
  } catch (error) {
    logger.error('Error getting token usage summaries:', error);
    respondError(res, 500, 'FAILED_TO_GET_TOKEN_SUMMARIES', 'Failed to get token usage summaries');
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
    respondSuccess<TokenSummaryResponse['data']>(res, summary);
  } catch (error) {
    logger.error(`Error getting token usage summary for ${req.params.provider}:`, error);
    respondError(res, 500, 'FAILED_TO_GET_TOKEN_SUMMARY', 'Failed to get token usage summary');
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
      return respondError(
        res,
        404,
        'TOKEN_BUDGET_NOT_FOUND',
        `No budget configured for provider: ${provider}`,
      );
    }

    respondSuccess<TokenBudgetResponse['data']>(res, budget);
  } catch (error) {
    logger.error(`Error getting budget for ${req.params.provider}:`, error);
    respondError(res, 500, 'FAILED_TO_GET_BUDGET', 'Failed to get budget');
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
      return respondError(res, 400, 'INVALID_BUDGET', 'Provider is required');
    }
    if (typeof budget.dailyLimit !== 'number' || budget.dailyLimit <= 0) {
      return respondError(res, 400, 'INVALID_BUDGET', 'Daily limit must be a positive number');
    }
    if (typeof budget.costPerMillionInput !== 'number' || budget.costPerMillionInput < 0) {
      return respondError(res, 400, 'INVALID_BUDGET', 'Cost per million input must be a non-negative number');
    }
    if (typeof budget.costPerMillionOutput !== 'number' || budget.costPerMillionOutput < 0) {
      return respondError(res, 400, 'INVALID_BUDGET', 'Cost per million output must be a non-negative number');
    }
    if (typeof budget.warningThreshold !== 'number' || budget.warningThreshold < 0 || budget.warningThreshold > 100) {
      return respondError(res, 400, 'INVALID_BUDGET', 'Warning threshold must be between 0 and 100');
    }

    tokenTracking.setBudget(budget);

    respondSuccess<TokenBudgetUpdateResponse['data']>(res, {
      message: `Budget set for provider: ${budget.provider}`,
      budget,
    });
  } catch (error) {
    logger.error('Error setting budget:', error);
    respondError(res, 500, 'FAILED_TO_SET_BUDGET', 'Failed to set budget');
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

    respondSuccess<TokenCanUseResponse['data']>(res, {
      provider,
      canUse,
      remainingTokens: remaining,
    });
  } catch (error) {
    logger.error(`Error checking if can use ${req.params.provider}:`, error);
    respondError(res, 500, 'FAILED_TO_CHECK_PROVIDER', 'Failed to check provider availability');
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

    respondSuccess<TokenRemainingResponse['data']>(res, {
      provider,
      remaining,
      limit: summary.budgetLimit,
      used: summary.totalTokens,
      percentUsed: summary.percentUsed,
    });
  } catch (error) {
    logger.error(`Error getting remaining tokens for ${req.params.provider}:`, error);
    respondError(res, 500, 'FAILED_TO_GET_REMAINING', 'Failed to get remaining tokens');
  }
});

/**
 * POST /token-tracking/reset
 * Manually trigger daily reset (for testing purposes)
 */
router.post('/reset', (req: Request, res: Response) => {
  try {
    tokenTracking.resetDailyTracking();
    respondSuccess<TokenResetResponse['data']>(res, { message: 'Daily tracking reset' });
  } catch (error) {
    logger.error('Error resetting daily tracking:', error);
    respondError(res, 500, 'FAILED_TO_RESET_TOKEN_TRACKING', 'Failed to reset daily tracking');
  }
});

export default router;
