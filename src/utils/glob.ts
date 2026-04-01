function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}

function normalizePattern(value: string): string {
  return value.replace(/\\/gu, "/");
}

export function normalizeGlobPath(value: string): string {
  return normalizePattern(value).replace(/^\.\/+/u, "");
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePattern(pattern);
  let index = 0;
  let output = "^";

  while (index < normalized.length) {
    const char = normalized[index];

    if (char === "*") {
      const next = normalized[index + 1];
      if (next === "*") {
        const after = normalized[index + 2];
        if (after === "/") {
          output += "(?:.*/)?";
          index += 3;
          continue;
        }

        output += ".*";
        index += 2;
        continue;
      }

      output += "[^/]*";
      index += 1;
      continue;
    }

    if (char === "?") {
      output += "[^/]";
      index += 1;
      continue;
    }

    if (char === "{") {
      const endIndex = normalized.indexOf("}", index + 1);
      if (endIndex !== -1) {
        const inner = normalized
          .slice(index + 1, endIndex)
          .split(",")
          .map((item) => escapeRegex(item.trim()))
          .join("|");
        output += `(?:${inner})`;
        index = endIndex + 1;
        continue;
      }
    }

    if (char === "/") {
      output += "/";
      index += 1;
      continue;
    }

    output += escapeRegex(char ?? "");
    index += 1;
  }

  output += "$";
  return new RegExp(output, "u");
}

export function matchesGlob(pattern: string, value: string): boolean {
  const normalizedValue = normalizeGlobPath(value);
  const regexp = globToRegExp(pattern);

  if (!pattern.includes("/")) {
    const segments = normalizedValue.split("/");
    const baseName = segments[segments.length - 1] ?? normalizedValue;
    return regexp.test(baseName);
  }

  return regexp.test(normalizedValue);
}
