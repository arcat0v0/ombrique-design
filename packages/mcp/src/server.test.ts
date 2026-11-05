import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./server";
import { describe, expect, it } from "vitest";
import type { DocumentTools } from "./tools";

describe("MCP server tool surface", () => {
  it("registers every Ombrique tool and returns the dialect skill", async () => {
    const tools = {
      readSkill: () => "# Ombrique TSX dialect",
    } as unknown as DocumentTools;
    const server = createMcpServer(tools);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "ombrique-test", version: "1.0.0" });
    await client.connect(clientTransport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "apply_edits",
        "export",
        "read_node",
        "read_skill",
        "read_state",
        "read_tree",
        "screenshot",
        "select",
      ].sort(),
    );
    const skill = CallToolResultSchema.parse(
      await client.callTool({
        name: "read_skill",
        arguments: {},
      }),
    );
    expect(skill.content[0]).toMatchObject({
      type: "text",
      text: "# Ombrique TSX dialect",
    });
    await client.close();
    await server.close();
  });
});
