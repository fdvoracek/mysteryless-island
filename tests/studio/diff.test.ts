import { expect, it } from "vitest";
import { fileDiff, houseFormat, lineDiff } from "../../src/studio/diff";
import type { FileDocument } from "../../src/studio/documents";

const disk: FileDocument[] = [{ path: "old.json", content: '{"a":1}', hash: "old", encoding: "utf8" }];
it("formats both sides and has no hunks for identical content or formatting-only changes", () => {
  expect(lineDiff("same", "same")).toEqual([]);
  expect(fileDiff("old.json", '{\n  "a": 1\n}', disk, new Map()).hunks).toEqual([]);
  expect(houseFormat("{broken")).toBe("{broken");
});
it("reports modified, new, deleted and both move sides, comparing destination with source disk", () => {
  expect(fileDiff("old.json", '{"a":2}', disk, new Map()).status).toBe("modified");
  const added = fileDiff("new.json", '{"a":1}', disk, new Map());
  expect(added.status).toBe("new");
  expect(added.hunks[0].lines.every(line => line.kind === "added")).toBe(true);
  const deleted = fileDiff("old.json", null, disk, new Map());
  expect(deleted.status).toBe("deleted");
  expect(deleted.hunks[0].lines.every(line => line.kind === "removed")).toBe(true);
  const moves = new Map([["old.json", "new.json"]]);
  expect(fileDiff("old.json", null, disk, moves)).toMatchObject({
    status: "moved", to: "new.json", hunks: [], omitted: 0,
  });
  const moved = fileDiff("new.json", '{"a":2}', disk, moves);
  expect(moved).toMatchObject({ status: "moved", from: "old.json" });
  expect(moved.hunks[0].lines).toEqual([
    { kind: "removed", before: 1, text: '{ "a": 1 }' }, { kind: "added", after: 1, text: '{ "a": 2 }' },
  ]);
});
it("retains two lines of context and accurate numbers, separates distant hunks and merges touching context", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const after = [...before]; after[3] = "changed 4"; after[15] = "changed 16";
  const hunks = lineDiff(before.join("\n"), after.join("\n"));
  expect(hunks).toHaveLength(2);
  expect(hunks[0].lines).toEqual([
    { kind: "context", text: "line 2", before: 2, after: 2 },
    { kind: "context", text: "line 3", before: 3, after: 3 },
    { kind: "removed", text: "line 4", before: 4 },
    { kind: "added", text: "changed 4", after: 4 },
    { kind: "context", text: "line 5", before: 5, after: 5 },
    { kind: "context", text: "line 6", before: 6, after: 6 },
  ]);
  after[7] = "changed 8";
  expect(lineDiff(before.join("\n"), after.join("\n"))).toHaveLength(2);
  expect(lineDiff("a\nb\nc", "a\ninsert\nb\nc")[0].lines.at(-1)).toEqual({ kind: "context", text: "c", before: 3, after: 4 });
});
it("caps a file at 200 rendered lines with an exact omitted count", () => {
  const diff = fileDiff("new.json", Array.from({ length: 250 }, (_, i) => `raw ${i}`).join("\n"), [], new Map());
  expect(diff.hunks.flatMap(hunk => hunk.lines)).toHaveLength(200);
  expect(diff.omitted).toBe(50);
});
it("diffs a one-line edit in 3,000 lines well under 100 ms", () => {
  const before = Array.from({ length: 3000 }, (_, i) => `unique line ${i}`);
  const after = [...before]; after[1500] = "replacement";
  const start = performance.now();
  const hunks = lineDiff(before.join("\n"), after.join("\n"));
  expect(performance.now() - start).toBeLessThan(50);
  expect(hunks).toHaveLength(1);
  expect(hunks[0].lines).toHaveLength(6);
});
