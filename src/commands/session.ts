import type { CommandContext, CommandDefinition } from "../commands.js";
import { clearSession, listSessions, loadSession } from "../session/store.js";
import {
  printError,
  printInfo,
  printSuccess,
  summarizeMessages,
} from "../utils/output.js";

export const sessionCommand: CommandDefinition = {
  name: "session",
  aliases: [],
  description: "Inspect or clear saved sessions.",
  async run(context: CommandContext): Promise<void> {
    const subcommand = context.args[0] ?? "list";

    if (subcommand === "list") {
      const sessions = await listSessions(context.config.workspaceRoot);
      if (sessions.length === 0) {
        printInfo("no saved sessions");
        return;
      }

      for (const session of sessions) {
        console.log(
          `${session.name}\t${session.updatedAt}\t${session.sizeBytes} bytes\t${session.filePath}`,
        );
      }
      return;
    }

    if (subcommand === "show") {
      const name = context.args[1] ?? context.config.sessionName;
      const session = await loadSession(context.config.workspaceRoot, name);
      console.log(`name: ${session.name}`);
      console.log(`createdAt: ${session.createdAt}`);
      console.log(`updatedAt: ${session.updatedAt}`);
      console.log(`messages: ${session.messages.length}`);
      console.log("");
      console.log(summarizeMessages(session.messages));
      return;
    }

    if (subcommand === "clear") {
      const name = context.args[1] ?? context.config.sessionName;
      const deleted = await clearSession(context.config.workspaceRoot, name);
      if (!deleted) {
        printError(`session not found: ${name}`);
        return;
      }

      printSuccess(`deleted session ${name}`);
      return;
    }

    printError(`unknown session subcommand: ${subcommand}`);
  },
};
