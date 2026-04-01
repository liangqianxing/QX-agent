import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "qx-demo-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "echo",
  {
    description: "Echo text back to the caller.",
    inputSchema: {
      text: z.string(),
      uppercase: z.boolean().optional(),
    },
  },
  async ({ text, uppercase = false }) => ({
    content: [
      {
        type: "text",
        text: uppercase ? text.toUpperCase() : text,
      },
    ],
  }),
);

server.registerTool(
  "sum",
  {
    description: "Add two numbers.",
    inputSchema: {
      a: z.number(),
      b: z.number(),
    },
  },
  async ({ a, b }) => ({
    content: [
      {
        type: "text",
        text: String(a + b),
      },
    ],
    structuredContent: {
      result: a + b,
    },
  }),
);

await server.connect(new StdioServerTransport());
