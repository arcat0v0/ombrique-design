import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewMenu, type ViewMenuProps } from "./ViewMenu";

afterEach(cleanup);

function renderViewMenu(overrides: Partial<ViewMenuProps> = {}) {
  const callbacks = {
    onZoomTo: vi.fn(),
    onZoomToFit: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onToggleDevtools: vi.fn(),
    onReloadRenderer: vi.fn(),
  };
  const rendered = render(
    <TooltipProvider>
      <ViewMenu zoom={1} {...callbacks} {...overrides} />
    </TooltipProvider>,
  );
  return { ...rendered, callbacks };
}

async function openMenu(baseElement: HTMLElement) {
  const trigger = within(baseElement).getByRole("button", {
    name: "视图与缩放",
  });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return within(baseElement).findByRole("menu");
}

describe("ViewMenu", () => {
  it("shows the current zoom and routes zoom actions", async () => {
    const { baseElement, callbacks } = renderViewMenu({ zoom: 1.25 });
    expect(within(baseElement).getByText("125%")).toBeDefined();

    for (const label of ["放大", "缩小", "100%"]) {
      const menu = await openMenu(baseElement);
      fireEvent.click(within(menu).getByText(label));
    }
    expect(callbacks.onZoomTo.mock.calls).toEqual([[1.5625], [1], [1]]);

    const fitMenu = await openMenu(baseElement);
    fireEvent.click(within(fitMenu).getByText("适应画布"));
    expect(callbacks.onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it("routes fullscreen, developer tools and reload actions", async () => {
    const { baseElement, callbacks } = renderViewMenu();
    for (const label of ["全屏", "开发者工具", "重新加载"]) {
      const menu = await openMenu(baseElement);
      fireEvent.click(within(menu).getByText(label));
    }
    expect(callbacks.onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(callbacks.onToggleDevtools).toHaveBeenCalledTimes(1);
    expect(callbacks.onReloadRenderer).toHaveBeenCalledTimes(1);
  });

  it("disables actions without a desktop bridge", async () => {
    const { baseElement } = renderViewMenu({
      onZoomTo: undefined,
      onToggleFullscreen: undefined,
      onToggleDevtools: undefined,
      onReloadRenderer: undefined,
    });
    const menu = await openMenu(baseElement);
    for (const label of [
      "放大",
      "缩小",
      "100%",
      "全屏",
      "开发者工具",
      "重新加载",
    ]) {
      const item = within(menu).getByText(label).closest("[role=menuitem]");
      expect(item?.getAttribute("aria-disabled")).toBe("true");
    }
  });
});
