import { clearSession, loadSession } from "../session/store.js";
import { clearTasks, formatTodosForDisplay, loadTasks } from "../tasks/store.js";
import { runAgent } from "../agent/runAgent.js";
import { prepareSkillAddendum } from "../skills/runtime.js";
import { getBuiltInTools } from "../tools/index.js";
import type { RunAgentEvent } from "../types.js";
import { summarizeMessages, truncate } from "../utils/output.js";
import { CLI_THEME } from "../ui/theme.js";
import {
  type ReplLogEntry,
  type ReplState,
  REPL_COMMAND_HELP,
  createReplEntry,
} from "../replShared.js";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";

export type Props = {
  initialEntries: ReplLogEntry[];
  initialSessionMessageCount: number;
  initialTaskCount: number;
  initialState: ReplState;
};

type EntryStyle = {
  accent: string;
  detail: string;
  body: string;
};

const ENTRY_STYLES: Record<ReplLogEntry["tone"], EntryStyle> = {
  assistant: {
    accent: CLI_THEME.colors.brandSoft,
    detail: CLI_THEME.colors.dimText,
    body: CLI_THEME.colors.text,
  },
  danger: {
    accent: CLI_THEME.colors.danger,
    detail: CLI_THEME.colors.warning,
    body: CLI_THEME.colors.text,
  },
  info: {
    accent: CLI_THEME.colors.brand,
    detail: CLI_THEME.colors.dimText,
    body: CLI_THEME.colors.text,
  },
  tool: {
    accent: CLI_THEME.colors.accent,
    detail: CLI_THEME.colors.dimText,
    body: CLI_THEME.colors.text,
  },
  user: {
    accent: CLI_THEME.colors.warm,
    detail: CLI_THEME.colors.dimText,
    body: CLI_THEME.colors.text,
  },
  warning: {
    accent: CLI_THEME.colors.warning,
    detail: CLI_THEME.colors.dimText,
    body: CLI_THEME.colors.text,
  },
};

