import type { CommandContext, CommandDefinition } from "../commands.js";
import {
  clearTasks,
  formatTodosForDisplay,
  listTaskLists,
  loadTasks,
} from "../tasks/store.js";
import { printError, printInfo, printSuccess } from "../utils/output.js";

export const tasksCommand: CommandDefinition = {
  name: "tasks",
  aliases: ["todo"],
  description: "Inspect or clear the session todo list used by todo_write.",
  async run(context: CommandContext): Promise<void> {
    const subcommand = context.args[0] ?? "show";

    if (subcommand === "list") {
      const taskLists = await listTaskLists(context.config.workspaceRoot);
      if (taskLists.length === 0) {
        printInfo("no task lists");
        return;
      }

      for (const taskList of taskLists) {
        console.log(
          `${taskList.sessionName}\t${taskList.taskCount} tasks\t${taskList.updatedAt}\t${taskList.filePath}`,
        );
      }
      return;
    }

    if (subcommand === "show") {
      const sessionName = context.args[1] ?? context.config.sessionName;
      const taskList = await loadTasks(context.config.workspaceRoot, sessionName);
      console.log(`session: ${sessionName}`);
      console.log(`updatedAt: ${taskList.updatedAt}`);
      console.log(`tasks: ${taskList.todos.length}`);
      console.log("");
      console.log(formatTodosForDisplay(taskList.todos));
      return;
    }

    if (subcommand === "clear") {
      const sessionName = context.args[1] ?? context.config.sessionName;
      const cleared = await clearTasks(context.config.workspaceRoot, sessionName);
      if (!cleared) {
        printError(`task list not found: ${sessionName}`);
        return;
      }

      printSuccess(`cleared task list for ${sessionName}`);
      return;
    }

    printError(`unknown tasks subcommand: ${subcommand}`);
  },
};
