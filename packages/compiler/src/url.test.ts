import { describe, expect, it } from "vitest";
import { mimeFor, urlToProjectPath } from "./url";

describe("urlToProjectPath", () => {
  it("maps page urls to project relative posix paths", () => {
    expect(urlToProjectPath("/r", "/pages/home.tsx")).toBe("pages/home.tsx");
    expect(urlToProjectPath("/r", "/tokens.css?v=3")).toBe("tokens.css");
    expect(urlToProjectPath("/r", "/assets/logo.png#x")).toBe(
      "assets/logo.png",
    );
  });

  it("rejects traversal and virtual urls", () => {
    expect(urlToProjectPath("/r", "/../etc/passwd")).toBeNull();
    expect(urlToProjectPath("/r", "/pages/../../secret.tsx")).toBeNull();
    expect(urlToProjectPath("/r", "/@vite/client")).toBeNull();
    expect(urlToProjectPath("/r", "/@fs/etc/passwd")).toBeNull();
    expect(
      urlToProjectPath("/r", "/node_modules/.vite/deps/react.js"),
    ).toBeNull();
    expect(urlToProjectPath("/r", "relative.tsx")).toBeNull();
  });

  it("collapses duplicate slashes", () => {
    expect(urlToProjectPath("/r", "//pages//home.tsx")).toBe("pages/home.tsx");
  });
});

describe("mimeFor", () => {
  it("returns javascript for tsx and fonts for woff2", () => {
    expect(mimeFor("pages/home.tsx")).toBe("text/javascript");
    expect(mimeFor("fonts/inter.woff2")).toBe("font/woff2");
    expect(mimeFor("bin")).toBe("application/octet-stream");
  });
});
