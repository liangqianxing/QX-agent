import { readFile } from "node:fs/promises";
import { getCommands, resolveCommand } from "../commands.js";
import { loadConfig } from "../config.js";
import type { CliConfigOverrides, ParsedFlags } from "../types.js";
import {
  getBooleanFlag,
  getNumberFlag,
  getStringFlag,
  parseArgv,
} from "../utils/args.js";
import { printError, renderHelp } from "../utils/output.js";

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgv(argv);
  const commands = getCommands();

  if (getBooleanFlag(parsed.flags, "version")) {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    console.log(packageJson.version);
    return;
  }

  const maybeCommand = resolveCommand(commands, parsed.positionals[0]);
  if (getBooleanFlag(parsed.flags, "help") && !maybeCommand) {
    console.log(renderHelp(commands));
    return;
  }

  const config = await loadConfig(
    process.cwd(),
    extractConfigOverrides(parsed.flags),
  );

  const commandArgs = maybeCommand
    ? parsed.positionals.slice(1)
    : parsed.positionals;

  const command =
    maybeCommand ?? commands.find((item) => item.name === "chat");
  if (!command) {
    printError("No command available.");
    process.exitCode = 1;
    return;
  }

  try {
    await command.run({
      args: commandArgs,
      flags: parsed.flags,
      config,
      commands,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(message);
    process.exitCode = 1;
  }
}

function extractConfigOverrides(flags: ParsedFlags): CliConfigOverrides {
  const provider = normalizeProvider(getStringFlag(flags, "provider"));
  const model = getStringFlag(flags, "model");
  const baseUrl = getStringFlag(flags, "base-url");
  const apiKey = getStringFlag(flags, "api-key");
  const sessionName = getStringFlag(flags, "session");
  const maxSteps = getNumberFlag(flags, "max-steps");
  const enableTools = normalizeBooleanFlag(flags, "tools");
  const enableSkills = normalizeBooleanFlag(flags, "skills");
  const timeoutMs = getNumberFlag(flags, "timeout-ms");
  const shellTimeoutMs = getNumberFlag(flags, "shell-timeout-ms");
  const systemPrompt = getStringFlag(flags, "system-prompt");
  const configPath = getStringFlag(flags, "config");
  const skillsDir = getStringFlag(flags, "skills-dir");
  const mcpConfigPath = getStringFlag(flags, "mcp-config");

  return {
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(sessionName !== undefined ? { sessionName } : {}),
    ...(maxSteps !== undefined ? { maxSteps } : {}),
    ...(enableTools !== undefined ? { enableTools } : {}),
    ...(enableSkills !== undefined ? { enableSkills } : {}),
    ...(skillsDir !== undefined ? { skillsDir } : {}),
    ...(mcpConfigPath !== undefined ? { mcpConfigPath } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(shellTimeoutMs !== undefined ? { shellTimeoutMs } : {}),
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(configPath !== undefined ? { configPath } : {}),
  };
}

function normalizeBooleanFlag(
  flags: ParsedFlags,
  key: string,
): boolean | undefined {
  const directValue = getBooleanFlag(flags, key);
  if (directValue !== undefined) {
    return directValue;
  }

  const stringValue = getStringFlag(flags, key);
  if (stringValue === undefined) {
    return undefined;
  }

  const normalized = stringValue.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function normalizeProvider(
  value: string | undefined,
): CliConfigOverrides["provider"] {
  if (
    value === "deepseek" ||
    value === "mock" ||
    value === "openai-compatible"
  ) {
    return value;
  }

  return undefined;
}
