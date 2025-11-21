/**
 * DevBot Credentials Manager
 *
 * Handles secure mounting and configuration of credentials for dev-bot containers:
 * - Claude CLI credentials
 * - Git credentials
 * - SSH keys
 * - Environment variables with secrets
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../../utils/logger.js';
import { VolumeMount } from './DevBotContainerBuilder.js';

export interface CredentialMounts {
  volumes: VolumeMount[];
  warnings: string[];
}

/**
 * Manages credential discovery and mounting for dev-bot containers
 */
export class DevBotCredentialsManager {
  private homeDir: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir || os.homedir();
  }

  /**
   * Discover and prepare all available credentials for container mounting
   */
  discoverCredentials(): CredentialMounts {
    const volumes: VolumeMount[] = [];
    const warnings: string[] = [];

    // Claude credentials
    const claudeCreds = this.findClaudeCredentials();
    if (claudeCreds) {
      volumes.push(claudeCreds);
      logger.info({
        category: 'process',
        action: 'claude_credentials_found',
        message: `Found Claude credentials at: ${claudeCreds.hostPath}`,
      });
    } else {
      warnings.push('Claude credentials not found - container may not authenticate with Claude API');
      logger.warn({
        category: 'process',
        action: 'claude_credentials_missing',
        message: 'Claude credentials file not found',
      });
    }

    // Codex credentials
    const codexCreds = this.findCodexCredentials();
    if (codexCreds) {
      volumes.push(codexCreds);
      logger.info({
        category: 'process',
        action: 'codex_credentials_found',
        message: `Found Codex credentials at: ${codexCreds.hostPath}`,
      });
    } else {
      warnings.push('Codex credentials not found (.codex/auth.json)');
      logger.warn({
        category: 'process',
        action: 'codex_credentials_missing',
        message: 'Codex credentials file not found',
      });
    }

    // Gemini credentials / settings (copy entire folder to preserve MCP servers & config)
    const geminiDir = this.findGeminiDirectory();
    if (geminiDir) {
      volumes.push(geminiDir);
      logger.info({
        category: 'process',
        action: 'gemini_credentials_found',
        message: `Found Gemini directory at: ${geminiDir.hostPath}`,
      });
    } else {
      warnings.push('Gemini credentials not found (~/.gemini)');
      logger.warn({
        category: 'process',
        action: 'gemini_credentials_missing',
        message: 'Gemini credentials directory not found',
      });
    }

    // Git credentials
    const gitCreds = this.findGitCredentials();
    if (gitCreds) {
      volumes.push(gitCreds);
      logger.info({
        category: 'process',
        action: 'git_credentials_found',
        message: 'Found git credentials',
      });
    } else {
      logger.debug({
        category: 'process',
        action: 'git_credentials_missing',
        message: 'Git credentials not found (may not be needed for public repos)',
      });
    }

    // SSH keys
    const sshMount = this.findSSHKeys();
    if (sshMount) {
      volumes.push(sshMount);
      logger.info({
        category: 'process',
        action: 'ssh_keys_found',
        message: 'Found SSH keys directory',
      });
    } else {
      logger.debug({
        category: 'process',
        action: 'ssh_keys_missing',
        message: 'SSH keys not found (may not be needed)',
      });
    }

    return { volumes, warnings };
  }

  /**
   * Find Codex CLI credentials
   */
  private findCodexCredentials(): VolumeMount | null {
    const codexAuth = path.join(this.homeDir, '.codex', 'auth.json');

    if (fs.existsSync(codexAuth)) {
      return {
        hostPath: codexAuth,
        containerPath: '/home/worker/.codex/auth.json',
        mode: 'ro',
      };
    }

    return null;
  }

  /**
   * Find Gemini CLI credentials/config (entire ~/.gemini folder)
   */
  private findGeminiDirectory(): VolumeMount | null {
    const geminiDir = path.join(this.homeDir, '.gemini');

    if (fs.existsSync(geminiDir)) {
      return {
        hostPath: geminiDir,
        containerPath: '/home/worker/.gemini',
        mode: 'ro',
      };
    }

    return null;
  }

  /**
   * Find Claude CLI credentials
   * Checks both .credentials.json (newer) and credentials.json (older)
   */
  private findClaudeCredentials(): VolumeMount | null {
    const claudeDir = path.join(this.homeDir, '.claude');
    const newPath = path.join(claudeDir, '.credentials.json');
    const oldPath = path.join(claudeDir, 'credentials.json');

    if (fs.existsSync(newPath)) {
      return {
        hostPath: newPath,
        containerPath: '/tmp/host-creds.json',
        mode: 'ro',
      };
    }

    if (fs.existsSync(oldPath)) {
      return {
        hostPath: oldPath,
        containerPath: '/tmp/host-creds.json',
        mode: 'ro',
      };
    }

    return null;
  }

  /**
   * Find git credentials file
   */
  private findGitCredentials(): VolumeMount | null {
    const gitCredsPath = path.join(this.homeDir, '.git-credentials');

    if (fs.existsSync(gitCredsPath)) {
      return {
        hostPath: gitCredsPath,
        containerPath: '/home/worker/.git-credentials',
        mode: 'ro',
      };
    }

    return null;
  }

  /**
   * Find SSH keys directory
   */
  private findSSHKeys(): VolumeMount | null {
    const sshDir = path.join(this.homeDir, '.ssh');

    if (fs.existsSync(sshDir)) {
      // Verify it has at least some keys
      const files = fs.readdirSync(sshDir);
      const hasKeys = files.some(f => f === 'id_rsa' || f === 'id_ed25519' || f === 'id_ecdsa');

      if (hasKeys) {
        return {
          hostPath: sshDir,
          containerPath: '/home/worker/.ssh',
          mode: 'ro',
        };
      }
    }

    return null;
  }

  /**
   * Get environment variables that should be passed through to container
   * (API keys, tokens, etc.)
   */
  getPassthroughEnv(keys: string[]): Record<string, string> {
    const env: Record<string, string> = {};

    for (const key of keys) {
      const value = process.env[key];
      if (value && value.length > 0) {
        env[key] = value;
        logger.debug({
          category: 'process',
          action: 'env_var_passthrough',
          message: `Passing through env var: ${key}`,
        });
      } else {
        logger.debug({
          category: 'process',
          action: 'env_var_missing',
          message: `Env var not found: ${key}`,
        });
      }
    }

    return env;
  }

  /**
   * Get standard passthrough environment variable keys
   */
  static getStandardPassthroughKeys(): string[] {
    return [
      // Claude/Anthropic
      'ANTHROPIC_API_KEY',
      'CLAUDE_API_KEY',

      // OpenAI/Codex
      'OPENAI_API_KEY',

      // Gemini / Google AI
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',

      // GitHub
      'GITHUB_TOKEN',
      'GH_TOKEN',

      // General
      'NPM_TOKEN',
      'NODE_ENV',
      'DEBUG',

      // Git config
      'GIT_AUTHOR_NAME',
      'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_COMMITTER_EMAIL',
    ];
  }

  /**
   * Validate that required credentials are present
   */
  validateRequiredCredentials(required: string[]): {
    valid: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    for (const req of required) {
      switch (req) {
        case 'claude':
          if (!this.findClaudeCredentials()) {
            missing.push('Claude credentials (.claude/.credentials.json)');
          }
          break;
        case 'git':
          if (!this.findGitCredentials()) {
            missing.push('Git credentials (.git-credentials)');
          }
          break;
        case 'ssh':
          if (!this.findSSHKeys()) {
            missing.push('SSH keys (.ssh directory)');
          }
          break;
        default:
          logger.warn({
            category: 'process',
            action: 'unknown_credential_requirement',
            message: `Unknown credential requirement: ${req}`,
          });
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
