import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMENTS_FILE,
  createEmptyCommentsDoc,
  createThread,
  loadComments,
  replyToThread,
  resolveThread,
  saveComments,
} from "./comments";
import {
  createBranch,
  execGit,
  getCurrentBranch,
  getGitStatus,
  listBranches,
  listHistory,
  readPastVersion,
  readPastVersionFiles,
  saveVersion,
  switchBranch,
} from "./git";
import { DocumentService } from "./service";

describe("git service integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `ombrique-git-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, "pages"), { recursive: true });

    await execGit(["init", "-b", "main"], tempDir);
    await execGit(["config", "user.name", "Ombrique Tester"], tempDir);
    await execGit(["config", "user.email", "tester@ombrique.local"], tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles commit history, past version reading and undoable restore", async () => {
    const manifestContent = JSON.stringify(
      {
        formatVersion: 1,
        pages: [{ id: "p1", name: "Home", file: "pages/home.tsx" }],
      },
      null,
      2,
    );
    const initialHome = `import { Frame } from "@ombrique/runtime";
export default function Home() {
  return <Frame name="Home" x={0} y={0} width={400} height={300} fill="#ffffff" />;
}
`;

    writeFileSync(join(tempDir, "ombrique.json"), manifestContent, "utf8");
    writeFileSync(join(tempDir, "pages", "home.tsx"), initialHome, "utf8");

    const status1 = await getGitStatus(tempDir);
    expect(status1.isRepo).toBe(true);
    expect(status1.dirty).toBe(true);
    expect(status1.changedFiles).toContain("ombrique.json");
    expect(status1.changedFiles).toContain("pages/home.tsx");

    const commit1 = await saveVersion(tempDir, "Initial commit");
    expect(commit1.hash).toMatch(/^[a-f0-9]{40}$/);

    const statusAfterC1 = await getGitStatus(tempDir);
    expect(statusAfterC1.dirty).toBe(false);

    const updatedHome = `import { Frame } from "@ombrique/runtime";
export default function Home() {
  return <Frame name="Home" x={0} y={0} width={800} height={600} fill="#000000" />;
}
`;
    writeFileSync(join(tempDir, "pages", "home.tsx"), updatedHome, "utf8");

    const status2 = await getGitStatus(tempDir);
    expect(status2.dirty).toBe(true);
    expect(status2.changedFiles).toEqual(["pages/home.tsx"]);

    const commit2 = await saveVersion(tempDir, "Expand home frame");
    expect(commit2.hash).toMatch(/^[a-f0-9]{40}$/);

    const history = await listHistory(tempDir);
    expect(history.length).toBe(2);
    expect(history[0]?.message).toBe("Expand home frame");
    expect(history[0]?.changedPages).toContain("home");
    expect(history[1]?.message).toBe("Initial commit");
    expect(history[1]?.author).toBe("Ombrique Tester");

    const pastContent = await readPastVersion(
      tempDir,
      commit1.hash,
      "pages/home.tsx",
    );
    expect(pastContent).toBe(initialHome);

    const pastFiles = await readPastVersionFiles(tempDir, commit1.hash);
    expect(pastFiles["pages/home.tsx"]).toBe(initialHome);
    expect(pastFiles["ombrique.json"]).toBe(manifestContent);

    const service = new DocumentService();
    service.open(tempDir);
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(updatedHome);

    service.restoreVersion(pastFiles);
    expect(readFileSync(join(tempDir, "pages", "home.tsx"), "utf8")).toBe(
      initialHome,
    );
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(initialHome);
    expect(service.canUndo).toBe(true);

    service.undo();
    expect(readFileSync(join(tempDir, "pages", "home.tsx"), "utf8")).toBe(
      updatedHome,
    );
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(updatedHome);
    expect(service.canRedo).toBe(true);
    service.redo();
    expect(readFileSync(join(tempDir, "pages", "home.tsx"), "utf8")).toBe(
      initialHome,
    );
    expect(service.project.files.get("pages/home.tsx")?.text).toBe(initialHome);

    expect(service.canUndo).toBe(true);
  });

  it("handles branch creation, refusal on dirty tree, and clean branch switching", async () => {
    writeFileSync(
      join(tempDir, "ombrique.json"),
      JSON.stringify({ formatVersion: 1, pages: [] }),
      "utf8",
    );
    await saveVersion(tempDir, "Initial root");

    const branchList1 = await listBranches(tempDir);
    expect(branchList1.current).toBe("main");
    expect(branchList1.branches).toContain("main");

    await createBranch(tempDir, "feature/experimental");
    expect(await getCurrentBranch(tempDir)).toBe("feature/experimental");

    const branchList2 = await listBranches(tempDir);
    expect(branchList2.branches).toContain("feature/experimental");
    expect(branchList2.branches).toContain("main");

    writeFileSync(
      join(tempDir, "pages", "draft.tsx"),
      "export default function Draft() { return null; }",
      "utf8",
    );

    const statusDirty = await getGitStatus(tempDir);
    expect(statusDirty.dirty).toBe(true);

    await expect(switchBranch(tempDir, "main")).rejects.toThrow(
      "工作区有未提交的设计修改，请先保存版本后再切换分支",
    );

    await saveVersion(tempDir, "Save draft on experimental");
    expect((await getGitStatus(tempDir)).dirty).toBe(false);

    await switchBranch(tempDir, "main");
    expect(await getCurrentBranch(tempDir)).toBe("main");

    const service = new DocumentService();
    service.open(tempDir);
    expect(service.project.files.has("pages/draft.tsx")).toBe(false);

    await switchBranch(tempDir, "feature/experimental");
    service.refreshAll();
    expect(service.project.files.has("pages/draft.tsx")).toBe(true);
    service.close();
  });

  it("round-trips comments to disk and tracks comments in git", async () => {
    writeFileSync(
      join(tempDir, "ombrique.json"),
      JSON.stringify({ formatVersion: 1, pages: [] }),
      "utf8",
    );
    await saveVersion(tempDir, "Initial");

    const empty = createEmptyCommentsDoc();
    const { doc: withThread, thread } = createThread(empty, {
      anchor: { type: "canvas", pageId: "p1", x: 100, y: 150 },
      author: "Designer",
      body: "Check layout contrast",
    });

    saveComments(tempDir, withThread);

    const status = await getGitStatus(tempDir);
    expect(status.dirty).toBe(true);
    expect(status.changedFiles).toContain(COMMENTS_FILE);

    await saveVersion(tempDir, "Add design comments");
    expect((await getGitStatus(tempDir)).dirty).toBe(false);

    const loaded1 = loadComments(tempDir);
    expect(loaded1.threads.length).toBe(1);
    expect(loaded1.threads[0]?.messages[0]?.body).toBe("Check layout contrast");

    const { doc: replied } = replyToThread(loaded1, thread.id, {
      author: "Engineer",
      body: "Updated contrast ratio to 4.5:1",
    });
    const resolved = resolveThread(replied, thread.id, "Engineer");
    saveComments(tempDir, resolved);

    const loaded2 = loadComments(tempDir);
    expect(loaded2.threads[0]?.resolved).toBe(true);
    expect(loaded2.threads[0]?.messages.length).toBe(2);
    expect(loaded2.threads[0]?.resolvedBy).toBe("Engineer");
  });
});
