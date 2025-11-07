import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WorkspaceOrchestrator } from './workspaceOrchestrator.js';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

describe('WorkspaceOrchestrator mirror handling', () => {
  let tempDir: string;
  let repoRoot: string;
  let mirrorPath: string;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-orch-test-'));
    repoRoot = path.join(tempDir, 'repo');
    mirrorPath = path.join(tempDir, 'mirror');
    execFileSyncMock.mockImplementation((command: string, args?: string[]) => {
      if (command === 'git' && Array.isArray(args)) {
        if (args[0] === 'clone') {
          // Handle both mirror clone and workspace clone
          const targetPath = args[args.length - 1];
          if (typeof targetPath === 'string') {
            fs.mkdirSync(targetPath, { recursive: true });
            fs.mkdirSync(path.join(targetPath, '.git'), { recursive: true });
          }
          return Buffer.from('');
        }

        if (args[0] === 'remote' && args[1] === 'get-url') {
          return Buffer.from('git@github.com:example/app-monitor.git');
        }
      }

      return Buffer.from('');
    });

    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    process.env.MIRROR_DEBUG = '0';
  });

  afterEach(() => {
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

    expect(context.mirrorPath).toBe(mirrorPath);
    expect(context.hostPath).toContain('task-123');

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
