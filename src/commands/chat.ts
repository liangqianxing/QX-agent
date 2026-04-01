import type { CommandContext, CommandDefinition } from "../commands.js";
import { runAgent } from "../agent/runAgent.js";
import { loadMcpRuntime } from "../mcp/manager.js";
import { createProvider } from "../providers/index.js";
import { startRepl } from "../repl.js";
import { loadSession } from "../session/store.js";
import { prepareSkillAddendum } from "../skills/runtime.js";
import { getBuiltInTools } from "../tools/index.js";
import { printAgentEvent, printWarning } from "../utils/output.js";

export const chatCommand: CommandDefinition = {
  name: "chat",
  aliases: ["ask"],
  description: "Start an interactive chat or run a one-shot prompt.",
  async run(context: CommandContext): Promise<void> {
    const provider = createProvider(context.config);
    const explicitSkillNames = parseExplicitSkillNames(context.flags.skill);
    const mcpRuntime = await loadMcpRuntime(context.config);

    if (context.args.length === 0) {
      await startRepl({
        config: context.config,
        explicitSkillNames,
        mcpRuntime,
        provider,
      });
      return;
    }

    const prompt = context.args.join(" ");
    const session = await loadSession(
      context.config.workspaceRoot,
      context.config.sessionName,
    );
    const skillContext = await prepareSkillAddendum(
      context.config,
      prompt,
      explicitSkillNames,
    );

    try {
      for (const diagnostic of mcpRuntime.diagnostics) {
        printWarning(diagnostic);
      }

      await runAgent({
        config: context.config,
        provider,
        session,
        prompt,
        systemPromptAddendum: skillContext.addendum,
        tools: context.config.enableTools
          ? [...getBuiltInTools(), ...mcpRuntime.tools]
          : mcpRuntime.tools,
        onEvent: printAgentEvent,
      });
    } finally {
      await mcpRuntime.close();
    }
  },
};

function parseExplicitSkillNames(raw: string | boolean | undefined): string[] {
  if (typeof raw !== "string") {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
