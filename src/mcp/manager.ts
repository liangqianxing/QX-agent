import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  CompatibilityCallToolResult,
  ContentBlock,
  Tool as McpTool,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  McpConfigFile,
  McpServerConfig,
  ResolvedConfig,
  ToolDefinition,
  ToolExecutionResult,
} from "../types.js";
import { fileExists, readUtf8 } from "../utils/filesystem.js";

type ConnectedMcpServer = {
  client: Client;
  config: McpServerConfig;
};

export type McpRuntime = {
  servers: ConnectedMcpServer[];
  tools: ToolDefinition[];
  diagnostics: string[];
  close: () => Promise<void>;
};

export async function loadMcpRuntime(config: ResolvedConfig): Promise<McpRuntime> {
  const mcpConfig = await loadMcpConfig(config);
  const diagnostics: string[] = [];
  const servers: ConnectedMcpServer[] = [];
  const tools: ToolDefinition[] = [];

  for (const serverConfig of mcpConfig.servers ?? []) {
    if (serverConfig.enabled === false) {
      continue;
    }

    let connected: ConnectedMcpServer | null = null;
    try {
      connected = await connectServer(serverConfig, config.workspaceRoot);

      const toolList = await connected.client.listTools();
      servers.push(connected);
      for (const tool of toolList.tools) {
        tools.push(createMcpToolDefinition(connected, tool));
      }
    } catch (error) {
      if (connected) {
        await safeCloseClient(connected.client);
      }

      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`MCP server '${serverConfig.name}' failed: ${message}`);
    }
  }

  return {
    servers,
    tools,
    diagnostics,
    async close() {
      await Promise.allSettled(
        servers.map(async (server) => {
          await server.client.close();
        }),
      );
    },
  };
}

export async function loadMcpConfig(config: ResolvedConfig): Promise<McpConfigFile> {
  const filePath = resolve(config.workspaceRoot, config.mcpConfigPath);
  if (!(await fileExists(filePath))) {
    return {};
  }

  return JSON.parse(await readUtf8(filePath)) as McpConfigFile;
}

export async function inspectMcpServers(config: ResolvedConfig): Promise<
  Array<{
    name: string;
    transport: McpServerConfig["transport"];
    tools: number;
    resources: number;
    prompts: number;
    error?: string;
  }>
> {
  const mcpConfig = await loadMcpConfig(config);
  const summaries: Array<{
    name: string;
    transport: McpServerConfig["transport"];
    tools: number;
    resources: number;
    prompts: number;
    error?: string;
  }> = [];

  for (const serverConfig of mcpConfig.servers ?? []) {
    if (serverConfig.enabled === false) {
      continue;
    }

    let connected: ConnectedMcpServer | null = null;
    try {
      connected = await connectServer(serverConfig, config.workspaceRoot);
      const client = connected.client;
      const [tools, resourcesCount, promptsCount] = await Promise.all([
        client.listTools(),
        getOptionalFeatureCount(() => client.listResources(), "resources"),
        getOptionalFeatureCount(() => client.listPrompts(), "prompts"),
      ]);

      summaries.push({
        name: serverConfig.name,
        transport: serverConfig.transport,
        tools: tools.tools.length,
        resources: resourcesCount,
        prompts: promptsCount,
      });
    } catch (error) {
      summaries.push({
        name: serverConfig.name,
        transport: serverConfig.transport,
        tools: 0,
        resources: 0,
        prompts: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (connected) {
        await safeCloseClient(connected.client);
      }
    }
  }

  return summaries;
}

export async function listMcpToolsForServer(
  config: ResolvedConfig,
  serverName?: string,
): Promise<
  Array<{
    server: string;
    toolName: string;
    description: string;
  }>
> {
  const mcpConfig = await loadMcpConfig(config);
  const result: Array<{
    server: string;
    toolName: string;
    description: string;
  }> = [];

  for (const serverConfig of mcpConfig.servers ?? []) {
    if (
      serverConfig.enabled === false ||
      (serverName !== undefined && serverConfig.name !== serverName)
    ) {
      continue;
    }

    const connected = await connectServer(serverConfig, config.workspaceRoot);
    try {
      const tools = await connected.client.listTools();
      for (const tool of tools.tools) {
        result.push({
          server: serverConfig.name,
          toolName: tool.name,
          description: tool.description ?? "",
        });
      }
    } finally {
      await connected.client.close();
    }
  }

  return result;
}

async function connectServer(
  serverConfig: McpServerConfig,
  workspaceRoot: string,
): Promise<ConnectedMcpServer> {
  const client = new Client(
    {
      name: "qx-agent-cli",
      version: "0.1.0",
    },
    {
      capabilities: {},
    },
  );

  if (serverConfig.transport === "stdio") {
    if (!serverConfig.command) {
      throw new Error(`MCP server '${serverConfig.name}' is missing 'command'`);
    }

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      cwd: serverConfig.cwd
        ? resolve(workspaceRoot, serverConfig.cwd)
        : workspaceRoot,
      env: buildEnv(serverConfig.env),
    });

    await client.connect(asTransport(transport));
  } else {
    if (!serverConfig.url) {
      throw new Error(`MCP server '${serverConfig.name}' is missing 'url'`);
    }

    const requestInit: RequestInit | undefined = serverConfig.headers
      ? { headers: serverConfig.headers }
      : undefined;
    const transport = new StreamableHTTPClientTransport(
      new URL(serverConfig.url),
      requestInit ? { requestInit } : undefined,
    );

    await client.connect(asTransport(transport));
  }

  return {
    client,
    config: serverConfig,
  };
}

