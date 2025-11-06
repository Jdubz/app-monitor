/**
 * Cost and Token Usage Monitor
 *
 * Monitors Claude API usage, costs, and enforces spending limits
 * Prevents runaway costs and provides usage analytics
 */

import * as fs from "fs";
import * as path from "path";

export interface CostConfig {
  spending: {
    enabled: boolean;
    dailyLimit: number;
    monthlyLimit: number;
    perTaskLimit: number;
    emergencyThreshold: number;
  };
  monitoring: {
    enabled: boolean;
    checkInterval: number;
    alertThreshold: number;
    logLevel: string;
  };
  tokens: {
    maxTokensPerRequest: number;
    maxTokensPerDay: number;
    maxTokensPerMonth: number;
    costPerToken: number;
  };
}

export interface UsageMetrics {
  timestamp: string;
  totalCost: number;
  dailyCost: number;
  monthlyCost: number;
  totalTokens: number;
  dailyTokens: number;
  monthlyTokens: number;
  requestCount: number;
  averageCostPerRequest: number;
  averageTokensPerRequest: number;
}

export class CostMonitor {
  private config: CostConfig;
  private metrics: UsageMetrics;
  private metricsFile: string;
  private isMonitoring: boolean = false;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(configPath: string) {
    this.loadConfig(configPath);
    this.metricsFile = path.join(__dirname, "../logs/cost-metrics.json");
    this.metrics = this.loadMetrics();
  }

