/**
 * Phase Validator Registry
 * 
 * Central registry for all phase validators.
 * Maps phase index to validator instance.
 * 
 * Usage:
 *   const registry = getValidatorRegistry();
 *   const validator = registry.getValidator(phaseIndex);
 *   const result = await validator.validate(task, artifacts);
 */

import { logger } from '../../utils/logger.js';
import type { PhaseValidator } from './types.js';
import { Phase1PlanningValidator } from './Phase1PlanningValidator.js';
import { Phase2ImplementationValidator } from './Phase2ImplementationValidator.js';
import { Phase3ReviewValidator } from './Phase3ReviewValidator.js';
import { Phase4FixesValidator } from './Phase4FixesValidator.js';
import { Phase5TestValidator } from './Phase5TestValidator.js';
import { Phase6CleanupValidator } from './Phase6CleanupValidator.js';
import { Phase7PRShepherdingValidator } from './Phase7PRShepherdingValidator.js';

export class ValidatorRegistry {
  private validators: Map<number, PhaseValidator>;

  constructor() {
    this.validators = new Map();
    this.registerDefaultValidators();
  }

  /**
   * Register all default phase validators.
   */
  private registerDefaultValidators(): void {
    this.register(new Phase1PlanningValidator());
    this.register(new Phase2ImplementationValidator());
    this.register(new Phase3ReviewValidator());
    this.register(new Phase4FixesValidator());
    this.register(new Phase5TestValidator());
    this.register(new Phase6CleanupValidator());
    this.register(new Phase7PRShepherdingValidator());

    logger.info({
      category: 'phase',
      action: 'validator_registry_initialized',
      message: `Registered ${this.validators.size} phase validators`,
      details: {
        phases: Array.from(this.validators.keys()).sort(),
      },
    });
  }

  /**
   * Register a phase validator.
   */
  register(validator: PhaseValidator): void {
    const phaseIndex = validator.phaseIndex;

    if (this.validators.has(phaseIndex)) {
      logger.warn({
        category: 'phase',
        action: 'validator_override',
        message: `Overriding validator for phase ${phaseIndex}`,
        details: { phaseIndex, phaseName: validator.phaseName },
      });
    }

    this.validators.set(phaseIndex, validator);
  }

  /**
   * Get validator for a specific phase.
   * @throws Error if no validator registered for phase
   */
  getValidator(phaseIndex: number): PhaseValidator {
    const validator = this.validators.get(phaseIndex);

    if (!validator) {
      const error = new Error(`No validator registered for phase ${phaseIndex}`);
      logger.error({
        category: 'phase',
        action: 'validator_not_found',
        message: error.message,
        details: { phaseIndex },
      });
      throw error;
    }

    return validator;
  }

  /**
   * Check if validator exists for phase.
   */
  hasValidator(phaseIndex: number): boolean {
    return this.validators.has(phaseIndex);
  }

  /**
   * Get all registered phase indexes.
   */
  getRegisteredPhases(): number[] {
    return Array.from(this.validators.keys()).sort();
  }

  /**
   * Get count of registered validators.
   */
  getValidatorCount(): number {
    return this.validators.size;
  }
}

// Singleton instance
let registryInstance: ValidatorRegistry | null = null;

/**
 * Get the singleton validator registry instance.
 */
export function getValidatorRegistry(): ValidatorRegistry {
  if (!registryInstance) {
    registryInstance = new ValidatorRegistry();
  }
  return registryInstance;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetValidatorRegistry(): void {
  registryInstance = null;
}
