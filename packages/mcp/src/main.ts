import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentSocketClient } from "./client";
import { createMcpServer } from "./server";
import { DocumentTools } from "./tools";
import { resolveSocketPath } from "./user-data";

const client = new AgentSocketClient({
  socketPath: resolveSocketPath(),
  clientName: "ombrique-mcp",
});

try {
  await client.connect();
} catch (error) {
  console.error(`[ombrique-mcp] ${String(error)}`);
  process.exit(1);
}

const server = createMcpServer(new DocumentTools(client));
await server.connect(new StdioServerTransport());
