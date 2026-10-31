import { describe, expect, it } from "vitest";
import { fitTextureSize } from "./texture-size";

const MAX_DIM = 8192;
const MAX_PIXELS = 16 * 1024 * 1024;

describe("fitTextureSize", () => {
  it("scales by the requested factor when it fits the budget", () => {
    expect(fitTextureSize(1440, 900, 2, MAX_DIM, MAX_PIXELS)).toEqual({
      width: 2880,
      height: 1800,
    });
  });

  it("keeps the requested scale for 1x requests", () => {
    expect(fitTextureSize(1440, 900, 1, MAX_DIM, MAX_PIXELS)).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it("shrinks oversized requests uniformly to the pixel budget", () => {
    const size = fitTextureSize(1440, 900, 8, MAX_DIM, MAX_PIXELS);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS + 20000);
    expect(size.width / size.height).toBeCloseTo(1440 / 900, 2);
  });

  it("clamps to the maximum texture dimension without distorting aspect", () => {
    const size = fitTextureSize(6000, 900, 4, MAX_DIM, MAX_PIXELS);
    expect(size.width).toBeLessThanOrEqual(MAX_DIM);
    expect(size.height).toBeLessThanOrEqual(MAX_DIM);
    expect(size.width / size.height).toBeCloseTo(6000 / 900, 1);
  });

  it("never returns a zero-sized texture", () => {
    expect(fitTextureSize(0, 0, 0, MAX_DIM, MAX_PIXELS)).toEqual({
      width: 1,
      height: 1,
    });
  });
});
