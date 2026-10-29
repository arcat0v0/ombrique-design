import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  utilityProcess,
  WebContentsView,
  nativeImage,
} from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, normalize, resolve, sep } from "node:path";
import { mimeFor, urlToProjectPath } from "@ombrique/compiler";
import { createBundle, extractBundle } from "@ombrique/doc-service";

const here = __dirname;
const rendererDir = join(here, "../renderer");
const preloadDir = join(here, "../preload");

app.commandLine.appendSwitch("enable-blink-features", "CanvasDrawElement");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-features", "Vulkan");
app.commandLine.appendSwitch("use-webgpu-adapter", "vulkan");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "ombrique",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

interface DocHost {
  child: Electron.UtilityProcess;
  send: (message: unknown) => void;
  onMessage: (cb: (message: Record<string, unknown>) => void) => void;
}

let docHost: DocHost | null = null;
let projectRoot: string | null = null;
let shellWindow: BrowserWindow | null = null;
let canvasView: WebContentsView | null = null;
let projectFiles: Record<string, string> = {};

const pending = new Map<string, (payload: Record<string, unknown>) => void>();
let requestSeq = 0;

function request(
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const host = ensureDocHost();
  requestSeq += 1;
  const id = `r${requestSeq}`;
  const { promise, resolve: settle } =
    Promise.withResolvers<Record<string, unknown>>();
  pending.set(id, settle);
  setTimeout(() => {
    if (pending.delete(id))
      settle({ error: `timeout: ${String(message.type)}` });
  }, 20000);
  host.send({ ...message, id });
  return promise;
}

function startDocHost(): DocHost {
  const child = utilityProcess.fork(join(here, "doc-host.js"), [], {
    serviceName: "ombrique-doc-service",
    stdio: "inherit",
  });
  const listeners: Array<(message: Record<string, unknown>) => void> = [];
  child.on("message", (message: Record<string, unknown>) => {
    for (const listener of listeners) listener(message);
  });
  return {
    child,
    send: (message) => child.postMessage(message),
    onMessage: (cb) => listeners.push(cb),
  };
}

function ensureDocHost(): DocHost {
  if (!docHost) {
    docHost = startDocHost();
    wireDocHost(docHost);
  }
  return docHost;
}

function isInside(root: string, candidate: string): boolean {
  const rel = normalize(candidate).slice(normalize(root).length);
  return !rel.startsWith("..") && !rel.startsWith(sep);
}

function readStatic(urlPath: string): Response | null {
  if (!projectRoot) return null;
  const rel = urlToProjectPath(urlPath);
  if (!rel) return null;
  const absolute = resolve(projectRoot, rel);
  if (!isInside(projectRoot, absolute)) return null;
  const cached = projectFiles[rel];
  const mime = mimeFor(rel);
  if (
    mime === "text/javascript" ||
    mime === "text/css" ||
    mime === "application/json"
  )
    return null;
  if (cached !== undefined)
    return new Response(Buffer.from(cached, "utf8"), {
      headers: { "content-type": mime },
    });
  try {
    return new Response(new Uint8Array(readFileSync(absolute)), {
      headers: { "content-type": mime },
    });
  } catch {
    return null;
  }
}

async function handleAppRequest(requestUrl: URL): Promise<Response> {
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/" || pathname === "/index.html") {
    const html = readFileSync(join(rendererDir, "canvas.html"), "utf8");
    return new Response(html, { headers: { "content-type": "text/html" } });
  }
  if (pathname === "/@vite/client" || pathname === "/@react-refresh") {
    const result = await request({
      type: "compile",
      root: projectRoot,
      url: pathname,
    });
    if (typeof result.code === "string") {
      return new Response(result.code, {
        headers: { "content-type": "text/javascript" },
      });
    }
    return new Response("export {}", {
      headers: { "content-type": "text/javascript" },
    });
  }
  if (pathname.startsWith("/assets/")) {
    const asset = join(rendererDir, pathname);
    if (existsSync(asset)) {
      return new Response(new Uint8Array(readFileSync(asset)), {
        headers: { "content-type": mimeFor(pathname) },
      });
    }
    return new Response("not found", { status: 404 });
  }
  if (pathname === "/canvas-runtime.js") {
    return new Response(readFileSync(join(rendererDir, "canvas-runtime.js")), {
      headers: { "content-type": "text/javascript" },
    });
  }
  const staticResponse = readStatic(pathname);
  if (staticResponse) return staticResponse;
  const result = await request({
    type: "compile",
    root: projectRoot,
    url: `${pathname}${requestUrl.search}`,
  });
  if (typeof result.code === "string") {
    return new Response(result.code, {
      headers: { "content-type": "text/javascript" },
    });
  }
  const message =
    typeof result.error === "string" ? result.error : "compile failed";
  return new Response(
    `const e = new Error(${JSON.stringify(message)}); e.ombriqueCompileError = true; throw e;`,
    { status: 200, headers: { "content-type": "text/javascript" } },
  );
}

function registerProtocol() {
  protocol.handle("ombrique", (incoming) =>
    handleAppRequest(new URL(incoming.url)),
  );
}

function wireDocHost(host: DocHost) {
  host.onMessage((message) => {
    const type = message.type;
    if (type === "ready") {
      if (projectRoot)
        host.send({
          type: "shell",
          message: { kind: "openProject", path: projectRoot },
        });
      return;
    }
    if (
      type === "compileResult" ||
      type === "htmlResult" ||
      type === "resolveResult" ||
      type === "treeResult" ||
      type === "versionsResult" ||
      type === "tokensResult" ||
      type === "stylesResult"
    ) {
      const id = String(message.id);
      const handler = pending.get(id);
      if (handler) {
        pending.delete(id);
        handler(message);
      }
      return;
    }
    if (type === "project") {
      projectRoot = String(message.root);
      projectFiles = (message.files as Record<string, string>) ?? {};
      shellWindow?.webContents.send("ombrique:project", message);
      canvasView?.webContents.send("ombrique:project", message);
      return;
    }
    if (type === "files") {
      projectFiles = (message.files as Record<string, string>) ?? projectFiles;
      shellWindow?.webContents.send("ombrique:files", message);
      if (message.manifest) {
        canvasView?.webContents.send("ombrique:manifest", message.manifest);
      }
      return;
    }
    if (type === "doc") {
      shellWindow?.webContents.send("ombrique:doc", message.message);
      return;
    }
    if (type === "hmr") {
      canvasView?.webContents.send("ombrique:hmr", message.payload);
      return;
    }
    if (type === "fatal") {
      shellWindow?.webContents.send("ombrique:fatal", message.message);
    }
  });
}

function applyCanvasBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  if (!canvasView) return;
  const x = Math.max(0, Math.round(bounds.x));
  const y = Math.max(0, Math.round(bounds.y));
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  if (width < 320 || height < 240 || x < 120) return;
  canvasView.setBounds({ x, y, width, height });
}

ipcMain.on(
  "ombrique:canvasBounds",
  (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (
      typeof bounds?.x !== "number" ||
      typeof bounds?.y !== "number" ||
      typeof bounds?.width !== "number" ||
      typeof bounds?.height !== "number"
    ) {
      return;
    }
    applyCanvasBounds(bounds);
  },
);

function layoutCanvas() {
  if (!shellWindow || !canvasView) return;
  const size = shellWindow.getContentSize();
  const width = size[0] ?? 1680;
  const height = size[1] ?? 1020;
  applyCanvasBounds({
    x: 240,
    y: 40,
    width: width - 240 - 280,
    height: height - 40 - 28,
  });
}

function createCanvasView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(preloadDir, "canvas.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  return view;
}

