import { describe, expect, it } from "vitest";
import {
  getStrokeShadowAlignment,
  parseBlur,
  parseShadow,
  removeStrokeShadows,
  serializeBlur,
  serializeShadow,
  upsertStrokeShadow,
} from "./effectStyles";
import { parseGradient, serializeGradient } from "./gradientStyles";

describe("effectStyles", () => {
  it.each([
    [
      "2px 4px 8px 1px rgba(0, 0, 0, 0.4)",
      {
        x: "2px",
        y: "4px",
        blur: "8px",
        spread: "1px",
        color: "rgba(0, 0, 0, 0.4)",
        inset: false,
      },
      "2px 4px 8px 1px rgba(0, 0, 0, 0.4)",
    ],
    [
      "inset 0px 2px 4px 0px #000000",
      {
        x: "0px",
        y: "2px",
        blur: "4px",
        spread: "0px",
        color: "#000000",
        inset: true,
      },
      "inset 0px 2px 4px 0px #000000",
    ],
    [
      "0 0 0 3px #fff",
      { x: "0", y: "0", blur: "0", spread: "3px", color: "#fff", inset: false },
      "0px 0px 0px 3px #fff",
    ],
  ])(
    "parses and serializes shadow: %s",
    (input, expectedObj, expectedOutput) => {
      const parsed = parseShadow(input);
      expect(parsed).toEqual(expectedObj);
      expect(parsed ? serializeShadow(parsed) : null).toBe(expectedOutput);
    },
  );

  it("upserts and removes stroke shadows while preserving other shadows", () => {
    const combined = upsertStrokeShadow(
      "2px 4px 8px 0px rgba(0, 0, 0, 0.3)",
      "inside",
      "2px",
      "#ff0000",
    );
    expect(combined).toBe(
      "2px 4px 8px 0px rgba(0, 0, 0, 0.3), inset 0px 0px 0px 2px #ff0000",
    );
    expect(getStrokeShadowAlignment(combined)).toBe("inside");

    const switched = upsertStrokeShadow(combined, "outside", "3px", "#00ff00");
    expect(switched).toBe(
      "2px 4px 8px 0px rgba(0, 0, 0, 0.3), 0px 0px 0px 3px #00ff00",
    );
    expect(getStrokeShadowAlignment(switched)).toBe("outside");

    expect(removeStrokeShadows(combined)).toBe(
      "2px 4px 8px 0px rgba(0, 0, 0, 0.3)",
    );
    expect(removeStrokeShadows("inset 0px 0px 0px 2px #ff0000")).toBeNull();
  });

  it("encodes and decodes hidden blur without losing radius", () => {
    const hidden = serializeBlur({ radius: "8px", hidden: true });
    const parsed = parseBlur(hidden);
    expect(parsed).toEqual({ radius: "8px", hidden: true });
    expect(serializeBlur({ radius: "8px", hidden: false })).toBe("blur(8px)");
  });
});

describe("gradientStyles", () => {
  it.each([
    ["linear-gradient(90deg, #ff0000 0%, #0000ff 100%)", "linear"],
    ["radial-gradient(circle, #ffffff 0%, #000000 100%)", "radial"],
    [
      "linear-gradient(45deg, rgba(255, 0, 0, 0.5) 10%, rgb(0, 0, 255) 90%)",
      "linear",
    ],
  ])("round-trips gradient: %s", (css, type) => {
    const parsed = parseGradient(css);
    expect(parsed?.type).toBe(type);
    expect(parsed ? serializeGradient(parsed) : null).toBe(css);
  });

  it("normalizes direction and stop positions", () => {
    const dir = parseGradient("linear-gradient(to right, #000 0%, #fff 100%)");
    expect(dir?.angle).toBe(90);

    const missingStops = parseGradient("linear-gradient(#000000, #ffffff)");
    expect(missingStops?.stops[0]?.position).toBe(0);
    expect(missingStops?.stops[1]?.position).toBe(100);
  });
});