function buildEnv(
  overrideEnv: Record<string, string> | undefined,
): Record<string, string> {
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      baseEnv[key] = value;
    }
  }

  return {
    ...baseEnv,
    ...(overrideEnv ?? {}),
  };
}

function createMcpToolDefinition(
  server: ConnectedMcpServer,
  tool: McpTool,
): ToolDefinition {
  const wrappedToolName = buildWrappedToolName(server.config.name, tool.name);
  const inputSchema: ToolDefinition["inputSchema"] = {
    type: "object",
    properties: (tool.inputSchema.properties ?? {}) as Record<string, unknown>,
    additionalProperties: true,
    ...(tool.inputSchema.required !== undefined
      ? { required: [...tool.inputSchema.required] }
      : {}),
  };

  return {
    name: wrappedToolName,
    description: `[MCP ${server.config.name}] ${tool.description ?? tool.name}`,
    inputSchema,
    async execute(args): Promise<ToolExecutionResult> {
      const result = await server.client.callTool({
        name: tool.name,
        arguments: args,
      });

      return {
        content: formatToolResult(result),
        isError: "isError" in result && result.isError === true,
      };
    },
  };
}

function buildWrappedToolName(serverName: string, toolName: string): string {
  const raw = `mcp_${sanitizeName(serverName)}_${sanitizeName(toolName)}`;
  if (raw.length <= 60) {
    return raw;
  }

  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 8);
  return `${raw.slice(0, 51)}_${hash}`;
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/gu, "_").replace(/_+/gu, "_");
}

function asTransport(
  transport: StdioClientTransport | StreamableHTTPClientTransport,
): Transport {
  // The SDK transport classes are runtime-compatible with Transport. This cast
  // works around an upstream exactOptionalPropertyTypes mismatch on sessionId.
  return transport as unknown as Transport;
}

async function safeCloseClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore secondary cleanup failures while surfacing the original MCP error.
  }
}

async function getOptionalFeatureCount<T extends { [key: string]: unknown }>(
  loader: () => Promise<T>,
  key: string,
): Promise<number> {
  try {
    const result = await loader();
    const value = result[key];
    return Array.isArray(value) ? value.length : 0;
  } catch (error) {
    if (isMethodNotFoundError(error)) {
      return 0;
    }

    throw error;
  }
}

function isMethodNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Method not found");
}

function formatToolResult(
  result: CallToolResult | CompatibilityCallToolResult,
): string {
  if ("toolResult" in result) {
    return JSON.stringify(result.toolResult, null, 2);
  }

  const payload: Record<string, unknown> = {
    content: result.content.map(formatContentBlock),
  };

  if (result.structuredContent !== undefined) {
    payload.structuredContent = result.structuredContent;
  }

  if (result.isError !== undefined) {
    payload.isError = result.isError;
  }

  return JSON.stringify(payload, null, 2);
}

function formatContentBlock(block: ContentBlock): Record<string, unknown> {
  if (block.type === "text") {
    return {
      type: "text",
      text: block.text,
    };
  }

  if (block.type === "resource") {
    return {
      type: "resource",
      resource: block.resource,
    };
  }

  if (block.type === "resource_link") {
    return {
      type: "resource_link",
      uri: block.uri,
      name: block.name,
      title: block.title,
      description: block.description,
      mimeType: block.mimeType,
    };
  }

  if (block.type === "image") {
    return {
      type: "image",
      mimeType: block.mimeType,
      dataPreview: `<base64:${block.data.length} chars>`,
    };
  }

  if (block.type === "audio") {
    return {
      type: "audio",
      mimeType: block.mimeType,
      dataPreview: `<base64:${block.data.length} chars>`,
    };
  }

  return block as unknown as Record<string, unknown>;
}
