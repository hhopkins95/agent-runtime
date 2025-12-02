import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "echo-server",
  version: "1.0.0",
});

// Echo tool - echoes back the input message
server.addTool({
  name: "echo",
  description: "Echoes back the input message. Use this tool to test MCP server connectivity.",
  parameters: z.object({
    message: z.string().describe("The message to echo back"),
  }),
  execute: async (args) => {
    return `Echo: ${args.message}`;
  },
});

// Server info tool - returns info about the MCP server
server.addTool({
  name: "get_server_info",
  description: "Returns information about the echo MCP server",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify({
      name: "echo-server",
      version: "1.0.0",
      description: "A simple echo MCP server for testing",
      timestamp: new Date().toISOString(),
      pid: process.pid,
    }, null, 2);
  },
});

// Start the server with stdio transport
server.start({ transportType: "stdio" });
