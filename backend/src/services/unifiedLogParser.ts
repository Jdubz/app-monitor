/**
 * Unified Log Parser
 *
 * Consolidates ClaudeLogParser and CodexLogParser into a single service
 * with agent-specific parsing strategies. Eliminates code duplication
 * and provides a consistent interface for both agent types.
 *
 * This parser replaces:
 * - claudeLogParser.ts (deprecated)
 * - codexLogParser.ts (deprecated)
 *
 * Benefits of unification:
 * - Single interface for all agent types
 * - Shared pricing and cost calculation logic
 * - Consistent log entry format
 * - Easier to add new agent types
 * - Reduced code duplication
 *
 * Usage:
 * ```typescript
 * import { parseLog, parseLogFile } from './unifiedLogParser.js';
 *
 * // Parse entire log file
 * const summary = await parseLog('/path/to/log.jsonl', 'claude');
 *
 * // Parse single log file
 * const entry = await parseLogFile('/path/to/log.json', 'codex');
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Common Types
// ============================================================================

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  serviceTier?: string;
}

export interface LogEntry {
  sessionId: string;
  timestamp: string;
  model: string;
  usage: UsageData;
  requestId: string;
  agentType: 'claude' | 'codex';
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalNewTokens: number;
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
  agentType: 'claude' | 'codex';
}

// ============================================================================
// Pricing Configuration
// ============================================================================

interface PricingTier {
  input: number;  // Per 1M tokens
  output: number; // Per 1M tokens
}

const CLAUDE_PRICING = new Map<string, PricingTier>([
  ['claude-sonnet-4-5-20250929', { input: 3.0, output: 15.0 }],
  ['claude-3-5-sonnet-20241022', { input: 3.0, output: 15.0 }],
  ['claude-3-5-haiku-20241022', { input: 0.8, output: 4.0 }],
  ['claude-3-opus-20240229', { input: 15.0, output: 75.0 }],
]);

const CODEX_PRICING = new Map<string, PricingTier>([
  // OpenAI GPT-4 pricing (Codex uses OpenAI models)
  ['gpt-4-turbo', { input: 10.0, output: 30.0 }],
  ['gpt-4', { input: 30.0, output: 60.0 }],
  ['gpt-3.5-turbo', { input: 0.5, output: 1.5 }],
]);

const DEFAULT_PRICING: PricingTier = { input: 3.0, output: 15.0 };

// ============================================================================
// Unified Log Parser
// ============================================================================

export class UnifiedLogParser {
  private readonly homeDir: string;

  constructor() {
    this.homeDir = process.env.HOME || process.env.USERPROFILE || '';
  }

  /**
   * Get pricing for a specific model
   */
  private getPricingForModel(model: string, agentType: 'claude' | 'codex'): PricingTier {
    const pricingMap = agentType === 'claude' ? CLAUDE_PRICING : CODEX_PRICING;
    return pricingMap.get(model) ?? DEFAULT_PRICING;
  }

  /**
   * Calculate cost from usage data
   */
  private calculateCost(usage: UsageData, model: string, agentType: 'claude' | 'codex'): number {
    const pricing = this.getPricingForModel(model, agentType);

    // Input cost: only new tokens (input + cache creation)
    const inputCost = (usage.totalInputTokens / 1_000_000) * pricing.input;

    // Output cost
    const outputCost = (usage.totalOutputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Find log files for a specific agent type
   */
  async findLogFiles(agentType: 'claude' | 'codex'): Promise<string[]> {
    if (agentType === 'claude') {
      return this.findClaudeLogFiles();
    } else {
      return this.findCodexLogFiles();
    }
  }

  /**
   * Find Claude log files
   */
  private async findClaudeLogFiles(): Promise<string[]> {
    const claudeDir = path.join(this.homeDir, '.claude');

    if (!fs.existsSync(claudeDir)) {
      return [];
    }

    const files: string[] = [];
    const entries = fs.readdirSync(claudeDir);

    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        files.push(path.join(claudeDir, entry));
      }
    }

    return files.sort();
  }

  /**
   * Find Codex log files
   */
  private async findCodexLogFiles(): Promise<string[]> {
    const codexDir = path.join(this.homeDir, '.codex', 'sessions');

    if (!fs.existsSync(codexDir)) {
      return [];
    }

    const files: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const filePath = path.join(dir, entry);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          walk(filePath);
        } else if (entry.endsWith('.jsonl')) {
          files.push(filePath);
        }
      }
    };

    walk(codexDir);
    return files.sort();
  }

  /**
   * Parse a log file for a specific agent type
   */
  async parseLogFile(filePath: string, agentType: 'claude' | 'codex'): Promise<LogEntry[]> {
    if (agentType === 'claude') {
      return this.parseClaudeLogFile(filePath);
    } else {
      return this.parseCodexLogFile(filePath);
    }
  }

  /**
   * Parse Claude log file
   */
  private async parseClaudeLogFile(filePath: string): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const data = JSON.parse(line);

        if (data.type === 'api_request' && data.usage) {
          const usage = data.usage;

          entries.push({
            sessionId: data.session_id || 'unknown',
            timestamp: data.timestamp || new Date().toISOString(),
            model: data.model || 'unknown',
            usage: {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheReadTokens: usage.cache_read_input_tokens || 0,
              cacheCreationTokens: usage.cache_creation_input_tokens || 0,
              totalInputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
              totalOutputTokens: usage.output_tokens || 0,
              serviceTier: data.service_tier
            },
            requestId: data.request_id || 'unknown',
            agentType: 'claude',
            metadata: {
              gitBranch: data.git_branch,
              cwd: data.cwd,
              uuid: data.uuid,
              parentUuid: data.parent_uuid
            }
          });
        }
      } catch (error) {
        // Skip invalid lines
      }
    }

    return entries;
  }

  /**
   * Parse Codex log file
   * Note: Codex doesn't provide detailed usage data in logs yet
   */
  private async parseCodexLogFile(filePath: string): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const data = JSON.parse(line);

        // Codex log format varies - adapt as needed
        if (data.type === 'session_start' || data.timestamp) {
          entries.push({
            sessionId: data.session_id || path.basename(filePath, '.jsonl'),
            timestamp: data.timestamp || new Date().toISOString(),
            model: data.model || 'gpt-4-turbo',
            usage: {
              inputTokens: 0, // Not available in logs
              outputTokens: 0,
              totalInputTokens: 0,
              totalOutputTokens: 0
            },
            requestId: data.id || 'unknown',
            agentType: 'codex',
            metadata: data
          });
        }
      } catch (error) {
        // Skip invalid lines
      }
    }

    return entries;
  }

  /**
   * Generate usage summary from log entries
   */
  generateSummary(entries: LogEntry[], agentType: 'claude' | 'codex'): UsageSummary {
    const summary: UsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalNewTokens: 0,
      requestCount: entries.length,
      sessionCount: new Set(entries.map(e => e.sessionId)).size,
      modelBreakdown: {},
      estimatedCost: 0,
      dateRange: {
        start: '',
        end: ''
      },
      agentType
    };

    if (entries.length === 0) {
      return summary;
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    summary.dateRange.start = entries[0].timestamp;
    summary.dateRange.end = entries[entries.length - 1].timestamp;

    // Aggregate usage
    for (const entry of entries) {
      const { usage, model } = entry;

      summary.totalInputTokens += usage.inputTokens;
      summary.totalOutputTokens += usage.outputTokens;
      summary.totalCacheReadTokens += usage.cacheReadTokens || 0;
      summary.totalCacheCreationTokens += usage.cacheCreationTokens || 0;
      summary.totalNewTokens += usage.totalInputTokens;

      // Model breakdown
      if (!summary.modelBreakdown[model]) {
        summary.modelBreakdown[model] = {
          inputTokens: 0,
          outputTokens: 0,
          requestCount: 0
        };
      }
      summary.modelBreakdown[model].inputTokens += usage.inputTokens;
      summary.modelBreakdown[model].outputTokens += usage.outputTokens;
      summary.modelBreakdown[model].requestCount++;

      // Add to cost
      summary.estimatedCost += this.calculateCost(usage, model, agentType);
    }

    return summary;
  }

  /**
   * Get usage summary for an agent type within a date range
   */
  async getUsageSummary(
    agentType: 'claude' | 'codex',
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageSummary> {
    const logFiles = await this.findLogFiles(agentType);
    const allEntries: LogEntry[] = [];

    for (const file of logFiles) {
      const entries = await this.parseLogFile(file, agentType);
      allEntries.push(...entries);
    }

    // Filter by date range if provided
    let filteredEntries = allEntries;
    if (startDate || endDate) {
      filteredEntries = allEntries.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }

    return this.generateSummary(filteredEntries, agentType);
  }
}
