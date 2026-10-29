import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Group } from "./Group";

afterEach(cleanup);

describe("Group", () => {
  it("renders with display:contents and carries data-name", () => {
    const { container } = render(
      <Group name="Card Group">
        <div>child</div>
      </Group>,
    );
    const el = container.firstElementChild as HTMLElement | null;
    expect(el?.tagName).toBe("DIV");
    expect(el?.getAttribute("data-name")).toBe("Card Group");
    expect(el?.style.display).toBe("contents");
  });

  it("supports hidden and data-locked metadata", () => {
    const { container } = render(
      <Group name="Locked" hidden data-locked>
        <div>child</div>
      </Group>,
    );
    const el = container.firstElementChild as HTMLElement | null;
    expect(el?.hasAttribute("hidden")).toBe(true);
    expect(el?.hasAttribute("data-locked")).toBe(true);
  });

  it("renders children without producing a layout box", () => {
    const { container, getByText } = render(
      <Group name="G">
        <p>alpha</p>
        <p>beta</p>
      </Group>,
    );
    expect(getByText("alpha")).not.toBeNull();
    expect(getByText("beta")).not.toBeNull();
    expect(container.querySelectorAll("[data-name='G']")).toHaveLength(1);
  });
});
