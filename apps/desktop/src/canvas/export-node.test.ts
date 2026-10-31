// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { serializeNodeToSvg } from "./export-node";

describe("serializeNodeToSvg", () => {
  it("serializes an SVG element directly with inlined dimensions", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 0 0 L 100 100");
    svg.appendChild(path);

    Object.defineProperty(svg, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });

    const result = serializeNodeToSvg(svg);
    expect(result).toContain("<svg");
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('viewBox="0 0 100 100"');
    expect(result).toContain("M 0 0 L 100 100");
  });

  it("serializes an ellipse primitive as native SVG ellipse", () => {
    const div = document.createElement("div");
    div.style.borderRadius = "50%";
    div.style.background = "#ff0000";
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 80, height: 60 }),
    });

    const result = serializeNodeToSvg(div);
    expect(result).toContain("<ellipse");
    expect(result).toContain('cx="40"');
    expect(result).toContain('cy="30"');
    expect(result).toContain('rx="40"');
    expect(result).toContain('ry="30"');
  });

  it("serializes a rect primitive as native SVG rect", () => {
    const div = document.createElement("div");
    div.style.background = "#0000ff";
    div.style.borderRadius = "8px";
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 120, height: 40 }),
    });

    const result = serializeNodeToSvg(div);
    expect(result).toContain("<rect");
    expect(result).toContain('width="120"');
    expect(result).toContain('height="40"');
    expect(result).toContain('rx="8"');
  });

  it("serializes generic HTML content using foreignObject with stripped data-* attributes", () => {
    const section = document.createElement("section");
    section.setAttribute("data-name", "Card");
    section.setAttribute("data-ombrique-id", "123");
    section.setAttribute("data-export", "1x:png");
    const h1 = document.createElement("h1");
    h1.textContent = "Hello Ombrique";
    section.appendChild(h1);

    Object.defineProperty(section, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 200 }),
    });

    const result = serializeNodeToSvg(section);
    expect(result).toContain("<foreignObject");
    expect(result).toContain("Hello Ombrique");
    expect(result).not.toContain("data-ombrique-id");
    expect(result).not.toContain("data-export");
  });
});
