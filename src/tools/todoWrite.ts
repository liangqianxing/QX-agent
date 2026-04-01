import type { TodoItem, TodoPriority, TodoStatus, ToolDefinition } from "../types.js";
import { loadTasks, saveTasks } from "../tasks/store.js";

const VALID_STATUSES = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
]);
const VALID_PRIORITIES = new Set<TodoPriority>(["low", "medium", "high"]);

export const todoWriteTool: ToolDefinition = {
  name: "todo_write",
  description:
    "Create or update the current session todo list. Use this for multi-step tasks and keep it current.",
  inputSchema: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        description:
          "Complete replacement todo list. Each item should include content and status, with optional priority.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["content", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["todos"],
    additionalProperties: false,
  },
  async execute(args, context) {
    const todos = normalizeTodos(args.todos);
    if (typeof todos === "string") {
      return {
        content: todos,
        isError: true,
      };
    }

    const previous = await loadTasks(context.workspaceRoot, context.sessionName);
    await saveTasks(context.workspaceRoot, {
      sessionName: context.sessionName,
      updatedAt: previous.updatedAt,
      todos,
    });

    return {
      content: JSON.stringify(
        {
          sessionName: context.sessionName,
          oldTodos: previous.todos,
          newTodos: todos,
        },
        null,
        2,
      ),
    };
  },
};

function normalizeTodos(raw: unknown): TodoItem[] | string {
  if (!Array.isArray(raw)) {
    return "todos must be an array";
  }

  const todos: TodoItem[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `todo at index ${index} must be an object`;
    }

    const content = "content" in item ? item.content : undefined;
    const status = "status" in item ? item.status : undefined;
    const priority = "priority" in item ? item.priority : undefined;
    const id = "id" in item ? item.id : undefined;

    if (typeof content !== "string" || content.trim() === "") {
      return `todo at index ${index} must include non-empty content`;
    }

    if (typeof status !== "string" || !VALID_STATUSES.has(status as TodoStatus)) {
      return `todo at index ${index} has invalid status`;
    }

    if (
      priority !== undefined &&
      (typeof priority !== "string" ||
        !VALID_PRIORITIES.has(priority as TodoPriority))
    ) {
      return `todo at index ${index} has invalid priority`;
    }

    if (id !== undefined && typeof id !== "string") {
      return `todo at index ${index} has invalid id`;
    }

    todos.push({
      ...(typeof id === "string" ? { id } : {}),
      content: content.trim(),
      status: status as TodoStatus,
      ...(typeof priority === "string" ? { priority: priority as TodoPriority } : {}),
    });
  }

  return todos;
}
