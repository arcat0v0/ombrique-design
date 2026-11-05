import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSocketPath } from "./user-data";

describe("resolveSocketPath", () => {
  it("prefers an explicit socket path", () => {
    expect(
      resolveSocketPath({
        env: {
          OMBRIQUE_MCP_SOCKET: "/tmp/custom.sock",
          OMBRIQUE_USER_DATA: "/tmp/ignored",
        },
        platform: "linux",
        home: "/home/test",
      }),
    ).toBe("/tmp/custom.sock");
  });

  it("prefers OMBRIQUE_USER_DATA over platform defaults", () => {
    expect(
      resolveSocketPath({
        env: { OMBRIQUE_USER_DATA: "/tmp/ombrique-user" },
        platform: "linux",
        home: "/home/test",
      }),
    ).toBe(join("/tmp/ombrique-user", "ombrique-mcp.sock"));
  });

  it("uses the Electron userData defaults per platform", () => {
    expect(
      resolveSocketPath({
        env: {},
        platform: "linux",
        home: "/home/test",
      }),
    ).toBe(
      join("/home/test", ".config", "@ombrique/desktop", "ombrique-mcp.sock"),
    );
    expect(
      resolveSocketPath({
        env: {},
        platform: "darwin",
        home: "/Users/test",
      }),
    ).toBe(
      join(
        "/Users/test",
        "Library",
        "Application Support",
        "@ombrique/desktop",
        "ombrique-mcp.sock",
      ),
    );
    expect(
      resolveSocketPath({
        env: { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
        platform: "win32",
        home: "C:\\Users\\test",
      }).startsWith("\\\\.\\pipe\\ombrique-"),
    ).toBe(true);
  });
});
