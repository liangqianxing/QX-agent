import type { CommandContext, CommandDefinition } from "../commands.js";
import { writeUtf8 } from "../utils/filesystem.js";
import {
  formatConfigForDisplay,
  printError,
  printSuccess,
} from "../utils/output.js";

const SAMPLE_CONFIG = {
  provider: "deepseek",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
  sessionName: "default",
  maxSteps: 16,
  enableTools: true,
  enableSkills: true,
  skillsDir: "skills",
  mcpConfigPath: "mcp.config.json",
  timeoutMs: 300000,
  shellTimeoutMs: 20000,
  systemPrompt: "You are QX Agent, a pragmatic terminal-based AI assistant.",
};

export const configCommand: CommandDefinition = {
  name: "config",
  aliases: [],
  description: "Show the resolved config or create a local config file.",
  async run(context: CommandContext): Promise<void> {
    const subcommand = context.args[0] ?? "show";

    if (subcommand === "show") {
      console.log(formatConfigForDisplay(context.config));
      return;
    }

    if (subcommand === "init") {
      await writeUtf8(
        context.config.projectConfigPath,
        `${JSON.stringify(SAMPLE_CONFIG, null, 2)}\n`,
      );
      printSuccess(`wrote ${context.config.projectConfigPath}`);
      return;
    }

    printError(`unknown config subcommand: ${subcommand}`);
  },
};