export function REPL(props: Props): JSX.Element {
  const { exit } = useApp();
  const [runtimeState, setRuntimeState] = useState(props.initialState);
  const [inputValue, setInputValue] = useState("");
  const [entries, setEntries] = useState(props.initialEntries);
  const [statusText, setStatusText] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [sessionMessageCount, setSessionMessageCount] = useState(
    props.initialSessionMessageCount,
  );
  const [taskCount, setTaskCount] = useState(props.initialTaskCount);
  const baseEntriesRef = useRef(props.initialEntries);
  const streamingAssistantEntryIdRef = useRef<string | null>(null);
  const deferredEntries = useDeferredValue(entries);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (key.escape && !busy) {
      setInputValue("");
    }
  });

  const visibleEntries = useMemo(
    () => deferredEntries.slice(-12),
    [deferredEntries],
  );

  function appendEntries(nextEntries: ReplLogEntry | ReplLogEntry[]): void {
    const list = Array.isArray(nextEntries) ? nextEntries : [nextEntries];
    startTransition(() => {
      setEntries((current) => [...current, ...list]);
    });
  }

  function resetEntries(nextEntry: ReplLogEntry): void {
    startTransition(() => {
      setEntries([...baseEntriesRef.current, nextEntry]);
    });
  }

  function updateEntry(
    entryId: string,
    updater: (entry: ReplLogEntry) => ReplLogEntry,
  ): void {
    startTransition(() => {
      setEntries((current) =>
        current.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
      );
    });
  }

  function finalizeStreamingAssistant(): void {
    const entryId = streamingAssistantEntryIdRef.current;
    if (!entryId) {
      return;
    }

    updateEntry(entryId, (entry) => ({
      ...stripEntryDetail(entry),
    }));
    streamingAssistantEntryIdRef.current = null;
  }

  async function handleSlashCommand(line: string): Promise<void> {
    const [command = "", ...rest] = line.slice(1).split(/\s+/u);

    if (command === "exit" || command === "quit") {
      exit();
      return;
    }

    if (command === "help") {
      appendEntries(
        createReplEntry("info", "commands", REPL_COMMAND_HELP.join("\n")),
      );
      setStatusText("Listed repl commands");
      return;
    }

    if (command === "model") {
      const model = rest.join(" ").trim();
      if (model === "") {
        appendEntries(
          createReplEntry("info", "model", runtimeState.config.model),
        );
        setStatusText("Displayed current model");
        return;
      }

      setRuntimeState((current) => ({
        ...current,
        config: {
          ...current.config,
          model,
        },
      }));
      appendEntries(createReplEntry("info", "model", `Switched to ${model}`));
      setStatusText("Model updated");
      return;
    }

    if (command === "tools") {
      const value = rest[0];
      if (value !== "on" && value !== "off") {
        appendEntries(
          createReplEntry(
            "info",
            "tools",
            `Tools are ${runtimeState.config.enableTools ? "on" : "off"}`,
          ),
        );
        setStatusText("Displayed tool state");
        return;
      }

      setRuntimeState((current) => ({
        ...current,
        config: {
          ...current.config,
          enableTools: value === "on",
        },
      }));
      appendEntries(createReplEntry("info", "tools", `Tools turned ${value}`));
      setStatusText("Tool state updated");
      return;
    }

    if (command === "history") {
      const session = await loadSession(
        runtimeState.config.workspaceRoot,
        runtimeState.config.sessionName,
      );
      appendEntries(
        createReplEntry("info", "history", summarizeMessages(session.messages)),
      );
      setStatusText("Loaded recent history");
      return;
    }

    if (command === "tasks") {
      if (rest[0] === "clear") {
        await clearTasks(
          runtimeState.config.workspaceRoot,
          runtimeState.config.sessionName,
        );
        setTaskCount(0);
        appendEntries(createReplEntry("warning", "tasks", "Todo list cleared."));
        setStatusText("Tasks cleared");
        return;
      }

      const taskList = await loadTasks(
        runtimeState.config.workspaceRoot,
        runtimeState.config.sessionName,
      );
      setTaskCount(taskList.todos.length);
      appendEntries(
        createReplEntry(
          "info",
          "tasks",
          formatTodosForDisplay(taskList.todos),
        ),
      );
      setStatusText("Loaded todo list");
      return;
    }

    if (command === "clear") {
      await clearSession(
        runtimeState.config.workspaceRoot,
        runtimeState.config.sessionName,
      );
      setSessionMessageCount(0);
      resetEntries(createReplEntry("warning", "session", "Session cleared."));
      setStatusText("Session cleared");
      return;
    }

    appendEntries(
      createReplEntry(
        "danger",
        "command",
        `Unknown repl command: ${command}`,
        "Type /help to see the available commands.",
      ),
    );
    setStatusText("Unknown repl command");
  }

  function handleAgentEvent(event: RunAgentEvent): void {
    if (event.type === "assistant_delta") {
      if (streamingAssistantEntryIdRef.current === null) {
        const entry = createReplEntry("assistant", "assistant", "", "streaming");
        streamingAssistantEntryIdRef.current = entry.id;
        appendEntries(entry);
      }

      const entryId = streamingAssistantEntryIdRef.current;
      if (entryId) {
        updateEntry(entryId, (entry) => ({
          ...entry,
          body: `${entry.body}${event.delta}`,
        }));
      }
      setStatusText("Streaming response");
      return;
    }

    if (event.type === "assistant") {
      const streamingEntryId = streamingAssistantEntryIdRef.current;
      if (streamingEntryId) {
        updateEntry(streamingEntryId, (entry) => ({
          ...stripEntryDetail(entry),
          body: event.content,
        }));
        streamingAssistantEntryIdRef.current = null;
        setStatusText("Ready");
        if (event.streamed) {
          return;
        }
      }

      appendEntries(createReplEntry("assistant", "assistant", event.content));
      setStatusText("Ready");
      return;
    }

    finalizeStreamingAssistant();

    if (event.type === "tool_start") {
      appendEntries(
        createReplEntry(
          "tool",
          `tool ${event.toolName}`,
          truncate(JSON.stringify(event.args), 160),
          "started",
        ),
      );
      setStatusText(`Running ${event.toolName}`);
      return;
    }

    if (event.type === "tool_end") {
      appendEntries(
        createReplEntry(
          event.isError ? "danger" : "tool",
          `tool ${event.toolName}`,
          event.resultPreview,
          event.isError ? "failed" : "completed",
        ),
      );
      setStatusText(
        event.isError ? `${event.toolName} failed` : `${event.toolName} completed`,
      );
      return;
    }
  }

  async function submitPrompt(rawValue: string): Promise<void> {
    const line = rawValue.trim();
    if (line === "" || busy) {
      return;
    }

    setInputValue("");

    if (line.startsWith("/")) {
      await handleSlashCommand(line);
      return;
    }

    appendEntries(createReplEntry("user", "you", line));
    setBusy(true);
    setStatusText("Thinking");

    try {
      const session = await loadSession(
        runtimeState.config.workspaceRoot,
        runtimeState.config.sessionName,
      );
      const skillContext = await prepareSkillAddendum(
        runtimeState.config,
        line,
        runtimeState.explicitSkillNames,
      );
      const tools = runtimeState.config.enableTools
        ? [...getBuiltInTools(), ...runtimeState.mcpRuntime.tools]
        : runtimeState.mcpRuntime.tools;

      const result = await runAgent({
        config: runtimeState.config,
        provider: runtimeState.provider,
        session,
        prompt: line,
        systemPromptAddendum: skillContext.addendum,
        tools,
        onEvent: handleAgentEvent,
      });

      setSessionMessageCount(result.session.messages.length);
      const taskList = await loadTasks(
        runtimeState.config.workspaceRoot,
        runtimeState.config.sessionName,
      );
      setTaskCount(taskList.todos.length);
      setStatusText("Ready");
    } catch (error) {
      finalizeStreamingAssistant();
      const message = error instanceof Error ? error.message : String(error);
      appendEntries(createReplEntry("danger", "error", message));
      setStatusText("Last turn failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column">
      <Header
        busy={busy}
        runtimeState={runtimeState}
        sessionMessageCount={sessionMessageCount}
        taskCount={taskCount}
      />

      <Box
        borderColor={CLI_THEME.colors.border}
        borderStyle="round"
        flexDirection="column"
        marginTop={1}
        paddingX={1}
        paddingY={0}
      >
        <Box justifyContent="space-between">
          <Text bold color={CLI_THEME.colors.brandSoft}>
            session feed
          </Text>
          <Text color={CLI_THEME.colors.muted}>
            {entries.length > visibleEntries.length
              ? `showing last ${visibleEntries.length} of ${entries.length}`
              : `${entries.length} events`}
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {visibleEntries.map((entry) => (
            <EntryBlock entry={entry} key={entry.id} />
          ))}
        </Box>
      </Box>

      <Box
        borderColor={busy ? CLI_THEME.colors.accent : CLI_THEME.colors.brand}
        borderStyle="round"
        flexDirection="column"
        marginTop={1}
        paddingX={1}
        paddingY={0}
      >
        <Box justifyContent="space-between">
          <Text bold color={CLI_THEME.colors.accent}>
            prompt
          </Text>
          <Text color={CLI_THEME.colors.muted}>
            enter send | /help commands | esc clear | ctrl+c exit
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text bold color={CLI_THEME.colors.brandSoft}>
            qx-agent &gt;
          </Text>
          <Text> </Text>
          <TextInput
            placeholder={
              busy
                ? "assistant is working..."
                : "Ask for code, files, tasks, or MCP tools"
            }
            value={inputValue}
            onChange={setInputValue}
            onSubmit={(value) => {
              void submitPrompt(value);
            }}
          />
        </Box>
      </Box>

      <Box justifyContent="space-between" marginTop={1}>
        <Text
          color={busy ? CLI_THEME.colors.accent : CLI_THEME.colors.brandSoft}
        >
          {busy ? `${statusText}...` : statusText}
        </Text>
        <Text color={CLI_THEME.colors.muted}>
          tools {runtimeState.config.enableTools ? "on" : "off"} | skills{" "}
          {runtimeState.config.enableSkills ? "on" : "off"}
        </Text>
      </Box>
    </Box>
  );
}

type HeaderProps = {
  busy: boolean;
  runtimeState: ReplState;
  sessionMessageCount: number;
  taskCount: number;
};

function Header(props: HeaderProps): JSX.Element {
  return (
    <Box
      borderColor={props.busy ? CLI_THEME.colors.accent : CLI_THEME.colors.brand}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={CLI_THEME.colors.brandSoft}>
          QX Agent
        </Text>
        <Text color={CLI_THEME.colors.muted}>React CLI</Text>
      </Box>
      <Text color={CLI_THEME.colors.dimText}>
        Inspired by the cc_src terminal layout, rebuilt for this project with
        Ink.
      </Text>
      <Box flexWrap="wrap" marginTop={1}>
        <HeaderTag
          color={CLI_THEME.colors.accent}
          label="session"
          value={props.runtimeState.config.sessionName}
        />
        <HeaderTag
          color={CLI_THEME.colors.brandSoft}
          label="provider"
          value={props.runtimeState.provider.name}
        />
        <HeaderTag
          color={CLI_THEME.colors.warm}
          label="model"
          value={props.runtimeState.config.model}
        />
        <HeaderTag
          color={CLI_THEME.colors.success}
          label="messages"
          value={String(props.sessionMessageCount)}
        />
        <HeaderTag
          color={CLI_THEME.colors.warning}
          label="tasks"
          value={String(props.taskCount)}
        />
        <HeaderTag
          color={CLI_THEME.colors.brand}
          label="mcp"
          value={String(props.runtimeState.mcpRuntime.tools.length)}
        />
      </Box>
    </Box>
  );
}

type HeaderTagProps = {
  color: string;
  label: string;
  value: string;
};

function HeaderTag(props: HeaderTagProps): JSX.Element {
  return (
    <Box marginRight={2}>
      <Text color={props.color}>[{props.label}]</Text>
      <Text> </Text>
      <Text bold color={CLI_THEME.colors.text}>
        {truncate(props.value, 36)}
      </Text>
    </Box>
  );
}

type EntryBlockProps = {
  entry: ReplLogEntry;
};

function EntryBlock({ entry }: EntryBlockProps): JSX.Element {
  const style = ENTRY_STYLES[entry.tone];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={style.accent}>
          {entry.label}
        </Text>
        {entry.detail ? (
          <>
            <Text color={style.detail}>  </Text>
            <Text color={style.detail}>{entry.detail}</Text>
          </>
        ) : null}
      </Box>
      <Text color={style.body}>{entry.body}</Text>
    </Box>
  );
}

function stripEntryDetail(entry: ReplLogEntry): ReplLogEntry {
  const { detail: _detail, ...rest } = entry;
  return rest;
}
