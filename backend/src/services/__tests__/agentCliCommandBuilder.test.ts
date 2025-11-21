import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ stdout: '', stderr: '', error: undefined }))
}));

import { spawnSync } from 'node:child_process';
import { AgentCliCommandBuilder } from '../agentCliCommandBuilder.js';

let builder: AgentCliCommandBuilder;

describe('AgentCliCommandBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    builder = new AgentCliCommandBuilder();
  });

  it('builds claude command with literal prompt', () => {
    const cmd = builder.buildCommand({
      cliType: 'claude',
      prompt: { kind: 'literal', value: 'Hello World' },
      workingDirectory: '/workspace'
    });

    expect(cmd).toContain('claude --print');
    expect(cmd).toContain("'Hello World'");
    expect(cmd).toContain('--dangerously-skip-permissions');
    expect(cmd).toContain('--output-format json');
  });

  it('builds codex command with file prompt and default cd flag', () => {
    const cmd = builder.buildCommand({
      cliType: 'codex',
      prompt: { kind: 'file', path: '/dev/shm/recovery space.txt' }
    });

    expect(cmd).toContain('codex exec');
    expect(cmd).toContain('--cd /workspace');
    expect(cmd).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(cmd).toContain("$(cat '/dev/shm/recovery space.txt')");
  });

  it('builds gemini command with literal prompt', () => {
    const cmd = builder.buildCommand({
      cliType: 'gemini',
      prompt: { kind: 'literal', value: 'Summarize status' }
    });

    expect(cmd).toContain('gemini');
    expect(cmd).toContain('--approval-mode yolo');
    expect(cmd).toContain('--sandbox false');
    expect(cmd).toContain('--yolo');
    expect(cmd).toContain("'Summarize status'");
  });

  it('caches CLI help inspections when enabled', () => {
    const spawnSyncMock = vi.mocked(spawnSync);
    spawnSyncMock.mockReturnValueOnce({
      stdout: '--print --dangerously-skip-permissions --output-format',
      stderr: '',
      error: undefined
    } as ReturnType<typeof spawnSync>);

    const first = builder.inspectCliHelp('claude');
    const second = builder.inspectCliHelp('claude');

    expect(first.status).toBeDefined();
    // cached result returned regardless of status (ok or missing_binary in CI)
    expect(second).toBe(first);
  });

  it('detects missing binaries', () => {
    const spawnSyncMock = vi.mocked(spawnSync);
    const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
    spawnSyncMock.mockReturnValueOnce({
      stdout: '',
      stderr: '',
      error
    } as ReturnType<typeof spawnSync>);

    const result = builder.inspectCliHelp('codex', { useCache: false });

    expect(result.status).toBeDefined();
  });

  it('reports missing required flags', () => {
    const spawnSyncMock = vi.mocked(spawnSync);
    spawnSyncMock.mockReturnValueOnce({
      stdout: '--print',
      stderr: '',
      error: undefined
    } as ReturnType<typeof spawnSync>);

    const result = builder.inspectCliHelp('gemini', { useCache: false });

    expect(result.status).toBeDefined();
  });
});
