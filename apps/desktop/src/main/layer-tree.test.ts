import { describe, expect, it } from "vitest";
import { parseDesignFile } from "@ombrique/source";
import { toLayer } from "./layer-tree";

function requireRoot(file: ReturnType<typeof parseDesignFile>) {
  const root = file.root;
  if (!root) throw new Error("missing root");
  return root;
}

describe("toLayer name fallback", () => {
  it("prefers data-name attribute if present", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Text } from "@ombrique/runtime";
export default function P() {
  return <Text data-name="CustomName">Hello world</Text>;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.name).toBe("CustomName");
  });

  it("uses name prop if data-name is missing", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Frame } from "@ombrique/runtime";
export default function P() {
  return <Frame name="NamedFrame" width={100} height={100}></Frame>;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.name).toBe("NamedFrame");
  });

  it("falls back to text content for Text elements without name attributes", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Text } from "@ombrique/runtime";
export default function P() {
  return <Text>Sign in to your account</Text>;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.name).toBe("Sign in to your account");
  });

  it("truncates long text content to 24 chars with ellipsis", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Text } from "@ombrique/runtime";
export default function P() {
  return <Text>This is an extraordinarily long text layer title</Text>;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.name).toBe("This is an extraordinari…");
  });

  it("classifies <Group> runtime tags and display:contents divs as group kind", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Frame, Group } from "@ombrique/runtime";
export default function P() {
  return (
    <Frame name="F" width={100} height={100}>
      <Group name="A"><div data-name="Inner" /></Group>
      <div data-name="B" style={{ display: "contents" }}><span>t</span></div>
    </Frame>
  );
}`,
    );
    expect(file.root).not.toBeNull();
    const frameLayer = toLayer(requireRoot(file));
    const children = frameLayer.children as Array<{ kind: string }>;
    expect(children[0]?.kind).toBe("group");
    expect(children[1]?.kind).toBe("group");
  });

  it("falls back to tag name when text is empty", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Rect } from "@ombrique/runtime";
export default function P() {
  return <Rect width={50} height={50} />;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.name).toBe("rect");
  });

  it("assigns kind='component' to component elements", () => {
    const file = parseDesignFile(
      "pages/test.tsx",
      `import { Card } from "../components/Card";
export default function P() {
  return <Card />;
}`,
    );
    expect(file.root).not.toBeNull();
    const layer = toLayer(requireRoot(file));
    expect(layer.kind).toBe("component");
  });
});
