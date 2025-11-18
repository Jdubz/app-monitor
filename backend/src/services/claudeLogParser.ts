/**
 * Claude Code Log Parser
 *
 * @deprecated This parser has been consolidated into unifiedLogParser.ts
 * Use unifiedLogParser.parseLog() instead with agentType: 'claude'
 *
 * This file is kept for reference only and will be removed in a future version.
 * All functionality has been migrated to the unified parser which supports
 * both Claude and Codex agents with a consistent interface.
 *
 * Migration guide:
 * ```typescript
 * // OLD:
 * import { parseClaudeLog } from './claudeLogParser.js';
 * const summary = await parseClaudeLog(logPath);
 *
 * // NEW:
 * import { parseLog } from './unifiedLogParser.js';
 * const summary = await parseLog(logPath, 'claude');
 * ```
 *
 * @see unifiedLogParser.ts for the current implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { daysAgo } from '../constants/timeouts.js';

export interface ClaudeUsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  totalInputTokens: number; // input + cache_creation (new tokens)
  totalOutputTokens: number;
  serviceTier: string;
}

export interface ClaudeLogEntry {
  sessionId: string;
  timestamp: string;
  model: string;
  usage: ClaudeUsageData;
  requestId: string;
  gitBranch?: string;
  cwd?: string;
  uuid: string;
  parentUuid?: string;
}

export interface ClaudeUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalNewTokens: number; // Only tokens that incur cost
  requestCount: number;
  sessionCount: number;
  modelBreakdown: Record<string, {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  }>;
  estimatedCost: number;
  dateRange: {
    start: string;
    end: string;
  };
}

// Claude pricing per 1M tokens (as of Oct 2025)
interface ClaudePricingTier {
  input: number;
  output: number;
}

const DEFAULT_PRICING: ClaudePricingTier = { input: 3.0, output: 15.0 };

const CLAUDE_PRICING = new Map<string, ClaudePricingTier>([
  ['claude-sonnet-4-5-20250929', { input: 3.0, output: 15.0 }],
  ['claude-3-5-sonnet-20241022', { input: 3.0, output: 15.0 }],
  ['claude-3-5-haiku-20241022', { input: 0.8, output: 4.0 }],
  ['claude-3-opus-20240229', { input: 15.0, output: 75.0 }],
]);

const getPricingForModel = (model: string): ClaudePricingTier => {
  return CLAUDE_PRICING.get(model) ?? DEFAULT_PRICING;
};

/**
 * @deprecated Use UnifiedLogParser instead. This class will be removed in a future version.
 * @see unifiedLogParser.ts for the current implementation
 */
export class ClaudeLogParser {
  /**
   * Parse a single JSONL log file and extract usage entries
   */
  async parseLogFile(filePath: string): Promise<ClaudeLogEntry[]> {
    const entries: ClaudeLogEntry[] = [];

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);

