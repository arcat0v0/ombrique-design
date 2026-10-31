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
});
