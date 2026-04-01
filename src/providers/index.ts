import type { Provider, ResolvedConfig } from "../types.js";
import { createMockProvider } from "./mock.js";
import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export function createProvider(config: ResolvedConfig): Provider {
  if (config.provider === "mock") {
    return createMockProvider();
  }

  return createOpenAICompatibleProvider(
    config.provider,
    config.apiKey,
    config.baseUrl,
  );
}
