import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".qx-agent", "node_modules"]);

export function resolveInsideWorkspace(
  workspaceRoot: string,
  userPath: string,
): string {
  const absoluteWorkspaceRoot = resolve(workspaceRoot);
  const candidate = resolve(absoluteWorkspaceRoot, userPath);

  if (
    candidate !== absoluteWorkspaceRoot &&
    !candidate.startsWith(`${absoluteWorkspaceRoot}${sep}`)
  ) {
    throw new Error(`Path escapes workspace root: ${userPath}`);
  }

  return candidate;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, content, "utf8");
}

export async function appendUtf8(filePath: string, content: string): Promise<void> {
  await ensureParentDirectory(filePath);
  const existing = (await fileExists(filePath)) ? await readFile(filePath, "utf8") : "";
  await writeFile(filePath, `${existing}${content}`, "utf8");
}

export async function walkWorkspace(
  root: string,
  options?: {
    maxDepth?: number;
    maxEntries?: number;
  },
): Promise<string[]> {
  const maxDepth = options?.maxDepth ?? 3;
  const maxEntries = options?.maxEntries ?? 200;
  const output: string[] = [];

  async function visit(directory: string, depth: number): Promise<void> {
    if (output.length >= maxEntries || depth > maxDepth) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= maxEntries) {
        return;
      }

      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const fullPath = resolve(directory, entry.name);
      output.push(fullPath);

      if (entry.isDirectory()) {
        await visit(fullPath, depth + 1);
      }
    }
  }

  await visit(resolve(root), 0);
  return output;
}

export async function isTextFile(filePath: string): Promise<boolean> {
  const file = await readFile(filePath);
  const limit = Math.min(file.length, 512);

  for (let index = 0; index < limit; index += 1) {
    if (file[index] === 0) {
      return false;
    }
  }

  return true;
}

export function toWorkspaceRelative(
  workspaceRoot: string,
  filePath: string,
): string {
  return relative(workspaceRoot, filePath) || ".";
}
