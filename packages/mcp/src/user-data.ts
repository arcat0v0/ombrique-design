import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "@ombrique/desktop";

export function socketPathFor(
  userData: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const hash = createHash("sha256")
      .update(userData)
      .digest("hex")
      .slice(0, 16);
    return `\\\\.\\pipe\\ombrique-${hash}`;
  }
  return join(userData, "ombrique-mcp.sock");
}

export function defaultUserDataDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  if (platform === "win32")
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), APP_NAME);
  if (platform === "darwin")
    return join(home, "Library", "Application Support", APP_NAME);
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), APP_NAME);
}

export interface ResolveSocketPathOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

export function resolveSocketPath(
  options: ResolveSocketPathOptions = {},
): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (env.OMBRIQUE_MCP_SOCKET) return env.OMBRIQUE_MCP_SOCKET;
  if (env.OMBRIQUE_USER_DATA)
    return socketPathFor(env.OMBRIQUE_USER_DATA, platform);
  return socketPathFor(defaultUserDataDir(platform, env, home), platform);
}
