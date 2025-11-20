import { spawnSync } from 'child_process';
import { shellQuote } from '../utils/shellQuote.js';

export type AgentCliType = 'claude' | 'codex' | 'gemini';

interface CliProfile {
  command: string;
  subcommand?: string[];
  baseArgs: string[];
  helpArgs: string[];
  requiredFlags: string[];
  workingDirectoryFlag?: string;
  defaultWorkingDirectory?: string;
}

const CLI_PROFILES: Record<AgentCliType, CliProfile> = {
  claude: {
    command: 'claude',
    baseArgs: ['--print', '--dangerously-skip-permissions', '--output-format', 'json'],
    helpArgs: ['--help'],
    requiredFlags: ['--print', '--dangerously-skip-permissions', '--output-format'],
  },
  codex: {
    command: 'codex',
    subcommand: ['exec'],
    baseArgs: [
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--json',
    ],
    helpArgs: ['exec', '--help'],
    requiredFlags: ['--cd', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--json'],
    workingDirectoryFlag: '--cd',
    defaultWorkingDirectory: '/workspace',
  },
  gemini: {
    command: 'gemini',
    baseArgs: ['--approval-mode', 'yolo', '--sandbox', 'false', '--yolo', '--output-format', 'json'],
    helpArgs: ['--help'],
    requiredFlags: ['--approval-mode', '--sandbox', '--yolo', '--output-format'],
  },
};

export type PromptSource =
  | { kind: 'literal'; value: string }
  | { kind: 'file'; path: string };

export interface BuildCliCommandOptions {
  cliType: AgentCliType;
  prompt: PromptSource;
  workingDirectory?: string;
}

export type CliHelpStatus = 'ok' | 'missing_flags' | 'missing_binary' | 'execution_failed';

export interface CliHelpInspection {
  status: CliHelpStatus;
  missingFlags?: string[];
  helpText?: string;
  error?: Error;
}

export class AgentCliCommandBuilder {
  private readonly cliHelpCache = new Map<AgentCliType, CliHelpInspection>();

  buildCommand(options: BuildCliCommandOptions): string {
    const profile = CLI_PROFILES[options.cliType];

    if (!profile) {
      throw new Error(`Unsupported CLI type: ${options.cliType}`);
    }

    const args = [...profile.baseArgs];
    const workingDir = options.workingDirectory ?? profile.defaultWorkingDirectory;

    if (profile.workingDirectoryFlag && workingDir) {
      args.push(profile.workingDirectoryFlag, workingDir);
    }

    const commandParts = [
      profile.command,
      ...(profile.subcommand ?? []),
      ...args,
      this.buildPromptArgument(options.prompt),
    ].filter(Boolean);

    return commandParts.join(' ');
  }

  inspectCliHelp(cliType: AgentCliType, options: { useCache?: boolean } = {}): CliHelpInspection {
    const useCache = options.useCache ?? true;
    if (useCache && this.cliHelpCache.has(cliType)) {
      return this.cliHelpCache.get(cliType)!;
    }

    const profile = CLI_PROFILES[cliType];
    if (!profile) {
      return { status: 'execution_failed', error: new Error(`Unknown CLI type ${cliType}`) };
    }

    const helpArgs = profile.helpArgs.length > 0 ? profile.helpArgs : ['--help'];
    const result = spawnSync(profile.command, helpArgs, { encoding: 'utf-8' });

    if (result.error) {
      const errno = result.error as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') {
        const inspection = { status: 'missing_binary', error: result.error } as CliHelpInspection;
        if (useCache) {
          this.cliHelpCache.set(cliType, inspection);
        }
        return inspection;
      }
      const inspection = { status: 'execution_failed', error: result.error } as CliHelpInspection;
      if (useCache) {
        this.cliHelpCache.set(cliType, inspection);
      }
      return inspection;
    }

    const helpText = `${result.stdout}${result.stderr}`;
    const missingFlags = profile.requiredFlags.filter(flag => !helpText.includes(flag));

    const inspection: CliHelpInspection =
      missingFlags.length > 0
        ? { status: 'missing_flags', missingFlags, helpText }
        : { status: 'ok', helpText };

    if (useCache) {
      this.cliHelpCache.set(cliType, inspection);
    }

    return inspection;
  }

  private buildPromptArgument(prompt: PromptSource): string {
    if (prompt.kind === 'file') {
      return `"$(cat ${shellQuote(prompt.path)})"`;
    }

    return shellQuote(prompt.value);
  }
}
