import {
  createServer,
  createServerHotChannel,
  DevEnvironment,
  type Plugin,
} from "vite";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
export type { WirePayload } from "./channel";
import {
  createChannelBridge,
  type HotClient,
  type WirePayload,
} from "./channel";

const require = createRequire(import.meta.url);

const BOARD_ROOT_URL = "/@ombrique/board-root";
const BOARD_ROOT_ID = "\0ombrique-board-root";
const BOARD_ROOT_SOURCE = `import { createElement } from "react";
import { createRoot } from "react-dom/client";

export function createBoardRoot(element) {
  const root = createRoot(element);
  return {
    render(component) {
      root.render(createElement(component));
    },
    unmount() {
      root.unmount();
    },
  };
}
`;

const boardRootPlugin: Plugin = {
  name: "ombrique:board-root",
  resolveId(id) {
    return id === BOARD_ROOT_URL ? BOARD_ROOT_ID : null;
  },
  load(id) {
    return id === BOARD_ROOT_ID ? BOARD_ROOT_SOURCE : null;
  },
};

const SHADER_URL_PREFIX = "/@ombrique-shader/";
const SHADER_ID_PREFIX = "\0ombrique-shader:";

function shaderSourcePlugin(root: string): Plugin {
  return {
    name: "ombrique:shader-source",
    enforce: "pre",
    resolveId(id) {
      if (!id.startsWith(SHADER_URL_PREFIX)) return null;
      return `${SHADER_ID_PREFIX}${id.slice(SHADER_URL_PREFIX.length)}`;
    },
    load(id) {
      if (!id.startsWith(SHADER_ID_PREFIX)) return null;
      const rest = id.slice(SHADER_ID_PREFIX.length);
      const slash = rest.indexOf("/");
      const rel = slash === -1 ? "" : rest.slice(slash + 1);
      const absolute = resolve(root, rel);
      const inside = relative(root, absolute);
      if (
        rel === "" ||
        inside === "" ||
        inside.startsWith("..") ||
        inside.startsWith(sep)
      ) {
        throw new Error(`shader source outside the project: ${rel}`);
      }
      return `export default ${JSON.stringify(readFileSync(absolute, "utf8"))};`;
    },
  };
}

const glslReloadPlugin: Plugin = {
  name: "ombrique:glsl-reload",
  configureServer(server) {
    const reload = (file: string): void => {
      if (!file.endsWith(".glsl")) return;
      server.environments.client?.hot.send({ type: "full-reload", path: "*" });
    };
    server.watcher.on("add", reload);
    server.watcher.on("change", reload);
  },
};

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
    plugins: [shaderSourcePlugin(root), boardRootPlugin, glslReloadPlugin],
    optimizeDeps: {
      include: [
        "react",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
        "react-dom",
        "react-dom/client",
      ],
    },
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
