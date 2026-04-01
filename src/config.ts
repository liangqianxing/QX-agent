import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  CliConfigOverrides,
  ConfigFile,
  ProviderName,
  ResolvedConfig,
} from "./types.js";
import { fileExists, readUtf8 } from "./utils/filesystem.js";

const COMMON_DEFAULTS = {
  sessionName: "default",
  maxSteps: 16,
  enableTools: true,
  enableSkills: true,
  skillsDir: "skills",
  mcpConfigPath: "mcp.config.json",
  timeoutMs: 300000,
  shellTimeoutMs: 20000,
  systemPrompt: null,
} satisfies Pick<
  ResolvedConfig,
  | "enableTools"
  | "enableSkills"
  | "maxSteps"
  | "mcpConfigPath"
  | "sessionName"
  | "shellTimeoutMs"
  | "skillsDir"
  | "systemPrompt"
  | "timeoutMs"
>;

function getProviderDefaults(provider: ProviderName): Pick<
  ResolvedConfig,
  "baseUrl" | "model" | "provider"
> {
  if (provider === "deepseek") {
    return {
      provider,
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    };
  }

  if (provider === "mock") {
    return {
      provider,
      model: "mock-model",
      baseUrl: "https://mock.local",
    };
  }

  return {
    provider,
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  };
}

export async function loadConfig(
  cwd: string,
  overrides: CliConfigOverrides = {},
): Promise<ResolvedConfig> {
  const globalConfigPath = join(homedir(), ".qx-agent", "config.json");
  const projectConfigPath = overrides.configPath
    ? resolve(cwd, overrides.configPath)
    : resolve(cwd, "agent.config.json");

  const [globalConfig, projectConfig] = await Promise.all([
    readConfigFile(globalConfigPath),
    readConfigFile(projectConfigPath),
  ]);

  const envConfig = readEnvConfig();
  const merged = {
    ...COMMON_DEFAULTS,
    ...globalConfig,
    ...projectConfig,
    ...envConfig,
    ...overrides,
  };
  const provider = merged.provider ?? "openai-compatible";
  const providerDefaults = getProviderDefaults(provider);

  return {
    provider,
    model: merged.model ?? providerDefaults.model,
    baseUrl: trimTrailingSlash(merged.baseUrl ?? providerDefaults.baseUrl),
    apiKey: merged.apiKey ?? null,
    sessionName: merged.sessionName ?? COMMON_DEFAULTS.sessionName,
    maxSteps: normalizePositiveInteger(
      merged.maxSteps,
      COMMON_DEFAULTS.maxSteps,
    ),
    enableTools: merged.enableTools ?? COMMON_DEFAULTS.enableTools,
    enableSkills: merged.enableSkills ?? COMMON_DEFAULTS.enableSkills,
    skillsDir: merged.skillsDir ?? COMMON_DEFAULTS.skillsDir,
    mcpConfigPath: merged.mcpConfigPath ?? COMMON_DEFAULTS.mcpConfigPath,
    timeoutMs: normalizePositiveInteger(
      merged.timeoutMs,
      COMMON_DEFAULTS.timeoutMs,
    ),
    shellTimeoutMs: normalizePositiveInteger(
      merged.shellTimeoutMs,
      COMMON_DEFAULTS.shellTimeoutMs,
    ),
    workspaceRoot: resolve(cwd, merged.workspaceRoot ?? cwd),
    systemPrompt: merged.systemPrompt ?? COMMON_DEFAULTS.systemPrompt,
    projectConfigPath,
    globalConfigPath,
  };
}

async function readConfigFile(filePath: string): Promise<ConfigFile> {
  if (!(await fileExists(filePath))) {
    return {};
  }

  return JSON.parse(await readUtf8(filePath)) as ConfigFile;
}

function readEnvConfig(): ConfigFile {
  const provider = normalizeProvider(process.env.AI_AGENT_PROVIDER);
  const model =
    process.env.AI_AGENT_MODEL ??
    process.env.DEEPSEEK_MODEL ??
    process.env.OPENAI_MODEL;
  const baseUrl =
    process.env.AI_AGENT_BASE_URL ??
    process.env.DEEPSEEK_BASE_URL ??
    process.env.OPENAI_BASE_URL;
  const apiKey =
    process.env.AI_AGENT_API_KEY ??
    process.env.DEEPSEEK_API_KEY ??
    process.env.OPENAI_API_KEY;
  const sessionName = process.env.AI_AGENT_SESSION;
  const maxSteps = parseOptionalNumber(process.env.AI_AGENT_MAX_STEPS);
  const enableTools = parseOptionalBoolean(process.env.AI_AGENT_ENABLE_TOOLS);
  const enableSkills = parseOptionalBoolean(process.env.AI_AGENT_ENABLE_SKILLS);
  const skillsDir = process.env.AI_AGENT_SKILLS_DIR;
  const mcpConfigPath = process.env.AI_AGENT_MCP_CONFIG;
  const timeoutMs = parseOptionalNumber(process.env.AI_AGENT_TIMEOUT_MS);
  const shellTimeoutMs = parseOptionalNumber(process.env.AI_AGENT_SHELL_TIMEOUT_MS);

  return {
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(sessionName !== undefined ? { sessionName } : {}),
    ...(maxSteps !== undefined ? { maxSteps } : {}),
    ...(enableTools !== undefined ? { enableTools } : {}),
    ...(enableSkills !== undefined ? { enableSkills } : {}),
    ...(skillsDir !== undefined ? { skillsDir } : {}),
    ...(mcpConfigPath !== undefined ? { mcpConfigPath } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(shellTimeoutMs !== undefined ? { shellTimeoutMs } : {}),
  };
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeProvider(value: string | undefined): ConfigFile["provider"] {
  if (
    value === "deepseek" ||
    value === "mock" ||
    value === "openai-compatible"
  ) {
    return value;
  }

  return undefined;
}
