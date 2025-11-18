/**
 * Codex CLI Log Parser
 *
 * @deprecated This parser has been consolidated into unifiedLogParser.ts
 * Use unifiedLogParser.parseLog() instead with agentType: 'codex'
 *
 * This file is kept for reference only and will be removed in a future version.
 * All functionality has been migrated to the unified parser which supports
 * both Claude and Codex agents with a consistent interface.
 *
 * Migration guide:
 * ```typescript
 * // OLD:
 * import { parseCodexLog } from './codexLogParser.js';
 * const summary = await parseCodexLog(logPath);
 *
 * // NEW:
 * import { parseLog } from './unifiedLogParser.js';
 * const summary = await parseLog(logPath, 'codex');
 * ```
 *
 * @see unifiedLogParser.ts for the current implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { daysAgo } from '../constants/timeouts.js';

export interface CodexSessionMeta {
  sessionId: string;
  startTime: string;
  project?: string;
  // Additional fields can be added as discovered
}

export interface CodexUsageEstimate {
  sessionCount: number;
  estimatedRequests: number;
  dateRange: {
    start: string;
    end: string;
  };
  note: string;
}

/**
 * @deprecated Use UnifiedLogParser instead. This class will be removed in a future version.
 * @see unifiedLogParser.ts for the current implementation
 */
export class CodexLogParser {
  private readonly codexDir = path.join(process.env.HOME || '', '.codex');

  /**
   * Find all Codex session directories
   */
  async findSessionDirs(): Promise<string[]> {
    const sessionsDir = path.join(this.codexDir, 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const dirs: string[] = [];

    // Recursively find all .jsonl files in sessions directory
    const walk = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          walk(filePath);
        } else if (file.endsWith('.jsonl')) {
          dirs.push(filePath);
        }
      }
    };

    walk(sessionsDir);
    return dirs;
  }

  /**
   * Parse a Codex session log file
   *
   * Currently extracts minimal metadata. Update when usage data becomes available.
   */
  async parseSessionLog(filePath: string): Promise<CodexSessionMeta | null> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let sessionMeta: CodexSessionMeta | null = null;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);

        // Extract session metadata
        if (json.type === 'session_meta') {
          sessionMeta = {
            sessionId: json.payload?.session_id || path.basename(filePath, '.jsonl'),
            startTime: json.timestamp || '',
            project: json.payload?.project
          };
          break; // Session meta is typically first line
        }
      } catch (error) {
        logger.warn({
          category: 'codex-log-parser',
          action: 'parse_line_failed',
          message: `Failed to parse line in ${filePath}`,
          details: { filePath, error }
        });
      }
    }

    return sessionMeta;
  }

  /**
   * Get basic session count and date range
   *
   * This provides minimal tracking until detailed usage data is available.
   */
  async getUsageEstimate(
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<CodexUsageEstimate> {
    const sessionFiles = await this.findSessionDirs();

    const sessions: CodexSessionMeta[] = [];
    for (const file of sessionFiles) {
      const meta = await this.parseSessionLog(file);
      if (meta) {
        sessions.push(meta);
      }
    }

    // Filter by date if provided
    let filteredSessions = sessions;
    if (options?.startDate || options?.endDate) {
      filteredSessions = sessions.filter(s => {
        const sessionDate = new Date(s.startTime);
        if (options.startDate && sessionDate < options.startDate) return false;
        if (options.endDate && sessionDate > options.endDate) return false;
        return true;
      });
    }

    const sortedSessions = filteredSessions.sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return {
      sessionCount: filteredSessions.length,
      estimatedRequests: filteredSessions.length * 10, // Rough estimate: ~10 requests per session
      dateRange: {
        start: sortedSessions[0]?.startTime || '',
        end: sortedSessions[sortedSessions.length - 1]?.startTime || ''
      },
      note: 'Codex logs do not include token usage. Track via response headers during execution.'
    };
  }

  /**
   * Format usage estimate as human-readable string
   */
  formatEstimate(estimate: CodexUsageEstimate): string {
    return [
      '=== Codex Usage Estimate ===',
      '',
      `⚠️  ${estimate.note}`,
      '',
      `Period: ${estimate.dateRange.start} to ${estimate.dateRange.end}`,
      `Sessions: ${estimate.sessionCount}`,
      `Estimated Requests: ${estimate.estimatedRequests} (rough estimate)`,
      '',
      '💡 For accurate usage tracking:',
      '  1. Parse response headers during API calls',
      '  2. Record usage in database after each execution',
      '  3. Query OpenAI dashboard: https://platform.openai.com/usage'
    ].join('\n');
  }

  /**
   * Get recent session activity
   */
  async getRecentActivity(days: number): Promise<CodexUsageEstimate> {
    const now = new Date();
    const startDate = daysAgo(days);

    return this.getUsageEstimate({ startDate, endDate: now });
  }
}

// Singleton instance
export const codexLogParser = new CodexLogParser();
