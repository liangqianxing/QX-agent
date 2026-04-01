import type { ToolDefinition } from "../types.js";
import {
  fileExists,
  readUtf8,
  resolveInsideWorkspace,
  writeUtf8,
} from "../utils/filesystem.js";

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Edit a file by replacing an existing string with a new string. Safer than overwriting the whole file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path inside the workspace." },
      old_string: {
        type: "string",
        description:
          "Exact text to replace. Use an empty string only when creating a new file or filling an empty file.",
      },
      new_string: { type: "string", description: "Replacement text." },
      replace_all: {
        type: "boolean",
        description: "Replace every occurrence instead of exactly one occurrence.",
      },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const path = args.path;
    const oldString = args.old_string;
    const newString = args.new_string;
    const replaceAll = args.replace_all === true;

    if (
      typeof path !== "string" ||
      typeof oldString !== "string" ||
      typeof newString !== "string"
    ) {
      return {
        content: "path, old_string, and new_string must be strings",
        isError: true,
      };
    }

    if (oldString === newString) {
      return {
        content: "old_string and new_string are identical; no edit to apply",
        isError: true,
      };
    }

    const absolutePath = resolveInsideWorkspace(context.workspaceRoot, path);
    const exists = await fileExists(absolutePath);

    if (!exists) {
      if (oldString !== "") {
        return {
          content:
            "file does not exist; use old_string=\"\" if you intend to create a new file",
          isError: true,
        };
      }

      await writeUtf8(absolutePath, newString);
      return {
        content: JSON.stringify(
          {
            path,
            created: true,
            occurrencesReplaced: 1,
            preview: newString.slice(0, 400),
          },
          null,
          2,
        ),
      };
    }

    const original = await readUtf8(absolutePath);

    if (oldString === "") {
      if (original !== "") {
        return {
          content:
            "old_string cannot be empty for a non-empty file; read the file first and replace exact text",
          isError: true,
        };
      }

      await writeUtf8(absolutePath, newString);
      return {
        content: JSON.stringify(
          {
            path,
            created: false,
            occurrencesReplaced: 1,
            preview: newString.slice(0, 400),
          },
          null,
          2,
        ),
      };
    }

    const occurrences = countOccurrences(original, oldString);
    if (occurrences === 0) {
      return {
        content: "old_string was not found in the file",
        isError: true,
      };
    }

    if (!replaceAll && occurrences > 1) {
      return {
        content:
          "old_string matched multiple locations; refine the string or set replace_all=true",
        isError: true,
      };
    }

    const updated = replaceAll
      ? original.split(oldString).join(newString)
      : original.replace(oldString, newString);
    await writeUtf8(absolutePath, updated);

    return {
      content: JSON.stringify(
        {
          path,
          created: false,
          occurrencesFound: occurrences,
          occurrencesReplaced: replaceAll ? occurrences : 1,
          preview: updated.slice(0, 400),
        },
        null,
        2,
      ),
    };
  },
};

function countOccurrences(content: string, target: string): number {
  if (target === "") {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor <= content.length) {
    const nextIndex = content.indexOf(target, cursor);
    if (nextIndex === -1) {
      break;
    }

    count += 1;
    cursor = nextIndex + target.length;
  }

  return count;
}
