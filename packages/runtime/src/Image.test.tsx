import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Image } from "./Image";

afterEach(() => cleanup());

describe("Image", () => {
  it("renders an absolute container with img inside", () => {
    const { container } = render(
      <Image
        name="HeroPhoto"
        x={10}
        y={20}
        width={300}
        height={200}
        src="/assets/photo.png"
        radius={8}
        opacity={0.9}
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("data-name")).toBe("HeroPhoto");
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.left).toBe("10px");
    expect(wrapper.style.top).toBe("20px");
    expect(wrapper.style.width).toBe("300px");
    expect(wrapper.style.height).toBe("200px");
    expect(wrapper.style.borderRadius).toBe("8px");
    expect(wrapper.style.opacity).toBe("0.9");

    const img = wrapper.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/assets/photo.png");
    expect(img.getAttribute("alt")).toBe("HeroPhoto");
  });
});
