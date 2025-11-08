import { Logging, Entry } from '@google-cloud/logging';
import { logger } from '../utils/logger.js';
import { config, environments } from '../config.js';
import type {
  EnvironmentsResponse,
  EnvironmentServicesResponse,
} from '@app-monitor/api-contracts';
import * as fs from 'fs';

export interface ParsedCloudLog {
  id: string;
  service: string;
  timestamp: number;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata: {
    trace?: string;
    spanId?: string;
    resource?: Record<string, unknown>;
    labels?: Record<string, string>;
    [key: string]: unknown;
  };
  raw: unknown;
}

export interface CloudLogsQuery {
  environment: string;
  service?: string;
  severity?: string;
  limit?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
  customFilter?: string;
}

export class CloudLogging {
  private logging: Logging | null = null;
  private initialized = false;
  private lastRequestTime: Record<string, number> = {};
  private minRequestInterval = 1000; // 1 second between requests per environment

  constructor() {
    this.initializeLogging();
  }

  /**
   * Initialize Google Cloud Logging client
   * 
   * Required IAM permissions:
   * - roles/logging.viewer: Read logs from Cloud Logging
   * 
   * See docs/GOOGLE_CLOUD_LOGGING_PERMISSIONS.md for setup instructions
   */
  private async initializeLogging(): Promise<void> {
    try {
      // Check if credentials file exists
      if (fs.existsSync(config.gcpKeyFile)) {
        this.logging = new Logging({
          keyFilename: config.gcpKeyFile,
        });
        logger.info({
      category: 'process',
      action: 'cloudlogging_initialized_with_keyfile_config_gcpke',
      message: `CloudLogging initialized with keyfile: ${config.gcpKeyFile}`
    });
        this.initialized = true;
      } else {
        // Try Application Default Credentials
        try {
          this.logging = new Logging();
          logger.info({
      category: 'process',
      action: 'cloudlogging_initialized_with_application_default_',
      message: 'CloudLogging initialized with Application Default Credentials'
    });
          this.initialized = true;
        } catch (adcError) {
          logger.warn({
      category: 'process',
      action: 'cloudlogging_could_not_initialize_no_credentials_f',
      message: 'CloudLogging could not initialize: No credentials found'
    });
          logger.warn({
      category: 'process',
      action: 'key_file_not_found_config_gcpkeyfile',
      message: `Key file not found: ${config.gcpKeyFile}`
    });
          logger.warn({
      category: 'process',
      action: 'cloud_logs_features_will_be_disabled',
      message: 'Cloud logs features will be disabled'
    });
          this.initialized = false;
        }
      }
    } catch (error) {
      logger.error({
        category: 'cloud',
        action: 'initialize_failed',
        message: 'Failed to initialize CloudLogging',
        error
      });
      this.initialized = false;
    }
  }

  /**
   * Check if cloud logging is available
   */
  isAvailable(): boolean {
    return this.initialized && this.logging !== null;
  }

