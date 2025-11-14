/**
 * Plan Status Updater Singleton
 *
 * Global instance of PlanStatusUpdater that can be accessed from anywhere.
 * This allows task queue, chain tracker, and other services to trigger plan updates.
 */

import type Database from 'better-sqlite3';
import { PlansService } from './plans.service.js';
import { PlanProgressCalculator } from './planProgressCalculator.service.js';
import { PlanStatusUpdater } from './planStatusUpdater.service.js';
import { logger } from '../utils/logger.js';

let instance: PlanStatusUpdater | null = null;

/**
 * Initialize the plan status updater singleton
 * Must be called once at application startup
 */
export function initializePlanStatusUpdater(db: Database.Database): void {
  if (instance) {
    logger.warn({
      category: 'plan',
      action: 'singleton_already_initialized',
      message: 'PlanStatusUpdater singleton already initialized',
    });
    return;
  }

  const plansService = new PlansService(db);
  const calculator = new PlanProgressCalculator(db);
  instance = new PlanStatusUpdater(db, plansService, calculator);

  logger.info({
    category: 'plan',
    action: 'singleton_initialized',
    message: 'PlanStatusUpdater singleton initialized',
  });
}

/**
 * Get the plan status updater singleton instance
 * Returns null if not initialized
 */
export function getPlanStatusUpdater(): PlanStatusUpdater | null {
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetPlanStatusUpdater(): void {
  instance = null;
}
