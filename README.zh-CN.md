# QX Agent CLI

英文版见 `README.md`。
在线预览页：`https://raw.githack.com/liangqianxing/QX-agent/main/docs/index.html`

`QX Agent CLI` 是一个用 TypeScript/Node.js 实现的轻量级 AI Agent 命令行项目，核心链路完整但规模不大，适合学习、二次开发和简历展示。

它包含这些核心部分：

- 命令行入口与命令分发
- 配置加载与会话持久化
- DeepSeek / OpenAI-compatible 模型接入
- Agent 多步执行循环
- 内置工具、MCP 工具、本地 skills

## 功能概览

- 交互式 REPL：`qx-agent`
- 单次 one-shot 命令：`qx-agent chat "总结这个项目"`
- 内置 DeepSeek 默认配置
- 支持 OpenAI-compatible 接口
- 支持离线 `mock` provider
- 内置工具：
  - `list_files`
  - `search_files`
  - `read_file`
  - `write_file`
  - `shell_command`
- 支持 MCP：
  - `stdio` 传输
  - `streamable-http` 传输
  - `mcp list` / `mcp tools` 查看服务器和工具
- 支持本地 skills：
  - 从 `skills/` 自动加载
  - 按 prompt 自动匹配
  - 也可通过 `--skill` 显式指定
- 会话记录保存在 `.qx-agent/sessions/`

## 安装

```bash
npm install
npm run build
```

开发模式运行：

```bash
npm run dev -- chat "hello"
```

如果要注册本地命令：

```bash
npm link
qx-agent
```

## 配置加载顺序

程序按下面顺序合并配置：

1. 代码默认值
2. `~/.qx-agent/config.json`
3. 当前项目下的 `agent.config.json`
4. 环境变量
5. CLI 参数

常用环境变量：

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

初始化本地配置：

```bash
qx-agent config init
```

或者复制 `agent.config.example.json` 为 `agent.config.json`。

一个最小示例：

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

DeepSeek 快速测试：

```powershell
$env:DEEPSEEK_API_KEY="your-key"
node dist/index.js "Reply with exactly ok." --provider deepseek --no-tools
```

## MCP 使用

在项目根目录放一个 `mcp.config.json`：

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

当前仓库已经自带：

- `mcp.config.example.json`
- `scripts/mcp-demo-server.mjs`

查看 MCP 连接情况：

```bash
qx-agent mcp list
qx-agent mcp tools
```

## Skills 使用

本地 skill 放在 `skills/` 下，每个 skill 是一个带前置信息的 Markdown 文件，例如：

```md
---
name: project-summary
description: 解释项目结构与运行链路
triggers: explain, architecture, summary
---
```

常用命令：

```bash
qx-agent skills list
qx-agent skills show project-summary
qx-agent skills init my-skill
```

单次请求显式启用某个 skill：

```bash
qx-agent chat "解释这个项目" --skill project-summary
```

## 使用方式

交互式 REPL：

```bash
qx-agent
```

单次命令：

```bash
qx-agent chat "列出当前目录下的 TypeScript 文件"
```

使用 mock provider：

```bash
qx-agent chat "List files in this directory" --provider mock
```

使用 DeepSeek：

```bash
qx-agent chat "Summarize this project" --provider deepseek
```

MCP 工具调用示例：

```bash
qx-agent "Use the MCP echo tool to echo exactly hello-mcp and nothing else."
```

REPL 常用命令：

- `/help`
- `/clear`
- `/history`
- `/model <name>`
- `/tools on`
- `/tools off`
- `/exit`

## 命令列表

- `chat [prompt...]`
- `config [show|init]`
- `mcp [list|tools]`
- `session [list|show|clear]`
- `skills [list|show|init]`
- `help`

## 项目运行原理

运行主链路可以概括为：

1. `src/index.ts` 作为入口启动 CLI
2. `src/entrypoints/cli.ts` 解析参数并合并配置
3. `src/commands/chat.ts` 决定进入 REPL 或 one-shot
4. `src/agent/runAgent.ts` 组织 system prompt、历史消息和用户输入
5. `src/providers/openaiCompatible.ts` 调用 DeepSeek / OpenAI-compatible 模型
6. 如果模型返回 tool call，就执行内置工具或 MCP 工具
7. 工具结果回写上下文后继续迭代，直到得到最终回答
8. `src/session/store.ts` 把消息保存到本地 session 文件

相关模块：

- `src/config.ts`：配置解析
- `src/repl.ts`：交互式循环
- `src/tools/index.ts`：内置工具注册
- `src/mcp/manager.ts`：MCP 连接、探测和工具封装
- `src/skills/`：skill 加载与匹配

## 说明

- 文件类工具被限制在当前工作区内执行。
- MCP 工具会包装成模型可调用的函数名，例如 `mcp_qx_demo_echo`。
- skills 本质上是附加到 system prompt 的任务指令，不是独立进程插件。
- `scripts/mcp-demo-server.mjs` 只是本地演示用 MCP server。
