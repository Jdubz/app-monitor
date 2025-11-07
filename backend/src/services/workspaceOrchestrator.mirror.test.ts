import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WorkspaceOrchestrator } from './workspaceOrchestrator.js';

let currentMirrorPath: string | null = null;

const execFileSyncMock = vi.fn((command: string, args: string[], _options: Record<string, unknown>) => {
  if (command === 'git' && Array.isArray(args)) {
    if (args[0] === 'clone' && currentMirrorPath) {
      fs.mkdirSync(currentMirrorPath, { recursive: true });
      return Buffer.from('');
    }

    if (args[0] === 'remote' && args[1] === 'get-url') {
      return Buffer.from('git@github.com:example/app-monitor.git');
    }
  }

  return Buffer.from('');
});

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

describe('WorkspaceOrchestrator mirror handling', () => {
  let tempDir: string;
  let repoRoot: string;
  let mirrorPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-orch-test-'));
    repoRoot = path.join(tempDir, 'repo');
    mirrorPath = path.join(tempDir, 'mirror');
    currentMirrorPath = mirrorPath;
    execFileSyncMock.mockClear();

    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    process.env.MIRROR_DEBUG = '0';
  });

  afterEach(() => {
    currentMirrorPath = null;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('clones and configures mirror when no cache exists', () => {
    const orchestrator = new WorkspaceOrchestrator({
      repoRoot,
      devBotsRoot: path.join(tempDir, 'dev-bots'),
      workspaceRoot: path.join(tempDir, 'workspaces'),
      artifactsRoot: path.join(tempDir, 'artifacts'),
      mirrorPath,
      gitUserName: 'TestBot',
      gitUserEmail: 'test@example.com',
    });

    orchestrator.initialize();
    const context = orchestrator.createWorkspace('task-123', 'worker-a');

    expect(fs.existsSync(mirrorPath)).toBe(true);
    expect(fs.existsSync(context.hostPath)).toBe(true);

    const cloneCall = execFileSyncMock.mock.calls.find(
      (call) =>
        call[0] === 'git' &&
        Array.isArray(call[1]) &&
        call[1][0] === 'clone' &&
        call[1][2] === '--branch',
    );
    expect(cloneCall).toBeTruthy();
  });
});
