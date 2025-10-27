#!/usr/bin/env tsx
/**
 * Query Claude Code usage from local logs
 *
 * Usage:
 *   npx tsx scripts/check-claude-usage.ts
 *   npx tsx scripts/check-claude-usage.ts --days 7
 *   npx tsx scripts/check-claude-usage.ts --month
 *   npx tsx scripts/check-claude-usage.ts --today
 */

import { claudeLogParser } from '../src/services/claudeLogParser';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const projectPath = path.resolve(__dirname, '../../..');

  console.log(`\n📊 Analyzing Claude Code usage for: ${projectPath}\n`);

  try {
    let summary;

    if (args.includes('--today')) {
      console.log('📅 Fetching today\'s usage...\n');
      summary = await claudeLogParser.getTodayUsage(projectPath);
    } else if (args.includes('--month')) {
      console.log('📅 Fetching current month\'s usage...\n');
      summary = await claudeLogParser.getCurrentMonthUsage(projectPath);
    } else {
      const daysIndex = args.indexOf('--days');
      const days = daysIndex >= 0 && args[daysIndex + 1] ? parseInt(args[daysIndex + 1]) : 7;
      console.log(`📅 Fetching last ${days} days of usage...\n`);
      summary = await claudeLogParser.getRecentUsage(projectPath, days);
    }

    console.log(claudeLogParser.formatSummary(summary));

    // Additional insights
    console.log('\n\n--- Efficiency Metrics ---');
    const avgInputPerRequest = summary.requestCount > 0
      ? Math.round(summary.totalInputTokens / summary.requestCount)
      : 0;
    const avgOutputPerRequest = summary.requestCount > 0
      ? Math.round(summary.totalOutputTokens / summary.requestCount)
      : 0;
    const cacheHitRate = summary.totalInputTokens > 0
      ? ((summary.totalCacheReadTokens / (summary.totalInputTokens + summary.totalCacheReadTokens)) * 100).toFixed(1)
      : '0.0';

    console.log(`Average Input Tokens/Request: ${avgInputPerRequest.toLocaleString()}`);
    console.log(`Average Output Tokens/Request: ${avgOutputPerRequest.toLocaleString()}`);
    console.log(`Cache Hit Rate: ${cacheHitRate}%`);
    console.log(`Cache Savings: ${summary.totalCacheReadTokens.toLocaleString()} tokens (free)`);

    if (summary.estimatedCost > 0) {
      console.log('\n--- Cost Projections ---');
      const costPerRequest = summary.estimatedCost / summary.requestCount;
      console.log(`Cost per Request: $${costPerRequest.toFixed(4)}`);

      // Project monthly cost based on recent usage
      const daysInSummary = args.includes('--today') ? 1 : args.includes('--month') ? 30 : 7;
      const dailyAverage = summary.estimatedCost / daysInSummary;
      const monthlyProjection = dailyAverage * 30;

      console.log(`Daily Average: $${dailyAverage.toFixed(2)}`);
      console.log(`Monthly Projection: $${monthlyProjection.toFixed(2)}`);
    }

    console.log('\n✅ Analysis complete!\n');

  } catch (error) {
    console.error('❌ Error analyzing Claude usage:', error);
    process.exit(1);
  }
}

main();
