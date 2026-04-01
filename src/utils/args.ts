import type { ParsedArgv, ParsedFlags } from "../types.js";

const SHORT_FLAG_MAP: Record<string, string> = {
  h: "help",
  m: "model",
  p: "provider",
  s: "session",
  v: "version",
};

export function parseArgv(argv: string[]): ParsedArgv {
  const flags: ParsedFlags = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (token.startsWith("--no-")) {
      flags[token.slice(5)] = false;
      continue;
    }

    if (token.startsWith("--")) {
      const equalsIndex = token.indexOf("=");
      if (equalsIndex !== -1) {
        const key = token.slice(2, equalsIndex);
        const value = token.slice(equalsIndex + 1);
        flags[key] = value;
        continue;
      }

      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        index += 1;
        continue;
      }

      flags[key] = true;
      continue;
    }

    if (token.startsWith("-") && token.length === 2) {
      const shortKey = token.slice(1);
      const mappedKey = SHORT_FLAG_MAP[shortKey];
      if (!mappedKey) {
        positionals.push(token);
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[mappedKey] = next;
        index += 1;
        continue;
      }

      flags[mappedKey] = true;
      continue;
    }

    positionals.push(token);
  }

  return { flags, positionals };
}

export function getStringFlag(
  flags: ParsedFlags,
  key: string,
): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function getBooleanFlag(
  flags: ParsedFlags,
  key: string,
): boolean | undefined {
  const value = flags[key];
  return typeof value === "boolean" ? value : undefined;
}

export function getNumberFlag(
  flags: ParsedFlags,
  key: string,
): number | undefined {
  const value = getStringFlag(flags, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
