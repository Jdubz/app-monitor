/**
 * Tests for repoPaths utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, resolveArtifactsDir } from './repoPaths.js';

// Mock fs module
vi.mock('fs');

describe('repoPaths', () => {
  describe('findRepoRoot', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env.REPO_ROOT;
    });

    afterEach(() => {
      delete process.env.REPO_ROOT;
    });

    it('should find .git directory in development mode', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/home/user/projects/app-monitor/backend/src';

      // Mock that .git exists at project root
      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr === '/home/user/projects/app-monitor/.git';
      });

      const result = findRepoRoot(startDir);

      expect(result).toBe('/home/user/projects/app-monitor');
    });

    it('should find backend parent directory in production without .git', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/opt/app-monitor/releases/20251116_161606/backend/dist/services/context';

      // Mock that no .git exists anywhere
      mockExistsSync.mockReturnValue(false);

      const result = findRepoRoot(startDir);

      expect(result).toBe('/opt/app-monitor/releases/20251116_161606');
    });

    it('should handle backend directory at different path positions', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/var/releases/my-app/backend/src';

      mockExistsSync.mockReturnValue(false);

      const result = findRepoRoot(startDir);

      expect(result).toBe('/var/releases/my-app');
    });

    it('should handle nested backend paths correctly', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/opt/app-monitor/releases/20251116_161606/backend/src/services/context/deep/nested';

      mockExistsSync.mockReturnValue(false);

      const result = findRepoRoot(startDir);

      expect(result).toBe('/opt/app-monitor/releases/20251116_161606');
    });

    it('should use REPO_ROOT environment variable as fallback when backend not found', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const startDir = '/some/random/path/without/structure';

      mockExistsSync.mockReturnValue(false);
      process.env.REPO_ROOT = '/custom/repo/root';

      const result = findRepoRoot(startDir);

      expect(result).toBe('/custom/repo/root');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Could not determine repo root')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should throw error when no .git, no backend, and no REPO_ROOT env var', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/some/random/path/without/structure';

      mockExistsSync.mockReturnValue(false);

      expect(() => findRepoRoot(startDir)).toThrow(
        /Unable to determine repository root/
      );
      expect(() => findRepoRoot(startDir)).toThrow(
        /Set the REPO_ROOT environment variable/
      );
    });

    it('should prefer .git over backend directory when both exist', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const startDir = '/home/user/dev/app-monitor/backend/src';

      // Mock that .git exists at /home/user/dev/app-monitor/.git
      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr === '/home/user/dev/app-monitor/.git';
      });

      const result = findRepoRoot(startDir);

      // Should find .git and return its parent, not walk to backend
      expect(result).toBe('/home/user/dev/app-monitor');
    });
  });

  describe('resolveArtifactsDir', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env.REPO_ROOT;
    });

    it('should resolve artifacts directory from repo root', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      // Mock .git at project root
      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.endsWith('.git');
      });

      const result = resolveArtifactsDir('/home/user/projects/app-monitor/backend');

      expect(result).toContain('dev-bots');
      expect(result).toContain('artifacts');
    });

    it('should use process.cwd() when no startDir provided', () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const originalCwd = process.cwd();

      // Mock .git exists at cwd parent
      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr === path.join(path.dirname(originalCwd), '.git');
      });

      const result = resolveArtifactsDir();

      expect(result).toContain('dev-bots');
      expect(result).toContain('artifacts');
    });
  });
});
