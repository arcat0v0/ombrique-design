import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldProject, starterPageSource } from "./project-scaffold";

describe("project scaffold", () => {
  it("writes a manifest and starter page into an empty folder", () => {
    const directory = mkdtempSync(join(tmpdir(), "ombrique-new-"));
    const manifest = scaffoldProject(directory);

    expect(manifest.pages).toEqual([
      { id: "home", name: "Home", file: "pages/home.tsx" },
    ]);
    expect(
      JSON.parse(readFileSync(join(directory, "ombrique.json"), "utf8")),
    ).toEqual(manifest);

    const page = readFileSync(join(directory, "pages", "home.tsx"), "utf8");
    expect(page).toContain('from "@ombrique/runtime"');
    expect(page).toContain("export default function Home()");
    expect(page).toContain(JSON.stringify(directory.split("/").pop() ?? ""));
  });

  it("refuses to overwrite a folder that already has files", () => {
    const directory = mkdtempSync(join(tmpdir(), "ombrique-new-"));
    writeFileSync(join(directory, "notes.txt"), "keep me", "utf8");

    expect(() => scaffoldProject(directory)).toThrow("空文件夹");
    expect(readFileSync(join(directory, "notes.txt"), "utf8")).toBe("keep me");
  });

  it("allows hidden folders such as .git", () => {
    const directory = mkdtempSync(join(tmpdir(), "ombrique-new-"));
    mkdirSync(join(directory, ".git"));

    expect(() => scaffoldProject(directory)).not.toThrow();
  });

  it("escapes project names safely in the starter page", () => {
    const page = starterPageSource('My "Quoted" <Project>');
    expect(page).toContain(`{${JSON.stringify('My "Quoted" <Project>')}}`);
  });
});
