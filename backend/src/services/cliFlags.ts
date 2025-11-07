/**
 * CLI Flags Compatibility Layer
 *
 * Maps conceptual flags to CLI-specific implementations for Claude and Codex.
 * This ensures we use the correct syntax for each tool.
 */

export type CLITool = 'claude' | 'codex';

export interface CLIFlags {
  // Security & Permissions
  bypassPermissions: boolean;
  permissionMode?: 'acceptEdits' | 'bypassPermissions' | 'default' | 'plan';

  // Sandbox Configuration
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';

  // Approval Policy
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';

  // Tool Access
  allowedTools?: string[];
  disallowedTools?: string[];

  // Output Mode
  printMode: boolean;
  outputFormat?: 'text' | 'json' | 'stream-json';

  // Directory Access
  workingDirectory?: string;
  additionalDirectories?: string[];

  // Session Management
  continueSession?: boolean;
  resumeSession?: string;
  sessionId?: string;

  // Model Selection
  model?: string;
  fallbackModel?: string;

  // Advanced
  systemPrompt?: string;
  appendSystemPrompt?: string;
  mcpConfig?: string[];
}

/**
 * Flag Compatibility Reference
 *
 * CLAUDE CLI FLAGS:
 * ==================
 * --dangerously-skip-permissions       : Skip all permission checks (no sandbox)
 * --permission-mode <mode>             : Permission behavior (acceptEdits, bypassPermissions, default, plan)
 * --allowedTools <tools>               : Comma/space-separated list of allowed tools (e.g. "Bash(git:*) Edit")
 * --disallowedTools <tools>            : Tools to deny
 * --print                              : Non-interactive mode, print response and exit
 * --output-format <format>             : Output format (text, json, stream-json)
 * --add-dir <directories>              : Additional directories to allow tool access
 * --continue                           : Continue most recent conversation
 * --resume [sessionId]                 : Resume a conversation
 * --model <model>                      : Model to use (alias or full name)
 * --fallback-model <model>             : Fallback model if default is overloaded
 * --system-prompt <prompt>             : System prompt to use
 * --append-system-prompt <prompt>      : Append to default system prompt
 * --mcp-config <configs>               : Load MCP servers from JSON
 * --settings <file-or-json>            : Load additional settings
 *
 * CODEX CLI FLAGS:
 * ================
 * --dangerously-bypass-approvals-and-sandbox : Skip all confirmations & sandboxing (DANGEROUS)
 * --sandbox <mode>                     : Sandbox policy (read-only, workspace-write, danger-full-access)
 *   Shorthand: -s <mode>
 * --ask-for-approval <policy>          : Approval requirement (untrusted, on-failure, on-request, never)
 *   Shorthand: -a <policy>
 * --full-auto                          : Low-friction automatic execution (-a on-failure, --sandbox workspace-write)
 * --cd <dir>                           : Working directory
 *   Shorthand: -C <dir>
 * --add-dir <dir>                      : Additional writable directories
 * --model <model>                      : Model to use
 *   Shorthand: -m <model>
 * --profile <profile>                  : Configuration profile from config.toml
 *   Shorthand: -p <profile>
 * --search                             : Enable web search
 * --config <key=value>                 : Override configuration value
 *   Shorthand: -c <key=value>
 * --enable <feature>                   : Enable a feature
 * --disable <feature>                  : Disable a feature
 * --image <file>                       : Attach images to prompt
 *   Shorthand: -i <file>
 *
 * CRITICAL DIFFERENCES:
 * =====================
 * 1. SANDBOX FLAG:
 *    - Claude: Does NOT have a --sandbox flag (uses --dangerously-skip-permissions or --permission-mode)
 *    - Codex: Uses --sandbox or -s with values (read-only, workspace-write, danger-full-access)
 *
 * 2. BYPASS PERMISSIONS:
 *    - Claude: --dangerously-skip-permissions (no value)
 *    - Codex: --dangerously-bypass-approvals-and-sandbox (no value)
 *
 * 3. PERMISSION MODE:
 *    - Claude: --permission-mode <mode> (acceptEdits, bypassPermissions, default, plan)
 *    - Codex: Does NOT have --permission-mode (uses --ask-for-approval instead)
 *
 * 4. APPROVAL POLICY:
 *    - Claude: --allowedTools to control which tools require approval
 *    - Codex: --ask-for-approval <policy> (untrusted, on-failure, on-request, never)
 *    - Codex exec: Does NOT support --ask-for-approval (use --dangerously-bypass-approvals-and-sandbox instead)
 *
 * 5. OUTPUT MODE:
 *    - Claude: --print (non-interactive)
 *    - Codex: Uses `codex exec` subcommand for non-interactive
 *    - IMPORTANT: Codex exec has different flag support than Codex interactive mode!
 */

/**
 * Build CLI arguments for the specified tool
 */
