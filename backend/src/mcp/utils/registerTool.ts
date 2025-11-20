import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { AnyZodObject, z, ZodRawShape } from 'zod';

type ToolConfig<Schema extends AnyZodObject> = {
  title?: string;
  description?: string;
  inputSchema: Schema;
};

type ToolHandler<Schema extends AnyZodObject> = (
  params: z.infer<Schema>,
  extra?: unknown,
) => Promise<unknown> | unknown;

type RawRegisterConfig = Parameters<McpServer['registerTool']>[1];
type RawRegisterHandler = Parameters<McpServer['registerTool']>[2];

export function registerZodTool<Schema extends AnyZodObject>(
  server: McpServer,
  name: string,
  config: ToolConfig<Schema>,
  handler: ToolHandler<Schema>,
) {
  const { inputSchema, ...rest } = config;

  const rawConfig: RawRegisterConfig = {
    ...rest,
    inputSchema: inputSchema.shape as ZodRawShape,
  };

  const rawHandler: RawRegisterHandler = (
    params: Parameters<RawRegisterHandler>[0],
    extra: Parameters<RawRegisterHandler>[1],
  ) => handler(params as z.infer<Schema>, extra);

  server.registerTool(name, rawConfig, rawHandler);
}
