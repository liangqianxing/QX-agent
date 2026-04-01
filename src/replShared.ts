import { randomUUID } from "node:crypto";
import type { McpRuntime } from "./mcp/manager.js";
import type { Provider, ResolvedConfig } from "./types.js";

export type ReplState = {
  config: ResolvedConfig;
  explicitSkillNames: string[];
  mcpRuntime: McpRuntime;
  provider: Provider;
};

export type ReplEntryTone =
  | "assistant"
  | "user"
  | "tool"
  | "info"
  | "warning"
  | "danger";

export type ReplLogEntry = {
  id: string;
  tone: ReplEntryTone;
  label: string;
  body: string;
  detail?: string;
};

export const REPL_COMMAND_HELP = [
  "/help          show repl commands",
  "/clear         clear the current session",
  "/history       print recent messages",
  "/tasks         show the current todo list",
  "/tasks clear   clear the current todo list",
  "/model <name>  switch model for this repl",
  "/tools on|off  enable or disable tools",
  "/exit          quit",
];

export function createReplEntry(
  tone: ReplEntryTone,
  label: string,
  body: string,
  detail?: string,
): ReplLogEntry {
  return {
    id: randomUUID(),
    tone,
    label,
    body,
    ...(detail !== undefined ? { detail } : {}),
  };
}
