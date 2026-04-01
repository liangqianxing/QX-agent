import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runAgent } from "./agent/runAgent.js";
import { loadSession } from "./session/store.js";
import { clearTasks, formatTodosForDisplay, loadTasks } from "./tasks/store.js";
import { prepareSkillAddendum } from "./skills/runtime.js";
import { getBuiltInTools } from "./tools/index.js";
import { launchRepl } from "./replLauncher.js";
import { type ReplState, createReplEntry } from "./replShared.js";
import {
  printAgentEvent,
  printHeader,
  printInfo,
  printWarning,
  summarizeMessages,
} from "./utils/output.js";
import { saveSession } from "./session/store.js";

export async function startRepl(initialState: ReplState): Promise<void> {
  if (!supportsInkRepl()) {
    await startLegacyRepl(initialState);
    return;
  }

  const [session, taskList] = await Promise.all([
    loadSession(initialState.config.workspaceRoot, initialState.config.sessionName),
    loadTasks(initialState.config.workspaceRoot, initialState.config.sessionName),
  ]);

  const initialEntries = [
    createReplEntry(
      "info",
      "session",
      `Connected to ${initialState.provider.name} with session ${initialState.config.sessionName}.`,
      "Type /help for commands.",
    ),
    ...initialState.mcpRuntime.diagnostics.map((diagnostic) =>
      createReplEntry("warning", "mcp", diagnostic),
    ),
  ];

  try {
    await launchRepl({
      initialEntries,
      initialSessionMessageCount: session.messages.length,
      initialTaskCount: taskList.todos.length,
      initialState,
    });
  } finally {
    await initialState.mcpRuntime.close();
  }
}

async function startLegacyRepl(initialState: ReplState): Promise<void> {
  const state = { ...initialState };
  const rl = readline.createInterface({
    input,
    output,
    terminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
  });

  printHeader("QX Agent interactive session");
  printInfo(`session: ${state.config.sessionName}`);
  printInfo(`provider: ${state.provider.name}`);
  printInfo("raw terminal mode unavailable, using fallback line repl");
  printInfo("type /help for commands");
  for (const diagnostic of state.mcpRuntime.diagnostics) {
    printWarning(diagnostic);
  }

  try {
    while (true) {
      const line = (await rl.question("qx-agent> ")).trim();
      if (line === "") {
        continue;
      }

      if (line.startsWith("/")) {
        const shouldContinue = await handleLegacySlashCommand(line, state);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      const session = await loadSession(
        state.config.workspaceRoot,
        state.config.sessionName,
      );
      const skillContext = await prepareSkillAddendum(
        state.config,
        line,
        state.explicitSkillNames,
      );
      const tools = state.config.enableTools
        ? [...getBuiltInTools(), ...state.mcpRuntime.tools]
        : state.mcpRuntime.tools;
      await runAgent({
        config: state.config,
        provider: state.provider,
        session,
        prompt: line,
        systemPromptAddendum: skillContext.addendum,
        tools,
        onEvent: printAgentEvent,
      });
    }
  } finally {
    await state.mcpRuntime.close();
    rl.close();
  }
}

async function handleLegacySlashCommand(
  line: string,
  state: ReplState,
): Promise<boolean> {
  const [command, ...rest] = line.slice(1).split(/\s+/u);

  if (command === "exit" || command === "quit") {
    return false;
  }

  if (command === "help") {
    console.log("/help          show repl commands");
    console.log("/clear         clear the current session");
    console.log("/history       print recent messages");
    console.log("/tasks         show the current todo list");
    console.log("/tasks clear   clear the current todo list");
    console.log("/model <name>  switch model for this repl");
    console.log("/tools on|off  enable or disable tools");
    console.log("/exit          quit");
    return true;
  }

  if (command === "model") {
    const model = rest.join(" ").trim();
    if (model === "") {
      console.log(`current model: ${state.config.model}`);
      return true;
    }

    state.config = {
      ...state.config,
      model,
    };
    printInfo(`model set to ${model}`);
    return true;
  }

  if (command === "tools") {
    const value = rest[0];
    if (value !== "on" && value !== "off") {
      console.log(`tools: ${state.config.enableTools ? "on" : "off"}`);
      return true;
    }

    state.config = {
      ...state.config,
      enableTools: value === "on",
    };
    printInfo(`tools ${value}`);
    return true;
  }

  if (command === "history") {
    const session = await loadSession(
      state.config.workspaceRoot,
      state.config.sessionName,
    );
    console.log(summarizeMessages(session.messages));
    return true;
  }

  if (command === "tasks") {
    if (rest[0] === "clear") {
      await clearTasks(state.config.workspaceRoot, state.config.sessionName);
      printInfo("todo list cleared");
      return true;
    }

    const taskList = await loadTasks(
      state.config.workspaceRoot,
      state.config.sessionName,
    );
    console.log(formatTodosForDisplay(taskList.todos));
    return true;
  }

  if (command === "clear") {
    const now = new Date().toISOString();
    await saveSession(state.config.workspaceRoot, {
      name: state.config.sessionName,
      createdAt: now,
      updatedAt: now,
      messages: [],
    });
    printInfo("session cleared");
    return true;
  }

  console.log(`unknown repl command: ${command}`);
  return true;
}

function supportsInkRepl(): boolean {
  return process.stdin.isTTY === true && typeof process.stdin.setRawMode === "function";
}
