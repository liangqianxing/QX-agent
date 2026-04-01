import { randomUUID } from "node:crypto";
import type {
  ChatResponse,
  ConversationMessage,
  Provider,
  ProviderName,
  ProviderRequest,
  ToolCallRequest,
} from "../types.js";

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIChoice = {
  finish_reason: "stop" | "tool_calls";
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
};

type OpenAIStreamChoice = {
  finish_reason: "stop" | "tool_calls" | null;
  delta: {
    content?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: "function";
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
};

type OpenAIResponse = {
  choices?: OpenAIChoice[];
  error?: {
    message?: string;
  };
};

type OpenAIStreamResponse = {
  choices?: OpenAIStreamChoice[];
  error?: {
    message?: string;
  };
};

type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
};

type RequestTimeoutController = {
  signal: AbortSignal;
  touch: () => void;
  clear: () => void;
  didTimeout: () => boolean;
};

export function createOpenAICompatibleProvider(
  providerName: ProviderName,
  apiKey: string | null,
  baseUrl: string,
): Provider {
  return {
    name: providerName,
    async createChatCompletion(request: ProviderRequest): Promise<ChatResponse> {
      if (!apiKey) {
        throw new Error(
          "Missing API key. Set AI_AGENT_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY, or use --provider mock.",
        );
      }

      const timeout = createRequestTimeout(request.timeoutMs);
      timeout.touch();

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages.map(toOpenAIMessage),
            tools:
              request.tools.length > 0
                ? request.tools.map((tool) => ({
                    type: "function",
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.inputSchema,
                    },
                  }))
                : undefined,
            tool_choice: request.tools.length > 0 ? "auto" : undefined,
            ...(request.onAssistantDelta ? { stream: true } : {}),
          }),
          signal: timeout.signal,
        });
      } catch (error) {
        timeout.clear();
        throw normalizeProviderError(error, request.timeoutMs, timeout.didTimeout());
      }

      if (!response.ok) {
        timeout.clear();
        const parsed = await tryParseJson<OpenAIResponse>(response);
        const message =
          parsed?.error?.message ?? `Provider request failed (${response.status})`;
        throw new Error(message);
      }

      if (request.onAssistantDelta) {
        return readStreamingChatCompletion(
          response,
          request.onAssistantDelta,
          request.timeoutMs,
          timeout,
        );
      }

      try {
        const parsed = (await response.json()) as OpenAIResponse;
        const choice = parsed.choices?.[0];
        if (!choice) {
          throw new Error("Provider returned no choices.");
        }

        const result = {
          content: choice.message.content,
          toolCalls: mapToolCalls(choice.message.tool_calls),
          stopReason: choice.finish_reason,
        };

        assertNonEmptyAssistantMessage(result);
        return result;
      } catch (error) {
        throw normalizeProviderError(error, request.timeoutMs, timeout.didTimeout());
      } finally {
        timeout.clear();
      }
    },
  };
}

