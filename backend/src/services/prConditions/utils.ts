/**
 * Shared utilities for PR condition evaluation
 */

import * as crypto from 'crypto';

/**
 * Generate fingerprint from list of items
 */
export function generateFingerprintFromList(items: string[]): string {
  if (items.length === 0) {
    return 'empty';
  }

  const content = items.join('|');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Generate simple fingerprint from string
 */
export function generateFingerprint(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}
