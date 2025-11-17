/**
 * Coverage Delta Calculator
 * 
 * Calculates test coverage delta on changed files for Phase 5 validation.
 * Compares current coverage against baseline to ensure new code maintains ≥80% coverage.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CoverageData {
  file: string;
  lines: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
}

export interface CoverageDelta {
  changedFiles: string[];
  baseline: {
    totalCoverage: number;
    changedFilesCoverage: number;
    files: Record<string, CoverageData>;
  };
  current: {
    totalCoverage: number;
    changedFilesCoverage: number;
    files: Record<string, CoverageData>;
  };
  delta: number; // % change in changed files coverage
  passing: boolean; // Whether coverage meets threshold
  threshold: number; // Required coverage percentage
}

/**
 * Parse LCOV coverage report into structured data
 */
function parseLcovReport(lcovPath: string): Record<string, CoverageData> {
  if (!fs.existsSync(lcovPath)) {
    return {};
  }

  const lcovContent = fs.readFileSync(lcovPath, 'utf8');
  const files: Record<string, CoverageData> = {};
  
  const records = lcovContent.split('end_of_record');
  
  for (const record of records) {
    if (!record.trim()) continue;
    
    const lines = record.split('\n');
    let currentFile = '';
    let linesFound = 0, linesHit = 0;
    let functionsFound = 0, functionsHit = 0;
    let branchesFound = 0, branchesHit = 0;
    
    for (const line of lines) {
      if (line.startsWith('SF:')) {
        currentFile = line.substring(3).trim();
      } else if (line.startsWith('LF:')) {
        linesFound = parseInt(line.substring(3), 10);
      } else if (line.startsWith('LH:')) {
        linesHit = parseInt(line.substring(3), 10);
      } else if (line.startsWith('FNF:')) {
        functionsFound = parseInt(line.substring(4), 10);
      } else if (line.startsWith('FNH:')) {
        functionsHit = parseInt(line.substring(4), 10);
      } else if (line.startsWith('BRF:')) {
        branchesFound = parseInt(line.substring(4), 10);
      } else if (line.startsWith('BRH:')) {
        branchesHit = parseInt(line.substring(4), 10);
      }
    }
    
    if (currentFile) {
      const linesPct = linesFound > 0 ? (linesHit / linesFound) * 100 : 100;
      const funcsPct = functionsFound > 0 ? (functionsHit / functionsFound) * 100 : 100;
      const branchesPct = branchesFound > 0 ? (branchesHit / branchesFound) * 100 : 100;
      
      files[currentFile] = {
        file: currentFile,
        lines: { total: linesFound, covered: linesHit, percentage: linesPct },
        functions: { total: functionsFound, covered: functionsHit, percentage: funcsPct },
        branches: { total: branchesFound, covered: branchesHit, percentage: branchesPct }
      };
    }
  }
  
  return files;
}

/**
 * Get list of changed files compared to base branch
 */
export function getChangedFiles(workspacePath: string, baseBranch: string = 'main'): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${baseBranch}...HEAD`,
      { cwd: workspacePath, encoding: 'utf8' }
    );
    
    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')))
      .filter(f => !f.includes('__tests__') && !f.includes('.test.') && !f.includes('.spec.'));
  } catch (error) {
    console.warn('Failed to get changed files:', error);
    return [];
  }
}

/**
 * Calculate average coverage across a set of files
 */
function calculateAverageCoverage(files: Record<string, CoverageData>, fileList?: string[]): number {
  const targetFiles = fileList || Object.keys(files);
  
  if (targetFiles.length === 0) {
    return 100; // No files = 100% coverage
  }
  
  let totalLines = 0;
  let coveredLines = 0;
  
  for (const file of targetFiles) {
    const coverage = files[file];
    if (coverage) {
      totalLines += coverage.lines.total;
      coveredLines += coverage.lines.covered;
    }
  }
  
  return totalLines > 0 ? (coveredLines / totalLines) * 100 : 100;
}

/**
 * Calculate coverage delta between baseline and current coverage
 */
export function calculateCoverageDelta(
  workspacePath: string,
  currentLcovPath: string,
  baselineLcovPath?: string,
  threshold: number = 80
): CoverageDelta {
  const changedFiles = getChangedFiles(workspacePath);
  const currentCoverage = parseLcovReport(currentLcovPath);
  const baselineCoverage = baselineLcovPath ? parseLcovReport(baselineLcovPath) : {};
  
  // Normalize file paths to be relative to workspace
  const normalizeFilePath = (filePath: string): string => {
    return path.relative(workspacePath, filePath);
  };
  
  const normalizedChangedFiles = changedFiles.map(normalizeFilePath);
  
  // Calculate current coverage
  const currentTotal = calculateAverageCoverage(currentCoverage);
  const currentChanged = calculateAverageCoverage(currentCoverage, normalizedChangedFiles);
  
  // Calculate baseline coverage
  const baselineTotal = calculateAverageCoverage(baselineCoverage);
  const baselineChanged = Object.keys(baselineCoverage).length > 0
    ? calculateAverageCoverage(baselineCoverage, normalizedChangedFiles)
    : currentChanged; // If no baseline, use current as baseline
  
  // Calculate delta
  const delta = currentChanged - baselineChanged;
  
  // Check if coverage meets threshold
  // Must satisfy BOTH: absolute threshold (≥80%) AND small delta (≥-0.1%)
  const meetsAbsoluteThreshold = currentChanged >= threshold;
  const meetsRelativeThreshold = delta >= -0.1;
  const passing = meetsAbsoluteThreshold && meetsRelativeThreshold;
  
  return {
    changedFiles: normalizedChangedFiles,
    baseline: {
      totalCoverage: baselineTotal,
      changedFilesCoverage: baselineChanged,
      files: baselineCoverage
    },
    current: {
      totalCoverage: currentTotal,
      changedFilesCoverage: currentChanged,
      files: currentCoverage
    },
    delta,
    passing,
    threshold
  };
}

/**
 * Generate coverage delta report for Phase 5 validation
 */
export function generateCoverageReport(
  workspacePath: string,
  currentLcovPath: string,
  baselineLcovPath?: string
): string {
  const delta = calculateCoverageDelta(workspacePath, currentLcovPath, baselineLcovPath);
  
  const report = {
    summary: {
      changedFiles: delta.changedFiles.length,
      currentCoverage: delta.current.changedFilesCoverage.toFixed(2),
      baselineCoverage: delta.baseline.changedFilesCoverage.toFixed(2),
      delta: delta.delta.toFixed(2),
      passing: delta.passing,
      threshold: delta.threshold
    },
    details: {
      changedFiles: delta.changedFiles,
      filesWithLowCoverage: delta.changedFiles
        .map(file => ({
          file,
          coverage: delta.current.files[file]?.lines.percentage || 0
        }))
        .filter(f => f.coverage < delta.threshold)
        .sort((a, b) => a.coverage - b.coverage)
    }
  };
  
  return JSON.stringify(report, null, 2);
}
