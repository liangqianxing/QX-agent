# QX Agent CLI

Chinese documentation: `README.zh-CN.md`

Online project page: `https://liangqianxing.github.io/QX-agent/`

`QX Agent CLI` is a compact TypeScript AI agent terminal app with a clear runtime path:

- command-line entrypoint and command registry
- config resolution and session persistence
- OpenAI-compatible / DeepSeek provider abstraction
- agent loop with tool calling
- built-in tools, MCP tools, and local skills

It stays intentionally small enough to read end-to-end and extend.

## Features

- Interactive REPL: `qx-agent`
- One-shot mode: `qx-agent chat "summarize this repo"`
- DeepSeek support with sensible defaults
- OpenAI-compatible provider support
- Offline `mock` provider for smoke tests
- Built-in tools:
  - `list_files`
  - `glob_files`
  - `search_files`
  - `grep_files`
  - `read_file`
  - `edit_file`
  - `write_file`
  - `todo_write`
  - `web_search`
  - `web_fetch`
  - `shell_command`
- MCP integration:
  - `stdio` transport
  - `streamable-http` transport
  - server inspection via `mcp list` / `mcp tools`
- Local skills:
  - auto-selected from `skills/`
  - explicit enable with `--skill`
  - inspect via `skills list` / `skills show`
- Project-scoped session storage under `.qx-agent/sessions/`

## Install

```bash
npm install
npm run build
```

Run in development:

```bash
npm run dev -- chat "hello"
```

Install the local binary:

```bash
npm link
qx-agent
```

## Configuration

Resolution order:

1. built-in defaults
2. `~/.qx-agent/config.json`
3. `./agent.config.json`
4. environment variables
5. CLI flags

Key environment variables:

- `AI_AGENT_PROVIDER`
- `AI_AGENT_MODEL`
- `AI_AGENT_BASE_URL`
- `AI_AGENT_API_KEY`
- `AI_AGENT_SESSION`
- `AI_AGENT_MAX_STEPS`
- `AI_AGENT_ENABLE_TOOLS`
- `AI_AGENT_ENABLE_SKILLS`
- `AI_AGENT_SKILLS_DIR`
- `AI_AGENT_MCP_CONFIG`
- `AI_AGENT_TIMEOUT_MS`
- `AI_AGENT_SHELL_TIMEOUT_MS`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Create a local config:

```bash
qx-agent config init
```

Or copy `agent.config.example.json` to `agent.config.json`.

Minimal example:

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "baseUrl": "https://api.deepseek.com",
  "sessionName": "default",
  "enableTools": true,
  "enableSkills": true,
  "skillsDir": "skills",
  "mcpConfigPath": "mcp.config.json"
}
```

DeepSeek quick start:

```powershell
$env:DEEPSEEK_API_KEY="your-key"
node dist/index.js "Reply with exactly ok." --provider deepseek --no-tools
```

## MCP

Place MCP server definitions in `mcp.config.json`:

```json
{
  "servers": [
    {
      "name": "qx-demo",
      "transport": "stdio",
      "command": "node",
      "args": ["scripts/mcp-demo-server.mjs"]
    }
  ]
}
```

This repo includes:

- `mcp.config.example.json`
- `scripts/mcp-demo-server.mjs`
- `mcp.web-search.config.example.json`
- `scripts/mcp-web-search-server.mjs`

Self-hosted web search example without a vendor API key:

```bash
qx-agent mcp list --mcp-config mcp.web-search.config.example.json
qx-agent "Use the MCP web_search tool to search for 'OpenAI latest news' and give me the top 2 results with links." --mcp-config mcp.web-search.config.example.json
```

Useful commands:

```bash
qx-agent mcp list
qx-agent mcp tools
```

## Skills

Local skills live under `skills/`. Each skill is a markdown file with lightweight frontmatter:

```md
---
name: project-summary
description: Explain the project structure and runtime flow.
triggers: explain, architecture, summary
---
```

Useful commands:

```bash
qx-agent skills list
qx-agent skills show project-summary
qx-agent skills init my-skill
```

Force a skill for a single request:

```bash
qx-agent chat "Explain this repo" --skill project-summary
```

## Usage

Interactive mode:

```bash
qx-agent
```

One-shot mode:

```bash
qx-agent chat "List the TypeScript files in this folder"
```

Built-in web search without MCP setup:

```bash
qx-agent "Use web_search to search for 'OpenAI latest news' and return the top 2 results with links."
```

Use the mock provider:

```bash
qx-agent chat "List files in this directory" --provider mock
```

Use DeepSeek:

```bash
qx-agent chat "Summarize this project" --provider deepseek
```

MCP tool call example:

```bash
qx-agent "Use the MCP echo tool to echo exactly hello-mcp and nothing else."
```

Useful REPL commands:

- `/help`
- `/clear`
- `/history`
- `/tasks`
- `/tasks clear`
- `/model <name>`
- `/tools on`
- `/tools off`
- `/exit`

## Commands

- `chat [prompt...]`
- `config [show|init]`
- `mcp [list|tools]`
- `session [list|show|clear]`
- `tasks [show|list|clear]`
- `skills [list|show|init]`
- `help`

## Architecture

- `src/index.ts`: Node entrypoint
- `src/entrypoints/cli.ts`: CLI bootstrap, flag parsing, command dispatch
- `src/config.ts`: layered config resolution
- `src/commands/chat.ts`: one-shot and REPL entry
- `src/repl.ts`: interactive loop
- `src/agent/runAgent.ts`: agent loop and tool-call orchestration
- `src/providers/openaiCompatible.ts`: DeepSeek / OpenAI-compatible chat client
- `src/tools/index.ts`: built-in tools
- `src/tasks/store.ts`: persistent session todo lists for `todo_write`
- `src/mcp/manager.ts`: MCP server connection, discovery, and tool wrapping
- `src/skills/`: local skill loading and prompt-time selection
- `src/session/store.ts`: session persistence

## Notes

- File tools stay restricted to the current workspace root.
- The built-in toolset now more closely mirrors a larger agent CLI: globbing, regex grep, targeted file edits, todo tracking, web search, and web fetch.
- MCP tools are exposed to the model as wrapped function tools such as `mcp_qx_demo_echo`.
- Skills are prompt-time instructions, not executable plugins.
- The demo MCP server is only for local testing.
