import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { handleEditCommandSchema } from "./commands";
import { ToolError } from "./errors";
import type { DocumentTools } from "./tools";

function ok(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function failed(error: unknown): CallToolResult {
  const body =
    error instanceof ToolError
      ? {
          ok: false,
          code: error.code,
          message: error.message,
          ...error.details,
        }
      : {
          ok: false,
          code: "internal_error",
          message: String(error),
        };
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(body, null, 2),
      },
    ],
    isError: true,
  };
}

async function call(
  operation: () => Promise<unknown> | unknown,
): Promise<CallToolResult> {
  try {
    return ok(await operation());
  } catch (error) {
    return failed(error);
  }
}

function imageResult(result: {
  mimeType: "image/png" | "image/jpeg";
  data: string;
  width: number;
  height: number;
}): CallToolResult {
  return {
    content: [
      {
        type: "image",
        data: result.data,
        mimeType: result.mimeType,
      },
      {
        type: "text",
        text: JSON.stringify({ width: result.width, height: result.height }),
      },
    ],
  };
}

export function createMcpServer(tools: DocumentTools): McpServer {
  const server = new McpServer({
    name: "ombrique",
    version: "0.1.0",
  });
  server.registerTool(
    "read_state",
    {
      description:
        "Read the open project, page files, current file versions, and selection availability",
      inputSchema: {},
    },
    async () => call(() => tools.readState()),
  );
  server.registerTool(
    "read_tree",
    {
      description:
        "Read a page tree; each node contains tag, name, rect, path, and an opaque handle",
      inputSchema: {
        page: z
          .string()
          .min(1)
          .describe("page file, for example pages/home.tsx"),
      },
    },
    async ({ page }) => call(() => tools.readTree({ page })),
  );
  server.registerTool(
    "read_node",
    {
      description: "Read style and attributes for one opaque handle",
      inputSchema: {
        handle: z.string().min(1),
      },
    },
    async ({ handle }) => call(() => tools.readNode({ handle })),
  );
  server.registerTool(
    "apply_edits",
    {
      description:
        "Apply handle-based edit commands as one atomic transaction; returns the failing command index on handle errors",
      inputSchema: {
        commands: z.array(handleEditCommandSchema).min(1),
      },
    },
    async ({ commands }) => call(() => tools.applyEdits({ commands })),
  );
  server.registerTool(
    "select",
    {
      description:
        "Point the independent Agent focus at handles without changing the user selection",
      inputSchema: {
        handles: z.array(z.string().min(1)).min(1),
      },
    },
    async ({ handles }) => call(() => tools.select({ handles })),
  );
  server.registerTool(
    "screenshot",
    {
      description:
        "Capture the current canvas view as PNG or JPEG image content",
      inputSchema: {
        page: z.string().min(1).optional(),
      },
    },
    async ({ page }) => {
      try {
        return imageResult(await tools.screenshot({ page }));
      } catch (error) {
        return failed(error);
      }
    },
  );
  server.registerTool(
    "export",
    {
      description:
        "Export a node through the existing main-process export pipeline",
      inputSchema: {
        handle: z.string().min(1).optional(),
        file: z.string().min(1).optional(),
        path: z.array(z.number().int().nonnegative()).optional(),
        name: z.string().min(1).optional(),
        format: z.enum(["png", "jpg", "webp", "svg", "pdf"]).optional(),
        scale: z.number().positive().optional(),
      },
    },
    async ({ handle, file, path, name, format, scale }) =>
      call(() => tools.exportFile({ handle, file, path, name, format, scale })),
  );
  server.registerTool(
    "read_skill",
    {
      description:
        "Read the handwritten Ombrique TSX dialect, command, handle, and atomicity guide",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text" as const, text: tools.readSkill() }],
    }),
  );
  return server;
}
