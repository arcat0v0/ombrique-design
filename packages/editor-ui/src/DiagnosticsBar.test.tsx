import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticItem } from "@ombrique/protocol";
import { DiagnosticsBar } from "./DiagnosticsBar";

afterEach(cleanup);

const error: DiagnosticItem = {
  file: "App.tsx",
  message: "类型错误",
  severity: "error",
};
const warning: DiagnosticItem = {
  file: "Page.tsx",
  message: "未使用的变量",
  severity: "warning",
};

describe("DiagnosticsBar", () => {
  it("shows the diagnostics count and the latest item", () => {
    const { getByText } = render(
      <DiagnosticsBar
        diagnostics={[error, warning]}
        notice={null}
        onDismissNotice={() => {}}
      />,
    );
    expect(getByText("2 条诊断")).toBeDefined();
    expect(getByText("Page.tsx: 未使用的变量")).toBeDefined();
  });

  it("colors the latest diagnostic by severity", () => {
    const { container, rerender } = render(
      <DiagnosticsBar
        diagnostics={[warning]}
        notice={null}
        onDismissNotice={() => {}}
      />,
    );
    expect(
      container.querySelector(".diagnostics-latest-warning"),
    ).not.toBeNull();
    rerender(
      <DiagnosticsBar
        diagnostics={[error]}
        notice={null}
        onDismissNotice={() => {}}
      />,
    );
    expect(container.querySelector(".diagnostics-latest-error")).not.toBeNull();
  });

  it("renders nothing extra when there are no diagnostics", () => {
    const { container, getByText } = render(
      <DiagnosticsBar
        diagnostics={[]}
        notice={null}
        onDismissNotice={() => {}}
      />,
    );
    expect(getByText("0 条诊断")).toBeDefined();
    expect(container.querySelector(".diagnostics-latest")).toBeNull();
  });

  it("shows the notice and dismisses it on click", () => {
    const onDismissNotice = vi.fn();
    const { getByText, getByLabelText, queryByLabelText, rerender } = render(
      <DiagnosticsBar
        diagnostics={[]}
        notice="已保存"
        onDismissNotice={onDismissNotice}
      />,
    );
    expect(getByText("已保存")).toBeDefined();
    getByLabelText("关闭通知").click();
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
    rerender(
      <DiagnosticsBar
        diagnostics={[]}
        notice={null}
        onDismissNotice={onDismissNotice}
      />,
    );
    expect(queryByLabelText("关闭通知")).toBeNull();
  });
});
