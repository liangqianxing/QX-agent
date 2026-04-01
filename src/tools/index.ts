import { editFileTool } from "./editFile.js";
import { globFilesTool } from "./globFiles.js";
import { grepFilesTool } from "./grepFiles.js";
import type { ToolDefinition } from "../types.js";
import { listFilesTool } from "./listFiles.js";
import { readFileTool } from "./readFile.js";
import { searchFilesTool } from "./searchFiles.js";
import { shellCommandTool } from "./shellCommand.js";
import { todoWriteTool } from "./todoWrite.js";
import { webFetchTool } from "./webFetch.js";
import { webSearchTool } from "./webSearch.js";
import { writeFileTool } from "./writeFile.js";

export function getBuiltInTools(): ToolDefinition[] {
  return [
    listFilesTool,
    globFilesTool,
    searchFilesTool,
    grepFilesTool,
    readFileTool,
    editFileTool,
    writeFileTool,
    todoWriteTool,
    webSearchTool,
    webFetchTool,
    shellCommandTool,
  ];
}