  private loadConfig(configPath: string): void {
    try {
      const configData = fs.readFileSync(configPath, "utf8");
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error("Failed to load cost config:", error);
      this.config = this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): CostConfig {
    return {
      spending: {
        enabled: true,
        dailyLimit: 50.0,
        monthlyLimit: 1000.0,
        perTaskLimit: 5.0,
        emergencyThreshold: 0.9,
      },
      monitoring: {
        enabled: true,
        checkInterval: 60000,
        alertThreshold: 0.8,
        logLevel: "info",
      },
      tokens: {
        maxTokensPerRequest: 100000,
        maxTokensPerDay: 1000000,
        maxTokensPerMonth: 20000000,
        costPerToken: 0.000015,
      },
    };
  }

  private loadMetrics(): UsageMetrics {
    try {
      if (fs.existsSync(this.metricsFile)) {
        const data = fs.readFileSync(this.metricsFile, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load metrics:", error);
    }

    return {
      timestamp: new Date().toISOString(),
      totalCost: 0,
      dailyCost: 0,
      monthlyCost: 0,
      totalTokens: 0,
      dailyTokens: 0,
      monthlyTokens: 0,
      requestCount: 0,
      averageCostPerRequest: 0,
      averageTokensPerRequest: 0,
    };
  }

  private saveMetrics(): void {
    try {
      fs.writeFileSync(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error("Failed to save metrics:", error);
    }
  }

  /**
   * Start cost monitoring
   */
  public startMonitoring(): void {
    if (!this.config.monitoring.enabled) {
      console.log("Cost monitoring disabled");
      return;
    }

    console.log("Starting cost monitoring...");
    this.isMonitoring = true;

    this.monitoringTimer = setInterval(() => {
      this.checkSpendingLimits();
      this.generateUsageReport();
    }, this.config.monitoring.checkInterval);
  }

  /**
   * Stop cost monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    this.isMonitoring = false;
    console.log("Cost monitoring stopped");
  }

  /**
   * Record API usage
   */
  public recordUsage(tokens: number, cost: number): boolean {
    if (!this.config.spending.enabled) {
      return true;
    }

    // Check per-request limits
    if (tokens > this.config.tokens.maxTokensPerRequest) {
      console.error(
        `Request blocked: ${tokens} tokens exceeds max ${this.config.tokens.maxTokensPerRequest}`,
      );
      return false;
    }

    if (cost > this.config.spending.perTaskLimit) {
      console.error(
        `Request blocked: $${cost} exceeds per-task limit $${this.config.spending.perTaskLimit}`,
      );
      return false;
    }

    // Update metrics
    this.metrics.totalCost += cost;
    this.metrics.dailyCost += cost;
    this.metrics.monthlyCost += cost;
    this.metrics.totalTokens += tokens;
    this.metrics.dailyTokens += tokens;
    this.metrics.monthlyTokens += tokens;
    this.metrics.requestCount++;
    this.metrics.averageCostPerRequest =
      this.metrics.totalCost / this.metrics.requestCount;
    this.metrics.averageTokensPerRequest =
      this.metrics.totalTokens / this.metrics.requestCount;
    this.metrics.timestamp = new Date().toISOString();

    this.saveMetrics();

    // Check spending limits
    if (this.checkSpendingLimits()) {
      return true;
    } else {
      // Rollback the usage
      this.metrics.totalCost -= cost;
      this.metrics.dailyCost -= cost;
      this.metrics.monthlyCost -= cost;
      this.metrics.totalTokens -= tokens;
      this.metrics.dailyTokens -= tokens;
      this.metrics.monthlyTokens -= tokens;
      this.metrics.requestCount--;
      this.saveMetrics();
      return false;
    }
  }

  /**
   * Check spending limits
   */
  private checkSpendingLimits(): boolean {
    const dailyLimit = this.config.spending.dailyLimit;
    const monthlyLimit = this.config.spending.monthlyLimit;
    const emergencyThreshold = this.config.spending.emergencyThreshold;

    // Check daily limit
    if (this.metrics.dailyCost >= dailyLimit * emergencyThreshold) {
      console.warn(
        `⚠️ Daily spending approaching limit: $${this.metrics.dailyCost}/${dailyLimit}`,
      );
    }

    if (this.metrics.dailyCost >= dailyLimit) {
      console.error(
        `🚨 Daily spending limit exceeded: $${this.metrics.dailyCost}/${dailyLimit}`,
      );
      this.triggerEmergencyStop();
      return false;
    }

    // Check monthly limit
    if (this.metrics.monthlyCost >= monthlyLimit * emergencyThreshold) {
      console.warn(
        `⚠️ Monthly spending approaching limit: $${this.metrics.monthlyCost}/${monthlyLimit}`,
      );
    }

    if (this.metrics.monthlyCost >= monthlyLimit) {
      console.error(
        `🚨 Monthly spending limit exceeded: $${this.metrics.monthlyCost}/${monthlyLimit}`,
      );
      this.triggerEmergencyStop();
      return false;
    }

    return true;
  }

  /**
   * Trigger emergency stop
   */
  private triggerEmergencyStop(): void {
    console.error("🚨 EMERGENCY STOP: Spending limits exceeded");

    // Stop all workers
    this.stopAllWorkers();

    // Send emergency notification
    this.sendEmergencyNotification();

    // Log emergency event
    this.logEmergencyEvent();
  }

  /**
   * Stop all workers
   */
  private stopAllWorkers(): void {
    // Implementation would stop all worker processes
    console.log("Stopping all workers due to spending limit exceeded");
  }

  /**
   * Send emergency notification
   */
  private sendEmergencyNotification(): void {
    const notification = {
      type: "emergency",
      message: "Spending limits exceeded - all workers stopped",
      metrics: this.metrics,
      timestamp: new Date().toISOString(),
    };

    console.error("EMERGENCY NOTIFICATION:", notification);

    // Save notification to file
    const notificationFile = path.join(
      __dirname,
      "../logs/emergency-notifications.log",
    );
    fs.appendFileSync(notificationFile, JSON.stringify(notification) + "\n");
  }

  /**
   * Log emergency event
   */
  private logEmergencyEvent(): void {
    const event = {
      timestamp: new Date().toISOString(),
      type: "emergency_stop",
      reason: "spending_limit_exceeded",
      metrics: this.metrics,
    };

    const eventFile = path.join(__dirname, "../logs/emergency-events.log");
    fs.appendFileSync(eventFile, JSON.stringify(event) + "\n");
  }

  /**
   * Generate usage report
   */
  private generateUsageReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      limits: {
        daily: this.config.spending.dailyLimit,
        monthly: this.config.spending.monthlyLimit,
        perTask: this.config.spending.perTaskLimit,
      },
      utilization: {
        daily: (this.metrics.dailyCost / this.config.spending.dailyLimit) * 100,
        monthly:
          (this.metrics.monthlyCost / this.config.spending.monthlyLimit) * 100,
      },
    };

    console.log("📊 Cost Report:", JSON.stringify(report, null, 2));

    // Save report
    const reportFile = path.join(__dirname, "../logs/cost-reports.json");
    fs.appendFileSync(reportFile, JSON.stringify(report) + "\n");
  }

  /**
   * Get current metrics
   */
  public getMetrics(): UsageMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset daily metrics
   */
  public resetDailyMetrics(): void {
    this.metrics.dailyCost = 0;
    this.metrics.dailyTokens = 0;
    this.saveMetrics();
    console.log("Daily metrics reset");
  }

  /**
   * Reset monthly metrics
   */
  public resetMonthlyMetrics(): void {
    this.metrics.monthlyCost = 0;
    this.metrics.monthlyTokens = 0;
    this.saveMetrics();
    console.log("Monthly metrics reset");
  }

  /**
   * Check if request is allowed
   */
  public isRequestAllowed(estimatedTokens: number): boolean {
    if (!this.config.spending.enabled) {
      return true;
    }

    const estimatedCost = estimatedTokens * this.config.tokens.costPerToken;

    // Check per-request limits
    if (estimatedTokens > this.config.tokens.maxTokensPerRequest) {
      return false;
    }

    if (estimatedCost > this.config.spending.perTaskLimit) {
      return false;
    }

    // Check daily limits
    if (
      this.metrics.dailyCost + estimatedCost >
      this.config.spending.dailyLimit
    ) {
      return false;
    }

    // Check monthly limits
    if (
      this.metrics.monthlyCost + estimatedCost >
      this.config.spending.monthlyLimit
    ) {
      return false;
    }

    return true;
  }
}
