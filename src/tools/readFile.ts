import type { ToolDefinition } from "../types.js";
import { readUtf8, resolveInsideWorkspace } from "../utils/filesystem.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read a UTF-8 text file inside the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path inside the workspace." },
      start_line: { type: "number", description: "1-based start line." },
      end_line: { type: "number", description: "1-based end line." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const targetPath = args.path;
    if (typeof targetPath !== "string") {
      return {
        content: "path must be a string",
        isError: true,
      };
    }

    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    const content = await readUtf8(absolutePath);
    const lines = content.split(/\r?\n/u);
    const startLine =
      typeof args.start_line === "number" ? Math.max(1, Math.floor(args.start_line)) : 1;
    const endLine =
      typeof args.end_line === "number"
        ? Math.max(startLine, Math.floor(args.end_line))
        : Math.min(lines.length, startLine + 199);

    const numbered = lines
      .slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`);

    return {
      content: JSON.stringify(
        {
          path: targetPath,
          startLine,
          endLine,
          content: numbered.join("\n"),
        },
        null,
        2,
      ),
    };
  },
};
