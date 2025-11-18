/**
 * Task Context Types
 *
 * Defines schemas for capturing rich diagnostic context for dev-bot automation.
 * Adapted from imagineer's bug report pattern but focused on prescriptive task
 * execution rather than retrospective debugging.
 */

import { z } from 'zod';

// ============================================================================
// Environment & Client Metadata
// ============================================================================

export const EnvironmentSnapshotSchema = z.object({
  appVersion: z.string().nullable(),
  gitSha: z.string().nullable(),
  buildTime: z.string().nullable(),
  nodeVersion: z.string().optional(),
  npmVersion: z.string().optional(),
  dockerImage: z.string().optional(),
  claudeVersion: z.string().optional(),
});

export const ClientMetadataSchema = z.object({
  locationHref: z.string().optional(),
  userAgent: z.string().optional(),
  platform: z.string().optional(),
  timestamp: z.string(),
});

export const ContainerMetadataSchema = z.object({
  containerId: z.string(),
  imageSha: z.string().optional(),
  cpuLimit: z.string().optional(),
  memoryLimitMB: z.number().optional(),
  workspacePath: z.string(),
  hostOS: z.string().optional(),
});

// ============================================================================
// Logs & Network (for frontend task creation)
// ============================================================================

export const LogEntrySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  timestamp: z.string(),
  category: z.string().optional(),
  serializedArgs: z.array(z.any()).optional(),
});

export const NetworkEventSchema = z.object({
  id: z.string(),
  method: z.string(),
  url: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  status: z.number().optional(),
  ok: z.boolean(),
  traceId: z.string().nullable(),
  requestHeaders: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
  responseHeaders: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
  requestBody: z.string().nullable().optional(),
  responseBody: z.string().nullable().optional(),
  error: z.string().optional(),
});

// ============================================================================
// Task Creation Context (captured when task is created)
// ============================================================================

export const AttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  data: z.string(), // base64 or URL
  sizeBytes: z.number().optional(),
});

export const TaskCreationContextSchema = z.object({
  // Environment at creation time
  environment: EnvironmentSnapshotSchema,

  // Client metadata (if created from frontend)
  clientMeta: ClientMetadataSchema.optional(),

  // Recent diagnostic breadcrumbs (if from frontend)
  recentLogs: z.array(LogEntrySchema).max(200).optional(),
  recentApiCalls: z.array(NetworkEventSchema).max(50).optional(),

  // Work-target specification
  workTarget: z.string(),
  targetBranch: z.string().default('main'),
  affectedFiles: z.array(z.string()).optional(),

  // Optional attachments
  screenshot: z.string().optional(), // base64 data URL
  attachments: z.array(AttachmentSchema).optional(),

  // App state snapshot (extensible via collectors)
  appState: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// Dev-Bot Execution Context (captured during task execution)
// ============================================================================

export const ShellCommandSchema = z.object({
  command: z.string(),
  cwd: z.string(),
  exitCode: z.number(),
  stdout: z.string(), // truncated to reasonable size
  stderr: z.string(), // truncated to reasonable size
  durationMs: z.number(),
  timestamp: z.string(),
});

export const FileOperationSchema = z.object({
  path: z.string(),
  operation: z.enum(['read', 'write', 'edit', 'delete']),
  linesBefore: z.number().optional(),
  linesAfter: z.number().optional(),
  diffPath: z.string().optional(), // reference to stored diff file
  timestamp: z.string(),
});

export const GitOperationSchema = z.object({
  command: z.string(), // e.g., 'git commit', 'git push'
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  filesChanged: z.number().optional(),
  timestamp: z.string(),
});

export const BuildOutputSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
  duration: z.number(),
  errors: z.array(z.object({
    file: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
  })).optional(),
  warnings: z.number().optional(),
  outputTruncated: z.string().optional(),
});

export const TestResultsSchema = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  total: z.number(),
  durationMs: z.number(),
  failures: z.array(z.object({
    test: z.string(),
    error: z.string(),
    file: z.string().optional(),
    line: z.number().optional(),
  })).optional(),
  coverage: z.object({
    lines: z.number().optional(),
    statements: z.number().optional(),
    branches: z.number().optional(),
    functions: z.number().optional(),
  }).optional(),
});

