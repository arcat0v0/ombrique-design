import { editCommandSchema } from "@ombrique/protocol";
import * as runtime from "@ombrique/runtime";
import { describe, expect, it } from "vitest";
import { DIALECT_DOC } from "./dialect";

function documentedNames(heading: string): string[] {
  const lines = DIALECT_DOC.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (start < 0) return [];
  const names: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ")) names.push(line.slice(2).trim());
  }
  return names;
}

describe("dialect documentation drift", () => {
  it("lists every runtime export", () => {
    const documented = documentedNames("Runtime primitives").sort();
    const actual = Object.keys(runtime).sort();
    expect(documented).toEqual(actual);
  });

  it("lists every edit command", () => {
    const documented = documentedNames("Edit commands").sort();
    const actual = editCommandSchema.options
      .map((option) => option.shape.kind.value)
      .sort();
    expect(documented).toEqual(actual);
    expect(actual).toHaveLength(22);
  });
});
