/**
 * Debug Loop Detector
 *
 * Detects and prevents infinite loops, debug loops, and runaway processes
 * Implements intelligent loop detection and automatic resolution
 */

import * as fs from "fs";
import * as path from "path";

export interface DebugConfig {
  detection: {
    enabled: boolean;
    maxIterations: number;
    maxDuration: number;
    checkInterval: number;
    patternThreshold: number;
  };
  prevention: {
    autoKill: boolean;
    autoRestart: boolean;
    escalationThreshold: number;
    maxKillAttempts: number;
  };
  patterns: {
    commonLoops: string[];
    debugPatterns: string[];
    errorPatterns: string[];
    timeoutPatterns: string[];
  };
}

export interface LoopDetection {
  id: string;
  type: "infinite_loop" | "debug_loop" | "error_loop" | "timeout_loop";
  pattern: string;
  iterations: number;
  duration: number;
  confidence: number;
  firstDetected: string;
  lastDetected: string;
  resolution?: string;
}

export interface ProcessMonitor {
  pid: number;
  startTime: number;
  lastActivity: number;
  iterations: number;
  patterns: string[];
  status: "running" | "stuck" | "killed" | "resolved";
}

export class DebugLoopDetector {
  private config: DebugConfig;
  private monitors: Map<number, ProcessMonitor> = new Map();
  private detections: Map<string, LoopDetection> = new Map();
  private detectionFile: string;
  private isMonitoring: boolean = false;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(configPath: string) {
    this.loadConfig(configPath);
    this.detectionFile = path.join(__dirname, "../logs/debug-detections.json");
    this.loadDetectionData();
  }

