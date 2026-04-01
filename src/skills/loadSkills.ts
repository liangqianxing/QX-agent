import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ResolvedConfig, SkillDefinition } from "../types.js";
import { fileExists, readUtf8 } from "../utils/filesystem.js";

type SkillFrontmatter = {
  name?: string;
  description?: string;
  triggers?: string[];
};

const TRIGGER_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "asks",
  "for",
  "from",
  "into",
  "of",
  "or",
  "skill",
  "the",
  "this",
  "to",
  "use",
  "user",
  "when",
  "with",
]);

export async function loadSkills(config: ResolvedConfig): Promise<SkillDefinition[]> {
  if (!config.enableSkills) {
    return [];
  }

  const root = resolve(config.workspaceRoot, config.skillsDir);
  if (!(await fileExists(root))) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const skills: SkillDefinition[] = [];

  for (const entry of entries) {
    const skillFilePath = entry.isDirectory()
      ? join(root, entry.name, "SKILL.md")
      : join(root, entry.name);

    const isMarkdownFile =
      skillFilePath.endsWith(".md") || skillFilePath.endsWith(".markdown");
    if (!isMarkdownFile || !(await fileExists(skillFilePath))) {
      continue;
    }

    const raw = await readUtf8(skillFilePath);
    const { frontmatter, content } = parseSkillFile(raw);
    const inferredName = inferSkillName(entry.name);
    const name = frontmatter.name?.trim() || inferredName;
    const description =
      frontmatter.description?.trim() || inferDescription(content) || `Skill ${name}`;
    const triggers = normalizeTriggers(frontmatter.triggers, name, description);

    skills.push({
      name,
      description,
      triggers,
      content: content.trim(),
      sourcePath: skillFilePath,
    });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

function parseSkillFile(raw: string): {
  frontmatter: SkillFrontmatter;
  content: string;
} {
  const normalized = raw.replace(/\r\n/gu, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      content: raw,
    };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return {
      frontmatter: {},
      content: raw,
    };
  }

  const header = normalized.slice(4, endIndex);
  const content = normalized.slice(endIndex + 5);
  const frontmatter: SkillFrontmatter = {};

  for (const line of header.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "name") {
      frontmatter.name = value;
      continue;
    }

    if (key === "description") {
      frontmatter.description = value;
      continue;
    }

    if (key === "triggers") {
      frontmatter.triggers = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");
    }
  }

  return {
    frontmatter,
    content,
  };
}

function inferSkillName(fileName: string): string {
  return fileName
    .replace(/\.md$/iu, "")
    .replace(/^skill[-_]/iu, "")
    .trim();
}

function inferDescription(content: string): string | null {
  const lines = content.split(/\r?\n/gu);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    return trimmed.slice(0, 140);
  }
  return null;
}

function normalizeTriggers(
  triggers: string[] | undefined,
  name: string,
  description: string,
): string[] {
  const explicit = triggers ?? [];
  const derivedDescription =
    explicit.length > 0 ? [] : tokenizeTriggerTerms(description);
  const derived = [name, ...tokenizeTriggerTerms(name), ...derivedDescription];

  return [...new Set([...explicit, ...derived])]
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 2);
}

function tokenizeTriggerTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .flatMap((token) => token.split(/[_-]+/u))
    .map((token) => token.trim())
    .filter(
      (token) => token.length >= 3 && !TRIGGER_STOPWORDS.has(token),
    );
}
