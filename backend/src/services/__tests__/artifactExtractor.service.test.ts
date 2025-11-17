/**
 * Artifact Extractor Service Unit Tests
 * 
 * Tests the ArtifactExtractorService for:
 * - Docker container artifact extraction
 * - Phase-specific artifact paths
 * - JSON parsing and validation
 * - Error handling for missing/invalid artifacts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ArtifactExtractorService, ArtifactExtractionOptions } from '../artifactExtractor.service.js';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('path');

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ArtifactExtractorService', () => {
  let service: ArtifactExtractorService;
  let mockExecFile: any;
  let mockFs: any;
  let mockPath: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArtifactExtractorService();
    mockExecFile = vi.mocked(childProcess.execFile);
    mockFs = vi.mocked(fs);
    mockPath = vi.mocked(path);
    
    // Setup default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.rmSync.mockImplementation(() => undefined);
  });

  describe('extractArtifacts', () => {
    it('should extract planning artifacts from phase 1', async () => {
      // Given: A container with planning artifacts
      const options: ArtifactExtractionOptions = {
        containerId: 'container-phase1',
        phaseIndex: 1,
        attempt: 1,
        tempDir: '/tmp/test',
      };
      
      const planningData = {
        architecture_notes: 'Test architecture',
        estimated_complexity: 'medium' as const,
      };

      // Mock docker cp success
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      
      // Mock file reads
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(planningData);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 1
      const artifacts = await service.extractArtifacts(options);

      // Then: Should return parsed planning artifacts
      expect(artifacts.planning).toEqual(planningData);
      expect(artifacts.stdout).toBe('Agent output');
      expect(artifacts.exitCode).toBe(0);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('should extract implementation artifacts from phase 2', async () => {
      // Given: A container with implementation artifacts
      const containerId = 'container-phase2';
      const implementationArtifact = {
        files: ['src/feature.ts', 'src/feature.test.ts'],
        changes: { added: 2, modified: 0, deleted: 0 },
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(implementationArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 2
      const artifacts = await service.extractArtifacts(containerId, 2);

      // Then: Should return parsed implementation artifacts
      expect(artifacts).toEqual(implementationArtifact);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('/artifacts/phase-2-implementation.json'),
        expect.any(Function)
      );
    });

    it('should extract review artifacts from phase 3', async () => {
      // Given: A container with review artifacts
      const containerId = 'container-phase3';
      const reviewArtifact = {
        reviewComments: ['Comment 1', 'Comment 2'],
        issuesFound: 2,
        criticalIssues: 0,
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(reviewArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 3
      const artifacts = await service.extractArtifacts(containerId, 3);

      // Then: Should return parsed review artifacts
      expect(artifacts).toEqual(reviewArtifact);
    });

    it('should extract fixes artifacts from phase 4', async () => {
      // Given: A container with fixes artifacts
      const containerId = 'container-phase4';
      const fixesArtifact = {
        fixedIssues: ['Issue 1', 'Issue 2'],
        remainingIssues: [],
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(fixesArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 4
      const artifacts = await service.extractArtifacts(containerId, 4);

      // Then: Should return parsed fixes artifacts
      expect(artifacts).toEqual(fixesArtifact);
    });

    it('should extract test artifacts from phase 5', async () => {
      // Given: A container with test artifacts
      const containerId = 'container-phase5';
      const testArtifact = {
        testResults: { passed: 10, failed: 0, skipped: 0 },
        coverage: 85.5,
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(testArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 5
      const artifacts = await service.extractArtifacts(containerId, 5);

      // Then: Should return parsed test artifacts
      expect(artifacts).toEqual(testArtifact);
    });

    it('should extract cleanup artifacts from phase 6', async () => {
      // Given: A container with cleanup artifacts
      const containerId = 'container-phase6';
      const cleanupArtifact = {
        removedFiles: ['temp.txt'],
        cleanupActions: ['remove debug logs'],
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(cleanupArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 6
      const artifacts = await service.extractArtifacts(containerId, 6);

      // Then: Should return parsed cleanup artifacts
      expect(artifacts).toEqual(cleanupArtifact);
    });

    it('should extract PR artifacts from phase 7', async () => {
      // Given: A container with PR artifacts
      const containerId = 'container-phase7';
      const prArtifact = {
        prNumber: 123,
        status: 'open',
        checksStatus: 'passed',
      };

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: JSON.stringify(prArtifact), stderr: '' });
      });

      // When: Extracting artifacts for phase 7
      const artifacts = await service.extractArtifacts(containerId, 7);

      // Then: Should return parsed PR artifacts
      expect(artifacts).toEqual(prArtifact);
    });

    it('should handle missing artifact files gracefully', async () => {
      // Given: A container without artifact file
      const containerId = 'container-no-artifacts';

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('File not found'), { stdout: '', stderr: 'No such file' });
      });

      // When/Then: Should throw error
      await expect(service.extractArtifacts(containerId, 1)).rejects.toThrow();
    });

    it('should handle invalid JSON in artifact files', async () => {
      // Given: A container with invalid JSON artifact
      const containerId = 'container-invalid-json';

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: 'invalid json{{{', stderr: '' });
      });

      // When/Then: Should throw parsing error
      await expect(service.extractArtifacts(containerId, 1)).rejects.toThrow();
    });

    it('should handle empty artifact files', async () => {
      // Given: A container with empty artifact file
      const containerId = 'container-empty';

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });

      // When: Extracting artifacts
      const artifacts = await service.extractArtifacts(containerId, 1);

      // Then: Should return empty object or throw (depends on implementation)
      expect(artifacts).toBeDefined();
    });

    it('should handle docker command execution errors', async () => {
      // Given: Docker command fails
      const containerId = 'container-error';

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('Docker daemon not running'), null);
      });

      // When/Then: Should propagate error
      await expect(service.extractArtifacts(containerId, 1)).rejects.toThrow('Docker daemon not running');
    });

    it('should use correct artifact paths for each phase', async () => {
      // Given: Service extracting artifacts
      const containerId = 'container-test';

      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      // When: Extracting for each phase
      await service.extractArtifacts(containerId, 1);
      await service.extractArtifacts(containerId, 2);
      await service.extractArtifacts(containerId, 3);
      await service.extractArtifacts(containerId, 4);
      await service.extractArtifacts(containerId, 5);
      await service.extractArtifacts(containerId, 6);
      await service.extractArtifacts(containerId, 7);

      // Then: Should use correct paths
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-1-planning.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-2-implementation.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-3-review.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-4-fixes.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-5-test.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-6-cleanup.json'),
        expect.any(Function)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('phase-7-pr-shepherding.json'),
        expect.any(Function)
      );
    });
  });
});