        // Only process assistant messages with usage data
        if (json.type === 'assistant' && json.message?.usage) {
          const usage = json.message.usage;

          const entry: ClaudeLogEntry = {
            sessionId: json.sessionId,
            timestamp: json.timestamp,
            model: json.message.model || 'unknown',
            requestId: json.requestId || '',
            gitBranch: json.gitBranch,
            cwd: json.cwd,
            uuid: json.uuid,
            parentUuid: json.parentUuid,
            usage: {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheReadTokens: usage.cache_read_input_tokens || 0,
              cacheCreationTokens: usage.cache_creation_input_tokens || 0,
              cacheCreation5m: usage.cache_creation?.ephemeral_5m_input_tokens || 0,
              cacheCreation1h: usage.cache_creation?.ephemeral_1h_input_tokens || 0,
              totalInputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
              totalOutputTokens: usage.output_tokens || 0,
              serviceTier: usage.service_tier || 'standard'
            }
          };

          entries.push(entry);
        }
      } catch (error) {
        // Skip invalid JSON lines
        console.warn(`Failed to parse line in ${filePath}:`, error);
      }
    }

    return entries;
  }

  /**
   * Find all Claude log files for a specific project
   */
  async findProjectLogs(projectPath: string): Promise<string[]> {
    const claudeDir = path.join(process.env.HOME || '', '.claude', 'projects');

    // Convert project path to Claude's directory naming format
    // e.g., /home/user/project -> -home-user-project
    const projectDirName = projectPath.replace(/\//g, '-');
    const projectLogsDir = path.join(claudeDir, projectDirName);

    if (!fs.existsSync(projectLogsDir)) {
      return [];
    }

    const files = fs.readdirSync(projectLogsDir);
    return files
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(projectLogsDir, f));
  }

  /**
   * Parse all logs for a project and generate usage summary
   */
  async parseProjectUsage(
    projectPath: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      sessionId?: string;
    }
  ): Promise<ClaudeUsageSummary> {
    const logFiles = await this.findProjectLogs(projectPath);

    let allEntries: ClaudeLogEntry[] = [];
    for (const logFile of logFiles) {
      const entries = await this.parseLogFile(logFile);
      allEntries.push(...entries);
    }

    // Filter by options
    if (options?.startDate) {
      allEntries = allEntries.filter(e => new Date(e.timestamp) >= options.startDate!);
    }
    if (options?.endDate) {
      allEntries = allEntries.filter(e => new Date(e.timestamp) <= options.endDate!);
    }
    if (options?.sessionId) {
      allEntries = allEntries.filter(e => e.sessionId === options.sessionId);
    }

    // Calculate summary
    const summary: ClaudeUsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalNewTokens: 0,
      requestCount: allEntries.length,
      sessionCount: new Set(allEntries.map(e => e.sessionId)).size,
      modelBreakdown: {},
      estimatedCost: 0,
      dateRange: {
        start: allEntries.length > 0 ? allEntries[0].timestamp : '',
        end: allEntries.length > 0 ? allEntries[allEntries.length - 1].timestamp : ''
      }
    };

    for (const entry of allEntries) {
      // Aggregate totals
      summary.totalInputTokens += entry.usage.inputTokens;
      summary.totalOutputTokens += entry.usage.outputTokens;
      summary.totalCacheReadTokens += entry.usage.cacheReadTokens;
      summary.totalCacheCreationTokens += entry.usage.cacheCreationTokens;
      summary.totalNewTokens += entry.usage.totalInputTokens; // input + cache_creation

      // Model breakdown
      if (!summary.modelBreakdown[entry.model]) {
        summary.modelBreakdown[entry.model] = {
          inputTokens: 0,
          outputTokens: 0,
          requestCount: 0
        };
      }
      summary.modelBreakdown[entry.model].inputTokens += entry.usage.totalInputTokens;
      summary.modelBreakdown[entry.model].outputTokens += entry.usage.totalOutputTokens;
      summary.modelBreakdown[entry.model].requestCount += 1;

      // Calculate cost
      const pricing = getPricingForModel(entry.model);
      const inputCost = (entry.usage.totalInputTokens / 1_000_000) * pricing.input;
      const outputCost = (entry.usage.totalOutputTokens / 1_000_000) * pricing.output;
      summary.estimatedCost += inputCost + outputCost;
    }

    return summary;
  }

  /**
   * Get usage for the current billing period (month)
   */
  async getCurrentMonthUsage(projectPath: string): Promise<ClaudeUsageSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.parseProjectUsage(projectPath, {
      startDate: startOfMonth,
      endDate: now
    });
  }

  /**
   * Get usage for today
   */
  async getTodayUsage(projectPath: string): Promise<ClaudeUsageSummary> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return this.parseProjectUsage(projectPath, {
      startDate: startOfDay,
      endDate: now
    });
  }

  /**
   * Get usage for the past N days
   */
  async getRecentUsage(projectPath: string, days: number): Promise<ClaudeUsageSummary> {
    const now = new Date();
    const startDate = daysAgo(days);

    return this.parseProjectUsage(projectPath, {
      startDate,
      endDate: now
    });
  }

  /**
   * Format usage summary as human-readable string
   */
  formatSummary(summary: ClaudeUsageSummary): string {
    const lines = [
      '=== Claude Usage Summary ===',
      '',
      `Period: ${summary.dateRange.start} to ${summary.dateRange.end}`,
      `Total Requests: ${summary.requestCount.toLocaleString()}`,
      `Unique Sessions: ${summary.sessionCount}`,
      '',
      '--- Token Usage ---',
      `Input Tokens: ${summary.totalInputTokens.toLocaleString()}`,
      `Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`,
      `Cache Read (Free): ${summary.totalCacheReadTokens.toLocaleString()}`,
      `Cache Creation: ${summary.totalCacheCreationTokens.toLocaleString()}`,
      `New Tokens (Billed): ${summary.totalNewTokens.toLocaleString()}`,
      '',
      '--- Cost Estimate ---',
      `Total: $${summary.estimatedCost.toFixed(2)}`,
      '',
      '--- Model Breakdown ---'
    ];

    for (const [model, stats] of Object.entries(summary.modelBreakdown)) {
      const pricing = getPricingForModel(model);
      const cost = (stats.inputTokens / 1_000_000) * pricing.input +
                   (stats.outputTokens / 1_000_000) * pricing.output;

      lines.push(`${model}:`);
      lines.push(`  Requests: ${stats.requestCount}`);
      lines.push(`  Input: ${stats.inputTokens.toLocaleString()} tokens`);
      lines.push(`  Output: ${stats.outputTokens.toLocaleString()} tokens`);
      lines.push(`  Cost: $${cost.toFixed(2)}`);
    }

    return lines.join('\n');
  }
}

// Singleton instance
export const claudeLogParser = new ClaudeLogParser();
