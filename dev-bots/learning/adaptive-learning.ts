/**
 * Adaptive Learning System
 * 
 * Learns from mistakes, patterns, and feedback to improve performance
 * Implements machine learning-like capabilities for continuous improvement
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LearningConfig {
  learning: {
    enabled: boolean;
    feedbackWeight: number;
    patternRecognition: boolean;
    adaptationRate: number;
    memorySize: number;
  };
  patterns: {
    errorPatterns: boolean;
    successPatterns: boolean;
    taskPatterns: boolean;
    timePatterns: boolean;
  };
  adaptation: {
    autoAdjust: boolean;
    confidenceThreshold: number;
    learningRate: number;
    maxIterations: number;
  };
}

export interface LearningPattern {
  id: string;
  type: 'error' | 'success' | 'task' | 'time';
  pattern: string;
  frequency: number;
  confidence: number;
  lastSeen: string;
  examples: string[];
  prevention?: string;
  optimization?: string;
}

export interface TaskFeedback {
  taskId: string;
  success: boolean;
  quality: number;
  timeTaken: number;
  errors: string[];
  improvements: string[];
  timestamp: string;
}

export class AdaptiveLearning {
  private config: LearningConfig;
  private patterns: Map<string, LearningPattern> = new Map();
  private feedback: TaskFeedback[] = [];
  private learningFile: string;
  private feedbackFile: string;

  constructor(configPath: string) {
    this.loadConfig(configPath);
    this.learningFile = path.join(__dirname, '../logs/learning-patterns.json');
    this.feedbackFile = path.join(__dirname, '../logs/task-feedback.json');
    this.loadLearningData();
  }

  private loadConfig(configPath: string): void {
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error('Failed to load learning config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): LearningConfig {
    return {
      learning: {
        enabled: true,
        feedbackWeight: 0.7,
        patternRecognition: true,
        adaptationRate: 0.1,
        memorySize: 1000
      },
      patterns: {
        errorPatterns: true,
        successPatterns: true,
        taskPatterns: true,
        timePatterns: true
      },
      adaptation: {
        autoAdjust: true,
        confidenceThreshold: 0.8,
        learningRate: 0.05,
        maxIterations: 100
      }
    };
  }

  private loadLearningData(): void {
    // Load patterns
    try {
      if (fs.existsSync(this.learningFile)) {
        const data = fs.readFileSync(this.learningFile, 'utf8');
        const patterns = JSON.parse(data);
        patterns.forEach((pattern: LearningPattern) => {
          this.patterns.set(pattern.id, pattern);
        });
      }
    } catch (error) {
      console.error('Failed to load learning patterns:', error);
    }

    // Load feedback
    try {
      if (fs.existsSync(this.feedbackFile)) {
        const data = fs.readFileSync(this.feedbackFile, 'utf8');
        this.feedback = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load feedback:', error);
    }
  }

  private saveLearningData(): void {
    // Save patterns
    try {
      const patterns = Array.from(this.patterns.values());
      fs.writeFileSync(this.learningFile, JSON.stringify(patterns, null, 2));
    } catch (error) {
      console.error('Failed to save learning patterns:', error);
    }

    // Save feedback
    try {
      fs.writeFileSync(this.feedbackFile, JSON.stringify(this.feedback, null, 2));
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  }

  /**
   * Record task feedback
   */
  public recordFeedback(feedback: TaskFeedback): void {
    if (!this.config.learning.enabled) {
      return;
    }

    this.feedback.push(feedback);
    
    // Keep only recent feedback
    if (this.feedback.length > this.config.learning.memorySize) {
      this.feedback = this.feedback.slice(-this.config.learning.memorySize);
    }

    // Learn from feedback
    this.learnFromFeedback(feedback);
    
    this.saveLearningData();
  }

  /**
   * Learn from feedback
   */
  private learnFromFeedback(feedback: TaskFeedback): void {
    // Analyze errors
    if (feedback.errors.length > 0) {
      this.analyzeErrors(feedback);
    }

    // Analyze success patterns
    if (feedback.success && feedback.quality > 0.8) {
      this.analyzeSuccess(feedback);
    }

    // Analyze time patterns
    this.analyzeTimePatterns(feedback);

    // Update existing patterns
    this.updatePatterns(feedback);
  }

  /**
   * Analyze errors
   */
  private analyzeErrors(feedback: TaskFeedback): void {
    for (const error of feedback.errors) {
      const patternId = `error_${this.hashString(error)}`;
      
      if (this.patterns.has(patternId)) {
        const pattern = this.patterns.get(patternId)!;
        pattern.frequency++;
        pattern.examples.push(feedback.taskId);
        pattern.lastSeen = feedback.timestamp;
        
        // Update confidence based on frequency
        pattern.confidence = Math.min(1.0, pattern.frequency / 10);
        
        this.patterns.set(patternId, pattern);
      } else {
        const newPattern: LearningPattern = {
          id: patternId,
          type: 'error',
          pattern: error,
          frequency: 1,
          confidence: 0.1,
          lastSeen: feedback.timestamp,
          examples: [feedback.taskId],
          prevention: this.generatePreventionStrategy(error)
        };
        
        this.patterns.set(patternId, newPattern);
      }
    }
  }

  /**
   * Analyze success patterns
   */
  private analyzeSuccess(feedback: TaskFeedback): void {
    const successKey = `success_${feedback.taskId}`;
    const patternId = `success_${this.hashString(successKey)}`;
    
    if (this.patterns.has(patternId)) {
      const pattern = this.patterns.get(patternId)!;
      pattern.frequency++;
      pattern.examples.push(feedback.taskId);
      pattern.lastSeen = feedback.timestamp;
      
      pattern.confidence = Math.min(1.0, pattern.frequency / 5);
      this.patterns.set(patternId, pattern);
    } else {
      const newPattern: LearningPattern = {
        id: patternId,
        type: 'success',
        pattern: successKey,
        frequency: 1,
        confidence: 0.2,
        lastSeen: feedback.timestamp,
        examples: [feedback.taskId],
        optimization: this.generateOptimizationStrategy(feedback)
      };
      
      this.patterns.set(patternId, newPattern);
    }
  }

  /**
   * Analyze time patterns
   */
  private analyzeTimePatterns(feedback: TaskFeedback): void {
    const timePattern = this.categorizeTimePattern(feedback.timeTaken);
    const patternId = `time_${timePattern}`;
    
    if (this.patterns.has(patternId)) {
      const pattern = this.patterns.get(patternId)!;
      pattern.frequency++;
      pattern.examples.push(feedback.taskId);
      pattern.lastSeen = feedback.timestamp;
      
      this.patterns.set(patternId, pattern);
    } else {
      const newPattern: LearningPattern = {
        id: patternId,
        type: 'time',
        pattern: timePattern,
        frequency: 1,
        confidence: 0.1,
        lastSeen: feedback.timestamp,
        examples: [feedback.taskId]
      };
      
      this.patterns.set(patternId, newPattern);
    }
  }

  /**
   * Update existing patterns
   */
  private updatePatterns(feedback: TaskFeedback): void {
    for (const [patternId, pattern] of this.patterns) {
      if (this.isPatternRelevant(pattern, feedback)) {
        pattern.frequency++;
        pattern.confidence = Math.min(1.0, pattern.frequency / 20);
        pattern.lastSeen = feedback.timestamp;
        
        this.patterns.set(patternId, pattern);
      }
    }
  }

  /**
   * Check if pattern is relevant to feedback
   */
  private isPatternRelevant(pattern: LearningPattern, feedback: TaskFeedback): boolean {
    switch (pattern.type) {
      case 'error':
        return feedback.errors.some(error => error.includes(pattern.pattern));
      case 'success':
        return feedback.success && feedback.quality > 0.8;
      case 'time':
        return this.categorizeTimePattern(feedback.timeTaken) === pattern.pattern;
      default:
        return false;
    }
  }

  /**
   * Categorize time pattern
   */
  private categorizeTimePattern(timeTaken: number): string {
    if (timeTaken < 60000) return 'fast';
    if (timeTaken < 300000) return 'medium';
    if (timeTaken < 900000) return 'slow';
    return 'very_slow';
  }

  /**
   * Generate prevention strategy
   */
  private generatePreventionStrategy(error: string): string {
    const strategies: Record<string, string> = {
      'timeout': 'Increase timeout limits or break task into smaller parts',
      'memory': 'Optimize memory usage or increase memory limits',
      'permission': 'Check file permissions and access rights',
      'network': 'Verify network connectivity and API endpoints',
      'syntax': 'Validate code syntax before execution',
      'dependency': 'Ensure all dependencies are installed and up to date'
    };

    for (const [key, strategy] of Object.entries(strategies)) {
      if (error.toLowerCase().includes(key)) {
        return strategy;
      }
    }

    return 'Review error details and implement appropriate fixes';
  }

  /**
   * Generate optimization strategy
   */
  private generateOptimizationStrategy(feedback: TaskFeedback): string {
    if (feedback.timeTaken < 60000) {
      return 'Task completed quickly - consider this approach for similar tasks';
    } else if (feedback.quality > 0.9) {
      return 'High quality result - replicate this methodology';
    } else {
      return 'Good result - continue with current approach';
    }
  }

  /**
   * Get learning insights
   */
  public getLearningInsights(): {
    totalPatterns: number;
    errorPatterns: number;
    successPatterns: number;
    recommendations: string[];
    topErrors: string[];
    topSuccesses: string[];
  } {
    const errorPatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'error')
      .sort((a, b) => b.frequency - a.frequency);

    const successPatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'success')
      .sort((a, b) => b.frequency - a.frequency);

    const recommendations = this.generateRecommendations();
    const topErrors = errorPatterns.slice(0, 5).map(p => p.pattern);
    const topSuccesses = successPatterns.slice(0, 5).map(p => p.pattern);

    return {
      totalPatterns: this.patterns.size,
      errorPatterns: errorPatterns.length,
      successPatterns: successPatterns.length,
      recommendations,
      topErrors,
      topSuccesses
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Analyze error patterns
    const errorPatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'error' && p.frequency > 3);
    
    for (const pattern of errorPatterns) {
      if (pattern.prevention) {
        recommendations.push(`Prevent ${pattern.pattern}: ${pattern.prevention}`);
      }
    }

    // Analyze success patterns
    const successPatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'success' && p.frequency > 2);
    
    for (const pattern of successPatterns) {
      if (pattern.optimization) {
        recommendations.push(`Optimize ${pattern.pattern}: ${pattern.optimization}`);
      }
    }

    return recommendations;
  }

  /**
   * Predict task success
   */
  public predictTaskSuccess(taskDescription: string): {
    successProbability: number;
    estimatedTime: number;
    potentialErrors: string[];
    recommendations: string[];
  } {
    const potentialErrors: string[] = [];
    const recommendations: string[] = [];
    let successProbability = 0.5; // Base probability
    let estimatedTime = 300000; // Base time (5 minutes)

    // Check against known error patterns
    for (const [, pattern] of this.patterns) {
      if (pattern.type === 'error' && pattern.confidence > 0.5) {
        if (taskDescription.toLowerCase().includes(pattern.pattern.toLowerCase())) {
          potentialErrors.push(pattern.pattern);
          successProbability -= 0.1;
        }
      }
    }

    // Check against success patterns
    for (const [, pattern] of this.patterns) {
      if (pattern.type === 'success' && pattern.confidence > 0.5) {
        if (taskDescription.toLowerCase().includes(pattern.pattern.toLowerCase())) {
          successProbability += 0.1;
          if (pattern.optimization) {
            recommendations.push(pattern.optimization);
          }
        }
      }
    }

    // Adjust time estimate based on patterns
    const timePatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'time');
    
    if (timePatterns.length > 0) {
      const avgTime = timePatterns.reduce((sum, p) => sum + p.frequency, 0) / timePatterns.length;
      estimatedTime = Math.max(60000, estimatedTime * (1 + avgTime / 10));
    }

    return {
      successProbability: Math.max(0, Math.min(1, successProbability)),
      estimatedTime,
      potentialErrors,
      recommendations
    };
  }

  /**
   * Hash string for pattern ID
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
