import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Vector } from "./Vector";
import { Boolean as BooleanPrimitive } from "./Boolean";

describe("Vector & Boolean runtime primitives", () => {
  it("renders Vector with default viewBox and absolute positioning", () => {
    const html = renderToString(
      <Vector x={10} y={20} width={200} height={100} name="Icons">
        <path d="M0 0 L10 10" />
      </Vector>,
    );
    expect(html).toContain('viewBox="0 0 200 100"');
    expect(html).toContain('data-name="Icons"');
    expect(html).toContain("position:absolute");
    expect(html).toContain("<path");
  });

  it("renders Boolean with operation attribute", () => {
    const html = renderToString(
      <BooleanPrimitive op="union" fill="#ff0000" name="Combined">
        <circle cx={10} cy={10} r={5} />
        <circle cx={20} cy={20} r={5} />
      </BooleanPrimitive>,
    );
    expect(html).toContain('data-boolean-op="union"');
    expect(html).toContain('fill="#ff0000"');
    expect(html).toContain('data-name="Combined"');
  });
});
