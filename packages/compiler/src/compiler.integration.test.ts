import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDesignCompiler,
  type DesignCompiler,
  type WirePayload,
} from "./compiler";

let root: string;
let compiler: DesignCompiler;
const wire: WirePayload[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "ombrique-compiler-"));
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(
    join(root, "pages/home.tsx"),
    `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={400} height={300} fill="#ffffff">
      <Text x={20} y={20} width={200} fontSize={16}>hello</Text>
    </Frame>
  );
}
`,
  );
  compiler = await createDesignCompiler(root);
  compiler.setWire((payload) => wire.push(payload));
  compiler.clientConnect({ send: () => {} });
});

afterAll(async () => {
  await compiler.close();
});

describe("design compiler", () => {
  it("transforms project tsx without an http server", async () => {
    const code = await compiler.transform("/pages/home.tsx");
    expect(code).toBeTruthy();
    expect(code).toContain("jsxDEV");
    expect(code).toContain("jsxDEV");
    expect(code).not.toContain('from "@ombrique/runtime"');
  });
  it("keeps the transformed module free of hmr accept wrappers", async () => {
    const code = await compiler.transform("/pages/home.tsx");
    expect(code).not.toContain("hot.accept");
    expect(code).not.toContain("RefreshRuntime");
  });

  it("returns null for missing modules", async () => {
    const code = await compiler.transform("/pages/nope.tsx");
    expect(code).toBeNull();
  });

  it("injects the vite client script into html", async () => {
    const html = await compiler.transformHtml("<html><body></body></html>");
    expect(html).toContain("/@vite/client");
  });

  it("delivers hmr updates over the custom channel on file change", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    compiler.setWire((payload) => {
      wire.push(payload);
      if (payload.type === "update" || payload.type === "full-reload")
        resolve();
    });
    writeFileSync(
      join(root, "pages", "home.tsx"),
      `import { Frame } from "@ombrique/runtime";

export default function Home() {
  return <Frame name="Home" x={0} y={0} width={100} height={100} />;
}
`,
    );
    await promise;
    const reload = wire.find(
      (p) => p.type === "update" || p.type === "full-reload",
    );
    expect(reload).toBeDefined();
    if (reload?.type === "update") {
      const updates = reload.updates as Array<{ type: string; path: string }>;
      expect(updates.some((u) => u.path === "/pages/home.tsx")).toBe(true);
    }
  }, 20000);
});
