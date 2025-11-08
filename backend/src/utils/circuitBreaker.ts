/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by stopping execution attempts after
 * repeated failures. Automatically retries after a timeout period.
 */

import { logger } from './logger.js';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  name: string;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure >= this.config.resetTimeout) {
        logger.info({
          category: 'circuit-breaker',
          action: 'state_transition',
          message: `Circuit breaker '${this.config.name}' transitioning from OPEN to HALF-OPEN`,
          details: {
            name: this.config.name,
            previousState: 'open',
            newState: 'half-open',
            timeSinceLastFailure: timeSinceLastFailure,
            resetTimeout: this.config.resetTimeout
          }
        });
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        const error = new Error(
          `Circuit breaker '${this.config.name}' is OPEN. ` +
          `Will retry in ${Math.ceil((this.config.resetTimeout - timeSinceLastFailure) / 1000)}s`
        );
        logger.warn({
          category: 'circuit-breaker',
          action: 'operation_rejected',
          message: `Circuit breaker '${this.config.name}' rejected operation (OPEN state)`,
          details: {
            name: this.config.name,
            state: 'open',
            failureCount: this.failureCount,
            timeSinceLastFailure: timeSinceLastFailure,
            retryInMs: this.config.resetTimeout - timeSinceLastFailure
          }
        });
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === 'half-open') {
      // In half-open state, a single success closes the circuit
      logger.info({
        category: 'circuit-breaker',
        action: 'state_transition',
        message: `Circuit breaker '${this.config.name}' transitioning from HALF-OPEN to CLOSED`,
        details: {
          name: this.config.name,
          previousState: 'half-open',
          newState: 'closed',
          previousFailureCount: this.failureCount
        }
      });
      this.state = 'closed';
      this.failureCount = 0;
      this.successCount = 0;
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      if (this.failureCount > 0) {
        logger.debug({
          category: 'circuit-breaker',
          action: 'failure_count_reset',
          message: `Circuit breaker '${this.config.name}' reset failure count after success`,
          details: {
            name: this.config.name,
            previousFailureCount: this.failureCount
          }
        });
        this.failureCount = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // In half-open state, a single failure reopens the circuit
      logger.error({
        category: 'circuit-breaker',
        action: 'state_transition',
        message: `Circuit breaker '${this.config.name}' transitioning from HALF-OPEN to OPEN`,
        details: {
          name: this.config.name,
          previousState: 'half-open',
          newState: 'open',
          failureCount: this.failureCount,
          resetTimeoutMs: this.config.resetTimeout
        }
      });
      this.state = 'open';
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      // In closed state, open circuit after threshold failures
      logger.error({
        category: 'circuit-breaker',
        action: 'state_transition',
        message: `Circuit breaker '${this.config.name}' transitioning from CLOSED to OPEN`,
        details: {
          name: this.config.name,
          previousState: 'closed',
          newState: 'open',
          failureCount: this.failureCount,
          failureThreshold: this.config.failureThreshold,
          resetTimeoutMs: this.config.resetTimeout
        }
      });
      this.state = 'open';
    } else {
      logger.warn({
        category: 'circuit-breaker',
        action: 'failure_recorded',
        message: `Circuit breaker '${this.config.name}' recorded failure`,
        details: {
          name: this.config.name,
          state: this.state,
          failureCount: this.failureCount,
          failureThreshold: this.config.failureThreshold,
          remaining: this.config.failureThreshold - this.failureCount
        }
      });
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    name: string;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      name: this.config.name
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    const previousState = this.state;
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;

    logger.info({
      category: 'circuit-breaker',
      action: 'manual_reset',
      message: `Circuit breaker '${this.config.name}' manually reset`,
      details: {
        name: this.config.name,
        previousState,
        newState: 'closed'
      }
    });
  }
}
