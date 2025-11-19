/**
 * Log Formatter Utility
 *
 * Converts plain text log output from services to structured JSON format.
 * This utility reads from stdin and writes structured JSON logs to a file.
 *
 * Usage:
 * ```bash
 * firebase emulators:start 2>&1 | node logFormatter.js firebase-emulators
 * npm run dev 2>&1 | node logFormatter.js frontend-dev
 * python3 src/job_finder/simple_flask_worker.py 2>&1 | node logFormatter.js job-finder-worker
 * ```
 *
 * Each service's output is converted to the standardized JSON log format:
 * ```json
 * {
 *   "severity": "INFO|WARN|ERROR|DEBUG",
 *   "timestamp": "2025-10-22T19:45:23.434261Z",
 *   "environment": "development",
 *   "service": "service-name",
 *   "category": "system",
 *   "action": "log",
 *   "message": "Log message text"
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized log directory - same location for dev and production
// Development: <repo-root>/backend/data/logs
// Production: /opt/app-monitor/shared/backend/data/logs
const LOGS_DIR = process.env.LOGS_DIR || path.resolve(__dirname, '../../data/logs');

type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

interface StructuredLogEntry {
  severity: LogSeverity;
  timestamp: string;
  environment: string;
  service: string;
  category?: string;
  action?: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Service-specific log file mapping
 */
const LOG_FILE_MAP: Record<string, string> = {
  'firebase-emulators': 'backend.log',
  'frontend-dev': 'frontend.log',
  'job-finder-worker': 'worker.log',
};

/**
 * Detect log severity from message content
 */
function detectSeverity(line: string): LogSeverity {
  const lowerLine = line.toLowerCase();

  // Error patterns
  if (
    lowerLine.includes('error') ||
    lowerLine.includes('✗') ||
    lowerLine.includes('failed') ||
    lowerLine.includes('exception') ||
    lowerLine.includes('fatal')
  ) {
    return 'ERROR';
  }

  // Warning patterns
  if (
    lowerLine.includes('warn') ||
    lowerLine.includes('warning') ||
    lowerLine.includes('⚠') ||
    lowerLine.includes('deprecated')
  ) {
    return 'WARNING';
  }

  // Debug patterns
  if (lowerLine.includes('debug') || lowerLine.includes('trace')) {
    return 'DEBUG';
  }

  // Default to INFO
  return 'INFO';
}

/**
 * Extract timestamp from common log formats
 */
function extractTimestamp(line: string): string | null {
  // Common timestamp patterns:
  // [2025-10-21T19:12:15.973Z]
  // 2025-10-21T19:12:15.973Z
  // [2025-10-21 19:12:15]
  const timestampPatterns = [
    /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/,
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/,
    /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/,
  ];

  for (const pattern of timestampPatterns) {
    const match = line.match(pattern);
    if (match) {
      // If format is not ISO, convert it
      if (!match[1].includes('T')) {
        return new Date(match[1]).toISOString();
      }
      return match[1];
    }
  }

  return null;
}

/**
 * Remove ANSI color codes from text
 */
function stripAnsiCodes(text: string): string {
   
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Clean message text by removing timestamp and log level prefixes
 */
function cleanMessage(line: string, _severity: LogSeverity): string {
  let message = stripAnsiCodes(line);

  // Remove timestamp brackets if present
  message = message.replace(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]\s*/, '');
  message = message.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/, '');

  // Remove log level prefixes
  message = message.replace(/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s*/i, '');
  message = message.replace(/^(ERROR|WARN|WARNING|INFO|DEBUG):\s*/i, '');

  // Remove common Firebase emulator prefixes
  message = message.replace(/^[ⓘℹ✔✓!⚠✗]\s+/g, '');

  return message.trim();
}

/**
 * Detect category from message content (service-specific logic)
 */
