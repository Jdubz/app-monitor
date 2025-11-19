/**
 * Risk Assessment Utilities
 *
 * Centralized logic for assessing task risk levels based on:
 * - File paths (docker, migrations, auth, etc.)
 * - Task complexity
 * - Content patterns (from schemas.ts)
 */

import { logger } from './logger.js';

// File-based risk patterns (path matching)
interface FileRiskPattern {
  pattern: RegExp;
  level: 'minimal' | 'low' | 'medium' | 'high';
}

const FILE_RISK_PATTERNS: FileRiskPattern[] = [
  { pattern: /docker\//i, level: 'high' },
  { pattern: /migrations?\//, level: 'high' },
  { pattern: /\.env|secrets|credentials|keys/i, level: 'high' },
  { pattern: /scripts\/deploy|scripts\/production/i, level: 'high' },
  { pattern: /backend\/src\/services\//i, level: 'medium' },
  { pattern: /backend\/src\/routes\//i, level: 'medium' },
  { pattern: /database|sql|schema/i, level: 'medium' },
  { pattern: /config\//i, level: 'medium' },
  { pattern: /frontend\/src\/components\//i, level: 'low' },
  { pattern: /frontend\/src\/services\//i, level: 'low' },
  { pattern: /tests?\//i, level: 'low' },
  { pattern: /\.test\.|\.spec\./i, level: 'low' },
  { pattern: /docs?\//i, level: 'minimal' },
  { pattern: /readme|contributing|changelog/i, level: 'minimal' },
];

/**
 * Infer risk level from file paths using pattern matching
 * Returns highest risk level found across all files
 */
export function inferRiskLevelFromFiles(files: string[]): 'minimal' | 'low' | 'medium' | 'high' {
  if (files.length === 0) return 'low';

  const riskScores = { minimal: 0, low: 0, medium: 0, high: 0 };

  for (const file of files) {
    const match = FILE_RISK_PATTERNS.find(p => p.pattern.test(file));
    if (match) {
      riskScores[match.level]++;
    } else {
      riskScores.low++;  // Default to low if no pattern matches
    }
  }

  logger.debug({
    category: 'context',
    action: 'infer_risk_from_files',
    message: 'Inferred risk level from file patterns',
    details: {
      filesCount: files.length,
      riskScores,
      note: 'Uses FILE_RISK_PATTERNS for path-based detection'
    }
  });

  // Return highest risk level with non-zero count
  if (riskScores.high > 0) return 'high';
  if (riskScores.medium > 0) return 'medium';
  if (riskScores.low > 0) return 'low';
  return 'minimal';
}

/**
 * Determine risk level considering both files and task complexity
 * Used for full task creation where we have complexity information
 */
export function determineRiskLevel(
  files: string[],
  complexity: 'simple' | 'medium' | 'complex' | 'expert' = 'simple'
): 'minimal' | 'low' | 'medium' | 'high' {
  // Start with file-based risk assessment
  const fileRisk = inferRiskLevelFromFiles(files);

  // If complexity is high, upgrade risk level
  if (complexity === 'expert') {
    // Expert complexity always increases risk
    if (fileRisk === 'minimal') return 'low';
    if (fileRisk === 'low') return 'medium';
    if (fileRisk === 'medium') return 'high';
    return 'high';
  }

  if (complexity === 'complex') {
    // Complex increases risk by one level
    if (fileRisk === 'minimal') return 'low';
    if (fileRisk === 'low') return 'medium';
    return fileRisk;  // medium stays medium, high stays high
  }

  // For simple/medium complexity, use file-based risk as-is
  return fileRisk;
}

/**
 * Export FILE_RISK_PATTERNS for reference
 */
export { FILE_RISK_PATTERNS };