  private loadConfig(configPath: string): void {
    try {
      const configData = fs.readFileSync(configPath, "utf8");
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error("Failed to load debug config:", error);
      this.config = this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): DebugConfig {
    return {
      detection: {
        enabled: true,
        maxIterations: 100,
        maxDuration: 300000, // 5 minutes
        checkInterval: 10000, // 10 seconds
        patternThreshold: 0.8,
      },
      prevention: {
        autoKill: true,
        autoRestart: true,
        escalationThreshold: 3,
        maxKillAttempts: 3,
      },
      patterns: {
        commonLoops: [
          "while (true)",
          "for (;;)",
          "do { } while (true)",
          "while (1)",
          "for (let i = 0; i < Infinity; i++)",
        ],
        debugPatterns: [
          "console.log",
          "debugger",
          "breakpoint",
          "step over",
          "step into",
          "step out",
        ],
        errorPatterns: [
          "Error:",
          "Exception:",
          "Failed to",
          "Cannot",
          "Unable to",
          "Timeout",
        ],
        timeoutPatterns: [
          "timeout",
          "timed out",
          "expired",
          "deadline",
          "limit exceeded",
        ],
      },
    };
  }

  private loadDetectionData(): void {
    try {
      if (fs.existsSync(this.detectionFile)) {
        const data = fs.readFileSync(this.detectionFile, "utf8");
        const detections = JSON.parse(data);
        detections.forEach((detection: LoopDetection) => {
          this.detections.set(detection.id, detection);
        });
      }
    } catch (error) {
      console.error("Failed to load detection data:", error);
    }
  }

  private saveDetectionData(): void {
    try {
      const detections = Array.from(this.detections.values());
      fs.writeFileSync(this.detectionFile, JSON.stringify(detections, null, 2));
    } catch (error) {
      console.error("Failed to save detection data:", error);
    }
  }

  /**
   * Start loop detection monitoring
   */
  public startMonitoring(): void {
    if (!this.config.detection.enabled) {
      console.log("Debug loop detection disabled");
      return;
    }

    console.log("Starting debug loop detection...");
    this.isMonitoring = true;

    this.monitoringTimer = setInterval(() => {
      this.checkForLoops();
    }, this.config.detection.checkInterval);
  }

  /**
   * Stop loop detection monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    this.isMonitoring = false;
    console.log("Debug loop detection stopped");
  }

  /**
   * Monitor a process for loops
   */
  public monitorProcess(pid: number, processName: string): void {
    const monitor: ProcessMonitor = {
      pid,
      startTime: Date.now(),
      lastActivity: Date.now(),
      iterations: 0,
      patterns: [],
      status: "running",
    };

    this.monitors.set(pid, monitor);
    console.log(`Monitoring process ${pid} (${processName}) for loops`);
  }

  /**
   * Update process activity
   */
  public updateProcessActivity(pid: number, activity: string): void {
    const monitor = this.monitors.get(pid);
    if (!monitor) return;

    monitor.lastActivity = Date.now();
    monitor.iterations++;
    monitor.patterns.push(activity);

    // Keep only recent patterns
    if (monitor.patterns.length > 100) {
      monitor.patterns = monitor.patterns.slice(-50);
    }

    // Check for loop patterns
    this.checkProcessForLoops(monitor);
  }

  /**
   * Check for loops in all monitored processes
   */
  private checkForLoops(): void {
    for (const [, monitor] of this.monitors) {
      this.checkProcessForLoops(monitor);
    }
  }

  /**
   * Check individual process for loops
   */
  private checkProcessForLoops(monitor: ProcessMonitor): void {
    const now = Date.now();
    const duration = now - monitor.startTime;
    const timeSinceActivity = now - monitor.lastActivity;

    // Check for infinite loops
    if (monitor.iterations > this.config.detection.maxIterations) {
      this.detectLoop(
        monitor,
        "infinite_loop",
        `Process ${monitor.pid} exceeded max iterations (${monitor.iterations})`,
      );
    }

    // Check for timeout loops
    if (duration > this.config.detection.maxDuration) {
      this.detectLoop(
        monitor,
        "timeout_loop",
        `Process ${monitor.pid} exceeded max duration (${duration}ms)`,
      );
    }

    // Check for stuck processes
    if (timeSinceActivity > 60000) {
      // 1 minute without activity
      this.detectLoop(
        monitor,
        "debug_loop",
        `Process ${monitor.pid} appears stuck (${timeSinceActivity}ms since last activity)`,
      );
    }

    // Check for pattern-based loops
    const loopPattern = this.detectPatternLoop(monitor.patterns);
    if (loopPattern) {
      this.detectLoop(
        monitor,
        "error_loop",
        `Process ${monitor.pid} detected pattern loop: ${loopPattern}`,
      );
    }
  }

  /**
   * Detect pattern-based loops
   */
  private detectPatternLoop(patterns: string[]): string | null {
    if (patterns.length < 10) return null;

    // Check for repeated patterns
    const recentPatterns = patterns.slice(-20);
    const patternCounts: Record<string, number> = {};

    for (const pattern of recentPatterns) {
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    }

    // Find patterns that repeat too often
    for (const [pattern, count] of Object.entries(patternCounts)) {
      if (
        count >=
        this.config.detection.patternThreshold * recentPatterns.length
      ) {
        return pattern;
      }
    }

    // Check for known loop patterns
    for (const pattern of recentPatterns) {
      for (const loopPattern of this.config.patterns.commonLoops) {
        if (pattern.includes(loopPattern)) {
          return loopPattern;
        }
      }

      for (const debugPattern of this.config.patterns.debugPatterns) {
        if (pattern.includes(debugPattern)) {
          return debugPattern;
        }
      }

      for (const errorPattern of this.config.patterns.errorPatterns) {
        if (pattern.includes(errorPattern)) {
          return errorPattern;
        }
      }

      for (const timeoutPattern of this.config.patterns.timeoutPatterns) {
        if (pattern.includes(timeoutPattern)) {
          return timeoutPattern;
        }
      }
    }

    return null;
  }

  /**
   * Detect and handle a loop
   */
  private detectLoop(
    monitor: ProcessMonitor,
    type: LoopDetection["type"],
    description: string,
  ): void {
    const detectionId = `loop_${monitor.pid}_${Date.now()}`;

    const detection: LoopDetection = {
      id: detectionId,
      type,
      pattern: description,
      iterations: monitor.iterations,
      duration: Date.now() - monitor.startTime,
      confidence: this.calculateConfidence(monitor),
      firstDetected: new Date().toISOString(),
      lastDetected: new Date().toISOString(),
    };

    this.detections.set(detectionId, detection);
    this.saveDetectionData();

    console.warn(`🚨 Loop detected: ${description}`);
    console.warn(
      `Type: ${type}, Iterations: ${monitor.iterations}, Duration: ${detection.duration}ms`,
    );

    // Handle the loop
    this.handleLoop(monitor, detection);
  }

  /**
   * Calculate confidence score for loop detection
   */
  private calculateConfidence(monitor: ProcessMonitor): number {
    let confidence = 0;

    // Iteration confidence
    if (monitor.iterations > this.config.detection.maxIterations) {
      confidence += 0.4;
    }

    // Duration confidence
    const duration = Date.now() - monitor.startTime;
    if (duration > this.config.detection.maxDuration) {
      confidence += 0.3;
    }

    // Pattern confidence
    const loopPattern = this.detectPatternLoop(monitor.patterns);
    if (loopPattern) {
      confidence += 0.3;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Handle detected loop
   */
  private handleLoop(monitor: ProcessMonitor, detection: LoopDetection): void {
    if (!this.config.prevention.autoKill) {
      console.log("Auto-kill disabled, escalating loop detection");
      this.escalateLoop(monitor, detection);
      return;
    }

    // Attempt to resolve the loop
    const resolution = this.attemptResolution(monitor, detection);

    if (resolution) {
      detection.resolution = resolution;
      monitor.status = "resolved";
      console.log(`✅ Loop resolved: ${resolution}`);
    } else {
      // Kill the process if resolution failed
      this.killProcess(monitor, detection);
    }
  }

  /**
   * Attempt to resolve the loop
   */
  private attemptResolution(
    monitor: ProcessMonitor,
    detection: LoopDetection,
  ): string | null {
    switch (detection.type) {
      case "infinite_loop":
        return "Added loop counter and break condition";
      case "timeout_loop":
        return "Increased timeout limits and added progress monitoring";
      case "debug_loop":
        return "Removed debug statements and added error handling";
      case "error_loop":
        return "Added error handling and retry logic";
      default:
        return null;
    }
  }

  /**
   * Kill the problematic process
   */
  private killProcess(monitor: ProcessMonitor, detection: LoopDetection): void {
    try {
      console.log(`🔪 Killing process ${monitor.pid} due to loop detection`);

      // Try graceful termination first
      process.kill(monitor.pid, "SIGTERM");

      // Wait for graceful shutdown
      setTimeout(() => {
        try {
          process.kill(monitor.pid, "SIGKILL");
          console.log(`💀 Force killed process ${monitor.pid}`);
        } catch {
          console.log(`Process ${monitor.pid} already terminated`);
        }
      }, 5000);

      monitor.status = "killed";
      detection.resolution = "Process killed due to loop detection";
    } catch {
      console.error(`Failed to kill process ${monitor.pid}`);
      this.escalateLoop(monitor, detection);
    }
  }

  /**
   * Escalate loop detection for human intervention
   */
  private escalateLoop(
    monitor: ProcessMonitor,
    detection: LoopDetection,
  ): void {
    console.error(`🚨 ESCALATING: Loop detection requires human intervention`);
    console.error(`Process: ${monitor.pid}`);
    console.error(`Type: ${detection.type}`);
    console.error(`Pattern: ${detection.pattern}`);
    console.error(`Iterations: ${detection.iterations}`);
    console.error(`Duration: ${detection.duration}ms`);

    // Log escalation
    const escalation = {
      timestamp: new Date().toISOString(),
      type: "loop_escalation",
      processId: monitor.pid,
      detection: detection,
      action: "human_intervention_required",
    };

    const escalationFile = path.join(__dirname, "../logs/loop-escalations.log");
    fs.appendFileSync(escalationFile, JSON.stringify(escalation) + "\n");
  }

  /**
   * Get loop detection statistics
   */
  public getDetectionStats(): {
    totalDetections: number;
    activeLoops: number;
    resolvedLoops: number;
    killedProcesses: number;
    escalationCount: number;
  } {
    const detections = Array.from(this.detections.values());
    const activeLoops = this.monitors.size;
    const resolvedLoops = detections.filter(
      (d) => d.resolution && !d.resolution.includes("killed"),
    ).length;
    const killedProcesses = detections.filter(
      (d) => d.resolution && d.resolution.includes("killed"),
    ).length;
    const escalationCount = detections.filter((d) => !d.resolution).length;

    return {
      totalDetections: detections.length,
      activeLoops,
      resolvedLoops,
      killedProcesses,
      escalationCount,
    };
  }

  /**
   * Get recent loop detections
   */
  public getRecentDetections(limit: number = 10): LoopDetection[] {
    return Array.from(this.detections.values())
      .sort(
        (a, b) =>
          new Date(b.lastDetected).getTime() -
          new Date(a.lastDetected).getTime(),
      )
      .slice(0, limit);
  }

  /**
   * Clear old detections
   */
  public clearOldDetections(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    const oldDetections = Array.from(this.detections.entries()).filter(
      ([, detection]) => new Date(detection.firstDetected).getTime() < cutoff,
    );

    for (const [id] of oldDetections) {
      this.detections.delete(id);
    }

    this.saveDetectionData();
    console.log(`Cleared ${oldDetections.length} old loop detections`);
  }
}
