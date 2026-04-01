import type { CommandDefinition } from "../commands.js";
import type { ConversationMessage, ResolvedConfig, RunAgentEvent } from "../types.js";
import { CLI_THEME, hexToRgb, resolveThemeColor } from "../ui/theme.js";

type PaintOptions = {
  background?: string;
  bold?: boolean;
  color?: string;
  dim?: boolean;
};

let hasActiveAssistantStream = false;

function colorize(text: string, options: PaintOptions): string {
  if (!process.stdout.isTTY) {
    return text;
  }

  const codes = [];
  if (options.bold) {
    codes.push("1");
  }

  if (options.dim) {
    codes.push("2");
  }

  if (options.color) {
    const rgb = hexToRgb(resolveThemeColor(options.color));
    codes.push(`38;2;${rgb.red};${rgb.green};${rgb.blue}`);
  }

  if (options.background) {
    const rgb = hexToRgb(resolveThemeColor(options.background));
    codes.push(`48;2;${rgb.red};${rgb.green};${rgb.blue}`);
  }

  return `\u001b[${codes.join(";")}m${text}\u001b[0m`;
}

export function printHeader(title: string): void {
  console.log(
    colorize(title, {
      bold: true,
      color: CLI_THEME.colors.brandSoft,
    }),
  );
}

export function printInfo(text: string): void {
  console.log(
    colorize(text, {
      color: CLI_THEME.colors.dimText,
      dim: true,
    }),
  );
}

export function printError(text: string): void {
  console.error(
    colorize(text, {
      bold: true,
      color: CLI_THEME.colors.danger,
    }),
  );
}

export function printSuccess(text: string): void {
  console.log(
    colorize(text, {
      color: CLI_THEME.colors.success,
    }),
  );
}

export function printWarning(text: string): void {
  console.log(
    colorize(text, {
      color: CLI_THEME.colors.warning,
    }),
  );
}

export function renderHelp(commands: CommandDefinition[]): string {
  const lines = [
    colorize("QX Agent CLI", {
      bold: true,
      color: CLI_THEME.colors.brandSoft,
    }),
    "",
    colorize("Usage:", {
      bold: true,
      color: CLI_THEME.colors.brand,
    }),
    `  ${colorize("qx-agent [prompt]", { color: CLI_THEME.colors.text })}`,
    `  ${colorize("qx-agent <command> [options]", {
      color: CLI_THEME.colors.text,
    })}`,
    "",
    colorize("Commands:", {
      bold: true,
      color: CLI_THEME.colors.brand,
    }),
  ];

  for (const command of commands) {
    const aliasText =
      command.aliases.length > 0 ? ` (${command.aliases.join(", ")})` : "";
    lines.push(
      `  ${colorize(`${command.name}${aliasText}`, {
        color: CLI_THEME.colors.accent,
        bold: true,
      })}`,
    );
    lines.push(`    ${command.description}`);
  }

  lines.push("");
  lines.push(
    colorize("Global flags:", {
      bold: true,
      color: CLI_THEME.colors.brand,
    }),
  );
  lines.push(renderFlag("--provider <name>", "deepseek | openai-compatible | mock"));
  lines.push(renderFlag("--model <name>", "override model"));
  lines.push(renderFlag("--base-url <url>", "override API base URL"));
  lines.push(renderFlag("--api-key <key>", "override API key"));
  lines.push(renderFlag("--session <name>", "override session name"));
  lines.push(renderFlag("--max-steps <n>", "max agent iterations"));
  lines.push(renderFlag("--no-tools", "disable built-in tools"));
  lines.push(renderFlag("--no-skills", "disable local skills"));
  lines.push(renderFlag("--skill <a,b>", "explicitly enable named skills"));
  lines.push(renderFlag("--skills-dir <path>", "override local skills directory"));
  lines.push(renderFlag("--mcp-config <path>", "override MCP config path"));
  lines.push(renderFlag("--timeout-ms <n>", "request timeout for model calls"));
  lines.push(renderFlag("--shell-timeout-ms <n>", "timeout for shell_command tool"));
  lines.push(renderFlag("--config <path>", "override agent config file path"));
  lines.push(renderFlag("--system-prompt <t>", "append custom system prompt"));
  lines.push(renderFlag("--help", "show help"));
  lines.push(renderFlag("--version", "show version"));

  return lines.join("\n");
}

export function printAgentEvent(event: RunAgentEvent): void {
  if (event.type === "assistant_delta") {
    if (!hasActiveAssistantStream) {
      process.stdout.write(
        colorize("assistant> ", {
          color: CLI_THEME.colors.brandSoft,
          bold: true,
        }),
      );
    }

    process.stdout.write(
      colorize(event.delta, {
        color: CLI_THEME.colors.brandSoft,
        bold: true,
      }),
    );
    hasActiveAssistantStream = true;
    return;
  }

  if (hasActiveAssistantStream) {
    process.stdout.write("\n");
    hasActiveAssistantStream = false;
  }

  if (event.type === "tool_start") {
    console.log(
      colorize(`tool> ${event.toolName} ${JSON.stringify(event.args)}`, {
        color: CLI_THEME.colors.accent,
      }),
    );
    return;
  }

  if (event.type === "tool_end") {
    const tag = event.isError ? "tool!" : "tool<";
    console.log(
      colorize(`${tag} ${event.toolName} ${event.resultPreview}`, {
        color: event.isError
          ? CLI_THEME.colors.danger
          : CLI_THEME.colors.dimText,
      }),
    );
    return;
  }

  if (event.streamed) {
    return;
  }

  console.log(
    colorize(`assistant> ${event.content}`, {
      color: CLI_THEME.colors.brandSoft,
      bold: true,
    }),
  );
}

export function summarizeMessages(messages: ConversationMessage[]): string {
  if (messages.length === 0) {
    return "No messages.";
  }

  return messages
    .slice(-12)
    .map((message) => {
      if (message.role === "tool") {
        return `tool:${message.name} ${truncate(message.content, 120)}`;
      }

      if (message.role === "assistant") {
        return `assistant ${truncate(message.content ?? "", 120)}`;
      }

      return `${message.role} ${truncate(message.content, 120)}`;
    })
    .join("\n");
}

export function formatConfigForDisplay(config: ResolvedConfig): string {
  const maskedApiKey =
    config.apiKey === null
      ? "(not set)"
      : `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-4)}`;

  return [
    `provider: ${config.provider}`,
    `model: ${config.model}`,
    `baseUrl: ${config.baseUrl}`,
    `apiKey: ${maskedApiKey}`,
    `sessionName: ${config.sessionName}`,
    `maxSteps: ${config.maxSteps}`,
    `enableTools: ${String(config.enableTools)}`,
    `enableSkills: ${String(config.enableSkills)}`,
    `skillsDir: ${config.skillsDir}`,
    `mcpConfigPath: ${config.mcpConfigPath}`,
    `timeoutMs: ${config.timeoutMs}`,
    `shellTimeoutMs: ${config.shellTimeoutMs}`,
    `workspaceRoot: ${config.workspaceRoot}`,
    `projectConfigPath: ${config.projectConfigPath}`,
    `globalConfigPath: ${config.globalConfigPath}`,
  ].join("\n");
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function renderFlag(flag: string, description: string): string {
  const padded = flag.length >= 22 ? `${flag} ` : flag.padEnd(22, " ");
  return `  ${colorize(padded, {
    color: CLI_THEME.colors.accent,
  })}${description}`;
}
