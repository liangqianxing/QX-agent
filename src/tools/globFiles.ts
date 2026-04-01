import { stat } from "node:fs/promises";
import type { ToolDefinition } from "../types.js";
import {
  resolveInsideWorkspace,
  toWorkspaceRelative,
  walkWorkspace,
} from "../utils/filesystem.js";
import { matchesGlob, normalizeGlobPath } from "../utils/glob.js";

export const globFilesTool: ToolDefinition = {
  name: "glob_files",
  description: "Find files by glob pattern, such as **/*.ts or package*.json.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern to match files against." },
      path: { type: "string", description: "Relative directory or file path inside the workspace." },
      max_results: { type: "number", description: "Maximum files to return." },
      max_depth: { type: "number", description: "Maximum traversal depth for directory searches." },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const pattern = args.pattern;
    if (typeof pattern !== "string" || pattern.trim() === "") {
      return {
        content: "pattern must be a non-empty string",
        isError: true,
      };
    }

    const targetPath = typeof args.path === "string" ? args.path : ".";
    const maxResults =
      typeof args.max_results === "number" ? Math.max(1, Math.floor(args.max_results)) : 100;
    const maxDepth =
      typeof args.max_depth === "number" ? Math.max(0, Math.floor(args.max_depth)) : 6;

    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    const candidates = await collectCandidates(absolutePath, maxDepth);
    const matches: string[] = [];

    for (const candidate of candidates) {
      const relativePath = normalizeGlobPath(
        toWorkspaceRelative(context.workspaceRoot, candidate),
      );
      if (!matchesGlob(pattern, relativePath)) {
        continue;
      }

      matches.push(relativePath);
      if (matches.length >= maxResults) {
        break;
      }
    }

    return {
      content: JSON.stringify(
        {
          pattern,
          path: targetPath,
          count: matches.length,
          files: matches,
        },
        null,
        2,
      ),
    };
  },
};

async function collectCandidates(rootPath: string, maxDepth: number): Promise<string[]> {
  const rootStats = await stat(rootPath);
  if (rootStats.isFile()) {
    return [rootPath];
  }

  const entries = await walkWorkspace(rootPath, {
    maxDepth,
    maxEntries: 2000,
  });
  const files: string[] = [];

  for (const entry of entries) {
    try {
      const entryStats = await stat(entry);
      if (entryStats.isFile()) {
        files.push(entry);
      }
    } catch {
      continue;
    }
  }

  return files;
}