  /**
   * Get logs from Google Cloud Logging
   */
  async getLogs(query: CloudLogsQuery): Promise<ParsedCloudLog[]> {
    if (!this.isAvailable()) {
      throw new Error('Cloud Logging is not available. Check credentials configuration.');
    }

    const environment = environments[query.environment];
    if (!environment) {
      throw new Error(`Environment "${query.environment}" not found`);
    }

    if (environment.name === 'local') {
      throw new Error('Cannot fetch cloud logs for local environment');
    }

    // Rate limiting
    this.enforceRateLimit(query.environment);

    try {
      const filter = this.buildFilter(query, environment);
      const limit = query.limit || 100;

      logger.info({
      category: 'process',
      action: 'fetching_logs_for_query_environment_with_filter_fi',
      message: `Fetching logs for ${query.environment} with filter: ${filter}`
    });

      const [entries] = await this.logging!.getEntries({
        filter,
        pageSize: limit,
        orderBy: 'timestamp desc',
      });

      const parsedLogs = entries.map((entry, index) =>
        this.parseLogEntry(entry, query.service || 'all', index)
      );

      logger.info({
      category: 'process',
      action: 'fetched_parsedlogs_length_cloud_logs_for_query_env',
      message: `Fetched ${parsedLogs.length} cloud logs for ${query.environment}`
    });
      return parsedLogs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        category: 'cloud',
        action: 'fetch_logs_failed',
        message: 'Failed to fetch cloud logs',
        error
      });
      throw new Error(`Failed to fetch cloud logs: ${errorMessage}`);
    }
  }

  /**
   * Build Cloud Logging filter query
   */
  private buildFilter(query: CloudLogsQuery, environment: typeof environments.staging): string {
    const filters: string[] = [];

    // Project filter (implied by logging client project)
    // filters.push(`resource.labels.project_id="${environment.projectId}"`);

    // Service filter
    if (query.service && query.service !== 'all-functions') {
      const serviceConfig = environment.services.find(s => s.name === query.service);
      if (serviceConfig?.logFilter) {
        filters.push(`(${serviceConfig.logFilter})`);
      }
    } else {
      // All cloud functions
      filters.push('resource.type="cloud_function"');
    }

    // Exclude audit logs by default (they spam the logs with binary data)
    // Users can include them by adding a custom filter
    if (!query.customFilter?.includes('protoPayload')) {
      filters.push('NOT protoPayload.serviceName=~".*"');
    }

    // Severity filter
    if (query.severity) {
      filters.push(`severity="${query.severity}"`);
    }

    // Time range filter
    if (query.timeRange) {
      filters.push(`timestamp >= "${query.timeRange.start.toISOString()}"`);
      filters.push(`timestamp <= "${query.timeRange.end.toISOString()}"`);
    }

    // Custom filter
    if (query.customFilter) {
      filters.push(`(${query.customFilter})`);
    }

    return filters.join(' AND ');
  }

  /**
   * Parse a Cloud Logging entry into our standardized format
   */
  private parseLogEntry(entry: Entry, serviceName: string, index: number): ParsedCloudLog {
    // Google Cloud Logging Entry types are complex and vary by log type
    // Using Record<string, unknown> for safe access to dynamic properties
    const metadata = entry.metadata as Record<string, unknown>;
    const data = entry.data as Record<string, unknown> | string;

    // Extract message from different payload types
    let message = '';
    if (typeof data === 'string') {
      message = data;
    } else if (typeof data === 'object' && data !== null) {
      if ('message' in data && typeof data.message === 'string') {
        message = data.message;
      } else if ('textPayload' in data && typeof data.textPayload === 'string') {
        message = data.textPayload;
      } else if ('jsonPayload' in data) {
        message = JSON.stringify(data.jsonPayload);
      } else if ('protoPayload' in data && typeof data.protoPayload === 'object' && data.protoPayload !== null) {
        // Handle protobuf audit logs - extract meaningful information
        message = this.parseProtoPayload(data.protoPayload as Record<string, unknown>, metadata);
      } else {
        message = JSON.stringify(data);
      }
    } else {
      message = JSON.stringify(data);
    }

    // Map Cloud Logging severity to our log levels
    const severity = typeof metadata.severity === 'string' ? metadata.severity : 'INFO';
    const level = this.mapSeverityToLevel(severity);

    // Extract timestamp
    // entry.timestamp is an object with { seconds: number, nanos?: number }
    const entryTimestamp = (entry as unknown as { timestamp?: unknown }).timestamp;
    const timestamp = entryTimestamp
      ? (typeof entryTimestamp === 'object' && entryTimestamp !== null && 'seconds' in entryTimestamp
          ? (entryTimestamp as { seconds: number }).seconds * 1000
          : new Date(entryTimestamp as string | number | Date).getTime())
      : Date.now();

    // Extract trace and span IDs
    const trace = typeof metadata.trace === 'string' ? metadata.trace : undefined;
    const spanId = typeof metadata.spanId === 'string' ? metadata.spanId : undefined;

    // Extract resource info
    const resource = typeof metadata.resource === 'object' && metadata.resource !== null
      ? metadata.resource as Record<string, unknown>
      : undefined;

    // Extract labels
    const labels = typeof metadata.labels === 'object' && metadata.labels !== null
      ? metadata.labels as Record<string, string>
      : {} as Record<string, string>;

    return {
      id: `cloud-${serviceName}-${index}-${timestamp}`,
      service: serviceName,
      timestamp,
      level,
      message,
      metadata: {
        trace,
        spanId,
        resource,
        labels,
        severity,
        insertId: typeof metadata.insertId === 'string' ? metadata.insertId : undefined,
        logName: typeof metadata.logName === 'string' ? metadata.logName : undefined,
      },
      raw: entry,
    };
  }

  /**
   * Parse protobuf audit log payload into a readable message
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private parseProtoPayload(protoPayload: Record<string, unknown>, _metadata: Record<string, unknown>): string {
    try {
      // Extract key information from audit log
      const methodName = typeof protoPayload.methodName === 'string' ? protoPayload.methodName : 'Unknown method';
      const serviceName = typeof protoPayload.serviceName === 'string' ? protoPayload.serviceName : 'Unknown service';
      const resourceName = typeof protoPayload.resourceName === 'string' ? protoPayload.resourceName : '';
      const requestMetadata = typeof protoPayload.requestMetadata === 'object' && protoPayload.requestMetadata !== null
        ? protoPayload.requestMetadata as Record<string, unknown>
        : {} as Record<string, unknown>;
      const callerIp = typeof requestMetadata.callerIp === 'string' ? requestMetadata.callerIp : 'Unknown IP';

      // For Cloud Build/Functions deployment audit logs
      if (serviceName.includes('cloudfunctions') || serviceName.includes('cloudbuild')) {
        const status = typeof protoPayload.status === 'object' && protoPayload.status !== null
          ? protoPayload.status as Record<string, unknown>
          : {} as Record<string, unknown>;
        if (typeof status.message === 'string') {
          // Extract the actual error message from the status
          return `[Audit Log] ${serviceName}: ${status.message}`;
        }
      }

      // Build a concise audit log message
      const parts = [
        `[Audit Log]`,
        serviceName,
        methodName.split('.').pop(), // Get just the method name without full path
        resourceName ? `on ${resourceName.split('/').pop()}` : '',
        `from ${callerIp}`,
      ].filter(Boolean);

      return parts.join(' ');
    } catch (error) {
      // Fallback to basic info if parsing fails
      return `[Audit Log] ${protoPayload.serviceName || 'Unknown service'}`;
    }
  }

  /**
   * Map Cloud Logging severity to our log level
   */
  private mapSeverityToLevel(severity: string): 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' {
    const severityUpper = severity.toUpperCase();

    if (severityUpper.includes('ERROR') || severityUpper.includes('CRITICAL') || severityUpper.includes('ALERT') || severityUpper.includes('EMERGENCY')) {
      return 'ERROR';
    }
    if (severityUpper.includes('WARN')) {
      return 'WARN';
    }
    if (severityUpper.includes('DEBUG') || severityUpper.includes('TRACE')) {
      return 'DEBUG';
    }

    return 'INFO';
  }

  /**
   * Enforce rate limiting to prevent quota exhaustion
   */
  private enforceRateLimit(environment: string): void {
    const now = Date.now();
    const lastRequest = this.lastRequestTime[environment] || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      throw new Error(`Rate limit: Please wait ${waitTime}ms before making another request to ${environment}`);
    }

    this.lastRequestTime[environment] = now;
  }

  /**
   * Get available environments
   */
  getEnvironments(): EnvironmentsResponse {
    return environments;
  }

  /**
   * Get services for a specific environment
   */
  getServicesForEnvironment(environmentName: string): EnvironmentServicesResponse {
    const environment = environments[environmentName];
    if (!environment) {
      throw new Error(`Environment "${environmentName}" not found`);
    }
    return environment.services;
  }

  /**
   * Build Cloud Console URL for a trace
   */
  getTraceUrl(projectId: string, traceId: string): string {
    return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${traceId}`;
  }
}
