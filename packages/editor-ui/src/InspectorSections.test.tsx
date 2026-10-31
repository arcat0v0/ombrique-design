import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CornerRadiusControl } from "./CornerRadiusControl";
import { EffectSection } from "./EffectSection";
import { StrokeSection } from "./StrokeSection";
import { makeSelection } from "./fixtures";

afterEach(cleanup);

describe("CornerRadiusControl", () => {
  it("edits a single uniform radius and expands to 4 corners", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      tag: "rect",
      styles: [
        { key: "radius", value: "8", source: "inline", readOnly: false },
      ],
    });
    const { getByLabelText } = render(
      <CornerRadiusControl
        selection={selection}
        disabled={false}
        onSetStyle={onSetStyle}
      />,
    );

    const uniform = getByLabelText("统一圆角") as HTMLInputElement;
    expect(uniform.value).toBe("8");
    fireEvent.change(uniform, { target: { value: "12" } });
    fireEvent.blur(uniform);
    expect(onSetStyle).toHaveBeenCalledWith("radius", 12);

    fireEvent.click(getByLabelText("展开独立4角圆角"));
    const tl = getByLabelText("左上圆角 (Top-Left)") as HTMLInputElement;
    expect(tl.value).toBe("");
    fireEvent.change(tl, { target: { value: "4" } });
    fireEvent.blur(tl);
    expect(onSetStyle).toHaveBeenCalledWith("radiusTopLeft", 4);
  });
});

describe("StrokeSection", () => {
  it("adds a stroke and switches alignment to inside/outside", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      tag: "rect",
      styles: [
        { key: "stroke", value: "#000000", source: "inline", readOnly: false },
      ],
    });
    const { getByLabelText, rerender } = render(
      <StrokeSection
        selection={selection}
        disabled={false}
        onSetStyle={onSetStyle}
      />,
    );

    fireEvent.click(getByLabelText("内侧描边 (Inside)"));
    expect(onSetStyle).toHaveBeenCalledWith(
      "boxShadow",
      "inset 0px 0px 0px 1px #000000",
    );

    const insideSelection = makeSelection({
      tag: "rect",
      styles: [
        {
          key: "boxShadow",
          value: "inset 0px 0px 0px 1px #000000",
          source: "inline",
          readOnly: false,
        },
      ],
    });
    rerender(
      <StrokeSection
        selection={insideSelection}
        disabled={false}
        onSetStyle={onSetStyle}
      />,
    );
    fireEvent.click(getByLabelText("居中描边 (Center)"));
    expect(onSetStyle).toHaveBeenCalledWith("stroke", "#000000");
    expect(onSetStyle).toHaveBeenCalledWith("strokeWidth", 1);
    expect(onSetStyle).toHaveBeenCalledWith("boxShadow", null);
  });

  it("preserves an existing drop shadow when switching stroke alignment", () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({
      tag: "rect",
      styles: [
        { key: "stroke", value: "#000000", source: "inline", readOnly: false },
        {
          key: "boxShadow",
          value: "2px 4px 8px 0px rgba(0, 0, 0, 0.3)",
          source: "inline",
          readOnly: false,
        },
      ],
    });
    const { getByLabelText } = render(
      <StrokeSection
        selection={selection}
        disabled={false}
        onSetStyle={onSetStyle}
      />,
    );
    fireEvent.click(getByLabelText("外侧描边 (Outside)"));
    expect(onSetStyle).toHaveBeenCalledWith(
      "boxShadow",
      "2px 4px 8px 0px rgba(0, 0, 0, 0.3), 0px 0px 0px 1px #000000",
    );
  });
});

describe("EffectSection", () => {
  it("adds a drop shadow effect", async () => {
    const onSetStyle = vi.fn();
    const selection = makeSelection({ tag: "rect", styles: [] });
    const { getByLabelText, findByText } = render(
      <EffectSection
        selection={selection}
        disabled={false}
        onSetStyle={onSetStyle}
      />,
    );
    fireEvent.pointerDown(getByLabelText("Add Effect"), { button: 0 });
    const dropItem = await findByText("Drop Shadow");
    fireEvent.click(dropItem);
    expect(onSetStyle).toHaveBeenCalledWith("boxShadow", expect.any(String));
  });
});
