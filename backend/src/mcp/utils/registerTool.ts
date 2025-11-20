import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ZodObject, ZodRawShape } from 'zod';

type AnyToolObject = ZodObject<ZodRawShape>;

type ToolConfig<Schema extends AnyToolObject> = {
  title?: string;
  description?: string;
  inputSchema: Schema;
};

type RawRegisterConfig = Parameters<McpServer['registerTool']>[1];
type RawRegisterHandler = Parameters<McpServer['registerTool']>[2];
type RawRegisterExtra = Parameters<RawRegisterHandler>[1];

type ToolHandler<Schema extends AnyToolObject> = (
  params: z.infer<Schema>,
  extra?: RawRegisterExtra,
) => Promise<CallToolResult> | CallToolResult;

export function registerZodTool<Schema extends AnyToolObject>(
  server: McpServer,
  name: string,
  config: ToolConfig<Schema>,
  handler: ToolHandler<Schema>,
) {
  const { inputSchema, ...rest } = config;

  const rawConfig: RawRegisterConfig = {
    ...rest,
    inputSchema: inputSchema as unknown as RawRegisterConfig['inputSchema'],
  };

  const rawHandler: RawRegisterHandler = async (
    params: Parameters<RawRegisterHandler>[0],
    extra: RawRegisterExtra,
  ) => handler(params as z.infer<Schema>, extra);

  server.registerTool(name, rawConfig, rawHandler);
}
