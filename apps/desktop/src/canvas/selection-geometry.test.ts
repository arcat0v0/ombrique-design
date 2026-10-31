// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { worldRectFromClientRect } from "./selection-geometry";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe("worldRectFromClientRect", () => {
  it("cancels the shared board transform so only the element delta survives", () => {
    const board = rect(0, 0, 1440, 900);
    const element = rect(100, 50, 200, 100);

    const untransformed = worldRectFromClientRect(
      element,
      { rect: board, origin: { x: 60, y: 0 } },
      1,
    );
    const translated = worldRectFromClientRect(
      rect(element.left + 37, element.top + 21, 200, 100),
      { rect: rect(37, 21, 1440, 900), origin: { x: 60, y: 0 } },
      1,
    );
    const scaled = worldRectFromClientRect(
      rect(element.left * 2.5, element.top * 2.5, 200 * 2.5, 100 * 2.5),
      { rect: rect(0, 0, 1440 * 2.5, 900 * 2.5), origin: { x: 60, y: 0 } },
      2.5,
    );

    expect(untransformed).toEqual({ x: 160, y: 50, width: 200, height: 100 });
    expect(translated).toEqual(untransformed);
    expect(scaled).toEqual(untransformed);
  });

  it("divides by zoom when only the board transform is scaled", () => {
    expect(
      worldRectFromClientRect(
        rect(40, 20, 20, 10),
        { rect: rect(0, 0, 200, 100), origin: { x: 0, y: 0 } },
        2,
      ),
    ).toEqual({ x: 20, y: 10, width: 10, height: 5 });
  });

  it("keeps fractional and negative offsets exact", () => {
    expect(
      worldRectFromClientRect(
        rect(-12.5, 30.25, 50.5, 20.75),
        { rect: rect(10, 10, 1440, 900), origin: { x: 0, y: 0 } },
        1,
      ),
    ).toEqual({ x: -22.5, y: 20.25, width: 50.5, height: 20.75 });
  });

  it("adds the world origin of a second board", () => {
    const board = rect(1500, 0, 1440, 900);
    const element = rect(1520, 10, 300, 120);
    expect(
      worldRectFromClientRect(
        element,
        { rect: board, origin: { x: 1500, y: 0 } },
        1,
      ),
    ).toEqual({ x: 1520, y: 10, width: 300, height: 120 });
    expect(
      worldRectFromClientRect(
        element,
        { rect: board, origin: { x: 0, y: 0 } },
        1,
      ),
    ).toEqual({ x: 20, y: 10, width: 300, height: 120 });
  });

  it("returns zero-size rects for degenerate elements", () => {
    expect(
      worldRectFromClientRect(
        rect(12, 12, 0, 0),
        { rect: rect(0, 0, 1440, 900), origin: { x: 0, y: 0 } },
        2,
      ),
    ).toEqual({ x: 6, y: 6, width: 0, height: 0 });
  });

  it("maps svg and non-HTMLElement rects without a special branch", () => {
    const html = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    html.getBoundingClientRect = () => {
      const value = rect(30, 40, 80, 60);
      return {
        ...value,
        right: 110,
        bottom: 100,
        x: 30,
        y: 40,
        toJSON: () => value,
      };
    };
    svg.getBoundingClientRect = html.getBoundingClientRect;
    const reference = { rect: rect(0, 0, 1440, 900), origin: { x: 60, y: 0 } };

    const fromHtml = worldRectFromClientRect(
      html.getBoundingClientRect(),
      reference,
      1,
    );
    const fromSvg = worldRectFromClientRect(
      svg.getBoundingClientRect(),
      reference,
      1,
    );
    expect(fromSvg).toEqual(fromHtml);
    expect(fromHtml).toEqual({ x: 90, y: 40, width: 80, height: 60 });
  });

  it("round-trips to board-local coordinates for commitMove", () => {
    const board = rect(0, 0, 1440, 900);
    const element = rect(64, 32, 120, 80);
    const zoom = 3;
    const reference = { rect: board, origin: { x: 1500, y: 0 } };
    const transformed = rect(
      element.left * zoom,
      element.top * zoom,
      element.width * zoom,
      element.height * zoom,
    );
    const boardTransformed = rect(
      0,
      0,
      board.width * zoom,
      board.height * zoom,
    );

    const world = worldRectFromClientRect(
      transformed,
      { rect: boardTransformed, origin: reference.origin },
      zoom,
    );
    expect(world).toEqual({ x: 1564, y: 32, width: 120, height: 80 });
    expect(world.x - reference.origin.x).toBe(64);
    expect(zoom * world.x).toBe(4692);
  });
});
