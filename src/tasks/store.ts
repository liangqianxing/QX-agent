import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { StoredTodoList, TodoItem } from "../types.js";
import { fileExists, readUtf8, writeUtf8 } from "../utils/filesystem.js";

function getTasksDirectory(workspaceRoot: string): string {
  return join(workspaceRoot, ".qx-agent", "tasks");
}

function getTasksFile(workspaceRoot: string, sessionName: string): string {
  return join(getTasksDirectory(workspaceRoot), `${sessionName}.json`);
}

export async function loadTasks(
  workspaceRoot: string,
  sessionName: string,
): Promise<StoredTodoList> {
  const filePath = getTasksFile(workspaceRoot, sessionName);
  if (!(await fileExists(filePath))) {
    return {
      sessionName,
      updatedAt: new Date().toISOString(),
      todos: [],
    };
  }

  return JSON.parse(await readUtf8(filePath)) as StoredTodoList;
}

export async function saveTasks(
  workspaceRoot: string,
  taskList: StoredTodoList,
): Promise<string> {
  const directory = getTasksDirectory(workspaceRoot);
  await mkdir(directory, { recursive: true });

  const nextTaskList: StoredTodoList = {
    ...taskList,
    updatedAt: new Date().toISOString(),
  };
  const filePath = getTasksFile(workspaceRoot, taskList.sessionName);
  await writeUtf8(filePath, `${JSON.stringify(nextTaskList, null, 2)}\n`);
  return filePath;
}

export async function clearTasks(
  workspaceRoot: string,
  sessionName: string,
): Promise<boolean> {
  const filePath = getTasksFile(workspaceRoot, sessionName);
  if (!(await fileExists(filePath))) {
    return false;
  }

  await rm(filePath, { force: true });
  return true;
}

export async function listTaskLists(workspaceRoot: string): Promise<
  Array<{
    sessionName: string;
    updatedAt: string;
    taskCount: number;
    filePath: string;
  }>
> {
  const directory = getTasksDirectory(workspaceRoot);
  if (!(await fileExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const taskLists = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = join(directory, entry.name);
        const [metadata, taskList] = await Promise.all([
          stat(filePath),
          readUtf8(filePath),
        ]);
        const parsed = JSON.parse(taskList) as StoredTodoList;
        return {
          sessionName: entry.name.replace(/\.json$/u, ""),
          updatedAt: metadata.mtime.toISOString(),
          taskCount: parsed.todos.length,
          filePath,
        };
      }),
  );

  return taskLists.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function formatTodosForPrompt(todos: TodoItem[]): string | null {
  if (todos.length === 0) {
    return null;
  }

  const lines = todos.map((todo, index) => {
    const priority = todo.priority ? `, priority=${todo.priority}` : "";
    return `${index + 1}. [${todo.status}] ${todo.content}${priority}`;
  });

  return [
    "Current session todo list:",
    ...lines,
    "Keep this list current with todo_write for multi-step work.",
  ].join("\n");
}

export function formatTodosForDisplay(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return "No tasks.";
  }

  return todos
    .map((todo, index) => {
      const priority = todo.priority ? ` (${todo.priority})` : "";
      return `${index + 1}. [${todo.status}] ${todo.content}${priority}`;
    })
    .join("\n");
}
