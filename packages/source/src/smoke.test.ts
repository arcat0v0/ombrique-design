import { describe, expect, it } from "vitest";
import {
  applyEdits,
  buildIndex,
  parseDesignFile,
  parseStylesheet,
  planPatch,
} from "./index.js";

const PAGE = `import { Frame, Text } from "@ombrique/runtime";

export default function Home() {
  return (
    <Frame name="Home" x={0} y={0} width={1440} height={900} fill="#ffffff">
      <div data-name="Hero" style={{ position: "absolute", left: 80, top: 120, width: 400 }}>
        <Text x={0} y={0} fontSize={24}>标题</Text>
      </div>
    </Frame>
  );
}
`;

describe("smoke", () => {
  it("parses, indexes, and patches", () => {
    const parsed = parseDesignFile("pages/home.tsx", PAGE);
    expect(parsed.root?.tag).toBe("Frame");
    const textEl = parsed.elements.find((e) => e.tag === "Text");
    expect(
      textEl?.textSpan &&
        PAGE.slice(textEl.textSpan.start, textEl.textSpan.end),
    ).toBe("标题");

    const sheet = parseStylesheet(
      "styles/home.module.scss",
      ".card {\n  color: red;\n  .label { font-size: 12px; }\n}\n",
    );
    expect(sheet.rules.map((r) => r.fullSelector)).toContain(".card .label");

    const index = buildIndex({ "pages/home.tsx": PAGE });
    expect(index.pages[0]?.width).toBe(1440);

    const target = parsed.elements.find((e) => e.tag === "div");
    const plan = planPatch(index, {
      kind: "setStyle",
      target: target?.ref ?? { file: "pages/home.tsx", start: 0, end: 0 },
      declarations: [["left", 100]],
    });
    const next = applyEdits(PAGE, plan.edits);
    expect(next).toContain("left: 100");
    expect(next).not.toContain("left: 80");
  });
});
