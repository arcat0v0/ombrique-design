import { createServer, createServerHotChannel, DevEnvironment } from "vite";
import { createRequire } from "node:module";
export type { WirePayload } from "./channel";
import {
  createChannelBridge,
  type HotClient,
  type WirePayload,
} from "./channel";

const require = createRequire(import.meta.url);

export interface DesignCompiler {
  transform(url: string): Promise<string | null>;
  transformHtml(html: string): Promise<string>;
  watcher: { on: (event: string, cb: (file: string) => void) => void };
  setWire(handler: (payload: WirePayload) => void): void;
  clientConnect(client: HotClient): void;
  clientMessage(payload: WirePayload, client: HotClient): void;
  close(): Promise<void>;
}

export async function createDesignCompiler(
  root: string,
): Promise<DesignCompiler> {
  const channel = createServerHotChannel();
  const bridge = createChannelBridge(channel);

  const server = await createServer({
    root,
    logLevel: "warn",
    configFile: false,
    server: { middlewareMode: true, ws: false },
    oxc: { jsx: { runtime: "automatic", development: true } },
    resolve: {
      alias: [
        { find: /^react$/, replacement: require.resolve("react") },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: require.resolve("react/jsx-dev-runtime"),
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: require.resolve("react/jsx-runtime"),
        },
        { find: /^react-dom$/, replacement: require.resolve("react-dom") },
        {
          find: /^react-dom\/client$/,
          replacement: require.resolve("react-dom/client"),
        },
        {
          find: /^@ombrique\/runtime$/,
          replacement: require.resolve("@ombrique/runtime"),
        },
      ],
    },
    environments: {
      client: {
        dev: {
          createEnvironment: (name, config, context) =>
            new DevEnvironment(name, config, {
              ...context,
              transport: channel,
              hot: true,
            }),
        },
      },
    },
  });

  const env = server.environments.client;

  return {
    async transform(url) {
      try {
        const clean = url.split("?")[0] ?? url;
        const result = await env.transformRequest(clean);
        return result?.code ?? null;
      } catch {
        return null;
      }
    },
    async transformHtml(html) {
      return server.transformIndexHtml("/", html);
    },
    watcher: server.watcher,
    setWire: bridge.setWire,
    clientConnect: bridge.clientConnect,
    clientMessage: bridge.clientMessage,
    async close() {
      await server.close();
    },
  };
}