async function readStreamingChatCompletion(
  response: Response,
  onAssistantDelta: (delta: string) => void,
  timeoutMs: number,
  timeout: RequestTimeoutController,
): Promise<ChatResponse> {
  if (!response.body) {
    timeout.clear();
    throw new Error("Provider returned no response body for streaming.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let stopReason: ChatResponse["stopReason"] = "stop";
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let sawDone = false;

  try {
    timeout.touch();

    while (!sawDone) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      timeout.touch();
      buffer += decoder.decode(value, { stream: true });
      const processed = processSseBuffer(buffer, (payload) => {
        if (payload === "[DONE]") {
          sawDone = true;
          return;
        }

        const chunk = JSON.parse(payload) as OpenAIStreamResponse;
        const choice = chunk.choices?.[0];
        if (!choice) {
          return;
        }

        if (typeof choice.delta.content === "string" && choice.delta.content !== "") {
          content += choice.delta.content;
          onAssistantDelta(choice.delta.content);
        }

        for (const toolCallDelta of choice.delta.tool_calls ?? []) {
          const current =
            toolCalls.get(toolCallDelta.index) ?? {
              id: "",
              name: "",
              arguments: "",
            };

          if (toolCallDelta.id) {
            current.id = toolCallDelta.id;
          }

          if (toolCallDelta.function?.name) {
            current.name += toolCallDelta.function.name;
          }

          if (toolCallDelta.function?.arguments) {
            current.arguments += toolCallDelta.function.arguments;
          }

          toolCalls.set(toolCallDelta.index, current);
        }

        if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
          stopReason = choice.finish_reason;
        }
      });

      buffer = processed;
    }

    const trailing = decoder.decode();
    if (trailing !== "") {
      timeout.touch();
      buffer += trailing;
      buffer = processSseBuffer(buffer, (payload) => {
        if (payload === "[DONE]") {
          sawDone = true;
          return;
        }

        const chunk = JSON.parse(payload) as OpenAIStreamResponse;
        const choice = chunk.choices?.[0];
        if (!choice) {
          return;
        }

        if (typeof choice.delta.content === "string" && choice.delta.content !== "") {
          content += choice.delta.content;
          onAssistantDelta(choice.delta.content);
        }

        for (const toolCallDelta of choice.delta.tool_calls ?? []) {
          const current =
            toolCalls.get(toolCallDelta.index) ?? {
              id: "",
              name: "",
              arguments: "",
            };

          if (toolCallDelta.id) {
            current.id = toolCallDelta.id;
          }

          if (toolCallDelta.function?.name) {
            current.name += toolCallDelta.function.name;
          }

          if (toolCallDelta.function?.arguments) {
            current.arguments += toolCallDelta.function.arguments;
          }

          toolCalls.set(toolCallDelta.index, current);
        }

        if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
          stopReason = choice.finish_reason;
        }
      });
    }
  } catch (error) {
    throw normalizeProviderError(error, timeoutMs, timeout.didTimeout());
  } finally {
    timeout.clear();
  }

  const result = {
    content: content === "" ? null : content,
    toolCalls: [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => ({
        id: toolCall.id || randomUUID(),
        name: toolCall.name,
        arguments: toolCall.arguments,
      })),
    stopReason,
  };

  assertNonEmptyAssistantMessage(result);
  return result;
}

function toOpenAIMessage(message: ConversationMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.name,
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls?.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function mapToolCalls(toolCalls: OpenAIToolCall[] | undefined): ToolCallRequest[] {
  if (!toolCalls) {
    return [];
  }

  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: toolCall.function.arguments,
  }));
}

function processSseBuffer(
  rawBuffer: string,
  onPayload: (payload: string) => void,
): string {
  const normalized = rawBuffer.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
  const parts = normalized.split("\n\n");
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const payload = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (payload !== "") {
      onPayload(payload);
    }
  }

  return remainder;
}

async function tryParseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function createRequestTimeout(timeoutMs: number): RequestTimeoutController {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const touch = (): void => {
    clear();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  return {
    signal: controller.signal,
    touch,
    clear,
    didTimeout: () => timedOut,
  };
}

function normalizeProviderError(
  error: unknown,
  timeoutMs: number,
  didTimeout: boolean,
): Error {
  if (didTimeout || isAbortError(error)) {
    return new Error(
      `Provider request timed out after ${timeoutMs}ms without progress. Increase timeoutMs or pass --timeout-ms for longer tasks.`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.message.includes("aborted") ||
    error.message.includes("AbortError")
  );
}

function assertNonEmptyAssistantMessage(response: ChatResponse): void {
  if (response.toolCalls.length > 0) {
    return;
  }

  if ((response.content ?? "").trim() !== "") {
    return;
  }

  throw new Error(
    "Provider returned an empty assistant message. The upstream proxy may be incompatible or unhealthy.",
  );
}
