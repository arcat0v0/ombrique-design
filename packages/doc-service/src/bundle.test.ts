import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBundle, extractBundle } from "./bundle";
import { gzipSync } from "node:zlib";

describe("bundle and extract", () => {
  it("packs project directory and extracts cleanly", async () => {
    const srcDir = mkdtempSync(join(tmpdir(), "ombrique-src-"));
    const destDir = mkdtempSync(join(tmpdir(), "ombrique-dest-"));
    const archivePath = join(tmpdir(), `test-${Date.now()}.ombrique`);

    mkdirSync(join(srcDir, "pages"), { recursive: true });
    mkdirSync(join(srcDir, "assets"), { recursive: true });
    mkdirSync(join(srcDir, "node_modules/fake"), { recursive: true });

    writeFileSync(join(srcDir, "ombrique.json"), '{"pages":[]}', "utf8");
    writeFileSync(join(srcDir, "tokens.css"), ":root{}", "utf8");
    writeFileSync(
      join(srcDir, "pages/home.tsx"),
      "export default function(){}",
      "utf8",
    );
    writeFileSync(join(srcDir, "assets/logo.png"), "FAKE_PNG", "utf8");
    writeFileSync(
      join(srcDir, "node_modules/fake/index.js"),
      "ignored",
      "utf8",
    );

    await createBundle(srcDir, archivePath);
    await extractBundle(archivePath, destDir);

    expect(readFileSync(join(destDir, "ombrique.json"), "utf8")).toBe(
      '{"pages":[]}',
    );
    expect(readFileSync(join(destDir, "tokens.css"), "utf8")).toBe(":root{}");
    expect(readFileSync(join(destDir, "pages/home.tsx"), "utf8")).toBe(
      "export default function(){}",
    );
    expect(readFileSync(join(destDir, "assets/logo.png"), "utf8")).toBe(
      "FAKE_PNG",
    );
    expect(() =>
      readFileSync(join(destDir, "node_modules/fake/index.js"), "utf8"),
    ).toThrow();

    rmSync(srcDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
    rmSync(archivePath, { force: true });
  });

  it("defends against zip slip path traversal", async () => {
    const destDir = mkdtempSync(join(tmpdir(), "ombrique-slip-dest-"));
    const archivePath = join(tmpdir(), `slip-${Date.now()}.ombrique`);

    const evilPayload = {
      manifest: { formatVersion: 1, created: Date.now(), files: [] },
      entries: {
        "../evil.txt": Buffer.from("malicious content").toString("base64"),
      },
    };
    writeFileSync(
      archivePath,
      gzipSync(Buffer.from(JSON.stringify(evilPayload))),
    );

    expect(() => extractBundle(archivePath, destDir)).toThrow(/Zip slip/);

    rmSync(destDir, { recursive: true, force: true });
    rmSync(archivePath, { force: true });
  });
});

describe("bundle: project icon sets", () => {
  it("packs and extracts the icons directory", async () => {
    const srcDir = mkdtempSync(join(tmpdir(), "ombrique-icon-src-"));
    const destDir = mkdtempSync(join(tmpdir(), "ombrique-icon-dest-"));
    const archivePath = join(tmpdir(), `icons-${Date.now()}.ombrique`);
    mkdirSync(join(srcDir, "icons"), { recursive: true });
    writeFileSync(join(srcDir, "icons/acme.json"), '{"prefix":"acme"}', "utf8");
    writeFileSync(join(srcDir, "ombrique.json"), '{"pages":[]}', "utf8");

    try {
      await createBundle(srcDir, archivePath);
      await extractBundle(archivePath, destDir);
      expect(readFileSync(join(destDir, "icons/acme.json"), "utf8")).toBe(
        '{"prefix":"acme"}',
      );
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
      rmSync(archivePath, { force: true });
    }
  });
});

describe("bundle: shader assets", () => {
  it("packs and extracts the shaders directory", async () => {
    const srcDir = mkdtempSync(join(tmpdir(), "ombrique-shader-src-"));
    const destDir = mkdtempSync(join(tmpdir(), "ombrique-shader-dest-"));
    const archivePath = join(tmpdir(), `shaders-${Date.now()}.ombrique`);
    mkdirSync(join(srcDir, "shaders"), { recursive: true });
    writeFileSync(
      join(srcDir, "shaders/mesh-gradient.glsl"),
      "#version 300 es\n",
      "utf8",
    );
    writeFileSync(join(srcDir, "ombrique.json"), '{"pages":[]}', "utf8");

    try {
      await createBundle(srcDir, archivePath);
      await extractBundle(archivePath, destDir);
      expect(
        readFileSync(join(destDir, "shaders/mesh-gradient.glsl"), "utf8"),
      ).toBe("#version 300 es\n");
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
      rmSync(archivePath, { force: true });
    }
  });
});
