/**
 * Task Auto-Detection Service
 *
 * Automatically detects missing task fields from minimal payload:
 * - Target files from git status (staged + modified)
 * - Risk level from file path patterns
 * - Context profiles from task type + files
 * - Default outputs per task type
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { logger } from '../utils/logger.js';
import { inferRiskLevelFromFiles } from '../utils/riskAssessment.js';
import { ContextRecipeSelector } from './context/contextRecipeSelector.js';
import type { RecipeTaskType } from '../types/contextRecipe.js';
import type { MinimalTaskPayload, TaskAutoDetectionResult } from '@app-monitor/api-contracts';

const DEFAULT_OUTPUTS: Record<string, string[]> = {
  implementation: ['unit-tests', 'integration-tests', 'documentation'],
  review: ['review-report', 'action-recommendation'],
  fix: ['patch', 'verification-log', 'root-cause-analysis'],
  'pr-follow-up': ['merge-status', 'gate-evaluation', 'blocker-resolution'],
  analysis: ['findings-report', 'recommendations', 'metrics']
};

export class TaskAutoDetectionService {
  private git: SimpleGit;
  
  constructor() {
    this.git = simpleGit();
  }
  
  /**
   * Auto-detect all missing fields from minimal payload
   */
  async detectFields(payload: MinimalTaskPayload): Promise<TaskAutoDetectionResult> {
    const result: TaskAutoDetectionResult = {
      detectedFiles: payload.targetFiles || await this.detectFilesFromGit(),
      inferredRiskLevel: payload.riskLevel || 'low',
      selectedProfiles: payload.contextProfiles || [],
      recommendedOutputs: payload.desiredOutputs || DEFAULT_OUTPUTS[payload.taskType] || [],
      confidence: {
        files: payload.targetFiles ? 1.0 : 0.7,  // Lower confidence if auto-detected
        riskLevel: payload.riskLevel ? 1.0 : 0.8,
        profiles: payload.contextProfiles ? 1.0 : 0.9
      },
      warnings: []
    };
    
    // Infer risk level if not provided
    if (!payload.riskLevel) {
      result.inferredRiskLevel = this.inferRiskLevel(result.detectedFiles);
      if (result.detectedFiles.length === 0) {
        result.warnings.push('No files detected - risk level defaulted to low. Consider specifying targetFiles.');
        result.confidence.riskLevel = 0.5;
      }
    }
    
    // Select context profiles if not provided
    if (!payload.contextProfiles || payload.contextProfiles.length === 0) {
      result.selectedProfiles = ContextRecipeSelector.getProfilesToInclude({
        taskType: payload.taskType as RecipeTaskType,
        targetFiles: result.detectedFiles,
        manualProfiles: undefined,
        includeOptional: false  // Only required + recommended
      });
      
      if (result.selectedProfiles.length === 0) {
        result.warnings.push('No context profiles selected - using defaults');
        result.selectedProfiles = ['dev-monitor', 'scope-control'];
        result.confidence.profiles = 0.6;
      }
    }
    
    // Validation warnings
    if (result.detectedFiles.length > 50) {
      result.warnings.push(`Large file count (${result.detectedFiles.length}) - consider narrowing scope to specific components`);
    }
    
    if (result.detectedFiles.length === 0 && payload.taskType !== 'analysis') {
      result.warnings.push('No target files detected - task may lack specificity. Consider providing targetFiles explicitly.');
    }
    
    logger.info({
      category: 'context',
      action: 'fields_detected',
      message: `Auto-detected ${result.detectedFiles.length} files for ${payload.taskType} task`,
      details: {
        taskType: payload.taskType,
        filesCount: result.detectedFiles.length,
        riskLevel: result.inferredRiskLevel,
        profilesCount: result.selectedProfiles.length,
        confidence: result.confidence,
        warningsCount: result.warnings.length
      }
    });
    
    return result;
  }
  
  /**
   * Detect target files from git status (staged + modified + created)
   */
  private async detectFilesFromGit(): Promise<string[]> {
    try {
      const status = await this.git.status();
      const files = new Set<string>();
      
      // Priority 1: Staged files (explicitly marked for commit)
      status.staged.forEach((f: string) => files.add(f));
      
      // Priority 2: Modified files (unsaved changes)
      status.modified.forEach((f: string) => files.add(f));
      
      // Priority 3: Created files (new files)
      status.created.forEach((f: string) => files.add(f));
      
      const fileArray = Array.from(files);
      
      logger.debug({
        category: 'context',
        action: 'git_files_detected',
        message: `Detected ${fileArray.length} files from git status`,
        details: {
          staged: status.staged.length,
          modified: status.modified.length,
          created: status.created.length,
          total: fileArray.length
        }
      });
      
      return fileArray;
    } catch (error) {
      logger.warn({
        category: 'context',
        action: 'git_detection_failed',
        message: 'Failed to detect files from git status - returning empty array',
        error
      });
      return [];
    }
  }
  
  /**
   * Infer risk level from file paths using pattern matching
   * Delegates to centralized risk assessment utility
   */
  private inferRiskLevel(files: string[]): 'minimal' | 'low' | 'medium' | 'high' {
    return inferRiskLevelFromFiles(files);
  }
}

// Export singleton instance
export const taskAutoDetectionService = new TaskAutoDetectionService();
