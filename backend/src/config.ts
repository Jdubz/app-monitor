import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { CloudService, EnvironmentDefinition } from '@app-monitor/api-contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory of job-finder-app-manager (backend/src -> backend -> app-monitor -> root)
const ROOT_DIR = path.resolve(__dirname, '../../..');

// Load environment variables from .env file (backend directory)
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5174',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../data/app-monitor.db'),
  gcpKeyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT_DIR, '.firebase/serviceAccountKey.json'),
  logSourcesConfig: path.join(__dirname, '../config/log-sources.json'),
  workerLogStreamsConfig: path.join(__dirname, '../config/worker-log-streams.json'),

  // Automatic Failure Recovery Feature Flags
  recovery: {
    // Enable automatic recovery system (default: disabled for safety)
    enabled: process.env.ENABLE_AUTO_RECOVERY === 'true',

    // Dry run mode - logs recovery actions without executing repair bots (default: true for testing)
    dryRun: process.env.RECOVERY_DRY_RUN !== 'false',  // Defaults to true unless explicitly disabled

    // Maximum concurrent repair bots (cleanup + followup) to prevent resource exhaustion
    maxConcurrentRepairBots: parseInt(process.env.MAX_CONCURRENT_REPAIR_BOTS || '1', 10),

    // Timeout for cleanup and followup bots (in milliseconds)
    cleanupTimeoutMs: parseInt(process.env.RECOVERY_CLEANUP_TIMEOUT_MS || '600000', 10),  // 10 minutes
    followupTimeoutMs: parseInt(process.env.RECOVERY_FOLLOWUP_TIMEOUT_MS || '900000', 10), // 15 minutes
  },
};

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  command: string;
  args: string[];
  cwd: string;
  ports?: number[];
  requirePorts?: boolean;  // If true, fail if ports are busy
  env?: Record<string, string>;
}

