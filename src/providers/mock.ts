import { randomUUID } from "node:crypto";
import type { ChatResponse, Provider, ProviderRequest } from "../types.js";

export function createMockProvider(): Provider {
  return {
    name: "mock",
    async createChatCompletion(request: ProviderRequest): Promise<ChatResponse> {
      const lastMessage = request.messages[request.messages.length - 1];

      if (lastMessage?.role === "tool") {
        return {
          content: `I used ${lastMessage.name} and received:\n${lastMessage.content}`,
          toolCalls: [],
          stopReason: "stop",
        };
      }

      const lastUser = [...request.messages]
        .reverse()
        .find((message) => message.role === "user");
      const prompt = lastUser?.role === "user" ? lastUser.content.toLowerCase() : "";

      if (request.tools.length > 0) {
        if (
          prompt.includes("list files") ||
          prompt.includes("list the files") ||
          prompt.includes("directory") ||
          prompt.includes("列出")
        ) {
          return {
            content: null,
            toolCalls: [
              {
                id: randomUUID(),
                name: "list_files",
                arguments: JSON.stringify({ path: ".", max_depth: 2 }),
              },
            ],
            stopReason: "tool_calls",
          };
        }

        if (prompt.includes("search")) {
          const query = lastUser?.role === "user" ? lastUser.content.replace(/^search\s+/iu, "") : "";
          return {
            content: null,
            toolCalls: [
              {
                id: randomUUID(),
                name: "search_files",
                arguments: JSON.stringify({ query: query || "TODO", path: "." }),
              },
            ],
            stopReason: "tool_calls",
          };
        }
      }

      const reply = `Mock provider reply: ${lastUser?.role === "user" ? lastUser.content : "hello"}`;
      if (request.onAssistantDelta) {
        await emitMockStream(reply, request.onAssistantDelta);
      }

      return {
        content: reply,
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };
}

async function emitMockStream(
  content: string,
  onAssistantDelta: (delta: string) => void,
): Promise<void> {
  for (let index = 0; index < content.length; index += 12) {
    onAssistantDelta(content.slice(index, index + 12));
    await new Promise((resolve) => {
      setTimeout(resolve, 12);
    });
  }
}
