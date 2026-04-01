import type { ResolvedConfig } from "../types.js";

export function buildSystemPrompt(
  config: ResolvedConfig,
  options?: {
    addendum?: string | null;
    todoContext?: string | null;
  },
): string {
  const sections = [
    "You are QX Agent, a pragmatic terminal-based AI assistant.",
    `You are operating inside the workspace root: ${config.workspaceRoot}`,
    "When tools are available, use them to inspect files and verify claims before answering.",
    "Prefer concise, direct answers. Do not fabricate file contents or command results.",
    "If a file path is needed, keep it relative to the workspace root.",
    "When editing files through tools, preserve existing user changes unless explicitly asked to replace them.",
  ];

  if (config.enableTools) {
    sections.push(
      "Available tools include listing files, globbing, grep-style search, reading files, exact in-place editing, writing files, maintaining a todo list, web search, web fetch, and running shell commands.",
      "For non-trivial tasks, first create a short todo list with todo_write and keep it updated as you complete steps.",
      "Prefer edit_file for targeted changes and write_file for full-file creation or replacement.",
      "When calling tools, arguments must always be valid JSON objects.",
      "When using write_file for long code or HTML, make sure the content is properly JSON-escaped; if needed, write smaller chunks instead of one huge payload.",
    );
  } else {
    sections.push("Tools are disabled for this session.");
  }

  if (config.systemPrompt) {
    sections.push(`Additional instruction: ${config.systemPrompt}`);
  }

  if (options?.todoContext && options.todoContext.trim() !== "") {
    sections.push(options.todoContext.trim());
  }

  if (options?.addendum && options.addendum.trim() !== "") {
    sections.push(options.addendum.trim());
  }

  return sections.join("\n");
}
