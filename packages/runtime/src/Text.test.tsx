import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Text } from "./Text";

afterEach(cleanup);

describe("Text", () => {
  it("renders pre-wrapped text with data-name", () => {
    const { container } = render(<Text name="title">Hello</Text>);
    const div = container.querySelector("div");
    expect(div?.textContent).toBe("Hello");
    expect(div?.getAttribute("data-name")).toBe("title");
    expect(div?.style.whiteSpace).toBe("pre-wrap");
  });

  it("positions absolutely when x/y are given", () => {
    const { container } = render(
      <Text x={30} y={40} width={200} fontSize={18} fill="#123456">
        body
      </Text>,
    );
    const div = container.querySelector("div");
    expect(div?.style.position).toBe("absolute");
    expect(div?.style.left).toBe("30px");
    expect(div?.style.top).toBe("40px");
    expect(div?.style.width).toBe("200px");
    expect(div?.style.fontSize).toBe("18px");
    expect(div?.style.color).toBe("rgb(18, 52, 86)");
  });
});