export const services: Record<string, ServiceConfig> = {
  'job-finder-backend': {
    name: 'job-finder-backend',
    displayName: 'Job Finder Backend',
    description: 'Node.js backend + Firebase emulators (Auth, Firestore, Functions, Storage + UI)',
    command: 'npm',
    args: ['run', 'start'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    ports: [5001, 4000, 4400, 8080, 9099, 9199],
    requirePorts: true,
    env: process.env as Record<string, string>,
  },
  'job-finder-frontend': {
    name: 'job-finder-frontend',
    displayName: 'Job Finder Frontend',
    description: 'React/Vite development server',
    command: 'npm',
    args: ['run', 'dev'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    ports: [5173],
    requirePorts: true,
    env: process.env as Record<string, string>,
  },
  'job-finder-worker': {
    name: 'job-finder-worker',
    displayName: 'Job Finder Worker',
    description: 'Flask-based worker with health monitoring (port 5555)',
    command: 'python3',
    args: ['src/job_finder/simple_flask_worker.py'],
    cwd: path.join(ROOT_DIR, 'job-finder-worker'),
    ports: [5555],
    requirePorts: true,
    env: {
      ...(process.env as Record<string, string>),
      LOG_FILE: path.join(ROOT_DIR, 'job-finder-worker/logs/worker.log'),
      WORKER_PORT: '5555',
      WORKER_HOST: '0.0.0.0',
    },
  },
};

// Cloud environment configurations
export interface EnvironmentConfig extends EnvironmentDefinition {
  readOnly: boolean;
}

export interface CloudServiceConfig extends CloudService {}

export const environments: Record<string, EnvironmentConfig> = {
  local: {
    name: 'local',
    displayName: 'Local Development',
    projectId: 'local',
    services: [
      {
        name: 'firebase-emulators',
        displayName: 'Firebase Emulators',
        description: 'Auth, Firestore, Functions, Storage + UI',
      },
      {
        name: 'frontend-dev',
        displayName: 'Frontend Dev Server',
        description: 'Vite dev server (port 5173)',
      },
      {
        name: 'job-finder-worker',
        displayName: 'Job Finder Worker',
        description: 'Flask-based worker with health monitoring (port 5555)',
      },
    ],
    readOnly: false,
  },
  staging: {
    name: 'staging',
    displayName: 'Staging',
    projectId: 'static-sites-257923',
    services: [
      {
        name: 'manageGenerator-staging',
        displayName: 'Generator (Staging)',
        description: 'Content generator functions',
        logFilter: 'resource.type="cloud_function" resource.labels.function_name="manageGenerator-staging"',
      },
      {
        name: 'contact-form-staging',
        displayName: 'Contact Form (Staging)',
        description: 'Contact form handler',
        logFilter: 'resource.type="cloud_function" resource.labels.function_name="contact-form-staging"',
      },
      {
        name: 'all-functions',
        displayName: 'All Functions (Staging)',
        description: 'All staging Cloud Functions',
        logFilter: 'resource.type="cloud_function" resource.labels.function_name=~".*-staging"',
      },
    ],
    readOnly: true,
  },
  production: {
    name: 'production',
    displayName: 'Production',
    projectId: process.env.PROD_PROJECT_ID || 'static-sites-257923',
    services: [
      {
        name: 'manageGenerator',
        displayName: 'Generator (Production)',
        description: 'Content generator functions',
        logFilter: 'resource.type="cloud_function" resource.labels.function_name="manageGenerator"',
      },
      {
        name: 'contact-form',
        displayName: 'Contact Form (Production)',
        description: 'Contact form handler',
        logFilter: 'resource.type="cloud_function" resource.labels.function_name="contact-form"',
      },
      {
        name: 'all-functions',
        displayName: 'All Functions (Production)',
        description: 'All production Cloud Functions (excludes staging)',
        logFilter: 'resource.type="cloud_function" NOT resource.labels.function_name=~".*-staging"',
      },
    ],
    readOnly: true,
  },
};

// Script configuration for one-off tasks
export type ScriptCategory = 'build' | 'test' | 'quality' | 'database' | 'deployment' | 'utility';
export type DangerLevel = 'safe' | 'warning' | 'danger';

export interface ScriptConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: ScriptCategory;
  command: string;
  args: string[];
  cwd: string;
  requiresConfirmation?: boolean;
  dangerLevel?: DangerLevel;
  icon?: string;
}

export const scripts: Record<string, ScriptConfig> = {
  // Frontend scripts
  'fe-build': {
    id: 'fe-build',
    name: 'fe-build',
    displayName: 'Build Frontend',
    description: 'Build production bundle for frontend (Vite)',
    category: 'build',
    command: 'npm',
    args: ['run', 'build'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    icon: '📦',
  },
  'fe-test': {
    id: 'fe-test',
    name: 'fe-test',
    displayName: 'Test Frontend',
    description: 'Run frontend unit tests (Vitest)',
    category: 'test',
    command: 'npm',
    args: ['test'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    icon: '🧪',
  },
  'fe-test-e2e': {
    id: 'fe-test-e2e',
    name: 'fe-test-e2e',
    displayName: 'E2E Tests (Frontend)',
    description: 'Run end-to-end tests (Playwright)',
    category: 'test',
    command: 'npm',
    args: ['run', 'test:e2e'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    icon: '🎭',
  },
  'fe-lint': {
    id: 'fe-lint',
    name: 'fe-lint',
    displayName: 'Lint Frontend',
    description: 'Run ESLint on frontend code',
    category: 'quality',
    command: 'npm',
    args: ['run', 'lint'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    icon: '🔍',
  },
  'fe-type-check': {
    id: 'fe-type-check',
    name: 'fe-type-check',
    displayName: 'Type Check (Frontend)',
    description: 'Run TypeScript type checking',
    category: 'quality',
    command: 'npm',
    args: ['run', 'type-check'],
    cwd: path.join(ROOT_DIR, 'job-finder-FE'),
    icon: '📐',
  },

  // Backend scripts
  'be-build': {
    id: 'be-build',
    name: 'be-build',
    displayName: 'Build Backend',
    description: 'Build Cloud Functions (TypeScript compilation)',
    category: 'build',
    command: 'npm',
    args: ['run', 'build'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    icon: '📦',
  },
  'be-test': {
    id: 'be-test',
    name: 'be-test',
    displayName: 'Test Backend',
    description: 'Run backend unit tests (Jest)',
    category: 'test',
    command: 'npm',
    args: ['test'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    icon: '🧪',
  },
  'be-lint': {
    id: 'be-lint',
    name: 'be-lint',
    displayName: 'Lint Backend',
    description: 'Run ESLint on backend code',
    category: 'quality',
    command: 'npm',
    args: ['run', 'lint'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    icon: '🔍',
  },

  // Worker scripts
  'worker-test': {
    id: 'worker-test',
    name: 'worker-test',
    displayName: 'Test Worker',
    description: 'Run worker unit tests (pytest)',
    category: 'test',
    command: 'make',
    args: ['test'],
    cwd: path.join(ROOT_DIR, 'job-finder-worker'),
    icon: '🧪',
  },
  'worker-lint': {
    id: 'worker-lint',
    name: 'worker-lint',
    displayName: 'Lint Worker',
    description: 'Run Black formatter check on Python code',
    category: 'quality',
    command: 'make',
    args: ['format-check'],
    cwd: path.join(ROOT_DIR, 'job-finder-worker'),
    icon: '🔍',
  },
  'worker-format': {
    id: 'worker-format',
    name: 'worker-format',
    displayName: 'Format Worker',
    description: 'Auto-format Python code with Black',
    category: 'quality',
    command: 'make',
    args: ['format'],
    cwd: path.join(ROOT_DIR, 'job-finder-worker'),
    icon: '✨',
  },

  // Database scripts
  'db-seed': {
    id: 'db-seed',
    name: 'db-seed',
    displayName: 'Seed Database',
    description: 'Seed Firebase emulators with test data',
    category: 'database',
    command: 'bash',
    args: ['scripts/emulator/seed-test-data.sh'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    icon: '🌱',
  },
  'db-clear': {
    id: 'db-clear',
    name: 'db-clear',
    displayName: 'Clear Database',
    description: 'Clear all Firebase emulator data',
    category: 'database',
    command: 'bash',
    args: ['scripts/emulator/clear-data.sh'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'warning',
    requiresConfirmation: true,
    icon: '🗑️',
  },
  'db-copy-prod-to-staging': {
    id: 'db-copy-prod-to-staging',
    name: 'db-copy-prod-to-staging',
    displayName: 'Copy Production → Staging',
    description: 'Export production Firestore and import to staging database',
    category: 'database',
    command: 'bash',
    args: ['scripts/database/copy-prod-to-staging.sh'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'danger',
    requiresConfirmation: true,
    icon: '🔄',
  },
  'db-copy-prod-to-local': {
    id: 'db-copy-prod-to-local',
    name: 'db-copy-prod-to-local',
    displayName: 'Copy Production → Local',
    description: 'Download production Firestore export for local development',
    category: 'database',
    command: 'bash',
    args: ['scripts/database/copy-prod-to-local.sh'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'warning',
    requiresConfirmation: true,
    icon: '📥',
  },

  // User management scripts - Local
  'user-add-editor-local': {
    id: 'user-add-editor-local',
    name: 'user-add-editor-local',
    displayName: 'Add Editor Role (Local)',
    description: 'Add editor role to user in local emulator',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:add-editor', '--', 'USER_ID', 'local'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'safe',
    requiresConfirmation: false,
    icon: '👤',
  },
  'user-remove-editor-local': {
    id: 'user-remove-editor-local',
    name: 'user-remove-editor-local',
    displayName: 'Remove Editor Role (Local)',
    description: 'Remove editor role from user in local emulator',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:remove-editor', '--', 'USER_ID', 'local'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'safe',
    requiresConfirmation: false,
    icon: '👤',
  },

  // User management scripts - Staging
  'user-add-editor-staging': {
    id: 'user-add-editor-staging',
    name: 'user-add-editor-staging',
    displayName: 'Add Editor Role (Staging)',
    description: 'Add editor role to user in staging database',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:add-editor', '--', 'USER_ID', 'staging'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'warning',
    requiresConfirmation: true,
    icon: '👤',
  },
  'user-remove-editor-staging': {
    id: 'user-remove-editor-staging',
    name: 'user-remove-editor-staging',
    displayName: 'Remove Editor Role (Staging)',
    description: 'Remove editor role from user in staging database',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:remove-editor', '--', 'USER_ID', 'staging'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'warning',
    requiresConfirmation: true,
    icon: '👤',
  },

  // User management scripts - Production
  'user-add-editor-production': {
    id: 'user-add-editor-production',
    name: 'user-add-editor-production',
    displayName: 'Add Editor Role (Production)',
    description: 'Add editor role to user in production database',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:add-editor', '--', 'USER_ID', 'production'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'danger',
    requiresConfirmation: true,
    icon: '👤',
  },
  'user-remove-editor-production': {
    id: 'user-remove-editor-production',
    name: 'user-remove-editor-production',
    displayName: 'Remove Editor Role (Production)',
    description: 'Remove editor role from user in production database',
    category: 'database',
    command: 'npm',
    args: ['run', 'script:remove-editor', '--', 'USER_ID', 'production'],
    cwd: path.join(ROOT_DIR, 'job-finder-BE'),
    dangerLevel: 'danger',
    requiresConfirmation: true,
    icon: '👤',
  },


  // Utility scripts
  'install-all': {
    id: 'install-all',
    name: 'install-all',
    displayName: 'Install All Dependencies',
    description: 'Run npm install in all repositories',
    category: 'utility',
    command: 'bash',
    args: ['-c', 'cd job-finder-FE && npm install && cd ../job-finder-BE && npm install && cd ../dev-monitor/backend && npm install && cd ../frontend && npm install'],
    cwd: ROOT_DIR,
    icon: '📥',
  },
  'clean-all': {
    id: 'clean-all',
    name: 'clean-all',
    displayName: 'Clean All Build Artifacts',
    description: 'Remove dist/, node_modules/.vite, and cache',
    category: 'utility',
    command: 'bash',
    args: ['-c', 'cd job-finder-FE && rm -rf dist node_modules/.vite && cd ../job-finder-BE && rm -rf functions/dist'],
    cwd: ROOT_DIR,
    icon: '🧹',
  },

};
// Test comment for linting
