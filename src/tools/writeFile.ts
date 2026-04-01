import type { ToolDefinition } from "../types.js";
import {
  appendUtf8,
  readUtf8,
  resolveInsideWorkspace,
  writeUtf8,
} from "../utils/filesystem.js";

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Write or append UTF-8 text to a file inside the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path inside the workspace." },
      content: { type: "string", description: "Text to write." },
      mode: {
        type: "string",
        description: "overwrite or append",
        enum: ["overwrite", "append"],
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const targetPath = args.path;
    const content = args.content;
    const mode = args.mode;

    if (typeof targetPath !== "string" || typeof content !== "string") {
      return {
        content: "path and content must be strings",
        isError: true,
      };
    }

    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, targetPath);
    if (mode === "append") {
      await appendUtf8(absolutePath, content);
    } else {
      await writeUtf8(absolutePath, content);
    }

    const preview = await readUtf8(absolutePath);
    return {
      content: JSON.stringify(
        {
          path: targetPath,
          mode: mode === "append" ? "append" : "overwrite",
          bytesWritten: Buffer.byteLength(content, "utf8"),
          preview: preview.slice(0, 400),
        },
        null,
        2,
      ),
    };
  },
};
