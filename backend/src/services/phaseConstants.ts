/**
 * Phase System Constants
 *
 * Centralized constants for the 7-phase task processing system.
 * These constants are used across the phase orchestration, validation,
 * execution, and observability layers.
 */

/**
 * Maximum number of attempts allowed per phase before blocking.
 * Tasks will be blocked if they reach this limit without successful validation.
 */
export const MAX_PHASE_ATTEMPTS = 4;

/**
 * Phase names mapped by phase index.
 * These are the canonical names used throughout the system for logging,
 * metrics, UI display, and documentation.
 */
export const PHASE_NAMES: Record<number, string> = {
  1: 'Planning',
  2: 'Implementation',
  3: 'Review',
  4: 'Fixes',
  5: 'Test Coverage & Validation',
  6: 'Cleanup & Docs',
  7: 'PR Shepherding',
};

/**
 * Get the name of a phase by its index.
 * @param phaseIndex The 1-based phase index (1-7)
 * @returns The phase name, or 'Unknown Phase' if index is invalid
 */
export function getPhaseNameByIndex(phaseIndex: number): string {
  return PHASE_NAMES[phaseIndex] || 'Unknown Phase';
}

/**
 * Valid phase indices (1-7)
 */
export const VALID_PHASE_INDICES = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Phase status values
 */
export type PhaseStatus = 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'blocked';

/**
 * All valid phase status values
 */
export const PHASE_STATUSES: PhaseStatus[] = ['ready', 'running', 'validating', 'recovering', 'complete', 'blocked'];
