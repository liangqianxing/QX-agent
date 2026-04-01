import type { ToolDefinition } from "../types.js";
import { fetchWebPage } from "../utils/web.js";

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch a web page and extract readable text content. Use after web_search when you need page details.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "HTTP or HTTPS URL to fetch." },
      max_chars: {
        type: "number",
        description: "Maximum number of characters to keep from the fetched content.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async execute(args) {
    const url = args.url;
    if (typeof url !== "string" || !/^https?:\/\//iu.test(url)) {
      return {
        content: "url must be an http or https URL",
        isError: true,
      };
    }

    const maxChars =
      typeof args.max_chars === "number" ? Math.max(500, Math.floor(args.max_chars)) : 12000;
    const result = await fetchWebPage({
      url,
      maxChars,
    });

    return {
      content: JSON.stringify(result, null, 2),
      isError: result.status >= 400,
    };
  },
};