export const LintResultsSchema = z.object({
  errors: z.number(),
  warnings: z.number(),
  fixable: z.number().optional(),
  issues: z.array(z.object({
    file: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
    rule: z.string(),
    severity: z.enum(['error', 'warning']),
    message: z.string(),
  })).max(100).optional(), // cap at 100 to prevent huge payloads
});

export const QualityValidationResultSchema = z.object({
  passed: z.boolean(),
  buildPassed: z.boolean().optional(),
  testsPassed: z.boolean().optional(),
  lintPassed: z.boolean().optional(),
  typeCheckPassed: z.boolean().optional(),
  violations: z.array(z.object({
    gate: z.string(),
    severity: z.enum(['error', 'warning']),
    message: z.string(),
  })).optional(),
});

export const ArtifactSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['patch', 'log', 'screenshot', 'report', 'session_summary']),
  path: z.string(),
  sizeBytes: z.number(),
  createdAt: z.string(),
});

export const ResourceUsageSchema = z.object({
  peakMemoryMB: z.number().optional(),
  cpuTimeSeconds: z.number().optional(),
  diskUsageMB: z.number().optional(),
});

export const TokenUsageSchema = z.object({
  provider: z.string(), // 'anthropic', 'openai'
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number().optional(),
});

export const TaskExecutionContextSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  workerId: z.string(),

  // Container metadata
  containerMeta: ContainerMetadataSchema.optional(),

  // Timestamps
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),

  // Execution trail
  commands: z.array(ShellCommandSchema).optional(),
  fileOperations: z.array(FileOperationSchema).optional(),
  gitOperations: z.array(GitOperationSchema).optional(),

  // Build/test/lint outputs
  buildOutput: BuildOutputSchema.optional(),
  testResults: TestResultsSchema.optional(),
  lintResults: LintResultsSchema.optional(),

  // Quality gates
  qualityValidation: QualityValidationResultSchema.optional(),

  // Artifacts generated
  artifacts: z.array(ArtifactSchema).optional(),

  // Resource usage
  resourceUsage: ResourceUsageSchema.optional(),

  // Token tracking
  tokenUsage: TokenUsageSchema.optional(),

  // Exit status
  exitCode: z.number(),
  status: z.enum(['success', 'failed', 'noop']),
  failureReason: z.string().optional(),
  commitSha: z.string().optional(),
});

// ============================================================================
// Work-Target Configuration Context
// ============================================================================

export const WorkTargetConfigSchema = z.object({
  workTargetId: z.string(),
  repositoryUrl: z.string(),
  baseBranch: z.string(),

  // Build/test configuration
  buildCommand: z.string().optional(),
  testCommand: z.string().optional(),
  lintCommand: z.string().optional(),
  typeCheckCommand: z.string().optional(),

  // Workspace paths
  workspacePath: z.string(),

  // Access control
  allowedFilePatterns: z.array(z.string()).optional(),
  forbiddenFilePatterns: z.array(z.string()).optional(),
  maxFileChanges: z.number().optional(),

  // Credentials (references only, never actual secrets)
  credentialRefs: z.array(z.string()).optional(),
});

// ============================================================================
// Type exports (inferred from Zod schemas)
// ============================================================================

export type EnvironmentSnapshot = z.infer<typeof EnvironmentSnapshotSchema>;
export type ClientMetadata = z.infer<typeof ClientMetadataSchema>;
export type ContainerMetadata = z.infer<typeof ContainerMetadataSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type NetworkEvent = z.infer<typeof NetworkEventSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type TaskCreationContext = z.infer<typeof TaskCreationContextSchema>;
export type ShellCommand = z.infer<typeof ShellCommandSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type GitOperation = z.infer<typeof GitOperationSchema>;
export type BuildOutput = z.infer<typeof BuildOutputSchema>;
export type TestResults = z.infer<typeof TestResultsSchema>;
export type LintResults = z.infer<typeof LintResultsSchema>;
export type QualityValidationResult = z.infer<typeof QualityValidationResultSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type TaskExecutionContext = z.infer<typeof TaskExecutionContextSchema>;
export type WorkTargetConfig = z.infer<typeof WorkTargetConfigSchema>;
