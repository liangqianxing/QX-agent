import type { CommandContext, CommandDefinition } from "../commands.js";
import { renderHelp } from "../utils/output.js";

export const helpCommand: CommandDefinition = {
  name: "help",
  aliases: [],
  description: "Show CLI help.",
  async run(context: CommandContext): Promise<void> {
    console.log(renderHelp(context.commands));
  },
};
