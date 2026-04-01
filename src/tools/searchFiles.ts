import type { ToolDefinition } from "../types.js";
import {
  isTextFile,
  readUtf8,
  resolveInsideWorkspace,
  toWorkspaceRelative,
  walkWorkspace,
} from "../utils/filesystem.js";

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Search for plain-text matches across files in the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for." },
      path: { type: "string", description: "Relative search root inside the workspace." },
      max_results: { type: "number", description: "Maximum matches to return." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const query = args.query;
    if (typeof query !== "string" || query.trim() === "") {
      return {
        content: "query must be a non-empty string",
        isError: true,
      };
    }

    const targetPath = typeof args.path === "string" ? args.path : ".";
    const maxResults =
      typeof args.max_results === "number" ? Math.floor(args.max_results) : 50;
    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    const entries = await walkWorkspace(absolutePath, {
      maxDepth: 5,
      maxEntries: 500,
    });

    const matches: string[] = [];
    for (const entry of entries) {
      if (matches.length >= maxResults) {
        break;
      }

      try {
        if (!(await isTextFile(entry))) {
          continue;
        }

        const content = await readUtf8(entry);
        const lines = content.split(/\r?\n/u);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (line !== undefined && line.toLowerCase().includes(query.toLowerCase())) {
            matches.push(
              `${toWorkspaceRelative(context.workspaceRoot, entry)}:${index + 1}: ${line}`,
            );
            if (matches.length >= maxResults) {
              break;
            }
          }
        }
      } catch {
        continue;
      }
    }

    return {
      content: JSON.stringify(
        {
          query,
          count: matches.length,
          matches,
        },
        null,
        2,
      ),
    };
  },
};
