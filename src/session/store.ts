import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationMessage, StoredSession, ToolCallRequest } from "../types.js";
import { fileExists, readUtf8, writeUtf8 } from "../utils/filesystem.js";

function getSessionDirectory(workspaceRoot: string): string {
  return join(workspaceRoot, ".qx-agent", "sessions");
}

function getSessionFile(workspaceRoot: string, sessionName: string): string {
  return join(getSessionDirectory(workspaceRoot), `${sessionName}.json`);
}

export async function loadSession(
  workspaceRoot: string,
  sessionName: string,
): Promise<StoredSession> {
  const filePath = getSessionFile(workspaceRoot, sessionName);
  if (!(await fileExists(filePath))) {
    const now = new Date().toISOString();
    return {
      name: sessionName,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  const stored = JSON.parse(await readUtf8(filePath)) as StoredSession;
  const { session, repaired } = normalizeSession(stored);
  if (repaired) {
    await writeSessionFile(filePath, session);
  }

  return session;
}

export async function saveSession(
  workspaceRoot: string,
  session: StoredSession,
): Promise<string> {
  const directory = getSessionDirectory(workspaceRoot);
  await mkdir(directory, { recursive: true });

  const filePath = getSessionFile(workspaceRoot, session.name);
  const nextSession: StoredSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  const normalized = normalizeSession(nextSession).session;
  await writeSessionFile(filePath, normalized);
  return filePath;
}

export async function listSessions(workspaceRoot: string): Promise<
  Array<{
    name: string;
    filePath: string;
    updatedAt: string;
    sizeBytes: number;
  }>
> {
  const directory = getSessionDirectory(workspaceRoot);
  if (!(await fileExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = join(directory, entry.name);
        const metadata = await stat(filePath);
        return {
          name: entry.name.replace(/\.json$/u, ""),
          filePath,
          updatedAt: metadata.mtime.toISOString(),
          sizeBytes: metadata.size,
        };
      }),
  );

  return sessions.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export async function clearSession(
  workspaceRoot: string,
  sessionName: string,
): Promise<boolean> {
  const filePath = getSessionFile(workspaceRoot, sessionName);
  if (!(await fileExists(filePath))) {
    return false;
  }

  await rm(filePath, { force: true });
  return true;
}

function normalizeSession(
  session: StoredSession,
): { session: StoredSession; repaired: boolean } {
  const { messages, repaired } = normalizeSessionMessages(session.messages);
  if (!repaired) {
    return { session, repaired: false };
  }

  return {
    repaired: true,
    session: {
      ...session,
      messages,
    },
  };
}

function normalizeSessionMessages(
  messages: ConversationMessage[],
): { messages: ConversationMessage[]; repaired: boolean } {
  const normalized: ConversationMessage[] = [];
  let repaired = false;
  let pendingToolCalls = new Map<string, ToolCallRequest>();

  const flushPendingToolCalls = () => {
    if (pendingToolCalls.size === 0) {
      return;
    }

    repaired = true;
    for (const toolCall of pendingToolCalls.values()) {
      normalized.push(buildMissingToolMessage(toolCall));
    }
    pendingToolCalls = new Map();
  };

  for (const message of messages) {
    if (pendingToolCalls.size > 0) {
      if (message.role === "tool" && pendingToolCalls.has(message.toolCallId)) {
        normalized.push(message);
        pendingToolCalls.delete(message.toolCallId);
        continue;
      }

      flushPendingToolCalls();
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      normalized.push(message);
      pendingToolCalls = new Map(
        message.toolCalls.map((toolCall) => [toolCall.id, toolCall]),
      );
      continue;
    }

    if (message.role === "tool") {
      repaired = true;
      continue;
    }

    normalized.push(message);
  }

  flushPendingToolCalls();

  return {
    messages: normalized,
    repaired,
  };
}

function buildMissingToolMessage(toolCall: ToolCallRequest): ConversationMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    name: toolCall.name,
    content:
      "Tool error: this tool call did not complete in a previous turn. The session history was repaired automatically.",
  };
}

async function writeSessionFile(
  filePath: string,
  session: StoredSession,
): Promise<void> {
  await writeUtf8(filePath, `${JSON.stringify(session, null, 2)}\n`);
}
