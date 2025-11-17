/**
 * Artifact Extractor Service
 * 
 * Extracts phase artifacts from dev-bot containers.
 * Looks for structured JSON files in /workspace/.artifacts/
 * 
 * Expected container structure:
 *   /workspace/.artifacts/
 *     ├── phase.json          # Phase-specific artifacts
 *     ├── stdout.log          # Container stdout
 *     ├── stderr.log          # Container stderr
 *     └── exit_code           # Exit code file
 * 
 * The phase.json structure depends on the phase:
 *   - Phase 1: PlanningArtifacts
 *   - Phase 2: ImplementationArtifacts
 *   - Phase 3: ReviewArtifacts
 *   - Phase 4: FixesArtifacts
 *   - Phase 5: TestArtifacts
 *   - Phase 6: CleanupArtifacts
 *   - Phase 7: PRShepherdingArtifacts
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import type { PhaseArtifacts } from './phaseValidation/types.js';

const execAsync = promisify(childProcess.exec);

export interface ArtifactExtractionOptions {
  containerId: string;
  phaseIndex: number;
  attempt: number;
  tempDir?: string;
}

export class ArtifactExtractorService {
  private readonly artifactsPath = '/workspace/.artifacts';

  /**
   * Extract artifacts from a running or stopped container.
   */
  async extractArtifacts(options: ArtifactExtractionOptions): Promise<PhaseArtifacts> {
    const { containerId, phaseIndex, attempt, tempDir } = options;

    logger.info({
      category: 'phase',
      action: 'extract_artifacts_start',
      message: `Extracting artifacts from container ${containerId}`,
      details: { containerId, phaseIndex, attempt },
    });

    // Create temp directory for extraction
    const extractDir = tempDir ?? path.join('/tmp', `artifacts-${containerId}-${Date.now()}`);
    
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    try {
      // Extract artifacts directory from container
      await this.copyFromContainer(containerId, this.artifactsPath, extractDir);

      // Read artifacts
      const artifacts = await this.readArtifacts(extractDir, phaseIndex);

      logger.info({
        category: 'phase',
        action: 'extract_artifacts_success',
        message: `Successfully extracted artifacts from container`,
        details: { 
          containerId, 
          phaseIndex,
          hasPhaseData: Boolean(artifacts.planning || artifacts.implementation || 
                                 artifacts.review || artifacts.fixes || artifacts.tests ||
                                 artifacts.cleanup || artifacts.prShepherding),
        },
      });

      return artifacts;

    } catch (error) {
      logger.error({
        category: 'phase',
        action: 'extract_artifacts_failed',
        message: `Failed to extract artifacts from container: ${error instanceof Error ? error.message : String(error)}`,
        details: { containerId, phaseIndex, error },
      });

      // Return minimal artifacts with error info
      return {
        stdout: `Error extracting artifacts: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: -1,
      };

    } finally {
      // Cleanup temp directory
      try {
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        logger.warn({
          category: 'phase',
          action: 'cleanup_failed',
          message: `Failed to cleanup temp directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          details: { extractDir },
        });
      }
    }
  }

  /**
   * Copy files from container to host.
   */
  private async copyFromContainer(containerId: string, containerPath: string, hostPath: string): Promise<void> {
    try {
      // Use docker cp to copy from container
      const command = `docker cp ${containerId}:${containerPath}/. ${hostPath}/`;
      await execAsync(command);
    } catch (error) {
      // If .artifacts directory doesn't exist in container, that's okay
      // Agent might not have created it yet
      logger.warn({
        category: 'phase',
        action: 'copy_artifacts_failed',
        message: `Could not copy artifacts from container (may not exist yet)`,
        details: { containerId, containerPath, error },
      });
    }
  }

  /**
   * Read and parse artifacts from extracted directory.
   */
  private async readArtifacts(extractDir: string, phaseIndex: number): Promise<PhaseArtifacts> {
    const artifacts: PhaseArtifacts = {};

    // Read stdout
    const stdoutPath = path.join(extractDir, 'stdout.log');
    if (fs.existsSync(stdoutPath)) {
      artifacts.stdout = fs.readFileSync(stdoutPath, 'utf-8');
    }

    // Read stderr
    const stderrPath = path.join(extractDir, 'stderr.log');
    if (fs.existsSync(stderrPath)) {
      artifacts.stderr = fs.readFileSync(stderrPath, 'utf-8');
    }

    // Read exit code
    const exitCodePath = path.join(extractDir, 'exit_code');
    if (fs.existsSync(exitCodePath)) {
      const exitCodeStr = fs.readFileSync(exitCodePath, 'utf-8').trim();
      artifacts.exitCode = parseInt(exitCodeStr, 10);
    }

    // Read phase-specific artifacts
    const phaseJsonPath = path.join(extractDir, 'phase.json');
    if (fs.existsSync(phaseJsonPath)) {
      try {
        const phaseData = JSON.parse(fs.readFileSync(phaseJsonPath, 'utf-8'));
        
        // Map to appropriate phase artifact type
        switch (phaseIndex) {
          case 1:
            artifacts.planning = phaseData;
            break;
          case 2:
            artifacts.implementation = phaseData;
            break;
          case 3:
            artifacts.review = phaseData;
            break;
          case 4:
            artifacts.fixes = phaseData;
            break;
          case 5:
            artifacts.tests = phaseData;
            break;
          case 6:
            artifacts.cleanup = phaseData;
            break;
          case 7:
            artifacts.prShepherding = phaseData;
            break;
          default:
            logger.warn({
              category: 'phase',
              action: 'unknown_phase_index',
              message: `Unknown phase index ${phaseIndex} for artifact mapping`,
              details: { phaseIndex },
            });
        }
      } catch (parseError) {
        logger.error({
          category: 'phase',
          action: 'parse_phase_json_failed',
          message: `Failed to parse phase.json: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          details: { phaseJsonPath, parseError },
        });
      }
    }

    return artifacts;
  }

  /**
   * Check if container has artifacts directory.
   */
  async hasArtifacts(containerId: string): Promise<boolean> {
    try {
      const command = `docker exec ${containerId} test -d ${this.artifactsPath}`;
      await execAsync(command);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let extractorInstance: ArtifactExtractorService | null = null;

export function getArtifactExtractor(): ArtifactExtractorService {
  if (!extractorInstance) {
    extractorInstance = new ArtifactExtractorService();
  }
  return extractorInstance;
}
