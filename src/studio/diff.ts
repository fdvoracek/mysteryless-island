import { formatContent } from "../content";
import type { FileDocument } from "./documents";

export interface DiffLine { kind: "context" | "removed" | "added"; text: string; before?: number; after?: number }
export interface Hunk { lines: DiffLine[] }
const lines = (text: string) => text ? text.replace(/\n$/, "").split("\n") : [];
export function houseFormat(text: string): string {
  try { return formatContent(JSON.parse(text)); } catch { return text; }
}
/** Trim unchanged ends before allocating the LCS matrix; retain two context lines per hunk. */
export function lineDiff(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const a = lines(before), b = lines(after);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const n = a.length - prefix - suffix, m = b.length - prefix - suffix;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    lcs[i][j] = a[prefix + i] === b[prefix + j] ? 1 + lcs[i + 1][j + 1] : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const all: DiffLine[] = [];
  const context = (i: number, j: number) => all.push({ kind: "context", text: a[i], before: i + 1, after: j + 1 });
  for (let i = Math.max(0, prefix - 2); i < prefix; i++) context(i, i);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[prefix + i] === b[prefix + j]) { context(prefix + i++, prefix + j++); }
    else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      all.push({ kind: "removed", text: a[prefix + i], before: prefix + ++i });
    } else { all.push({ kind: "added", text: b[prefix + j], after: prefix + ++j }); }
  }
  for (let k = 0; k < Math.min(2, suffix); k++) context(prefix + n + k, prefix + m + k);
  const hunks: Hunk[] = [];
  let end = -1;
  for (let k = 0; k < all.length; k++) {
    if (all[k].kind === "context") continue;
    const start = Math.max(0, k - 2), nextEnd = Math.min(all.length, k + 3);
    if (start > end) hunks.push({ lines: all.slice(start, nextEnd) });
    else hunks[hunks.length - 1].lines.push(...all.slice(end, nextEnd));
    end = nextEnd;
  }
  return hunks;
}
export function fileDiff(path: string, draft: string | null, disk: FileDocument[], moves: ReadonlyMap<string, string>) {
  const to = draft === null ? moves.get(path) : undefined;
  if (to) return { path, status: "moved", from: undefined, to, hunks: [] as Hunk[], omitted: 0 };
  const from = [...moves].find(([, to]) => to === path)?.[0];
  const original = disk.find(file => file.path === (from ?? path));
  const status = from || moves.has(path) ? "moved" : draft === null ? "deleted" : !original ? "new" : "modified";
  const hunks = lineDiff(houseFormat(original?.content ?? ""), houseFormat(draft ?? ""));
  let remaining = 200;
  const total = hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
  const capped = hunks.flatMap(hunk => {
    const visible = hunk.lines.slice(0, remaining); remaining -= visible.length;
    return visible.length ? [{ lines: visible }] : [];
  });
  return { path, status, from, to, hunks: capped, omitted: Math.max(0, total - 200) };
}
