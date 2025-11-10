import crypto from 'crypto';
import { DevBotsDatabase } from './database.js';
import { logger } from '../utils/logger.js';

export interface ReviewComment {
  id?: number;
  pr_number: number;
  comment_id: number;
  file_path?: string;
  line_number?: number;
  body: string;
  fingerprint: string;
  severity: 'blocking' | 'suggestion' | 'info' | 'nitpick';
  category?: string;
  resolved: boolean;
  created_at: number;
  resolved_at?: number;
  reviewer?: string;
  is_copilot: boolean;
}

export interface ResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  blocking: number;
  unresolvedBlocking: number;
}

/**
 * Service for tracking and managing PR review comments
 * Uses fingerprinting to detect comment resolution across PR updates
 */
export class ReviewCommentTracker {
  constructor(private db: DevBotsDatabase) {}

  /**
   * Generate a fingerprint for a comment (SHA-256 of file:line:body)
   * Used for detecting when comments are resolved across PR updates
   */
  generateFingerprint(filePath: string | undefined, lineNumber: number | undefined, body: string): string {
    const content = `${filePath || 'general'}:${lineNumber || 0}:${body.trim()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Classify comment severity based on content patterns
   */
  classifySeverity(body: string): 'blocking' | 'suggestion' | 'info' | 'nitpick' {
    const lowerBody = body.toLowerCase();

    // Explicit severity tags
    if (lowerBody.includes('**critical bug:**') || lowerBody.includes('**security concern:**')) {
      return 'blocking';
    }
    if (lowerBody.includes('[nitpick]') || lowerBody.includes('[nit]')) {
      return 'nitpick';
    }
    if (lowerBody.includes('[blocking]') || lowerBody.includes('**must fix**')) {
      return 'blocking';
    }

    // Keyword-based fallback
    const blockingKeywords = ['critical', 'must fix', 'security', 'vulnerability', 'bug', 'error', 'broken'];
    const suggestionKeywords = ['suggest', 'consider', 'recommend', 'could', 'might want to'];

    const hasBlocking = blockingKeywords.some(kw => lowerBody.includes(kw));
    const hasSuggestion = suggestionKeywords.some(kw => lowerBody.includes(kw));

    if (hasBlocking) return 'blocking';
    if (hasSuggestion) return 'suggestion';

    return 'info';
  }

  /**
   * Extract comment category (security, performance, testing, etc.)
   */
  extractCategory(body: string): string | undefined {
    const lowerBody = body.toLowerCase();

    if (lowerBody.includes('security') || lowerBody.includes('vulnerability') || lowerBody.includes('xss') || lowerBody.includes('injection')) {
      return 'security';
    }
    if (lowerBody.includes('performance') || lowerBody.includes('optimization') || lowerBody.includes('slow')) {
      return 'performance';
    }
    if (lowerBody.includes('test') || lowerBody.includes('coverage')) {
      return 'testing';
    }
    if (lowerBody.includes('style') || lowerBody.includes('formatting') || lowerBody.includes('lint')) {
      return 'style';
    }
    if (lowerBody.includes('documentation') || lowerBody.includes('comment') || lowerBody.includes('docs')) {
      return 'documentation';
    }
    if (lowerBody.includes('correctness') || lowerBody.includes('bug') || lowerBody.includes('error')) {
      return 'correctness';
    }

    return undefined;
  }

  /**
   * Store a review comment
   */
  storeComment(comment: Omit<ReviewComment, 'id' | 'resolved' | 'resolved_at'>): ReviewComment | null {
    try {
      const fingerprint = this.generateFingerprint(comment.file_path, comment.line_number, comment.body);
      const severity = this.classifySeverity(comment.body);
      const category = this.extractCategory(comment.body);

      const result = this.db.getConnection().prepare(`
        INSERT INTO pr_review_comments
        (pr_number, comment_id, file_path, line_number, body, fingerprint, severity, category, resolved, created_at, reviewer, is_copilot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        comment.pr_number,
        comment.comment_id,
        comment.file_path || null,
        comment.line_number || null,
        comment.body,
        fingerprint,
        severity,
        category || null,
        comment.created_at,
        comment.reviewer || null,
        comment.is_copilot ? 1 : 0
      );

      return {
        ...comment,
        id: result.lastInsertRowid as number,
        fingerprint,
        severity,
        category,
        resolved: false,
        resolved_at: undefined
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        logger.debug({
          category: 'pr-workflow',
          action: 'duplicate_comment',
          message: 'Comment already stored (duplicate fingerprint)',
          details: { pr_number: comment.pr_number, comment_id: comment.comment_id }
        });
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark a comment as resolved by fingerprint
   */
  markResolved(fingerprint: string): boolean {
    const result = this.db.getConnection().prepare(`
      UPDATE pr_review_comments
      SET resolved = 1, resolved_at = ?
      WHERE fingerprint = ? AND resolved = 0
    `).run(Date.now(), fingerprint);

    return result.changes > 0;
  }

  /**
   * Get all comments for a PR
   */
  getCommentsForPR(prNumber: number, includeResolved: boolean = true): ReviewComment[] {
    const query = includeResolved
      ? `SELECT * FROM pr_review_comments WHERE pr_number = ? ORDER BY created_at DESC`
      : `SELECT * FROM pr_review_comments WHERE pr_number = ? AND resolved = 0 ORDER BY created_at DESC`;

    const rows = this.db.getConnection().prepare(query).all(prNumber) as any[];

    return rows.map(c => ({
      id: c.id,
      pr_number: c.pr_number,
      comment_id: c.comment_id,
      file_path: c.file_path,
      line_number: c.line_number,
      body: c.body,
      fingerprint: c.fingerprint,
      severity: c.severity,
      category: c.category,
      resolved: Boolean(c.resolved),
      created_at: c.created_at,
      resolved_at: c.resolved_at,
      reviewer: c.reviewer,
      is_copilot: Boolean(c.is_copilot)
    }));
  }

  /**
   * Detect resolved comments by comparing current PR state to stored comments
   * Returns fingerprints of newly resolved comments
   */
  detectResolvedComments(prNumber: number, currentCommentIds: number[]): string[] {
    const storedComments = this.getCommentsForPR(prNumber, false);
    const resolvedFingerprints: string[] = [];

    for (const stored of storedComments) {
      // If stored comment ID is not in current comments, it was resolved
      if (!currentCommentIds.includes(stored.comment_id)) {
        if (this.markResolved(stored.fingerprint)) {
          resolvedFingerprints.push(stored.fingerprint);
          logger.info({
            category: 'pr-workflow',
            action: 'comment_resolved',
            message: `Comment ${stored.comment_id} resolved`,
            details: { pr_number: prNumber, fingerprint: stored.fingerprint, severity: stored.severity }
          });
        }
      }
    }

    return resolvedFingerprints;
  }

  /**
   * Get resolution summary for a PR
   */
  getResolutionSummary(prNumber: number): ResolutionSummary {
    const all = this.getCommentsForPR(prNumber, true);
    const resolved = all.filter(c => c.resolved);
    const unresolved = all.filter(c => !c.resolved);
    const blocking = all.filter(c => c.severity === 'blocking');
    const unresolvedBlocking = unresolved.filter(c => c.severity === 'blocking');

    return {
      total: all.length,
      resolved: resolved.length,
      unresolved: unresolved.length,
      blocking: blocking.length,
      unresolvedBlocking: unresolvedBlocking.length
    };
  }

  /**
   * Clear all comments for a PR (useful after merge or PR close)
   */
  clearCommentsForPR(prNumber: number): void {
    this.db.getConnection().prepare(`DELETE FROM pr_review_comments WHERE pr_number = ?`).run(prNumber);
    logger.debug({
      category: 'pr-workflow',
      action: 'comments_cleared',
      message: `Cleared all comments for PR #${prNumber}`,
      details: { pr_number: prNumber }
    });
  }
}
