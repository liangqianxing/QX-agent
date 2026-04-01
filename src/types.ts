export type ProviderName = "deepseek" | "mock" | "openai-compatible";

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: string;
};

export type ConversationMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: ToolCallRequest[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      name: string;
    };

export type ToolExecutionResult = {
  content: string;
  isError?: boolean;
};

export type ToolExecutionContext = {
  workspaceRoot: string;
  sessionName: string;
  shellTimeoutMs: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult>;
};

export type ChatResponse = {
  content: string | null;
  toolCalls: ToolCallRequest[];
  stopReason: "tool_calls" | "stop";
};

export type ProviderRequest = {
  model: string;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  timeoutMs: number;
  onAssistantDelta?: (delta: string) => void;
};

export type Provider = {
  name: ProviderName;
  createChatCompletion: (request: ProviderRequest) => Promise<ChatResponse>;
};

export type StoredSession = {
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

export type ConfigFile = {
  provider?: ProviderName;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  sessionName?: string;
  maxSteps?: number;
  enableTools?: boolean;
  enableSkills?: boolean;
  skillsDir?: string;
  mcpConfigPath?: string;
  timeoutMs?: number;
  shellTimeoutMs?: number;
  workspaceRoot?: string;
  systemPrompt?: string;
};

export type CliConfigOverrides = ConfigFile & {
  configPath?: string;
};

export type ResolvedConfig = {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  sessionName: string;
  maxSteps: number;
  enableTools: boolean;
  enableSkills: boolean;
  skillsDir: string;
  mcpConfigPath: string;
  timeoutMs: number;
  shellTimeoutMs: number;
  workspaceRoot: string;
  systemPrompt: string | null;
  projectConfigPath: string;
  globalConfigPath: string;
};

export type ParsedFlags = Record<string, string | boolean>;

export type ParsedArgv = {
  flags: ParsedFlags;
  positionals: string[];
};

export type RunAgentEvent =
  | {
      type: "assistant_delta";
      delta: string;
    }
  | {
      type: "tool_start";
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_end";
      toolName: string;
      resultPreview: string;
      isError: boolean;
    }
  | {
      type: "assistant";
      content: string;
      streamed?: boolean;
    };

export type AgentRunResult = {
  reply: string;
  session: StoredSession;
};

export type SkillDefinition = {
  name: string;
  description: string;
  triggers: string[];
  content: string;
  sourcePath: string;
};

export type TodoStatus = "pending" | "in_progress" | "completed";

export type TodoPriority = "low" | "medium" | "high";

export type TodoItem = {
  id?: string;
  content: string;
  status: TodoStatus;
  priority?: TodoPriority;
};

export type StoredTodoList = {
  sessionName: string;
  updatedAt: string;
  todos: TodoItem[];
};

export type McpServerConfig = {
  name: string;
  transport: "stdio" | "streamable-http";
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

export type McpConfigFile = {
  servers?: McpServerConfig[];
};
