import { describe, it, expect } from 'vitest';
import { summarizeAgentComparisonMetrics } from './taskQueue.sqlite.js';

describe('summarizeAgentComparisonMetrics', () => {
  const zeroAgentMetrics = { total: 0, completed: 0, failed: 0, success_rate: 0 };

  it('should return zeroed metrics when no stats exist', () => {
    const metrics = summarizeAgentComparisonMetrics([]);
    expect(metrics).toEqual(
      expect.objectContaining({
        claude: expect.objectContaining(zeroAgentMetrics),
        codex: expect.objectContaining(zeroAgentMetrics),
      }),
    );

    expect(metrics.task_type_breakdown).toEqual(
      expect.objectContaining({
        claude: expect.objectContaining({
          implementation: expect.objectContaining(zeroAgentMetrics),
          testing: expect.objectContaining(zeroAgentMetrics),
          documentation: expect.objectContaining(zeroAgentMetrics),
        }),
        codex: expect.objectContaining({
          implementation: expect.objectContaining(zeroAgentMetrics),
          testing: expect.objectContaining(zeroAgentMetrics),
          documentation: expect.objectContaining(zeroAgentMetrics),
        }),
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
    expect(metrics.codex).toEqual(expect.objectContaining(zeroAgentMetrics));
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

  it('should include task type breakdown for tracked task types', () => {
    const metrics = summarizeAgentComparisonMetrics(
      [
        { agent_type: 'claude', total: 3, completed: 2, failed: 1, avg_duration_ms: 1500 },
        { agent_type: 'codex', total: 2, completed: 2, failed: 0, avg_duration_ms: 2200 },
      ],
      [
        {
          agent_type: 'claude',
          task_type: 'implementation',
          total: 2,
          completed: 2,
          failed: 0,
          avg_duration_ms: 1800,
        },
        {
          agent_type: 'codex',
          task_type: 'documentation',
          total: 1,
          completed: 1,
          failed: 0,
          avg_duration_ms: 2000,
        },
        {
          agent_type: 'codex',
          task_type: 'planning',
          total: 5,
          completed: 4,
          failed: 1,
          avg_duration_ms: 3000,
        },
      ],
    );

    expect(metrics.task_type_breakdown.claude.implementation).toEqual(
      expect.objectContaining({
        total: 2,
        completed: 2,
        failed: 0,
        success_rate: 100,
      }),
    );
    expect(metrics.task_type_breakdown.claude.testing).toEqual(expect.objectContaining(zeroAgentMetrics));
    expect(metrics.task_type_breakdown.codex.documentation.avg_duration_ms).toBe(2000);
    expect(metrics.task_type_breakdown.codex.testing).toEqual(expect.objectContaining(zeroAgentMetrics));
    expect(metrics.task_type_breakdown.codex.implementation).toEqual(expect.objectContaining(zeroAgentMetrics));
  });

  it('should ignore task type stats for unknown agent types', () => {
    const metrics = summarizeAgentComparisonMetrics(
      [],
      [
        {
          agent_type: 'backend-specialist',
          task_type: 'implementation',
          total: 5,
          completed: 4,
          failed: 1,
          avg_duration_ms: 1800,
        },
      ],
    );

    expect(metrics.task_type_breakdown.claude.implementation).toEqual(expect.objectContaining(zeroAgentMetrics));
    expect(metrics.task_type_breakdown.codex.implementation).toEqual(expect.objectContaining(zeroAgentMetrics));
  });
});
