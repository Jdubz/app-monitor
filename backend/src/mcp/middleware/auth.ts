const ADMIN_ONLY_TOOLS = new Set([
  "task_create",
  "task_get",
  "task_list",
  "task_unblock",
  "task_cancel",
  "bot_list_active",
  "bot_get_status",
  "bot_recover",
  "bot_heartbeat_status",
  "pr_trigger_evaluation",
  "pr_get_blocking_issues",
  "system_health",
]);

const DEV_BOT_ONLY_TOOLS = new Set(["task_report_outcome"]);

type McpRole = "admin" | "dev-bot";

export interface AuthContext {
  role: McpRole;
  env: "production" | "development" | "test";
}

function resolveRole(): McpRole {
  const role = process.env.APP_MONITOR_MCP_USER_ROLE as McpRole | undefined;
  if (!role || (role !== "admin" && role !== "dev-bot")) {
    throw new Error("APP_MONITOR_MCP_USER_ROLE must be set to admin or dev-bot");
  }
  return role;
}

export function getAuthContext(): AuthContext {
  const env = (process.env.NODE_ENV as "production" | "development" | "test") || "development";
  return {
    role: resolveRole(),
    env,
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
    throw new Error(`Dev-bots are not permitted to call ${toolName}`);
  }
}

export function withAuth<T>(toolName: string, handler: (params: T) => Promise<unknown>) {
  return async (params: T): Promise<unknown> => {
    const context = getAuthContext();
    checkToolPermission(toolName, context);
    return handler(params);
  };
}