function createShellWindow() {
  shellWindow = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1200,
    minHeight: 720,
    title: "Ombrique",
    backgroundColor: "#0e0e12",
    webPreferences: {
      preload: join(preloadDir, "shell.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  canvasView = createCanvasView();
  shellWindow.contentView.addChildView(canvasView);
  layoutCanvas();
  void canvasView.webContents.loadURL("ombrique://app/");

  if (process.env.ELECTRON_RENDERER_URL) {
    void shellWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void shellWindow.loadFile(join(rendererDir, "index.html"));
  }

  shellWindow.on("resize", layoutCanvas);
  shellWindow.on("closed", () => {
    canvasView = null;
    shellWindow = null;
  });
}

ipcMain.handle("ombrique:openProject", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  const picked = result.filePaths[0];
  if (!picked) return null;
  projectRoot = picked;
  ensureDocHost().send({
    type: "shell",
    message: { kind: "openProject", path: picked },
  });
  return picked;
});

ipcMain.handle("ombrique:openPath", async (_event, path: string) => {
  projectRoot = path;
  ensureDocHost().send({
    type: "shell",
    message: { kind: "openProject", path },
  });
  return path;
});

ipcMain.handle("ombrique:shellMessage", async (_event, message: unknown) => {
  ensureDocHost().send({ type: "shell", message });
  return true;
});

ipcMain.handle("ombrique:readFiles", async () => projectFiles);

ipcMain.handle(
  "ombrique:resolveNode",
  async (_event, file: string, path: number[]) => {
    const result = await request({
      type: "resolve",
      root: projectRoot,
      file,
      path,
    });
    return result.element ?? null;
  },
);

ipcMain.handle("ombrique:tree", async (_event, file: string) => {
  const result = await request({ type: "tree", root: projectRoot, file });
  return result.layers ?? [];
});

ipcMain.handle("ombrique:versions", async () => {
  const result = await request({ type: "versions", root: projectRoot });
  return result.versions ?? {};
});

ipcMain.handle("ombrique:listTokens", async () => {
  const result = await request({ type: "tokens", root: projectRoot });
  return result.tokens ?? [];
});

ipcMain.handle("ombrique:importImage", async () => {
  if (!projectRoot) return { ok: false };
  const win = shellWindow ?? BrowserWindow.getFocusedWindow();
  if (!win) return { ok: false };
  const picked = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif"],
      },
    ],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false };
  const sourceFile = picked.filePaths[0];
  if (!sourceFile) return { ok: false };
  const fileName = basename(sourceFile);
  const assetsDir = join(projectRoot, "assets");
  try {
    mkdirSync(assetsDir, { recursive: true });
    const destFile = join(assetsDir, fileName);
    copyFileSync(sourceFile, destFile);
    let width = 400;
    let height = 300;
    try {
      const img = nativeImage.createFromPath(destFile);
      const size = img.getSize();
      if (size.width > 0 && size.height > 0) {
        width = size.width;
        height = size.height;
      }
    } catch {
      // fallback
    }
    const name = fileName.replace(/\.[^.]+$/, "");
    return {
      ok: true,
      src: `assets/${fileName}`,
      width,
      height,
      name,
    };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("ombrique:listStyles", async () => {
  const result = await request({ type: "styles", root: projectRoot });
  return result.styles ?? [];
});

function exampleProjectRoot(): string {
  const candidates = [
    join(app.getAppPath(), "example-project"),
    join(here, "../../../../example-project"),
    join(here, "../../../example-project"),
  ];
  const found = candidates.find((candidate) =>
    existsSync(join(candidate, "ombrique.json")),
  );
  return found ?? candidates[0] ?? process.cwd();
}

ipcMain.handle("ombrique:openExample", async () => {
  const exampleRoot = exampleProjectRoot();
  projectRoot = exampleRoot;
  ensureDocHost().send({
    type: "shell",
    message: { kind: "openProject", path: exampleRoot },
  });
  return exampleRoot;
});

ipcMain.on(
  "ombrique:toCanvas",
  (_event, payload: { channel: string; payload: unknown }) => {
    canvasView?.webContents.send(payload.channel, payload.payload);
  },
);

ipcMain.on(
  "ombrique:fromCanvas",
  (_event, payload: { channel: string; payload: unknown }) => {
    shellWindow?.webContents.send(payload.channel, payload.payload);
  },
);

interface E2eLayer {
  id: string;
  name: string;
  tag: string;
  kind: string;
  depth: number;
  children: E2eLayer[];
}

interface E2eResolve {
  element?: {
    ref: { file: string; start: number; end: number };
    path: number[];
  } | null;
}

interface E2eTokens {
  tokens?: Array<{ name: string; value: string }>;
}

interface E2eStyles {
  styles?: Array<{
    file: string;
    decls?: Array<{ prop: string; valueSpan: { start: number; end: number } }>;
  }>;
}

async function exportNode(payload: {
  file: string;
  path?: number[];
  format: "png" | "jpg" | "webp" | "svg" | "pdf";
  scale: number;
  defaultName: string;
}): Promise<{ ok: boolean }> {
  const win = shellWindow;
  if (!win || !canvasView) return { ok: false };
  let filePath: string | null = null;
  const ext = payload.format;
  if (process.env.OMBRIQUE_E2E) {
    filePath = join(
      process.env.OMBRIQUE_E2E_DIR ?? "/tmp/ombrique-e2e",
      payload.defaultName,
    );
  } else {
    const picked = await dialog.showSaveDialog(win, {
      title: `导出 ${ext.toUpperCase()}`,
      defaultPath: payload.defaultName,
      filters: [{ name: `${ext.toUpperCase()} 文件`, extensions: [ext] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: false };
    filePath = picked.filePath;
  }

  if (payload.format === "pdf") {
    try {
      const pdfBytes = await canvasView.webContents.printToPDF({});
      writeFileSync(filePath, pdfBytes);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  const { promise: result, resolve: resResolve } = Promise.withResolvers<{
    ok: boolean;
  }>();
  const timer = setTimeout(() => {
    ipcMain.removeListener("ombrique:fromCanvas", onExportResult);
    resResolve({ ok: false });
  }, 30_000);
  const onExportResult = (
    _evt: Electron.IpcMainEvent,
    msg: { channel: string; payload: unknown },
  ) => {
    if (msg.channel !== "ombrique:exportResult") return;
    clearTimeout(timer);
    ipcMain.removeListener("ombrique:fromCanvas", onExportResult);
    const res = msg.payload as {
      outPath: string;
      ok: boolean;
      bytes?: ArrayBuffer;
    };
    if (!res.ok || !res.bytes) {
      resResolve({ ok: false });
      return;
    }
    writeFileSync(res.outPath, Buffer.from(res.bytes));
    resResolve({ ok: true });
  };
  ipcMain.on("ombrique:fromCanvas", onExportResult);
  canvasView.webContents.send("ombrique:export", {
    file: payload.file,
    path: payload.path,
    format: payload.format,
    scale: payload.scale,
    outPath: filePath,
  });
  return result;
}

async function exportPage(payload: {
  file: string;
  defaultName: string;
}): Promise<{ ok: boolean }> {
  const win = shellWindow;
  if (!win || !canvasView) return { ok: false };
  let filePath: string | null = null;
  if (process.env.OMBRIQUE_E2E) {
    filePath = join(
      process.env.OMBRIQUE_E2E_DIR ?? "/tmp/ombrique-e2e",
      payload.defaultName,
    );
  } else {
    const picked = await dialog.showSaveDialog(win, {
      title: "导出 PNG",
      defaultPath: payload.defaultName,
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: false };
    filePath = picked.filePath;
  }
  const { promise: result, resolve } = Promise.withResolvers<{ ok: boolean }>();
  const timer = setTimeout(() => {
    ipcMain.removeListener("ombrique:fromCanvas", onExportResult);
    resolve({ ok: false });
  }, 30_000);
  const onExportResult = (
    _evt: Electron.IpcMainEvent,
    msg: { channel: string; payload: unknown },
  ) => {
    if (msg.channel !== "ombrique:exportResult") return;
    clearTimeout(timer);
    ipcMain.removeListener("ombrique:fromCanvas", onExportResult);
    const res = msg.payload as {
      outPath: string;
      ok: boolean;
      bytes?: ArrayBuffer;
    };
    if (!res.ok || !res.bytes) {
      resolve({ ok: false });
      return;
    }
    writeFileSync(res.outPath, Buffer.from(res.bytes));
    resolve({ ok: true });
  };
  ipcMain.on("ombrique:fromCanvas", onExportResult);
  canvasView.webContents.send("ombrique:export", {
    file: payload.file,
    outPath: filePath,
  });
  return result;
}

ipcMain.handle(
  "ombrique:exportNode",
  (
    _event,
    payload: {
      file: string;
      path?: number[];
      format: "png" | "jpg" | "webp" | "svg" | "pdf";
      scale: number;
      defaultName: string;
    },
  ) => exportNode(payload),
);

ipcMain.handle("ombrique:bundleProject", async () => {
  if (!projectRoot) return { ok: false };
  const win = shellWindow ?? BrowserWindow.getFocusedWindow();
  let destFile: string | null = null;
  if (process.env.OMBRIQUE_E2E) {
    destFile = join(
      process.env.OMBRIQUE_E2E_DIR ?? "/tmp/ombrique-e2e",
      "project.ombrique",
    );
  } else {
    if (!win) return { ok: false };
    const picked = await dialog.showSaveDialog(win, {
      title: "导出 .ombrique 项目包",
      defaultPath: "project.ombrique",
      filters: [{ name: "Ombrique Package", extensions: ["ombrique"] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: false };
    destFile = picked.filePath;
  }
  try {
    await createBundle(projectRoot, destFile);
    return { ok: true, path: destFile };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("ombrique:openBundle", async () => {
  const win = shellWindow ?? BrowserWindow.getFocusedWindow();
  let srcFile: string | null = null;
  if (process.env.OMBRIQUE_E2E_BUNDLE_FILE) {
    srcFile = process.env.OMBRIQUE_E2E_BUNDLE_FILE;
  } else {
    if (!win) return { ok: false };
    const picked = await dialog.showOpenDialog(win, {
      title: "打开 .ombrique 项目包",
      properties: ["openFile"],
      filters: [{ name: "Ombrique Package", extensions: ["ombrique"] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false };
    srcFile = picked.filePaths[0] ?? null;
  }
  if (!srcFile) return { ok: false };
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const extractedDir = mkdtempSync(join(tmpdir(), "ombrique-bundle-"));
  try {
    await extractBundle(srcFile, extractedDir);
    projectRoot = extractedDir;
    ensureDocHost().send({
      type: "shell",
      message: { kind: "openProject", path: extractedDir },
    });
    return { ok: true, root: extractedDir };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle(
  "ombrique:exportPage",
  (_event, payload: { file: string; defaultName: string }) =>
    exportPage(payload),
);

ipcMain.handle("ombrique:reloadCanvas", async () => {
  await canvasView?.webContents.reload();
  return true;
});

app.whenReady().then(() => {
  console.log("[ombrique] ready");
  registerProtocol();
  ensureDocHost();
  createShellWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createShellWindow();
  });
});

if (process.env.OMBRIQUE_E2E) {
  const e2eDir = process.env.OMBRIQUE_E2E_DIR ?? "/tmp/ombrique-e2e";
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    await wait(1500);
    ensureDocHost().send({
      type: "shell",
      message: { kind: "openProject", path: exampleProjectRoot() },
    });
    const logs: string[] = [];
    shellWindow?.webContents.on("console-message", (event) =>
      logs.push(`[shell] ${event.message}`),
    );
    canvasView?.webContents.on("console-message", (event) =>
      logs.push(`[canvas] ${event.message}`),
    );
    await wait(5000);
    if (shellWindow) {
      await shellWindow.webContents
        .executeJavaScript(`
        const layer = document.querySelector(".layer-row");
        if (layer) layer.click();
      `)
        .catch(() => {});
      await wait(1500);
    }
    for (const [name, view] of [
      ["shell", shellWindow],
      ["canvas", null],
    ] as const) {
      if (name === "shell" && view) {
        const image = await view.webContents.capturePage();
        (await import("node:fs")).writeFileSync(
          join(e2eDir, "shell.png"),
          image.toPNG(),
        );
      }
    }
    if (process.env.OMBRIQUE_E2E_EXPORT) {
      const result = await exportPage({
        file: "pages/home.tsx",
        defaultName: "home-export.png",
      });
      logs.push(`[export] png ${result.ok ? "OK" : "FAIL"}`);
    }

    if (process.env.OMBRIQUE_E2E_OPS) {
      const file = "pages/pricing.tsx";
      const versions = () =>
        request({ type: "versions", root: projectRoot }).then((r) =>
          Object.values((r.versions as Record<string, string>) ?? {}),
        );
      const getText = () => projectFiles[file] ?? "";
      const log = (label: string, ok: boolean) =>
        logs.push(`[ops] ${label} ${ok ? "OK" : "FAIL"}`);

      const v0 = await versions();
      ensureDocHost().send({
        type: "shell",
        message: {
          kind: "applyCommands",
          commands: [
            {
              kind: "createNodes",
              parent: null,
              pageFile: file,
              index: 1,
              specs: [
                { kind: "text", text: "New plan", x: 96, y: 700, width: 300 },
              ],
            },
          ],
          baseVersions: v0,
        },
      });
      await wait(1800);
      log("create text", getText().includes("New plan"));

      const v1 = await versions();
      ensureDocHost().send({
        type: "shell",
        message: {
          kind: "applyCommands",
          commands: [
            {
              kind: "createNodes",
              parent: null,
              pageFile: file,
              index: 1,
              specs: [
                {
                  kind: "rect",
                  name: "Badge",
                  x: 500,
                  y: 200,
                  width: 120,
                  height: 80,
                  fill: "#22aa66",
                },
              ],
            },
          ],
          baseVersions: v1,
        },
      });
      await wait(1800);
      log("create rect", getText().includes("#22aa66"));

      const resolved = await request({
        type: "resolve",
        root: projectRoot,
        file,
        path: [0, 1],
      });
      const element = resolved.element as {
        ref: { file: string; start: number; end: number };
        path: number[];
      } | null;
      log("resolve rect", element !== null && element !== undefined);
      if (element) {
        const v2 = await versions();
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            commands: [
              {
                kind: "deleteNodes",
                targets: [
                  {
                    file,
                    start: element.ref.start,
                    end: element.ref.end,
                    path: element.path,
                  },
                ],
              },
            ],
            baseVersions: v2,
          },
        });
        await wait(1800);
        log("delete rect", !getText().includes("#22aa66"));

        ensureDocHost().send({ type: "shell", message: { kind: "undo" } });
        await wait(1500);
        log("undo delete", getText().includes("#22aa66"));

        ensureDocHost().send({ type: "shell", message: { kind: "redo" } });
        await wait(1500);
        log("redo delete", !getText().includes("#22aa66"));
      }

      ensureDocHost().send({ type: "shell", message: { kind: "undo" } });
      await wait(1500);
      ensureDocHost().send({ type: "shell", message: { kind: "undo" } });
      await wait(1500);
      ensureDocHost().send({ type: "shell", message: { kind: "undo" } });
      await wait(1500);
      log("undo all", !getText().includes("New plan"));
    }

    if (process.env.OMBRIQUE_E2E_PAGES) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[pages-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-e2e-pages-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(tempProj, "pages/home.tsx"),
        `import { Frame } from "@ombrique/runtime";
export default function Home() {
  return <Frame name="Home" x={0} y={0} width={800} height={600} />;
}`,
      );

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(1800);

      ensureDocHost().send({
        type: "shell",
        message: {
          kind: "applyCommands",
          commands: [{ kind: "addPage", name: "Dashboard" }],
          baseVersions: [],
        },
      });
      await wait(1800);

      const tree1 = await request({
        type: "tree",
        root: tempProj,
        file: "pages/dashboard.tsx",
      });
      log("addPage creates file & tree", Array.isArray(tree1.layers));

      ensureDocHost().send({
        type: "shell",
        message: {
          kind: "applyCommands",
          commands: [
            { kind: "renamePage", pageId: "dashboard", name: "Analytics" },
          ],
          baseVersions: [],
        },
      });
      await wait(1800);
      log(
        "renamePage updates manifest",
        (projectFiles["ombrique.json"] ?? "").includes("Analytics"),
      );

      ensureDocHost().send({
        type: "shell",
        message: {
          kind: "applyCommands",
          commands: [{ kind: "deletePage", pageId: "dashboard" }],
          baseVersions: [],
        },
      });
      await wait(1800);
      log(
        "deletePage removes from manifest",
        !(projectFiles["ombrique.json"] ?? "").includes("dashboard"),
      );
      const afterTree = await request({
        type: "tree",
        root: tempProj,
        file: "pages/home.tsx",
      });
      const afterLayers = (afterTree.layers ?? []) as Array<{
        id: string;
        name: string;
      }>;
      log("tree survives page ops", afterLayers.length > 0);
    }

    if (process.env.OMBRIQUE_E2E_LAYOUT) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[layout-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } =
        await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-e2e-layout-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(tempProj, "pages/home.tsx"),
        `import { Frame, Rect, Text } from "@ombrique/runtime";
export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect x={40} y={40} width={120} height={80} fill="#4488ff" />
      <Text x={40} y={160} width={200} fontSize={20} fill="#111111">Card label</Text>
    </Frame>
  );
}`,
      );
      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      const tree = await request({
        type: "tree",
        root: tempProj,
        file: "pages/home.tsx",
      });
      const layers = (tree.layers ?? []) as Array<{
        id: string;
        children: Array<{ id: string; ref?: unknown }>;
      }>;
      const rect = layers[0]?.children[0];
      const text = layers[0]?.children[1];
      log("layout project loads", Boolean(rect && text));
      if (rect && text) {
        const versions = await request({ type: "versions", root: tempProj });
        const resolveRect = await request({
          type: "resolve",
          root: tempProj,
          file: "pages/home.tsx",
          path: [0, 0],
        });
        const resolveText = await request({
          type: "resolve",
          root: tempProj,
          file: "pages/home.tsx",
          path: [0, 1],
        });
        const rectEl = resolveRect.element as {
          ref: { start: number; end: number };
        } | null;
        const textEl = resolveText.element as {
          ref: { start: number; end: number };
        } | null;
        if (rectEl && textEl) {
          ensureDocHost().send({
            type: "shell",
            message: {
              kind: "applyCommands",
              commands: [
                {
                  kind: "groupNodes",
                  targets: [
                    {
                      file: "pages/home.tsx",
                      start: rectEl.ref.start,
                      end: rectEl.ref.end,
                      path: [0, 0],
                    },
                    {
                      file: "pages/home.tsx",
                      start: textEl.ref.start,
                      end: textEl.ref.end,
                      path: [0, 1],
                    },
                  ],
                  parent: {
                    file: "pages/home.tsx",
                    start: 0,
                    end: 0,
                    path: [0],
                  },
                  pageFile: "pages/home.tsx",
                  index: 0,
                  name: "Card",
                },
              ],
              baseVersions: Object.values(
                (versions.versions as Record<string, string>) ?? {},
              ),
            },
          });
          await wait(2500);
          const afterGroup = readFileSync(
            join(tempProj, "pages/home.tsx"),
            "utf8",
          );
          log(
            "groupNodes extracts source into <Group>",
            afterGroup.includes('data-name="Card"') &&
              afterGroup.includes("#4488ff") &&
              afterGroup.includes("Card label"),
          );

          const groupTree = await request({
            type: "tree",
            root: tempProj,
            file: "pages/home.tsx",
          });
          const groupLayers = (groupTree.layers ?? []) as E2eLayer[];
          const cardLayer = groupLayers[0]?.children?.[0];
          log("group layer kind is group", cardLayer?.kind === "group");
          log("group keeps children", (cardLayer?.children.length ?? 0) === 2);

          const groupResolve = await request({
            type: "resolve",
            root: tempProj,
            file: "pages/home.tsx",
            path: [0, 0],
          });
          const groupEl = groupResolve.element as {
            ref: { start: number; end: number };
            path: number[];
          } | null;
          if (groupEl) {
            const v2 = await request({ type: "versions", root: tempProj });
            ensureDocHost().send({
              type: "shell",
              message: {
                kind: "applyCommands",
                commands: [
                  {
                    kind: "setAttrs",
                    target: {
                      file: "pages/home.tsx",
                      start: groupEl.ref.start,
                      end: groupEl.ref.end,
                      path: groupEl.path,
                    },
                    attrs: { layout: "vertical", gap: 24 },
                  },
                ],
                baseVersions: Object.values(
                  (v2.versions as Record<string, string>) ?? {},
                ),
              },
            });
            await wait(2500);
            const afterLayout = readFileSync(
              join(tempProj, "pages/home.tsx"),
              "utf8",
            );
            log(
              "layout props written and HMR reachable",
              afterLayout.includes('layout="vertical"') &&
                afterLayout.includes("gap={24}"),
            );

            ensureDocHost().send({
              type: "shell",
              message: { kind: "undo" },
            });
            await wait(1500);
            const afterUndo = readFileSync(
              join(tempProj, "pages/home.tsx"),
              "utf8",
            );
            log(
              "undo removes layout props",
              !afterLayout.includes("layout") ||
                !afterUndo.includes('layout="vertical"'),
            );
          }
        }
      }
    }

    if (process.env.OMBRIQUE_E2E_GROUPFLOW) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[group-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } =
        await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-e2e-group-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
      );
      const originalCode = `import { Frame, Rect, Text } from "@ombrique/runtime";
export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect x={40} y={40} width={120} height={80} fill="#4488ff" />
      <Text x={40} y={160} width={200} fontSize={20} fill="#111111">Card label</Text>
    </Frame>
  );
}`;
      writeFileSync(join(tempProj, "pages/home.tsx"), originalCode);
      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      const resolveRect = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 0],
      });
      const resolveText = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 1],
      });
      const rectEl = resolveRect.element as {
        ref: { start: number; end: number };
      } | null;
      const textEl = resolveText.element as {
        ref: { start: number; end: number };
      } | null;
      const frameResolve = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0],
      });
      const frameEl = frameResolve.element as {
        ref: { start: number; end: number };
      } | null;
      log("selection resolves", Boolean(rectEl && textEl && frameEl));
      if (rectEl && textEl && frameEl) {
        const versions = await request({ type: "versions", root: tempProj });
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            commands: [
              {
                kind: "groupNodes",
                targets: [
                  {
                    file: "pages/home.tsx",
                    start: rectEl.ref.start,
                    end: rectEl.ref.end,
                    path: [0, 0],
                  },
                  {
                    file: "pages/home.tsx",
                    start: textEl.ref.start,
                    end: textEl.ref.end,
                    path: [0, 1],
                  },
                ],
                parent: {
                  file: "pages/home.tsx",
                  start: frameEl.ref.start,
                  end: frameEl.ref.end,
                  path: [0],
                },
                pageFile: "pages/home.tsx",
                index: 0,
                name: "Card",
              },
            ],
            baseVersions: Object.values(
              (versions.versions as Record<string, string>) ?? {},
            ),
          },
        });
        await wait(2500);
        const afterGroup = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log("group created", afterGroup.includes('data-name="Card"'));

        const groupTree = await request({
          type: "tree",
          root: tempProj,
          file: "pages/home.tsx",
        });
        const groupLayers = (groupTree.layers ?? []) as Array<{
          children: Array<{ kind: string }>;
        }>;
        log("layer kind group", groupLayers[0]?.children[0]?.kind === "group");

        const groupResolve = await request({
          type: "resolve",
          root: tempProj,
          file: "pages/home.tsx",
          path: [0, 0],
        });
        const groupEl = groupResolve.element as {
          ref: { start: number; end: number };
          path: number[];
        } | null;
        if (groupEl) {
          const v2 = await request({ type: "versions", root: tempProj });
          ensureDocHost().send({
            type: "shell",
            message: {
              kind: "applyCommands",
              commands: [
                {
                  kind: "ungroupNode",
                  target: {
                    file: "pages/home.tsx",
                    start: groupEl.ref.start,
                    end: groupEl.ref.end,
                    path: groupEl.path,
                  },
                },
              ],
              baseVersions: Object.values(
                (v2.versions as Record<string, string>) ?? {},
              ),
            },
          });
          await wait(2500);
          const afterUngroup = readFileSync(
            join(tempProj, "pages/home.tsx"),
            "utf8",
          );
          log(
            "ungroup restores source",
            !afterUngroup.includes('data-name="Card"') &&
              afterUngroup.includes("#4488ff") &&
              afterUngroup.includes("Card label"),
          );

          ensureDocHost().send({
            type: "shell",
            message: { kind: "undo" },
          });
          await wait(1500);
          const afterUndo = readFileSync(
            join(tempProj, "pages/home.tsx"),
            "utf8",
          );
          log("undo restores group", afterUndo.includes('data-name="Card"'));
          ensureDocHost().send({
            type: "shell",
            message: { kind: "undo" },
          });
          await wait(1500);
          const afterUndo2 = readFileSync(
            join(tempProj, "pages/home.tsx"),
            "utf8",
          );
          log("undo restores original", afterUndo2 === originalCode);
        }
      }
    }

    if (process.env.OMBRIQUE_E2E_TOKENS_GROUP) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[tokens-group-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } =
        await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-tokens-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
        "utf8",
      );
      const multiCardCode = `import { Frame, Rect } from "@ombrique/runtime";
export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect data-name="R0" x={10} y={10} width={50} height={50} fill="#111111" />
      <Rect data-name="R1" x={70} y={10} width={50} height={50} fill="#222222" />
      <Rect data-name="R2" x={130} y={10} width={50} height={50} fill="#333333" />
    </Frame>
  );
}
`;
      writeFileSync(join(tempProj, "pages/home.tsx"), multiCardCode, "utf8");
      writeFileSync(
        join(tempProj, "card.scss"),
        ".card {\n  color: #111111;\n  padding: 10px;\n}\n",
        "utf8",
      );

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      const r0 = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 0],
      });
      const r1 = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 1],
      });
      const r2 = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 2],
      });

      if (r0.element && r1.element && r2.element) {
        log("three rects resolved", true);
        const el0 = (r0 as E2eResolve).element as NonNullable<
          E2eResolve["element"]
        >;
        const el1 = (r1 as E2eResolve).element as NonNullable<
          E2eResolve["element"]
        >;
        const ref0 = {
          file: "pages/home.tsx",
          start: el0.ref.start,
          end: el0.ref.end,
          path: [0, 0],
        };
        const ref1 = {
          file: "pages/home.tsx",
          start: el1.ref.start,
          end: el1.ref.end,
          path: [0, 1],
        };
        const parentRef = {
          file: "pages/home.tsx",
          start: 0,
          end: multiCardCode.length,
          path: [0],
        };

        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "groupNodes",
                targets: [ref0, ref1],
                parent: parentRef,
                pageFile: "pages/home.tsx",
                index: 0,
                name: "PairGroup",
              },
            ],
          },
        });
        await wait(1500);

        const codeAfterMultiGroup = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        const hasPairGroup = codeAfterMultiGroup.includes(
          'data-name="PairGroup"',
        );
        const r2Outside =
          codeAfterMultiGroup.includes('data-name="R2"') &&
          !codeAfterMultiGroup
            .split('data-name="PairGroup"')[1]
            ?.split("</Group>")[0]
            ?.includes('data-name="R2"');
        log(
          "precise multi-group excludes unselected R2",
          hasPairGroup && r2Outside,
        );

        const initialTokens = await request({ type: "tokens", root: tempProj });
        log(
          "initial tokens empty",
          Array.isArray(initialTokens.tokens) &&
            initialTokens.tokens.length === 0,
        );

        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "createToken",
                name: "brand-color",
                value: "#2563eb",
              },
            ],
          },
        });
        await wait(1500);

        const tokensCss = readFileSync(join(tempProj, "tokens.css"), "utf8");
        log(
          "createToken writes tokens.css with :root",
          tokensCss.includes("--brand-color: #2563eb;"),
        );

        const tokensListed = await request({ type: "tokens", root: tempProj });
        const hasBrandToken = (tokensListed as E2eTokens).tokens?.some(
          (t) => t.name === "--brand-color" && t.value === "#2563eb",
        );
        log("listTokens returns created token", Boolean(hasBrandToken));

        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "setTokenValue",
                name: "brand-color",
                value: "#1d4ed8",
              },
            ],
          },
        });
        await wait(1500);

        const tokensCssAfterSet = readFileSync(
          join(tempProj, "tokens.css"),
          "utf8",
        );
        log(
          "setTokenValue updates tokens.css",
          tokensCssAfterSet.includes("--brand-color: #1d4ed8;"),
        );

        const stylesList = await request({ type: "styles", root: tempProj });
        const cardRule = (stylesList as E2eStyles).styles?.find(
          (s) => s.file === "card.scss",
        );
        const colorDecl = cardRule?.decls?.find((d) => d.prop === "color");
        log("listStyles finds card.scss color decl", Boolean(colorDecl));

        if (colorDecl) {
          ensureDocHost().send({
            type: "shell",
            message: {
              kind: "applyCommands",
              baseVersions: [],
              commands: [
                {
                  kind: "setSharedStyle",
                  file: "card.scss",
                  start: colorDecl.valueSpan.start,
                  end: colorDecl.valueSpan.end,
                  value: "#ff0055",
                },
              ],
            },
          });
          await wait(1500);

          const scssAfterEdit = readFileSync(
            join(tempProj, "card.scss"),
            "utf8",
          );
          log(
            "setSharedStyle updates scss",
            scssAfterEdit.includes("color: #ff0055;"),
          );

          ensureDocHost().send({
            type: "shell",
            message: { kind: "undo" },
          });
          await wait(1500);

          const scssAfterUndo = readFileSync(
            join(tempProj, "card.scss"),
            "utf8",
          );
          log("undo restores scss", scssAfterUndo.includes("color: #111111;"));

          if (shellWindow && !shellWindow.isDestroyed()) {
            const evalResult = await shellWindow.webContents.executeJavaScript(`
            (async () => {
              try {
                const bridge = window.ombriqueShell;
                if (!bridge) return { ok: false, reason: "no bridge" };
                const tokens = await bridge.listTokens();
                const styles = await bridge.listStyles();
                const cardRule = styles.find(s => s.file === "card.scss");
                const colorDecl = cardRule?.decls?.find(d => d.prop === "color");
                if (!colorDecl) return { ok: false, reason: "no color decl" };
                const updated = await bridge.updateSharedStyle("card.scss", colorDecl.valueSpan.start, colorDecl.valueSpan.end, "#00bb88");
                return { ok: updated, tokensCount: tokens.length };
              } catch (e) {
                return { ok: false, reason: String(e) };
              }
            })()
          `);
            log("bridge UI path updateSharedStyle", evalResult?.ok === true);
          }
        }
      }
    }

    if (process.env.OMBRIQUE_E2E_COMPONENT) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[component-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const {
        mkdtempSync,
        writeFileSync,
        mkdirSync,
        readFileSync,
        existsSync,
      } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-comp-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      mkdirSync(join(tempProj, "components"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
        "utf8",
      );

      const initialHome = `import { Frame, Rect } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Rect data-name="Card" x={20} y={20} width={150} height={100} fill="#3b82f6" />
    </Frame>
  );
}
`;
      writeFileSync(join(tempProj, "pages/home.tsx"), initialHome, "utf8");

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      const resolved = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 0],
      });

      if (resolved.element) {
        log("card target resolved", true);
        const cardRef = {
          file: "pages/home.tsx",
          start: (resolved as E2eResolve).element?.ref.start ?? 0,
          end: (resolved as E2eResolve).element?.ref.end ?? 0,
          path: [0, 0],
        };

        // 1. Create component Card
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "createComponent",
                target: cardRef,
                name: "Card",
              },
            ],
          },
        });
        await wait(2000);

        const compPath = join(tempProj, "components/Card.tsx");
        const compCreated = existsSync(compPath);
        log("components/Card.tsx generated", compCreated);

        const compCode = compCreated ? readFileSync(compPath, "utf8") : "";
        log(
          "Card component exports function",
          compCode.includes("export function Card()"),
        );

        const homeAfterCreate = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "home replaces with <Card />",
          homeAfterCreate.includes("<Card />"),
        );
        log(
          "home adds Card import",
          homeAfterCreate.includes(
            'import { Card } from "../components/Card";',
          ),
        );

        // 2. Check layer tree kind === 'component'
        const tree = await request({
          type: "tree",
          root: tempProj,
          file: "pages/home.tsx",
        });
        const rootLayer = (tree.layers as E2eLayer[])?.[0];
        const cardLayer = rootLayer?.children?.[0];
        log("layer tree kind is component", cardLayer?.kind === "component");

        // 3. Resolve the Card instance
        const cardResolved = await request({
          type: "resolve",
          root: tempProj,
          file: "pages/home.tsx",
          path: [0, 0],
        });
        const cardInstanceRef = {
          file: "pages/home.tsx",
          start: (cardResolved as E2eResolve).element?.ref.start ?? 0,
          end: (cardResolved as E2eResolve).element?.ref.end ?? 0,
          path: [0, 0],
        };

        // 4. Detach instance
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "detachInstance",
                target: cardInstanceRef,
              },
            ],
          },
        });
        await wait(2000);

        const homeAfterDetach = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "detach unfolds static JSX",
          homeAfterDetach.includes('data-name="Card"') &&
            !homeAfterDetach.includes("<Card"),
        );
        log(
          "detach removes unused Card import",
          !homeAfterDetach.includes("import { Card }"),
        );

        // 5. Undo restores <Card />
        ensureDocHost().send({
          type: "shell",
          message: { kind: "undo" },
        });
        await wait(1500);

        const homeAfterUndo = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log("undo restores Card instance", homeAfterUndo.includes("<Card />"));

        // 6. Redo restores detached JSX
        ensureDocHost().send({
          type: "shell",
          message: { kind: "redo" },
        });
        await wait(1500);

        const homeAfterRedo = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "redo restores detached JSX",
          homeAfterRedo.includes('data-name="Card"'),
        );
      }
    }

    if (process.env.OMBRIQUE_E2E_ASSETS_VECTOR) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[assets-vector-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } =
        await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-asset-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      mkdirSync(join(tempProj, "assets"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
        "utf8",
      );

      // Create dummy image file in tempProj/assets/avatar.png
      writeFileSync(
        join(tempProj, "assets/avatar.png"),
        "FAKE_PNG_BINARY",
        "utf8",
      );

      const initialHome = `import { Frame, Vector, Boolean } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Vector x={10} y={10} width={200} height={200} data-name="VecRoot">
        <Boolean op="union" fill="#ff0000" data-name="BooleanShape">
          <path d="M0 0 L50 0 L50 50 Z" />
          <path d="M50 50 L100 50 L100 100 Z" />
        </Boolean>
      </Vector>
    </Frame>
  );
}
`;
      writeFileSync(join(tempProj, "pages/home.tsx"), initialHome, "utf8");

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      // 1. Check layer tree recognises vector / boolean
      const tree = await request({
        type: "tree",
        root: tempProj,
        file: "pages/home.tsx",
      });
      const rootLayer = (tree.layers as E2eLayer[])?.[0];
      const vecLayer = rootLayer?.children?.[0];
      log("Vector layer kind is vector", vecLayer?.kind === "vector");
      const boolLayer = vecLayer?.children?.[0];
      log("Boolean layer kind is vector", boolLayer?.kind === "vector");

      // 2. Resolve Boolean node and flattenBoolean
      const resolvedBool = await request({
        type: "resolve",
        root: tempProj,
        file: "pages/home.tsx",
        path: [0, 0, 0],
      });

      if (resolvedBool.element) {
        log("Boolean node resolved", true);
        const boolRef = {
          file: "pages/home.tsx",
          start: (resolvedBool as E2eResolve).element?.ref.start ?? 0,
          end: (resolvedBool as E2eResolve).element?.ref.end ?? 0,
          path: [0, 0, 0],
        };

        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "flattenBoolean",
                target: boolRef,
              },
            ],
          },
        });
        await wait(2000);

        const homeAfterFlatten = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "flattenBoolean converts <Boolean> into <path d=...>",
          homeAfterFlatten.includes(
            '<path d="M0 0 L50 0 L50 50 Z M50 50 L100 50 L100 100 Z"',
          ) && !homeAfterFlatten.includes("<Boolean"),
        );

        // 3. Undo restores <Boolean>
        ensureDocHost().send({
          type: "shell",
          message: { kind: "undo" },
        });
        await wait(1500);

        const homeAfterUndo = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log("undo restores <Boolean>", homeAfterUndo.includes("<Boolean"));

        // 4. Test Image insert via createNodes
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            baseVersions: [],
            commands: [
              {
                kind: "createNodes",
                parent: {
                  file: "pages/home.tsx",
                  start: 0,
                  end: 0,
                  path: [0],
                },
                pageFile: "pages/home.tsx",
                index: 1,
                specs: [
                  {
                    kind: "image",
                    name: "Avatar",
                    src: "assets/avatar.png",
                    x: 250,
                    y: 20,
                    width: 120,
                    height: 120,
                    radius: 8,
                  },
                ],
              },
            ],
          },
        });
        await wait(2000);

        const homeAfterImage = readFileSync(
          join(tempProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "image node inserted with src and radius",
          homeAfterImage.includes('src="assets/avatar.png"') &&
            homeAfterImage.includes('data-name="Avatar"'),
        );

        const treeAfterImage = await request({
          type: "tree",
          root: tempProj,
          file: "pages/home.tsx",
        });
        const imgLayer = (treeAfterImage.layers as E2eLayer[])?.[0]
          ?.children?.[1];
        log("image layer kind is image", imgLayer?.kind === "image");
      }
    }

    if (process.env.OMBRIQUE_E2E_EXPORT_BUNDLE) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[export-bundle-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const tempProj = mkdtempSync(join(tmpdir(), "ombrique-exp-"));
      mkdirSync(join(tempProj, "pages"), { recursive: true });
      mkdirSync(join(tempProj, "assets"), { recursive: true });
      writeFileSync(
        join(tempProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
        "utf8",
      );
      writeFileSync(
        join(tempProj, "tokens.css"),
        ":root { --color: #ff0000; }\n",
        "utf8",
      );

      const initialHome = `import { Frame, Vector } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={800} height={600}>
      <Vector x={10} y={10} width={200} height={200} data-name="Icon">
        <path d="M0 0 L100 100" fill="#3b82f6" />
      </Vector>
    </Frame>
  );
}
`;
      writeFileSync(join(tempProj, "pages/home.tsx"), initialHome, "utf8");

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: tempProj },
      });
      await wait(2000);

      // 1. Export PNG
      const pngRes = await exportNode({
        file: "pages/home.tsx",
        format: "png",
        scale: 2,
        defaultName: "test-export.png",
      });
      log("export PNG", pngRes.ok);

      // 2. Export JPG
      const jpgRes = await exportNode({
        file: "pages/home.tsx",
        format: "jpg",
        scale: 1,
        defaultName: "test-export.jpg",
      });
      log("export JPG", jpgRes.ok);

      // 3. Export WebP
      const webpRes = await exportNode({
        file: "pages/home.tsx",
        format: "webp",
        scale: 2,
        defaultName: "test-export.webp",
      });
      log("export WebP", webpRes.ok);

      // 4. Export SVG
      const svgRes = await exportNode({
        file: "pages/home.tsx",
        path: [0, 0],
        format: "svg",
        scale: 1,
        defaultName: "test-export.svg",
      });
      log("export SVG", svgRes.ok);

      // 5. Export PDF
      const pdfRes = await exportNode({
        file: "pages/home.tsx",
        format: "pdf",
        scale: 1,
        defaultName: "test-export.pdf",
      });
      log("export PDF", pdfRes.ok);

      // 6. Bundle project into .ombrique
      const bundlePath = join(
        process.env.OMBRIQUE_E2E_DIR ?? "/tmp/ombrique-e2e",
        "test-project.ombrique",
      );
      await createBundle(tempProj, bundlePath);
      log("createBundle outputs .ombrique file", existsSync(bundlePath));

      // 7. Extract bundle into new directory and reload as project
      const unpackDir = mkdtempSync(join(tmpdir(), "ombrique-unpack-"));
      await extractBundle(bundlePath, unpackDir);
      log(
        "extractBundle extracts tokens.css",
        existsSync(join(unpackDir, "tokens.css")),
      );
      log(
        "extractBundle extracts pages/home.tsx",
        existsSync(join(unpackDir, "pages/home.tsx")),
      );

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: unpackDir },
      });
      await wait(2000);

      const unpackTree = await request({
        type: "tree",
        root: unpackDir,
        file: "pages/home.tsx",
      });
      const unpackLayers = (unpackTree.layers ?? []) as E2eLayer[];
      log(
        "unpacked project loads into doc-host tree",
        unpackLayers?.length > 0,
      );
    }

    if (process.env.OMBRIQUE_E2E_UI) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[ui-e2e] ${label} ${ok ? "OK" : "FAIL"}`);
      const {
        mkdtempSync,
        writeFileSync,
        mkdirSync,
        readFileSync,
        rmSync,
        existsSync,
      } = await import("node:fs");
      const { tmpdir } = await import("node:os");

      // Setup clean isolated temp project for UI editing tests
      const uiProj = mkdtempSync(join(tmpdir(), "ombrique-ui-e2e-"));
      mkdirSync(join(uiProj, "pages"), { recursive: true });
      writeFileSync(
        join(uiProj, "ombrique.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            pages: [{ id: "home", name: "Home", file: "pages/home.tsx" }],
          },
          null,
          2,
        ),
        "utf8",
      );
      const initialHome = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <Text x={96} y={96} width={720} fontSize={56} fill="#ffffff">
        Design in code
      </Text>
    </Frame>
  );
}
`;
      writeFileSync(join(uiProj, "pages/home.tsx"), initialHome, "utf8");

      ensureDocHost().send({
        type: "shell",
        message: { kind: "openProject", path: uiProj },
      });
      await wait(2500);

      if (shellWindow && canvasView) {
        // 1. Click layer row "Design in code" and assert properties panel appears with right values
        const clickResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const rows = Array.from(document.querySelectorAll(".layer-row"));
            const target = rows.find(r => r.textContent?.includes("Design in code"));
            if (!target) return { ok: false, reason: "layer row not found" };
            target.click();
            await new Promise(r => setTimeout(r, 800));
            // Check properties panel rendered with selection
            const textInput = document.querySelector('textarea[aria-label="文本内容"]') ||
                              document.querySelector('input[aria-label="文本内容"]') ||
                              document.querySelector('input[aria-label="名称"]');
            const propPanel = document.querySelector('[aria-label="属性面板"]');
            return {
              ok: Boolean(propPanel && textInput),
              textValue: textInput?.value,
            };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        log(
          "click layer row selects and shows properties",
          clickResult?.ok === true,
        );

        // 2. Modify Geometry X input: set value + dispatch input/blur
        const editXResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const xInput = document.querySelector('input[aria-label="X 坐标值"]') ;
            if (!xInput) return { ok: false, reason: "X input not found" };
            xInput.focus();
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            ).set;
            setter.call(xInput, "150");
            xInput.dispatchEvent(new Event("input", { bubbles: true }));
            xInput.dispatchEvent(new Event("change", { bubbles: true }));
            xInput.blur();
            xInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
            return { ok: true, sentVal: "150" };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        await wait(2000);

        const homeAfterEdit = readFileSync(
          join(uiProj, "pages/home.tsx"),
          "utf8",
        );
        const xApplied =
          homeAfterEdit.includes("x={150}") ||
          homeAfterEdit.includes("x={ 150 }") ||
          homeAfterEdit.includes("left: 150");
        log(
          "geometry X input updates page source x",
          editXResult?.ok === true && xApplied,
        );
        log(
          "geometry X edit is a minimal source diff",
          Math.abs(homeAfterEdit.length - initialHome.length) <= 2 &&
            !homeAfterEdit.includes("x={96}"),
        );
        const stillSelected = await shellWindow.webContents
          .executeJavaScript(`
          (() => {
            const row = document.querySelector(".layer-row.layer-row-selected");
            return Boolean(row && row.textContent && row.textContent.includes("Design in code"));
          })()
        `)
          .catch(() => false);
        log(
          "selection survives HMR after geometry edit",
          stillSelected === true,
        );

        // Undo via UI undo button
        const undoResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            let undoBtn = null;
            for (let i = 0; i < 40; i += 1) {
              undoBtn = document.querySelector('button[aria-label="撤销"]');
              if (undoBtn && !undoBtn.disabled) break;
              await new Promise((r) => setTimeout(r, 100));
            }
            if (!undoBtn) return { ok: false, reason: "undo button not found" };
            if (undoBtn.disabled) return { ok: false, reason: "undo disabled" };
            undoBtn.click();
            return { ok: true };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        await wait(2000);

        const homeAfterUndo = readFileSync(
          join(uiProj, "pages/home.tsx"),
          "utf8",
        );
        log(
          "UI undo button restores source x",
          undoResult?.ok === true &&
            (homeAfterUndo.includes("x={96}") ||
              homeAfterUndo.includes("x={ 96 }") ||
              homeAfterUndo.includes("left: 96")),
        );

        // 3. Click "+" button to add page
        const addPageResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const addBtn = document.querySelector('button[aria-label="添加页面"]') ;
            if (!addBtn) return { ok: false, reason: "add page button not found" };
            addBtn.click();
            return { ok: true };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        await wait(2000);

        const manifestAfterAdd = JSON.parse(
          readFileSync(join(uiProj, "ombrique.json"), "utf8"),
        );
        const newPageFile = manifestAfterAdd.pages?.find(
          (p: { name: string }) => p.name === "Page 2",
        )?.file;
        const pageFileCreated = newPageFile
          ? existsSync(join(uiProj, newPageFile))
          : false;
        log(
          "UI add page creates page tab and file",
          addPageResult?.ok === true && pageFileCreated,
        );

        // 3b. Rename the new page through its overflow menu + dialog
        const renameResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const trigger = document.querySelector('button[aria-label="页面 Page 2 选项"]');
            if (!trigger) return { ok: false, reason: "page menu missing" };
            trigger.click();
            await new Promise((r) => setTimeout(r, 400));
            const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const renameItem = items.find((el) => el.textContent?.includes("重命名"));
            if (!renameItem) return { ok: false, reason: "rename item missing" };
            renameItem.click();
            await new Promise((r) => setTimeout(r, 400));
            const input = document.querySelector('input[placeholder="输入页面名称"]');
            if (!input) return { ok: false, reason: "rename dialog missing" };
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            ).set;
            setter.call(input, "Pricing Plan");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 100));
            const buttons = Array.from(document.querySelectorAll("button"));
            const save = buttons.find((b) => b.textContent?.trim() === "保存");
            if (!save) return { ok: false, reason: "save button missing" };
            save.click();
            return { ok: true };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        await wait(2000);

        const manifestAfterRename = JSON.parse(
          readFileSync(join(uiProj, "ombrique.json"), "utf8"),
        );
        const renamedInManifest = (manifestAfterRename.pages ?? []).some(
          (p: { name: string }) => p.name === "Pricing Plan",
        );
        const renamedVisible = await shellWindow.webContents
          .executeJavaScript(`
          Boolean(Array.from(document.querySelectorAll(".page-tab")).some((el) => el.textContent?.includes("Pricing Plan")))
        `)
          .catch(() => false);
        log(
          "UI page menu rename updates manifest and tabs",
          renameResult?.ok === true &&
            renamedInManifest &&
            renamedVisible === true,
        );

        // 3c. Delete the renamed page through its overflow menu + confirm dialog
        const deleteResult = await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const trigger = document.querySelector('button[aria-label="页面 Pricing Plan 选项"]');
            if (!trigger) return { ok: false, reason: "page menu missing" };
            trigger.click();
            await new Promise((r) => setTimeout(r, 400));
            const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const del = items.find((el) => el.textContent?.trim() === "删除");
            if (!del) return { ok: false, reason: "delete item missing" };
            del.click();
            await new Promise((r) => setTimeout(r, 500));
            const buttons = Array.from(document.querySelectorAll("button"));
            const confirm = buttons.find((b) => b.textContent?.trim() === "删除");
            if (!confirm) return { ok: false, reason: "confirm button missing" };
            confirm.click();
            return { ok: true };
          })()
        `)
          .catch((e) => ({ ok: false, error: String(e) }));
        await wait(2000);

        const manifestAfterDelete = JSON.parse(
          readFileSync(join(uiProj, "ombrique.json"), "utf8"),
        );
        const tabGone = await shellWindow.webContents
          .executeJavaScript(`
          !Array.from(document.querySelectorAll(".page-tab")).some((el) => el.textContent?.includes("Pricing Plan"))
        `)
          .catch(() => false);
        log(
          "UI page menu delete removes manifest entry and tab",
          deleteResult?.ok === true &&
            !(manifestAfterDelete.pages ?? []).some(
              (p: { name: string }) => p.name === "Pricing Plan",
            ) &&
            tabGone === true,
        );

        // 4. Canvas: click to select a node, then drag it, assert source changed
        await shellWindow.webContents
          .executeJavaScript(`
          (async () => {
            const tabs = Array.from(document.querySelectorAll(".page-tab"));
            const home = tabs.find((el) => el.textContent?.trim() === "Home");
            if (home) home.click();
            return true;
          })()
        `)
          .catch(() => {});
        await wait(2000);

        const beforeDrag = readFileSync(join(uiProj, "pages/home.tsx"), "utf8");
        const targetPoint = await canvasView.webContents
          .executeJavaScript(`
          (() => {
            const nodes = Array.from(document.querySelectorAll(".board *"));
            const el = nodes.find(
              (n) =>
                n.children.length === 0 &&
                (n.textContent || "").trim() === "Design in code",
            );
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
          })()
        `)
          .catch(() => null);
        log("canvas target node located", Boolean(targetPoint));
        if (targetPoint) {
          canvasView.webContents.sendInputEvent({
            type: "mouseDown",
            x: targetPoint.x,
            y: targetPoint.y,
            button: "left",
            clickCount: 1,
          });
          await wait(250);
          canvasView.webContents.sendInputEvent({
            type: "mouseMove",
            x: targetPoint.x + 40,
            y: targetPoint.y + 30,
            button: "left",
          });
          await wait(250);
          canvasView.webContents.sendInputEvent({
            type: "mouseUp",
            x: targetPoint.x + 40,
            y: targetPoint.y + 30,
            button: "left",
            clickCount: 1,
          });
          await wait(2500);
        }
        const afterDrag = readFileSync(join(uiProj, "pages/home.tsx"), "utf8");
        const dragChangedSource = afterDrag !== beforeDrag;
        log("canvas pointer drag changes source", dragChangedSource);
        const selectedAfterDrag = await shellWindow.webContents
          .executeJavaScript(`
          Boolean(document.querySelector(".layer-row.layer-row-selected"))
        `)
          .catch(() => false);
        log("canvas click selects node in layers", selectedAfterDrag === true);

        // Capture shell.png
        const shellImage = await shellWindow.webContents.capturePage();
        (await import("node:fs")).writeFileSync(
          join(e2eDir, "shell.png"),
          shellImage.toPNG(),
        );
        log("shell screenshot captured", true);
      }

      // Cleanup UI temporary project
      try {
        rmSync(uiProj, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    if (process.env.OMBRIQUE_E2E_PERF) {
      const log = (label: string, ok: boolean) =>
        logs.push(`[perf-500] ${label} ${ok ? "OK" : "FAIL"}`);

      if (canvasView) {
        if (projectRoot !== exampleProjectRoot()) {
          projectRoot = exampleProjectRoot();
          ensureDocHost().send({
            type: "shell",
            message: { kind: "openProject", path: projectRoot },
          });
        }
        await wait(3000);
        const { promise: perfPromise, resolve: perfResolve } =
          Promise.withResolvers<{
            ok: boolean;
            p50?: number;
            p99?: number;
            minFps?: number;
            maxFps?: number;
            sampleCount?: number;
            lastVisible?: number;
            boards?: number;
            lastPaints?: number;
            lastUploads?: number;
          }>();

        const timer = setTimeout(() => {
          ipcMain.removeListener("ombrique:fromCanvas", onPerfResult);
          perfResolve({ ok: false });
        }, 45_000);

        const onPerfResult = (
          _evt: Electron.IpcMainEvent,
          msg: { channel: string; payload: unknown },
        ) => {
          if (msg.channel !== "ombrique:perf500Result") return;
          clearTimeout(timer);
          ipcMain.removeListener("ombrique:fromCanvas", onPerfResult);
          perfResolve(
            msg.payload as { ok: boolean; p50?: number; p99?: number },
          );
        };

        ipcMain.on("ombrique:fromCanvas", onPerfResult);

        // Wait until the canvas renderer finished booting before asking for the benchmark
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const ready = await canvasView.webContents
            .executeJavaScript(
              `Boolean(document.getElementById("cv") && document.getElementById("cv").getAttribute("content") === "drawable" && window.ombriqueCanvas)`,
            )
            .catch(() => false);
          if (ready) break;
          await wait(250);
        }

        canvasView.webContents.send("ombrique:perf500", {});
        let perfResult = await Promise.race([
          perfPromise,
          wait(12_000).then(() => ({ ok: false }) as { ok: boolean }),
        ]);
        for (let retry = 0; retry < 2 && !perfResult.ok; retry += 1) {
          await wait(1500);
          const { promise: retryPromise, resolve: retryResolve } =
            Promise.withResolvers<{
              ok: boolean;
              p50?: number;
              p99?: number;
            }>();
          const retryListener = (
            _evt: Electron.IpcMainEvent,
            msg: { channel: string; payload: unknown },
          ) => {
            if (msg.channel !== "ombrique:perf500Result") return;
            ipcMain.removeListener("ombrique:fromCanvas", retryListener);
            retryResolve(
              msg.payload as { ok: boolean; p50?: number; p99?: number },
            );
          };
          ipcMain.on("ombrique:fromCanvas", retryListener);
          canvasView.webContents.send("ombrique:perf500", {});
          perfResult = await Promise.race([
            retryPromise,
            wait(12_000).then(() => ({ ok: false }) as { ok: boolean }),
          ]);
          ipcMain.removeListener("ombrique:fromCanvas", retryListener);
        }

        const perfPayload = perfResult as {
          ok: boolean;
          p50?: number;
          p99?: number;
          minFps?: number;
          maxFps?: number;
          sampleCount?: number;
          lastVisible?: number;
          boards?: number;
          lastPaints?: number;
          lastUploads?: number;
        };
        const p50 = perfPayload.p50 ?? 0;
        const p99 = perfPayload.p99 ?? 0;
        log("500 boards rendered and animated", perfResult.ok === true);
        log(`500 boards p50 fps >= 30 (${p50} fps)`, p50 >= 30);
        log(`500 boards p99 fps >= 20 (${p99} fps)`, p99 >= 20);
        console.log(
          `[perf-500] sampleCount=${perfPayload.sampleCount} boards=${perfPayload.boards} min=${perfPayload.minFps} p50=${p50} p99=${p99} max=${perfPayload.maxFps} visiblePerFrame=${perfPayload.lastVisible} paints=${perfPayload.lastPaints} uploads=${perfPayload.lastUploads}`,
        );
      }
    }

    if (process.env.OMBRIQUE_E2E_EDIT) {
      const tree = await request({
        type: "tree",
        root: projectRoot,
        file: "pages/home.tsx",
      });
      const layers =
        (tree.layers as Array<{
          id: string;
          name: string;
          children: unknown[];
        }>) ?? [];
      const resolved = await request({
        type: "resolve",
        root: projectRoot,
        file: "pages/home.tsx",
        path: [0, 3],
      });
      console.log("[e2e] layers", JSON.stringify(layers).slice(0, 300));
      console.log("[e2e] resolved", JSON.stringify(resolved).slice(0, 500));
      const element = resolved.element as {
        ref: { file: string; start: number; end: number };
        path: number[];
      } | null;
      if (element) {
        const versions = await request({ type: "versions", root: projectRoot });
        ensureDocHost().send({
          type: "shell",
          message: {
            kind: "applyCommands",
            commands: [
              {
                kind: "setAttrs",
                target: {
                  file: element.ref.file,
                  start: element.ref.start,
                  end: element.ref.end,
                  path: element.path,
                },
                attrs: { fill: "#ff3366" },
              },
            ],
            baseVersions: Object.values(
              (versions.versions as Record<string, string>) ?? {},
            ),
          },
        });
        await wait(2500);
        logs.push("[e2e] command dispatched");
      }
    }
    if (process.env.OMBRIQUE_E2E_INTERACT) {
      if (projectRoot !== exampleProjectRoot()) {
        projectRoot = exampleProjectRoot();
        ensureDocHost().send({
          type: "shell",
          message: { kind: "openProject", path: projectRoot },
        });
        await wait(2000);
      }
      const cv = canvasView?.webContents;
      const file = "pages/pricing.tsx";
      const getText = () => projectFiles[file] ?? "";
      const log = (label: string, ok: boolean) =>
        logs.push(`[interact] ${label} ${ok ? "OK" : "FAIL"}`);
      if (cv) {
        await wait(2000);
        const textTree = await request({
          type: "tree",
          root: projectRoot,
          file,
        });
        const layers =
          (textTree.layers as Array<{
            id: string;
            name: string;
            tag: string;
            children: Array<{ id: string; name: string; tag: string }>;
          }>) ?? [];
        const solo = layers[0]?.children.find((child) => child.tag === "text");
        log("find Solo layer", Boolean(solo?.id));
        if (solo?.id) {
          const path = solo.id.split("/").map(Number);
          cv.sendInputEvent({
            type: "mouseDown",
            x: 400,
            y: 300,
            button: "left",
          });
          await wait(200);
          const resolve = await request({
            type: "resolve",
            root: projectRoot,
            file,
            path,
          });
          log("hit test selection", resolve.element !== null);
          const beforeText = getText();
          cv.sendInputEvent({ type: "char", keyCode: "x" });
          await wait(400);
          log("text edit keyboard reachable", getText() === beforeText);
        }
      }
    }
    const canvasImage = canvasView
      ? await canvasView.webContents.capturePage()
      : null;
    if (canvasImage)
      (await import("node:fs")).writeFileSync(
        join(e2eDir, "canvas.png"),
        canvasImage.toPNG(),
      );
    await wait(1500);
    (await import("node:fs")).writeFileSync(
      join(e2eDir, "logs.txt"),
      logs.join("\n"),
    );
    console.log("[ombrique] e2e captured");
    if (process.env.OMBRIQUE_E2E_AUTO_QUIT) {
      setTimeout(() => app.quit(), 500);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  docHost?.child.kill();
  docHost = null;
});
