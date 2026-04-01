import type { ToolDefinition } from "../types.js";
import { searchDuckDuckGoLite } from "../utils/web.js";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the public web for current information. Use this for external or time-sensitive queries.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      max_results: { type: "number", description: "Maximum search results to return." },
      allowed_domains: {
        type: "array",
        description: "Only return results from these domains.",
        items: { type: "string" },
      },
      blocked_domains: {
        type: "array",
        description: "Never return results from these domains.",
        items: { type: "string" },
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args) {
    const query = args.query;
    if (typeof query !== "string" || query.trim() === "") {
      return {
        content: "query must be a non-empty string",
        isError: true,
      };
    }

    const maxResults =
      typeof args.max_results === "number" ? Math.max(1, Math.floor(args.max_results)) : 5;
    const allowedDomains = normalizeDomainArray(args.allowed_domains);
    if (typeof allowedDomains === "string") {
      return {
        content: allowedDomains,
        isError: true,
      };
    }

    const blockedDomains = normalizeDomainArray(args.blocked_domains);
    if (typeof blockedDomains === "string") {
      return {
        content: blockedDomains,
        isError: true,
      };
    }

    const result = await searchDuckDuckGoLite({
      query,
      maxResults,
      allowedDomains,
      blockedDomains,
    });

    return {
      content: JSON.stringify(result, null, 2),
    };
  },
};

function normalizeDomainArray(raw: unknown): string[] | string {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return "domain filters must be arrays of strings";
  }

  const values: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.trim() === "") {
      return "domain filters must contain non-empty strings";
    }
    values.push(item.trim());
  }

  return values;
}
