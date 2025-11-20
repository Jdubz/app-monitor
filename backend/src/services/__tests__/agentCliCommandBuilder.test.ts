import { describe, it, expect } from 'vitest';
import { AgentCliCommandBuilder } from '../agentCliCommandBuilder.js';

const builder = new AgentCliCommandBuilder();

describe('AgentCliCommandBuilder', () => {
  it('builds claude command with literal prompt', () => {
    const cmd = builder.buildCommand({
      cliType: 'claude',
      prompt: { kind: 'literal', value: 'Hello World' },
      workingDirectory: '/workspace'
    });

    expect(cmd).toContain('claude --print');
    expect(cmd).toContain("'Hello World'");
    expect(cmd).toContain('--output-format json');
  });

  it('builds codex command with file prompt', () => {
    const cmd = builder.buildCommand({
      cliType: 'codex',
      prompt: { kind: 'file', path: '/dev/shm/recovery.txt' },
      workingDirectory: '/workspace'
    });

    expect(cmd).toContain('codex exec');
    expect(cmd).toContain('--cd /workspace');
    expect(cmd).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(cmd).toContain('$(cat \'/dev/shm/recovery.txt\')');
  });

  it('builds gemini command with literal prompt', () => {
    const cmd = builder.buildCommand({
      cliType: 'gemini',
      prompt: { kind: 'literal', value: 'Summarize status' }
    });

    expect(cmd).toContain('gemini');
    expect(cmd).toContain('--approval-mode yolo');
    expect(cmd).toContain('--sandbox false');
    expect(cmd).toContain("'Summarize status'");
  });

  it('verifies CLI flag availability when binaries exist', () => {
    const targets: Array<'claude' | 'codex' | 'gemini'> = ['claude', 'codex', 'gemini'];

    for (const cliType of targets) {
      const result = builder.inspectCliHelp(cliType);

      if (result.status === 'missing_binary') {
        // Environment does not have this CLI installed; skip verification.
        expect(result.status).toBe('missing_binary');
      } else if (result.status === 'missing_flags') {
        expect(result.missingFlags).toEqual([]);
      } else {
        expect(result.status).toBe('ok');
      }
    }
  });
});
