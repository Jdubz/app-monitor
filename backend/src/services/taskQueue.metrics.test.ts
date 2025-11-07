import { describe, it, expect } from 'vitest';
import {
  summarizeAgentComparisonMetrics,
  type AgentComparisonMetrics,
} from './taskQueue.sqlite.js';

describe('summarizeAgentComparisonMetrics', () => {
  const zeroMetrics: AgentComparisonMetrics = {
    claude: { total: 0, completed: 0, failed: 0, success_rate: 0 },
    codex: { total: 0, completed: 0, failed: 0, success_rate: 0 },
  };

  it('should return zeroed metrics when no stats exist', () => {
    const metrics = summarizeAgentComparisonMetrics([]);
    expect(metrics).toEqual(
      expect.objectContaining({
        claude: expect.objectContaining(zeroMetrics.claude),
        codex: expect.objectContaining(zeroMetrics.codex),
      }),
    );
  });

  it('should compute metrics for a single agent', () => {
    const metrics = summarizeAgentComparisonMetrics([
      { agent_type: 'claude', total: 10, completed: 7, failed: 3, avg_duration_ms: 1200 },
    ]);

    expect(metrics.claude.total).toBe(10);
    expect(metrics.claude.completed).toBe(7);
    expect(metrics.claude.failed).toBe(3);
    expect(metrics.claude.avg_duration_ms).toBe(1200);
    expect(metrics.claude.success_rate).toBeCloseTo(70);

    // Codex should remain at defaults when no data exists
    expect(metrics.codex).toEqual(expect.objectContaining(zeroMetrics.codex));
  });

  it('should compute metrics for both agents with fractional success rates', () => {
    const metrics = summarizeAgentComparisonMetrics([
      { agent_type: 'claude', total: 4, completed: 1, failed: 3, avg_duration_ms: null },
      { agent_type: 'codex', total: 6, completed: 5, failed: 1, avg_duration_ms: 2500 },
    ]);

    expect(metrics.claude.success_rate).toBeCloseTo(25);
    expect(metrics.claude.avg_duration_ms).toBeUndefined();

    expect(metrics.codex.success_rate).toBeCloseTo((5 / 6) * 100);
    expect(metrics.codex.avg_duration_ms).toBe(2500);
  });
});