export function buildCLIArgs(tool: CLITool, flags: CLIFlags): string[] {
  const args: string[] = [];

  if (tool === 'claude') {
    // Claude-specific flags

    // Output mode
    if (flags.printMode) {
      args.push('--print');
    }

    if (flags.outputFormat && flags.printMode) {
      args.push('--output-format', flags.outputFormat);
    }

    // Permissions & Security
    if (flags.bypassPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    if (flags.permissionMode) {
      args.push('--permission-mode', flags.permissionMode);
    }

    // Tool Access
    if (flags.allowedTools && flags.allowedTools.length > 0) {
      args.push('--allowedTools', ...flags.allowedTools);
    }

    if (flags.disallowedTools && flags.disallowedTools.length > 0) {
      args.push('--disallowedTools', ...flags.disallowedTools);
    }

    // Directory Access
    if (flags.additionalDirectories && flags.additionalDirectories.length > 0) {
      flags.additionalDirectories.forEach(dir => {
        args.push('--add-dir', dir);
      });
    }

    // Session Management
    if (flags.continueSession) {
      args.push('--continue');
    }

    if (flags.resumeSession) {
      args.push('--resume', flags.resumeSession);
    }

    if (flags.sessionId) {
      args.push('--session-id', flags.sessionId);
    }

    // Model Selection
    if (flags.model) {
      args.push('--model', flags.model);
    }

    if (flags.fallbackModel && flags.printMode) {
      args.push('--fallback-model', flags.fallbackModel);
    }

    // System Prompts
    if (flags.systemPrompt) {
      args.push('--system-prompt', flags.systemPrompt);
    }

    if (flags.appendSystemPrompt) {
      args.push('--append-system-prompt', flags.appendSystemPrompt);
    }

    // MCP Configuration
    if (flags.mcpConfig && flags.mcpConfig.length > 0) {
      args.push('--mcp-config', ...flags.mcpConfig);
    }

  } else if (tool === 'codex') {
    // Codex-specific flags

    // Sandbox Configuration
    if (flags.sandbox) {
      args.push('--sandbox', flags.sandbox);
    }

    // Approval Policy
    // IMPORTANT: Codex exec mode does NOT support --ask-for-approval flag
    // Only add this flag if NOT using exec mode (printMode indicates exec mode)
    if (flags.approvalPolicy && !flags.printMode) {
      args.push('--ask-for-approval', flags.approvalPolicy);
    }

    // Bypass all security (DANGEROUS)
    if (flags.bypassPermissions) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    // Working Directory
    if (flags.workingDirectory) {
      args.push('--cd', flags.workingDirectory);
    }

    // Additional Directories
    if (flags.additionalDirectories && flags.additionalDirectories.length > 0) {
      flags.additionalDirectories.forEach(dir => {
        args.push('--add-dir', dir);
      });
    }

    // Model Selection
    if (flags.model) {
      args.push('--model', flags.model);
    }
  }

  return args;
}

/**
 * Get recommended flags for dev-bot execution
 */
export function getDevBotFlags(tool: CLITool): CLIFlags {
  return {
    bypassPermissions: false,  // Use controlled access
    printMode: tool === 'claude',  // Claude uses --print, Codex uses exec subcommand

    // For dev-bots, we want full access for git operations but in a sandboxed way
    sandbox: tool === 'codex' ? 'danger-full-access' : undefined,
    permissionMode: tool === 'claude' ? 'bypassPermissions' : undefined,
    // NOTE: approvalPolicy removed for codex - codex exec doesn't support --ask-for-approval flag
    // Use bypassPermissions: true if you need to skip approvals in codex exec mode

    // Allow git operations
    allowedTools: tool === 'claude' ? ['Bash(git:*)'] : undefined,

    // Output configuration
    outputFormat: 'text',
  };
}

/**
 * Build complete CLI command string
 */
export function buildCLICommand(tool: CLITool, flags: CLIFlags, prompt: string): string {
  const args = buildCLIArgs(tool, flags);
  const escapedPrompt = prompt.replace(/'/g, "'\\''");  // Escape single quotes for shell

  // Build command
  const argsStr = args.join(' ');
  return `${tool} ${argsStr} '${escapedPrompt}'`;
}

/**
 * Validate CLI flags for the specified tool
 *
 * Throws an error if incompatible flags are used
 */
export function validateCLIFlags(tool: CLITool, flags: CLIFlags): void {
  if (tool === 'codex') {
    // Codex exec mode incompatibilities
    if (flags.printMode && flags.approvalPolicy) {
      throw new Error(
        'Codex exec mode does NOT support --ask-for-approval flag. ' +
        'Use --dangerously-bypass-approvals-and-sandbox instead or set bypassPermissions: true'
      );
    }

    // Sandbox policy vs sandbox
    if (flags.permissionMode) {
      throw new Error(
        'Codex does NOT support --permission-mode. Use --sandbox <mode> instead'
      );
    }

    // Check for common mistakes
    if (flags.allowedTools) {
      throw new Error(
        'Codex does NOT support --allowedTools. Use --ask-for-approval policy or --dangerously-bypass-approvals-and-sandbox'
      );
    }
  } else if (tool === 'claude') {
    // Claude incompatibilities
    if (flags.sandbox) {
      throw new Error(
        'Claude does NOT support --sandbox. Use --permission-mode instead'
      );
    }

    if (flags.approvalPolicy) {
      throw new Error(
        'Claude does NOT support --ask-for-approval. Use --allowedTools instead'
      );
    }
  }
}
