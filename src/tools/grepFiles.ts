import { stat } from "node:fs/promises";
import type { ToolDefinition } from "../types.js";
import {
  isTextFile,
  readUtf8,
  resolveInsideWorkspace,
  toWorkspaceRelative,
  walkWorkspace,
} from "../utils/filesystem.js";
import { matchesGlob, normalizeGlobPath } from "../utils/glob.js";

export const grepFilesTool: ToolDefinition = {
  name: "grep_files",
  description: "Search file contents with a regular expression across the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for." },
      path: { type: "string", description: "Relative file or directory path inside the workspace." },
      glob: { type: "string", description: "Optional glob filter such as **/*.ts." },
      max_results: { type: "number", description: "Maximum matches to return." },
      case_insensitive: { type: "boolean", description: "Enable case-insensitive regex search." },
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

    const flags = args.case_insensitive === true ? "iu" : "u";
    let expression: RegExp;
    try {
      expression = new RegExp(pattern, flags);
    } catch (error) {
      return {
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }

    const targetPath = typeof args.path === "string" ? args.path : ".";
    const globPattern = typeof args.glob === "string" ? args.glob : null;
    const maxResults =
      typeof args.max_results === "number" ? Math.max(1, Math.floor(args.max_results)) : 100;
    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    const candidates = await collectCandidates(absolutePath);
    const matches: string[] = [];

    for (const candidate of candidates) {
      if (matches.length >= maxResults) {
        break;
      }

      const relativePath = normalizeGlobPath(
        toWorkspaceRelative(context.workspaceRoot, candidate),
      );
      if (globPattern && !matchesGlob(globPattern, relativePath)) {
        continue;
      }

      try {
        if (!(await isTextFile(candidate))) {
          continue;
        }

        const content = await readUtf8(candidate);
        const lines = content.split(/\r?\n/u);

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? "";
          expression.lastIndex = 0;
          if (expression.test(line)) {
            matches.push(`${relativePath}:${index + 1}: ${line}`);
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
          pattern,
          path: targetPath,
          glob: globPattern,
          count: matches.length,
          matches,
        },
        null,
        2,
      ),
    };
  },
};

async function collectCandidates(rootPath: string): Promise<string[]> {
  const rootStats = await stat(rootPath);
  if (rootStats.isFile()) {
    return [rootPath];
  }

  const entries = await walkWorkspace(rootPath, {
    maxDepth: 8,
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
