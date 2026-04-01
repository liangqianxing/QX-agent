import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_MAX_RESULTS = 5;
const SEARCH_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 QX-Agent-CLI/0.1";

const server = new McpServer({
  name: "qx-web-search-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "web_search",
  {
    description: [
      "Search the public web without requiring a third-party API key.",
      "Use this for real-time or external information lookups when the model needs fresh web results.",
      "Results are fetched from DuckDuckGo Lite and returned as structured JSON.",
    ].join(" "),
    inputSchema: {
      query: z.string().min(2),
      max_results: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ query, max_results = DEFAULT_MAX_RESULTS }) => {
    const result = await performWebSearch(query, max_results);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
    };
  },
);

await server.connect(new StdioServerTransport());

async function performWebSearch(query, maxResults) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const organic = parseDuckDuckGoLite(html).slice(0, maxResults);

  return {
    organic,
    related_searches: [],
    base_resp: {
      status_code: response.status,
      status_msg: response.statusText,
      source: "duckduckgo-lite",
    },
  };
}

function parseDuckDuckGoLite(html) {
  const linkPattern =
    /<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>/giu;
  const matches = [...html.matchAll(linkPattern)];
  const results = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const blockStart = match.index ?? 0;
    const blockEnd = nextMatch?.index ?? html.length;
    const block = html.slice(blockStart, blockEnd);

    const rawHref = match[1] ?? "";
    const title = decodeHtml(stripTags(match[2] ?? ""));
    const snippet = decodeHtml(
      stripTags(
        firstMatch(
          /<td class='result-snippet'>\s*([\s\S]*?)\s*<\/td>/iu,
          block,
        ) ?? "",
      ),
    );
    const displayLink = decodeHtml(
      stripTags(firstMatch(/<span class='link-text'>([\s\S]*?)<\/span>/iu, block) ?? ""),
    );
    const link = normalizeDuckDuckGoLink(rawHref);

    if (!title || !link) {
      continue;
    }

    results.push({
      title,
      link,
      snippet,
      date: "",
      display_link: displayLink,
    });
  }

  return results;
}

function firstMatch(pattern, text) {
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

function normalizeDuckDuckGoLink(rawHref) {
  const href = decodeHtml(rawHref).trim();
  if (href === "") {
    return "";
  }

  const absolute = href.startsWith("//") ? `https:${href}` : href;

  try {
    const url = new URL(absolute);
    const redirectTarget = url.searchParams.get("uddg");
    return redirectTarget ? decodeURIComponent(redirectTarget) : url.toString();
  } catch {
    return absolute;
  }
}

function stripTags(value) {
  return value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#x2F;/gu, "/")
    .replace(/&#47;/gu, "/")
    .replace(/&nbsp;/gu, " ");
}
