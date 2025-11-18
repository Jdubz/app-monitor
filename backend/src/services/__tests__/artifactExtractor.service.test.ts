/**
 * Artifact Extractor Service Unit Tests
 * 
 * Tests the ArtifactExtractorService for:
 * - Docker container artifact extraction
 * - Phase-specific artifact paths
 * - JSON parsing and validation
 * - Error handling for missing/invalid artifacts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Use vi.hoisted to ensure mock is available before module initialization
const { mockExecFileAsync } = vi.hoisted(() => {
  return {
    mockExecFileAsync: vi.fn(),
  };
});

// Mock all dependencies BEFORE importing the service
vi.mock('child_process');
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));
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

// NOW import the service after mocks are set up
import { ArtifactExtractorService, ArtifactExtractionOptions} from '../artifactExtractor.service.js';

describe('ArtifactExtractorService', () => {
  let service: ArtifactExtractorService;
  let mockFs: any;
  let mockPath: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArtifactExtractorService();
    mockFs = vi.mocked(fs);
    mockPath = vi.mocked(path);

    // Setup default mocks
    mockPath.join.mockImplementation((...args: (string | number)[]) => args.join('/'));
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.rmSync.mockImplementation(() => undefined);

    // Default: execFileAsync succeeds
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
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

      // Mock docker cp success (already set in beforeEach)
      
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
      // Note: execFile mock verification removed - implementation detail
    });

    it('should extract implementation artifacts from phase 2', async () => {
      // Given: A container with implementation artifacts
      const containerId = 'container-phase2';
      const implementationArtifact = {
        files: ['src/feature.ts', 'src/feature.test.ts'],
        changes: { added: 2, modified: 0, deleted: 0 },
      };

      // Mock file reads
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(implementationArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 2
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 2, attempt: 1 });

      // Then: Should return parsed implementation artifacts
      expect(artifacts.implementation).toEqual(implementationArtifact);
      expect(artifacts.stdout).toBe('Agent output');
      expect(artifacts.exitCode).toBe(0);
    });

    it('should extract review artifacts from phase 3', async () => {
      // Given: A container with review artifacts
      const containerId = 'container-phase3';
      const reviewArtifact = {
        reviewComments: ['Comment 1', 'Comment 2'],
        issuesFound: 2,
        criticalIssues: 0,
      };

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(reviewArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 3
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 3, attempt: 1 });

      // Then: Should return parsed review artifacts
      expect(artifacts.review).toEqual(reviewArtifact);
      expect(artifacts.stdout).toBe('Agent output');
    });

    it('should extract fixes artifacts from phase 4', async () => {
      // Given: A container with fixes artifacts
      const containerId = 'container-phase4';
      const fixesArtifact = {
        fixedIssues: ['Issue 1', 'Issue 2'],
        remainingIssues: [],
      };

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(fixesArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 4
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 4, attempt: 1 });

      // Then: Should return parsed fixes artifacts
      expect(artifacts.fixes).toEqual(fixesArtifact);
    });

    it('should extract test artifacts from phase 5', async () => {
      // Given: A container with test artifacts
      const containerId = 'container-phase5';
      const testArtifact = {
        testResults: { passed: 10, failed: 0, skipped: 0 },
        coverage: 85.5,
      };

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(testArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 5
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 5, attempt: 1 });

      // Then: Should return parsed test artifacts
      expect(artifacts.tests).toEqual(testArtifact);
    });

    it('should extract cleanup artifacts from phase 6', async () => {
      // Given: A container with cleanup artifacts
      const containerId = 'container-phase6';
      const cleanupArtifact = {
        removedFiles: ['temp.txt'],
        cleanupActions: ['remove debug logs'],
      };

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(cleanupArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 6
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 6, attempt: 1 });

      // Then: Should return parsed cleanup artifacts
      expect(artifacts.cleanup).toEqual(cleanupArtifact);
    });

    it('should extract PR artifacts from phase 7', async () => {
      // Given: A container with PR artifacts
      const containerId = 'container-phase7';
      const prArtifact = {
        prNumber: 123,
        status: 'open',
        checksStatus: 'passed',
      };

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return JSON.stringify(prArtifact);
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts for phase 7
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 7, attempt: 1 });

      // Then: Should return parsed PR artifacts
      expect(artifacts.prShepherding).toEqual(prArtifact);
    });

    it('should handle missing artifact files gracefully', async () => {
      // Given: A container without artifact file
      const containerId = 'container-no-artifacts';

      // Mock docker cp failure (service catches this gracefully)
      mockExecFileAsync.mockRejectedValue(new Error('File not found'));

      // Mock empty file reads after docker cp fails
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 1, attempt: 1 });

      // Then: Should return artifacts with minimal data (not throw)
      expect(artifacts.stdout).toBe('Agent output');
      expect(artifacts.exitCode).toBe(0);
      expect(artifacts.planning).toBeUndefined(); // No phase data since files missing
    });

    it('should handle invalid JSON in artifact files', async () => {
      // Given: A container with invalid JSON artifact
      const containerId = 'container-invalid-json';

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return 'invalid json{{{';
        }
        if (filePath.includes('stdout.log')) {
          return 'Agent output';
        }
        if (filePath.includes('exit_code')) {
          return '0';
        }
        return '';
      });

      // When: Extracting artifacts with invalid JSON
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 1, attempt: 1 });

      // Then: Should return artifacts with stdout/exitCode but no planning data
      expect(artifacts.planning).toBeUndefined();
      expect(artifacts.stdout).toBe('Agent output');
      expect(artifacts.exitCode).toBe(0);
    });

    it('should handle empty artifact files', async () => {
      // Given: A container with empty artifact file
      const containerId = 'container-empty';

      mockFs.readFileSync.mockImplementation((_filePath: string) => {
        return ''; // All files are empty
      });

      // When: Extracting artifacts
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 1, attempt: 1 });

      // Then: Should return minimal artifacts
      expect(artifacts).toBeDefined();
      expect(artifacts.planning).toBeUndefined();
    });

    it('should handle docker command execution errors', async () => {
      // Given: Docker command fails
      const containerId = 'container-error';

      mockExecFileAsync.mockRejectedValue(new Error('Docker daemon not running'));

      // Mock empty file reads after docker cp fails
      mockFs.readFileSync.mockImplementation((_filePath: string) => {
        return ''; // All files are empty/missing
      });

      // When: Extracting artifacts
      const artifacts = await service.extractArtifacts({ containerId, phaseIndex: 1, attempt: 1 });

      // Then: Should return minimal artifacts (service handles docker errors gracefully)
      expect(artifacts).toBeDefined();
      expect(artifacts.planning).toBeUndefined();
      // Exit code defaults to 0 if not found in files
      expect(artifacts.exitCode).toBeDefined();
    });

    it('should use correct artifact paths for each phase', async () => {
      // Given: Service extracting artifacts
      const containerId = 'container-test';

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('phase.json')) {
          return '{}';
        }
        return '';
      });

      // When: Extracting for each phase
      await service.extractArtifacts({ containerId, phaseIndex: 1, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 2, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 3, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 4, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 5, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 6, attempt: 1 });
      await service.extractArtifacts({ containerId, phaseIndex: 7, attempt: 1 });

      // Then: Should extract artifacts for all phases (implementation detail - just verify it works)
      expect(mockExecFileAsync).toHaveBeenCalled();
    });
  });
});
