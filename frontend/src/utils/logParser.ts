// Log parsing utilities for the frontend
export interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  service: string;
  source: string;
  metadata?: Record<string, any>;
}

export interface ParsedLogEntry extends LogEntry {
  parsedTimestamp: Date;
  formattedTime: string;
  isError: boolean;
  isWarning: boolean;
  isInfo: boolean;
  isDebug: boolean;
}

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

/**
 * Parse a raw log entry into a structured format
 */
export function parseLogEntry(rawEntry: unknown): ParsedLogEntry {
  // Type guard for object
  const entry = (typeof rawEntry === 'object' && rawEntry !== null) 
    ? rawEntry as Record<string, unknown>
    : {};

  const logEntry: LogEntry = {
    id: (typeof entry.id === 'string' ? entry.id : undefined) || generateId(),
    timestamp: (typeof entry.timestamp === 'string' ? entry.timestamp : undefined) || new Date().toISOString(),
    level: (typeof entry.level === 'string' ? entry.level : undefined) || 'INFO',
    message: (typeof entry.message === 'string' ? entry.message : undefined) || '',
    service: (typeof entry.service === 'string' ? entry.service : undefined) || 'unknown',
    source: (typeof entry.source === 'string' ? entry.source : undefined) || 'stdout',
    metadata: (typeof entry.metadata === 'object' && entry.metadata !== null ? entry.metadata as Record<string, unknown> : undefined) || {}
  };

  const parsedTimestamp = new Date(logEntry.timestamp);
  const formattedTime = formatTimestamp(parsedTimestamp);
  
  const level = logEntry.level.toUpperCase() as LogLevel;
  const isError = level === 'ERROR';
  const isWarning = level === 'WARN';
  const isInfo = level === 'INFO';
  const isDebug = level === 'DEBUG';

  return {
    ...logEntry,
    parsedTimestamp,
    formattedTime,
    isError,
    isWarning,
    isInfo,
    isDebug
  };
}

/**
 * Parse multiple log entries
 */
export function parseLogEntries(rawEntries: unknown[]): ParsedLogEntry[] {
  return rawEntries.map(parseLogEntry);
}

/**
 * Filter log entries by level
 */
export function filterByLevel(entries: ParsedLogEntry[], level: LogLevel): ParsedLogEntry[] {
  return entries.filter(entry => entry.level === level);
}

/**
 * Filter log entries by service
 */
export function filterByService(entries: ParsedLogEntry[], service: string): ParsedLogEntry[] {
  return entries.filter(entry => entry.service === service);
}

/**
 * Filter log entries by time range
 */
export function filterByTimeRange(
  entries: ParsedLogEntry[], 
  startTime: Date, 
  endTime: Date
): ParsedLogEntry[] {
  return entries.filter(entry => 
    entry.parsedTimestamp >= startTime && entry.parsedTimestamp <= endTime
  );
}

/**
 * Search log entries by message content
 */
export function searchLogEntries(entries: ParsedLogEntry[], query: string): ParsedLogEntry[] {
  const lowercaseQuery = query.toLowerCase();
  return entries.filter(entry => 
    entry.message.toLowerCase().includes(lowercaseQuery) ||
    entry.service.toLowerCase().includes(lowercaseQuery)
  );
}

/**
 * Sort log entries by timestamp
 */
export function sortLogEntries(entries: ParsedLogEntry[], ascending: boolean = true): ParsedLogEntry[] {
  return [...entries].sort((a, b) => {
    const comparison = a.parsedTimestamp.getTime() - b.parsedTimestamp.getTime();
    return ascending ? comparison : -comparison;
  });
}

/**
 * Get log level statistics
 */
export function getLogLevelStats(entries: ParsedLogEntry[]): Record<LogLevel, number> {
  const stats: Record<LogLevel, number> = {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    DEBUG: 0,
    TRACE: 0
  };

  entries.forEach(entry => {
    const level = entry.level as LogLevel;
    if (Object.prototype.hasOwnProperty.call(stats, level)) {
      stats[level]++;
    }
  });

  return stats;
}

/**
 * Get service statistics
 */
export function getServiceStats(entries: ParsedLogEntry[]): Record<string, number> {
  const stats: Record<string, number> = {};
  
  entries.forEach(entry => {
    stats[entry.service] = (stats[entry.service] || 0) + 1;
  });

  return stats;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: Date): string {
  return timestamp.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Generate a unique ID for log entries
 */
function generateId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract error details from log entry
 */
export function extractErrorDetails(entry: ParsedLogEntry): {
  error: string | null;
  stack: string | null;
  code: string | null;
} {
  if (!entry.isError) {
    return { error: null, stack: null, code: null };
  }

  const metadata = entry.metadata || {};
  return {
    error: metadata.error || entry.message,
    stack: metadata.stack || null,
    code: metadata.code || null
  };
}

/**
 * Check if log entry contains sensitive information
 */
export function containsSensitiveInfo(entry: ParsedLogEntry): boolean {
  const sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /auth/i,
    /credential/i
  ];

  const textToCheck = `${entry.message} ${JSON.stringify(entry.metadata || {})}`;
  
  return sensitivePatterns.some(pattern => pattern.test(textToCheck));
}

/**
 * Sanitize log entry by removing sensitive information
 */
export function sanitizeLogEntry(entry: ParsedLogEntry): ParsedLogEntry {
  if (!containsSensitiveInfo(entry)) {
    return entry;
  }

  const sanitizedMessage = entry.message.replace(
    /(password|token|secret|key|auth|credential)\s*[:=]\s*[^\s,}]+/gi,
    '$1: [REDACTED]'
  );

  const sanitizedMetadata = { ...entry.metadata };
  Object.keys(sanitizedMetadata).forEach(key => {
    if (/(password|token|secret|key|auth|credential)/i.test(key)) {
      sanitizedMetadata[key] = '[REDACTED]';
    }
  });

  return {
    ...entry,
    message: sanitizedMessage,
    metadata: sanitizedMetadata
  };
}
