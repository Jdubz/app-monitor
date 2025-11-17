/**
 * Centralized constants for the 7-phase task processing system
 */

export const PHASE_NAMES = [
  'Planning',
  'Implementation',
  'Review',
  'Fixes',
  'Test Coverage & Validation',
  'Cleanup & Docs',
  'PR Shepherding',
] as const;

export const MAX_PHASE_ATTEMPTS = 4;

export type PhaseName = (typeof PHASE_NAMES)[number];

/**
 * Get phase name by index (1-based)
 */
export function getPhaseNameByIndex(phaseIndex: number): PhaseName {
  if (phaseIndex < 1 || phaseIndex > PHASE_NAMES.length) {
    throw new Error(`Invalid phase index: ${phaseIndex}. Must be between 1 and ${PHASE_NAMES.length}`);
  }
  return PHASE_NAMES[phaseIndex - 1];
}

/**
 * Get phase index by name (returns 1-based index)
 */
export function getPhaseIndexByName(phaseName: string): number {
  const index = PHASE_NAMES.indexOf(phaseName as PhaseName);
  if (index === -1) {
    throw new Error(`Invalid phase name: ${phaseName}`);
  }
  return index + 1;
}
