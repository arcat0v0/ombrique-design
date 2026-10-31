import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitCommit } from "@ombrique/protocol";
import { VersionHistoryPanel } from "./VersionHistoryPanel";

afterEach(cleanup);

describe("VersionHistoryPanel", () => {
  const sampleCommits: GitCommit[] = [
    {
      hash: "1111111111111111111111111111111111111111",
      shortHash: "1111111",
      author: "Alice",
      email: "alice@test.local",
      date: new Date().toISOString(),
      message: "Update home page layout",
      changedPages: ["home"],
      changedFiles: ["pages/home.tsx"],
    },
    {
      hash: "2222222222222222222222222222222222222222",
      shortHash: "2222222",
      author: "Bob",
      email: "bob@test.local",
      date: new Date().toISOString(),
      message: "Initial commit",
      changedPages: [],
      changedFiles: ["ombrique.json"],
    },
  ];

  it("renders branch and commit history list and supports saving a version", async () => {
    const onSaveVersion = vi.fn().mockResolvedValue(true);
    render(
      <VersionHistoryPanel
        history={sampleCommits}
        branches={{ current: "main", branches: ["main", "feature/new"] }}
        onSaveVersion={onSaveVersion}
      />,
    );

    expect(screen.getByText("main")).toBeDefined();
    expect(screen.getByText("Update home page layout")).toBeDefined();
    expect(screen.getByText("Initial commit")).toBeDefined();
    expect(screen.getByText("1111111")).toBeDefined();
    expect(screen.getByText("home")).toBeDefined();

    const saveButtons = screen.getAllByRole("button", { name: /保存版本/ });
    if (saveButtons[0]) fireEvent.click(saveButtons[0]);
    expect(screen.getByText("保存设计版本")).toBeDefined();

    const input = screen.getByPlaceholderText(
      "例如: 更新首页头部设计、调整按钮间距",
    );
    fireEvent.change(input, { target: { value: "Refactor typography" } });
    const form = input.closest("form");
    if (form) fireEvent.submit(form);

    expect(onSaveVersion).toHaveBeenCalledWith("Refactor typography");
  });

  it("calls onCreateBranch when creating a branch", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(true);
    render(
      <VersionHistoryPanel
        history={sampleCommits}
        onCreateBranch={onCreateBranch}
      />,
    );

    const branchButtons = screen.getAllByRole("button", { name: /新分支/ });
    if (branchButtons[0]) fireEvent.click(branchButtons[0]);
    expect(screen.getByText("创建新分支")).toBeDefined();

    const input = screen.getByPlaceholderText("feature/new-landing");
    fireEvent.change(input, { target: { value: "feature/dark-mode" } });
    const form = input.closest("form");
    if (form) fireEvent.submit(form);

    expect(onCreateBranch).toHaveBeenCalledWith("feature/dark-mode");
  });

  it("calls onPreviewVersion and onRestoreVersion", () => {
    const onPreviewVersion = vi.fn();
    const onRestoreVersion = vi.fn().mockResolvedValue(undefined);

    render(
      <VersionHistoryPanel
        history={sampleCommits}
        onPreviewVersion={onPreviewVersion}
        onRestoreVersion={onRestoreVersion}
      />,
    );

    const previewButton = screen.getByRole("button", {
      name: `预览版本: ${sampleCommits[0]?.shortHash}`,
    });
    fireEvent.click(previewButton);
    expect(onPreviewVersion).toHaveBeenCalledWith(sampleCommits[0]);

    const restoreButton = screen.getByRole("button", {
      name: `恢复版本: ${sampleCommits[0]?.shortHash}`,
    });
    fireEvent.click(restoreButton);
    expect(screen.getByText("确认恢复此版本？")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "确认恢复此版本" }));
    expect(onRestoreVersion).toHaveBeenCalledWith(sampleCommits[0]);
  });

  it("displays preview banner and handles exit preview", () => {
    const onExitHistoryPreview = vi.fn();
    render(
      <VersionHistoryPanel
        history={sampleCommits}
        isHistoryPreview={true}
        previewCommit={sampleCommits[0]}
        onExitHistoryPreview={onExitHistoryPreview}
      />,
    );

    expect(screen.getByText(/预览版本: 1111111/)).toBeDefined();
    const exitButtons = screen.getAllByRole("button", { name: "退出预览" });
    const firstExit = exitButtons[0];
    if (firstExit) fireEvent.click(firstExit);
    expect(onExitHistoryPreview).toHaveBeenCalled();
  });
});
