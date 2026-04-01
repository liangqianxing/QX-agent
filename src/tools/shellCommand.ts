import { spawn } from "node:child_process";
import type { ToolDefinition } from "../types.js";

type ShellResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const isWindows = process.platform === "win32";
    const shellExecutable = isWindows ? "powershell.exe" : "/bin/bash";
    const shellArgs = isWindows
      ? ["-NoLogo", "-NoProfile", "-Command", command]
      : ["-lc", command];

    const child = spawn(shellExecutable, shellArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({
          exitCode: null,
          signal: "SIGTERM",
          stdout,
          stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim(),
          durationMs: Date.now() - start,
        });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        resolve({
          exitCode,
          signal,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        });
      }
    });
  });
}

export const shellCommandTool: ToolDefinition = {
  name: "shell_command",
  description: "Run a shell command inside the workspace root.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute." },
      timeout_ms: { type: "number", description: "Override timeout in milliseconds." },
    },
    required: ["command"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const command = args.command;
    if (typeof command !== "string" || command.trim() === "") {
      return {
        content: "command must be a non-empty string",
        isError: true,
      };
    }

    const timeoutMs =
      typeof args.timeout_ms === "number"
        ? Math.max(1000, Math.floor(args.timeout_ms))
        : context.shellTimeoutMs;

    const result = await runShellCommand(
      command,
      context.workspaceRoot,
      timeoutMs,
    );

    return {
      content: JSON.stringify(result, null, 2),
      isError: result.exitCode !== 0,
    };
  },
};
