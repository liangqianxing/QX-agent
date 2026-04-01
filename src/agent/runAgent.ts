import { buildSystemPrompt } from "./systemPrompt.js";
import { saveSession } from "../session/store.js";
import { formatTodosForPrompt, loadTasks } from "../tasks/store.js";
import type {
  AgentRunResult,
  ConversationMessage,
  Provider,
  ResolvedConfig,
  RunAgentEvent,
  StoredSession,
  ToolDefinition,
} from "../types.js";
import { truncate } from "../utils/output.js";

type RunAgentOptions = {
  config: ResolvedConfig;
  provider: Provider;
  session: StoredSession;
  prompt: string;
  tools: ToolDefinition[];
  systemPromptAddendum?: string | null;
  onEvent?: (event: RunAgentEvent) => void;
};

export async function runAgent(
  options: RunAgentOptions,
): Promise<AgentRunResult> {
  const { config, provider, tools, onEvent } = options;
  const session: StoredSession = {
    ...options.session,
    messages: [...options.session.messages],
  };

  session.messages.push({
    role: "user",
    content: options.prompt,
  });
  await saveSession(config.workspaceRoot, session);

  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (let step = 0; step < config.maxSteps; step += 1) {
    const todoList = await loadTasks(config.workspaceRoot, config.sessionName);
    const requestMessages: ConversationMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(config, {
          ...(options.systemPromptAddendum !== undefined
            ? { addendum: options.systemPromptAddendum }
            : {}),
          ...(formatTodosForPrompt(todoList.todos) !== null
            ? { todoContext: formatTodosForPrompt(todoList.todos) }
            : {}),
        }),
      },
      ...prepareMessagesForProvider(session.messages),
    ];

    let sawAssistantDelta = false;
    const response = await provider.createChatCompletion({
      model: config.model,
      messages: requestMessages,
      tools,
      timeoutMs: config.timeoutMs,
      ...(onEvent
        ? {
            onAssistantDelta: (delta: string) => {
              if (delta === "") {
                return;
              }

              sawAssistantDelta = true;
              onEvent({
                type: "assistant_delta",
                delta,
              });
            },
          }
        : {}),
    });

    const assistantMessage: ConversationMessage =
      response.toolCalls.length > 0
        ? {
            role: "assistant",
            content: response.content,
            toolCalls: response.toolCalls,
          }
        : {
            role: "assistant",
            content: response.content,
          };

    session.messages.push(assistantMessage);
    await saveSession(config.workspaceRoot, session);

    if ((response.content ?? "").trim() !== "") {
      onEvent?.({
        type: "assistant",
        content: response.content ?? "",
        ...(sawAssistantDelta ? { streamed: true } : {}),
      });
    }

    if (response.toolCalls.length === 0) {
      const finalReply = response.content ?? "";
      return {
        reply: finalReply,
        session,
      };
    }

    for (const toolCall of response.toolCalls) {
      const tool = toolsByName.get(toolCall.name);
      if (!tool) {
        session.messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: `Unknown tool: ${toolCall.name}`,
        });
        await saveSession(config.workspaceRoot, session);
        onEvent?.({
          type: "tool_end",
          toolName: toolCall.name,
          resultPreview: "unknown tool",
          isError: true,
        });
        continue;
      }

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = parseToolArguments(toolCall.arguments);
      } catch (error) {
        const message = buildToolArgumentErrorMessage(
          tool.name,
          toolCall.arguments,
          error,
        );
        session.messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: message,
        });
        await saveSession(config.workspaceRoot, session);

        onEvent?.({
          type: "tool_end",
          toolName: tool.name,
          resultPreview: truncate(singleLine(message), 140),
          isError: true,
        });
        continue;
      }

      onEvent?.({
        type: "tool_start",
        toolName: tool.name,
        args: parsedArgs,
      });

      try {
        const result = await tool.execute(parsedArgs, {
          workspaceRoot: config.workspaceRoot,
          sessionName: config.sessionName,
          shellTimeoutMs: config.shellTimeoutMs,
        });

        session.messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: result.content,
        });
        await saveSession(config.workspaceRoot, session);

        onEvent?.({
          type: "tool_end",
          toolName: tool.name,
          resultPreview: truncate(singleLine(result.content), 140),
          isError: result.isError ?? false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        session.messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: tool.name,
          content: `Tool error: ${message}`,
        });
        await saveSession(config.workspaceRoot, session);

        onEvent?.({
          type: "tool_end",
          toolName: tool.name,
          resultPreview: truncate(message, 140),
          isError: true,
        });
      }
    }
  }

  throw new Error(
    `Agent reached max steps (${config.maxSteps}) without producing a final answer.`,
  );
}

const HISTORY_USER_TURNS = 4;
const MAX_USER_CONTENT_LENGTH = 2_000;
const MAX_ASSISTANT_CONTENT_LENGTH = 4_000;
const MAX_TOOL_CONTENT_LENGTH = 3_500;
const MAX_TOOL_ARGUMENT_LENGTH = 1_200;

function prepareMessagesForProvider(
  messages: ConversationMessage[],
): ConversationMessage[] {
  const retained = sliceRecentConversation(messages, HISTORY_USER_TURNS);
  return retained.map(compactConversationMessage);
}

function sliceRecentConversation(
  messages: ConversationMessage[],
  maxUserTurns: number,
): ConversationMessage[] {
  const userIndexes = messages.reduce<number[]>((indexes, message, index) => {
    if (message.role === "user") {
      indexes.push(index);
    }
    return indexes;
  }, []);

  if (userIndexes.length <= maxUserTurns) {
    return messages;
  }

  const startIndex = userIndexes[userIndexes.length - maxUserTurns] ?? 0;
  return messages.slice(startIndex);
}

function compactConversationMessage(
  message: ConversationMessage,
): ConversationMessage {
  if (message.role === "user") {
    return {
      role: "user",
      content: compactText(message.content, MAX_USER_CONTENT_LENGTH, "user message"),
    };
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      toolCallId: message.toolCallId,
      name: message.name,
      content: compactText(
        message.content,
        MAX_TOOL_CONTENT_LENGTH,
        `tool result from ${message.name}`,
      ),
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content:
        message.content === null
          ? null
          : compactText(
              message.content,
              MAX_ASSISTANT_CONTENT_LENGTH,
              "assistant message",
            ),
      ...(message.toolCalls
        ? {
            toolCalls: message.toolCalls.map((toolCall) => ({
              ...toolCall,
              arguments: compactText(
                toolCall.arguments,
                MAX_TOOL_ARGUMENT_LENGTH,
                `tool arguments for ${toolCall.name}`,
              ),
            })),
          }
        : {}),
    };
  }

  return message;
}

function compactText(
  value: string,
  maxLength: number,
  label: string,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return [
    value.slice(0, maxLength),
    "",
    `[${label} truncated: omitted ${value.length - maxLength} chars]`,
  ].join("\n");
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (raw.trim() === "") {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  throw new Error("Tool arguments must be a JSON object.");
}

function singleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function buildToolArgumentErrorMessage(
  toolName: string,
  rawArguments: string,
  error: unknown,
): string {
  const reason = error instanceof Error ? error.message : String(error);
  const preview = truncate(singleLine(rawArguments), 220);

  return [
    `Tool error: invalid JSON arguments for ${toolName}: ${reason}.`,
    "Retry with a valid JSON object.",
    "If the payload is large, escape quotes and newlines correctly or write the content in smaller chunks.",
    `Arguments preview: ${preview}`,
  ].join(" ");
}
