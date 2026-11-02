import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecentProject } from "@ombrique/protocol";
import { Workspace, formatRelativeTime } from "./Workspace";

afterEach(cleanup);

function makeProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    root: "/work/pricing-redesign",
    name: "pricing-redesign",
    lastOpenedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    exists: true,
    pageCount: 4,
    thumbnail: null,
    ...overrides,
  };
}

function renderWorkspace(overrides: Record<string, unknown> = {}) {
  const callbacks = {
    onOpenRecent: vi.fn(),
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    onRemoveRecent: vi.fn(),
    onOpenExample: vi.fn(),
  };
  const rendered = render(
    <Workspace
      recentProjects={[makeProject()]}
      {...callbacks}
      {...overrides}
    />,
  );
  return { ...rendered, callbacks };
}

describe("Workspace", () => {
  it("renders recent projects with metadata and opens them", () => {
    const { getByLabelText, getByText, callbacks } = renderWorkspace();
    expect(getByText("pricing-redesign")).toBeDefined();
    expect(getByText("/work/pricing-redesign")).toBeDefined();
    expect(getByText("4 页")).toBeDefined();
    expect(getByText("5 分钟前")).toBeDefined();

    fireEvent.click(getByLabelText("打开项目 pricing-redesign"));
    expect(callbacks.onOpenRecent).toHaveBeenCalledWith(
      "/work/pricing-redesign",
    );
  });

  it("removes an entry without opening it", () => {
    const { getByLabelText, callbacks } = renderWorkspace();
    fireEvent.click(getByLabelText("从最近项目中移除 pricing-redesign"));
    expect(callbacks.onRemoveRecent).toHaveBeenCalledWith(
      "/work/pricing-redesign",
    );
    expect(callbacks.onOpenRecent).not.toHaveBeenCalled();
  });

  it("filters by name or path", () => {
    const { getByLabelText, queryByText } = renderWorkspace({
      recentProjects: [
        makeProject(),
        makeProject({
          root: "/work/marketing-site",
          name: "marketing-site",
          pageCount: 2,
        }),
      ],
    });
    const search = getByLabelText("搜索最近项目") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "marketing" } });
    expect(queryByText("marketing-site")).not.toBeNull();
    expect(queryByText("pricing-redesign")).toBeNull();

    fireEvent.change(search, { target: { value: "nope" } });
    expect(queryByText("没有匹配的项目")).not.toBeNull();
  });

  it("marks missing projects as unavailable", () => {
    const { getByLabelText, getByText } = renderWorkspace({
      recentProjects: [makeProject({ exists: false })],
    });
    expect(getByText("路径不存在")).toBeDefined();
    expect(
      (getByLabelText("打开项目 pricing-redesign") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows an empty state with real actions", () => {
    const { getAllByText, getByText, callbacks } = renderWorkspace({
      recentProjects: [],
    });
    expect(getByText("还没有最近项目")).toBeDefined();
    const createButton = getAllByText("新建项目")[0];
    if (createButton) fireEvent.click(createButton);
    expect(callbacks.onCreateProject).toHaveBeenCalledTimes(1);
  });

  it("shows skeletons while the history is loading", () => {
    const { queryByText } = renderWorkspace({ recentProjects: undefined });
    expect(queryByText("还没有最近项目")).toBeNull();
    expect(queryByText("pricing-redesign")).toBeNull();
  });

  it("formats relative timestamps across ranges", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");
    expect(formatRelativeTime("2026-06-10T11:59:40.000Z", now)).toBe("刚刚");
    expect(formatRelativeTime("2026-06-10T11:35:00.000Z", now)).toBe(
      "25 分钟前",
    );
    expect(formatRelativeTime("2026-06-10T07:00:00.000Z", now)).toBe(
      "5 小时前",
    );
    expect(formatRelativeTime("2026-06-07T12:00:00.000Z", now)).toBe("3 天前");
    expect(formatRelativeTime("bad-date", now)).toBe("未知时间");
  });
});
