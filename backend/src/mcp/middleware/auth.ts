
export interface AuthContext {
  isDevBot: boolean;
  isAdminBot: boolean;
  env: 'production' | 'development' | 'test';
}

export function getAuthContext(): AuthContext {
  const role = process.env.APP_MONITOR_MCP_USER_ROLE || 'admin'; // Default to admin for now if not set? Or strict?
  const env = (process.env.NODE_ENV as 'production' | 'development' | 'test') || 'development';

  return {
    isDevBot: role === 'dev-bot',
    isAdminBot: role === 'admin',
    env: env
  };
}

export function checkToolPermission(toolName: string, context: AuthContext): void {
  if (context.isDevBot && context.env === 'production') {
    throw new Error("Dev-bots cannot access production MCP");
  }

  if (context.isAdminBot) {
    const disallowed = ["task_report_outcome"];
    if (disallowed.includes(toolName)) {
      throw new Error(`Admin bot cannot access: ${toolName}`);
    }
  }
}

export function withAuth<T>(toolName: string, handler: (params: T) => Promise<any>) {
  return async (params: T) => {
    const context = getAuthContext();
    checkToolPermission(toolName, context);
    return handler(params);
  };
}
