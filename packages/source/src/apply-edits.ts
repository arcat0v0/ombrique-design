import type { TextEdit } from "./types.js";

export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) {
      throw new Error(`overlapping edits near offset ${edit.start}`);
    }
    if (edit.end < edit.start || edit.end > text.length) {
      throw new Error(
        `edit out of bounds: [${edit.start}, ${edit.end}) for text of length ${text.length}`,
      );
    }
    out += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  out += text.slice(cursor);
  return out;
}
