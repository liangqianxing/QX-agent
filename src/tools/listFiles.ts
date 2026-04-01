import type { ToolDefinition } from "../types.js";
import {
  resolveInsideWorkspace,
  toWorkspaceRelative,
  walkWorkspace,
} from "../utils/filesystem.js";

export const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List files and directories inside the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path inside the workspace." },
      max_depth: { type: "number", description: "Maximum directory traversal depth." },
      max_entries: { type: "number", description: "Maximum number of entries to return." },
    },
    additionalProperties: false,
  },
  async execute(args, context) {
    const targetPath = typeof args.path === "string" ? args.path : ".";
    const maxDepth =
      typeof args.max_depth === "number" ? Math.floor(args.max_depth) : 2;
    const maxEntries =
      typeof args.max_entries === "number" ? Math.floor(args.max_entries) : 200;

    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    const entries = await walkWorkspace(absolutePath, {
      maxDepth,
      maxEntries,
    });

    return {
      content: JSON.stringify(
        {
          path: targetPath,
          count: entries.length,
          entries: entries.map((entry) =>
            toWorkspaceRelative(context.workspaceRoot, entry),
          ),
        },
        null,
        2,
      ),
    };
  },
};