function detectCategory(line: string, service: string): string {
  const lowerLine = line.toLowerCase();

  if (service === 'firebase-emulators') {
    if (lowerLine.includes('emulator')) return 'emulators';
    if (lowerLine.includes('firestore')) return 'database';
    if (lowerLine.includes('auth')) return 'auth';
    if (lowerLine.includes('functions')) return 'api';
    if (lowerLine.includes('storage')) return 'storage';
  }

  if (service === 'frontend-dev') {
    if (lowerLine.includes('vite')) return 'build';
    if (lowerLine.includes('hmr') || lowerLine.includes('reload')) return 'hmr';
    if (lowerLine.includes('build')) return 'build';
    if (lowerLine.includes('server')) return 'server';
  }

  if (service === 'job-finder-worker') {
    if (lowerLine.includes('flask')) return 'server';
    if (lowerLine.includes('worker')) return 'worker';
    if (lowerLine.includes('queue')) return 'queue';
    if (lowerLine.includes('pipeline')) return 'pipeline';
  }

  return 'system';
}

/**
 * Detect action from message content
 */
function detectAction(line: string, severity: LogSeverity): string {
  const lowerLine = line.toLowerCase();

  if (lowerLine.includes('start')) return 'starting';
  if (lowerLine.includes('stop') || lowerLine.includes('exit')) return 'stopping';
  if (lowerLine.includes('ready')) return 'ready';
  if (lowerLine.includes('listening')) return 'listening';
  if (lowerLine.includes('connect')) return 'connected';
  if (lowerLine.includes('disconnect')) return 'disconnected';
  if (lowerLine.includes('build')) return 'building';
  if (lowerLine.includes('compile')) return 'compiling';
  if (lowerLine.includes('error') && severity === 'ERROR') return 'error';
  if (lowerLine.includes('warn') && severity === 'WARNING') return 'warning';

  return 'log';
}

/**
 * Convert plain text log line to structured JSON format
 */
function convertToStructured(line: string, service: string): StructuredLogEntry {
  // Detect severity
  const severity = detectSeverity(line);

  // Extract or generate timestamp
  const extractedTimestamp = extractTimestamp(line);
  const timestamp = extractedTimestamp || new Date().toISOString();

  // Clean the message
  const message = cleanMessage(line, severity);

  // Detect category and action
  const category = detectCategory(line, service);
  const action = detectAction(line, severity);

  return {
    severity,
    timestamp,
    environment: 'development',
    service,
    category,
    action,
    message,
  };
}

/**
 * Format a log line to structured JSON (exported for use by ProcessManager)
 * @param line - The raw log line
 * @param service - The service name
 * @returns The structured log entry as JSON string, or null if line is empty
 */
export function formatLogLine(line: string, service: string): string | null {
  // Skip empty lines
  if (!line.trim()) {
    return null;
  }

  // Try to parse as JSON first (in case it's already structured)
  try {
    const parsed = JSON.parse(line);
    if (parsed.severity && parsed.timestamp && parsed.message) {
      // Already structured JSON - return as-is
      return line;
    }
  } catch {
    // Not JSON - continue with conversion
  }

  // Convert plain text to structured format
  const structured = convertToStructured(line, service);
  return JSON.stringify(structured);
}

/**
 * Main log formatter class (for standalone CLI usage)
 */
export class LogFormatter {
  private service: string;
  private logFile: string;
  private writeStream: fs.WriteStream;

  constructor(service: string) {
    this.service = service;

    // Determine log file name
    const logFileName = LOG_FILE_MAP[service] || `${service}.log`;
    this.logFile = path.join(LOGS_DIR, logFileName);

    // Ensure logs directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // Create write stream (append mode)
    this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  /**
   * Process a log line and write structured JSON to file
   */
  processLine(line: string): void {
    const formatted = formatLogLine(line, this.service);
    if (formatted) {
      this.writeStream.write(formatted + '\n');
    }
  }

  /**
   * Start reading from stdin and processing lines
   */
  start(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line: string) => {
      this.processLine(line);
      // Also echo to stdout for ProcessManager to capture
      console.log(line);
    });

    rl.on('close', () => {
      this.writeStream.end();
    });
  }

  /**
   * Close the log formatter
   */
  close(): void {
    this.writeStream.end();
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const serviceName = process.argv[2];

  if (!serviceName) {
    console.error('Usage: node logFormatter.js <service-name>');
    console.error('Available services: firebase-emulators, frontend-dev, job-finder-worker');
    process.exit(1);
  }

  const formatter = new LogFormatter(serviceName);
  formatter.start();
}
