const ADMIN_ONLY_TOOLS = new Set([
  "bot_recover",
]);

const DEV_BOT_ONLY_TOOLS = new Set(["task_report_outcome"]);

type McpRole = "admin" | "dev-bot";
type McpEnv = "production" | "development" | "test";

export interface AuthContext {
  role: McpRole;
  env: McpEnv;
}

/**
 * Validates MCP environment variables at startup
 * @throws Error if required environment variables are missing or invalid
 */
export function validateMcpEnvironment(): void {
  const role = process.env.APP_MONITOR_MCP_USER_ROLE;
  if (!role || (role !== "admin" && role !== "dev-bot")) {
    throw new Error(
      "APP_MONITOR_MCP_USER_ROLE must be set to 'admin' or 'dev-bot'. " +
      `Current value: ${role || '(not set)'}`
    );
  }

  // Validate dev-bots cannot run in production
  const env = resolveEnv();
  if (role === "dev-bot" && env === "production") {
    throw new Error(
      "Dev-bots cannot access production MCP. " +
      "Set APP_MONITOR_ENV or NODE_ENV to 'development' or 'test'."
    );
  }

  console.error(`MCP Auth: role=${role}, env=${env}`);
}

function resolveRole(): McpRole {
  const role = process.env.APP_MONITOR_MCP_USER_ROLE as McpRole | undefined;
  if (!role || (role !== "admin" && role !== "dev-bot")) {
    throw new Error("APP_MONITOR_MCP_USER_ROLE must be set to admin or dev-bot");
  }
  return role;
}

function resolveEnv(): McpEnv {
  const rawEnv = (process.env.APP_MONITOR_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  if (rawEnv === 'production') {
    return 'production';
  }
  if (rawEnv === 'test') {
    return 'test';
  }
  return 'development';
}

export function getAuthContext(): AuthContext {
  return {
    role: resolveRole(),
    env: resolveEnv(),
  };
}

export function checkToolPermission(toolName: string, context: AuthContext): void {
  if (context.role === "dev-bot" && context.env === "production") {
    throw new Error("Dev-bots cannot access production MCP");
  }

  if (DEV_BOT_ONLY_TOOLS.has(toolName)) {
    if (context.role !== "dev-bot") {
      throw new Error(`${toolName} can only be used by dev-bots`);
    }
    return;
  }

  if (ADMIN_ONLY_TOOLS.has(toolName) && context.role !== "admin") {
    throw new Error(`${toolName} requires admin role`);
  }

  if (context.role === "dev-bot") {
    return;
  }
}

export function withAuth<T, R = unknown>(
  toolName: string,
  handler: (params: T, context: AuthContext, extra?: unknown) => R | Promise<R>,
) {
  return (params: T, extra?: unknown): R | Promise<R> => {
    const context = getAuthContext();
    checkToolPermission(toolName, context);
    return handler(params, context, extra);
  };
}
