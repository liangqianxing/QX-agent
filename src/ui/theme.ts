export const CLI_THEME = {
  colors: {
    brand: "#11616B",
    brandSoft: "#6BA5BD",
    border: "#297270",
    accent: "#F6998D",
    accentSoft: "#FEECE7",
    warm: "#FFE3BF",
    success: "#8AB07C",
    warning: "#EC8D61",
    danger: "#D05D56",
    muted: "#81939A",
    text: "#EAF2F5",
    dimText: "#B7C4CA",
  },
} as const;

type ThemeColorName = keyof typeof CLI_THEME.colors;

type Rgb = {
  red: number;
  green: number;
  blue: number;
};

export function resolveThemeColor(color: ThemeColorName | string): string {
  if (color in CLI_THEME.colors) {
    return CLI_THEME.colors[color as ThemeColorName];
  }

  return color;
}

export function hexToRgb(color: string): Rgb {
  const normalized = color.replace(/^#/u, "");
  if (!/^[0-9a-fA-F]{6}$/u.test(normalized)) {
    throw new Error(`Invalid hex color: ${color}`);
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}
