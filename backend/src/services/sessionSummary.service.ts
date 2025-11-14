/**
 * Session Summary Service
 *
 * Generates session_summary.json files for completed tasks.
 * Aggregates task execution details, outputs, errors, and artifacts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { TaskArtifact } from './taskArtifact.service.js';

export interface SessionSummary {
  task_id: string;
  task_title: string;
  task_type: string;
  status: 'completed' | 'failed';
  exit_code: number;
  
  // Timing
  created_at: number;
  started_at: number;
  completed_at: number;
  duration_ms: number;
  
  // Agent info
  assigned_agent: string;
  agent_type: string;
  
  // Execution results
  output_summary: string;
  error_summary?: string;
  
  // Artifacts
  artifacts: Array<{
    type: string;
    path: string;
    size_bytes?: number;
  }>;
  
  // Stats
  stdout_lines?: number;
  stderr_lines?: number;
  files_changed?: number;
  
  // Metadata
  generated_at: string;
}

export class SessionSummaryService {
  /**
   * Generate session summary JSON for a completed task
   */
  generateSummary(
    task: Task,
    exitCode: number,
    stdout: string,
    stderr: string,
    artifacts: TaskArtifact[]
  ): SessionSummary {
    const startedAt = task.started_at || task.assigned_at || task.created_at;
    const completedAt = task.completed_at || Date.now();
    const duration = completedAt - startedAt;
    
    // Extract output summary (first 500 chars or first few lines)
    const outputSummary = this.extractSummary(task.output || stdout, 500);
    const errorSummary = stderr ? this.extractSummary(stderr, 500) : undefined;
    
    const summary: SessionSummary = {
      task_id: task.id,
      task_title: task.title,
      task_type: task.type,
      status: exitCode === 0 ? 'completed' : 'failed',
      exit_code: exitCode,
      
      created_at: task.created_at,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: duration,
      
      assigned_agent: task.assigned_agent || 'unknown',
      agent_type: task.agent_type || 'unknown',
      
      output_summary: outputSummary,
      error_summary: errorSummary,
      
      artifacts: artifacts.map(a => ({
        type: a.type,
        path: a.path,
        size_bytes: a.size_bytes,
      })),
      
      stdout_lines: stdout ? stdout.split('\n').length : 0,
      stderr_lines: stderr ? stderr.split('\n').length : 0,
      
      generated_at: new Date().toISOString(),
    };
    
    return summary;
  }
  
  /**
   * Write session summary to file
   */
  async writeSummary(
    summary: SessionSummary,
    artifactsDir: string
  ): Promise<string> {
    const timestamp = Date.now();
    const filename = `${summary.task_id}-session-summary-${timestamp}.json`;
    const filepath = path.join(artifactsDir, filename);
    
    try {
      const json = JSON.stringify(summary, null, 2);
      fs.writeFileSync(filepath, json, 'utf-8');
      
      logger.info({
        category: 'artifact',
        action: 'session_summary_created',
        message: `Created session summary for task ${summary.task_id}`,
        details: {
          task_id: summary.task_id,
          filepath,
          size: json.length,
        },
      });
      
      return filepath;
    } catch (error) {
      logger.error({
        category: 'artifact',
        action: 'session_summary_failed',
        message: `Failed to write session summary for task ${summary.task_id}`,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Extract summary from text (first N chars, preserving line breaks)
   */
  private extractSummary(text: string, maxChars: number): string {
    if (!text) return '';
    
    if (text.length <= maxChars) {
      return text;
    }
    
    // Try to break at a newline near the limit
    const nearEnd = text.substring(0, maxChars);
    const lastNewline = nearEnd.lastIndexOf('\n');
    
    if (lastNewline > maxChars * 0.8) {
      return nearEnd.substring(0, lastNewline) + '\n[... truncated]';
    }
    
    return nearEnd + '[... truncated]';
  }
}
