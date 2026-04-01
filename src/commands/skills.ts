import { join, resolve } from "node:path";
import type { CommandContext, CommandDefinition } from "../commands.js";
import { loadSkills } from "../skills/loadSkills.js";
import { fileExists, writeUtf8 } from "../utils/filesystem.js";
import { printError, printInfo, printSuccess } from "../utils/output.js";

export const skillsCommand: CommandDefinition = {
  name: "skills",
  aliases: [],
  description: "List, inspect, or initialize local skills.",
  async run(context: CommandContext): Promise<void> {
    const subcommand = context.args[0] ?? "list";

    if (subcommand === "list") {
      const skills = await loadSkills(context.config);
      if (skills.length === 0) {
        printInfo("no local skills found");
        return;
      }

      for (const skill of skills) {
        console.log(`${skill.name}\t${skill.description}\t${skill.sourcePath}`);
      }
      return;
    }

    if (subcommand === "show") {
      const name = context.args[1];
      if (!name) {
        printError("usage: skills show <name>");
        return;
      }

      const skills = await loadSkills(context.config);
      const skill = skills.find((item) => item.name === name);
      if (!skill) {
        printError(`skill not found: ${name}`);
        return;
      }

      console.log(`# ${skill.name}`);
      console.log("");
      console.log(`Description: ${skill.description}`);
      console.log(`Triggers: ${skill.triggers.join(", ")}`);
      console.log(`Source: ${skill.sourcePath}`);
      console.log("");
      console.log(skill.content);
      return;
    }

    if (subcommand === "init") {
      const name = context.args[1] ?? "example-skill";
      const targetDir = resolve(context.config.workspaceRoot, context.config.skillsDir, name);
      const targetFile = join(targetDir, "SKILL.md");
      if (await fileExists(targetFile)) {
        printError(`skill already exists: ${targetFile}`);
        return;
      }

      const template = [
        "---",
        `name: ${name}`,
        "description: Briefly describe when this skill should be used.",
        "triggers: keyword1, keyword2",
        "---",
        "",
        `# ${name}`,
        "",
        "Write concrete task-specific instructions here.",
        "Keep them short, actionable, and specialized.",
      ].join("\n");

      await writeUtf8(targetFile, `${template}\n`);
      printSuccess(`created ${targetFile}`);
      return;
    }

    printError(`unknown skills subcommand: ${subcommand}`);
  },
};
