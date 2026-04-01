import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config.js";
import { helpCommand } from "./commands/help.js";
import { mcpCommand } from "./commands/mcp.js";
import { sessionCommand } from "./commands/session.js";
import { skillsCommand } from "./commands/skills.js";
import { tasksCommand } from "./commands/tasks.js";
import type { ParsedFlags, ResolvedConfig } from "./types.js";

export type CommandContext = {
  args: string[];
  flags: ParsedFlags;
  config: ResolvedConfig;
  commands: CommandDefinition[];
};

export type CommandDefinition = {
  name: string;
  aliases: string[];
  description: string;
  run: (context: CommandContext) => Promise<void>;
};

const COMMANDS: CommandDefinition[] = [
  chatCommand,
  configCommand,
  mcpCommand,
  sessionCommand,
  tasksCommand,
  skillsCommand,
  helpCommand,
];

export function getCommands(): CommandDefinition[] {
  return COMMANDS;
}

export function resolveCommand(
  commands: CommandDefinition[],
  maybeCommand: string | undefined,
): CommandDefinition | undefined {
  if (!maybeCommand) {
    return undefined;
  }

  return commands.find(
    (command) =>
      command.name === maybeCommand || command.aliases.includes(maybeCommand),
  );
}
