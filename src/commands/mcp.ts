import type { CommandContext, CommandDefinition } from "../commands.js";
import { inspectMcpServers, listMcpToolsForServer } from "../mcp/manager.js";
import { printError, printInfo } from "../utils/output.js";

export const mcpCommand: CommandDefinition = {
  name: "mcp",
  aliases: [],
  description: "Inspect configured MCP servers and discovered tools.",
  async run(context: CommandContext): Promise<void> {
    const subcommand = context.args[0] ?? "list";

    if (subcommand === "list") {
      const summaries = await inspectMcpServers(context.config);
      if (summaries.length === 0) {
        printInfo("no MCP servers configured");
        return;
      }

      for (const summary of summaries) {
        if (summary.error) {
          console.log(
            `${summary.name}\t${summary.transport}\terror\t${summary.error}`,
          );
          continue;
        }

        console.log(
          `${summary.name}\t${summary.transport}\ttools=${summary.tools}\tresources=${summary.resources}\tprompts=${summary.prompts}`,
        );
      }
      return;
    }

    if (subcommand === "tools") {
      const serverName = context.args[1];
      const tools = await listMcpToolsForServer(context.config, serverName);
      if (tools.length === 0) {
        printInfo("no MCP tools found");
        return;
      }

      for (const tool of tools) {
        console.log(`${tool.server}\t${tool.toolName}\t${tool.description}`);
      }
      return;
    }

    printError(`unknown mcp subcommand: ${subcommand}`);
  },
};
