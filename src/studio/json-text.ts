import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import type { ContentProblem } from "../content";

export interface TextRange { from: number; to: number }
export interface TextProblem extends TextRange { message: string }

const VALUES = new Set(["Object", "Array", "String", "Number", "True", "False", "Null"]);
const root = (state: EditorState): SyntaxNode | undefined => ensureSyntaxTree(state, state.doc.length, 200)?.topNode;
const valueChildren = (node: SyntaxNode): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (VALUES.has(child.name)) result.push(child);
  return result;
};
const properties = (object: SyntaxNode): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  for (let child = object.firstChild; child; child = child.nextSibling) if (child.name === "Property") result.push(child);
  return result;
};
const keyOf = (state: EditorState, property: SyntaxNode): { node: SyntaxNode; name: string } | undefined => {
  const node = property.getChild("PropertyName");
  if (!node) return undefined;
  try { return { node, name: JSON.parse(state.sliceDoc(node.from, node.to)) as string }; }
  catch { return { node, name: state.sliceDoc(node.from + 1, Math.max(node.from + 1, node.to - 1)) }; }
};
const valueOfProperty = (property: SyntaxNode): SyntaxNode | undefined => valueChildren(property)[0];
const top = (state: EditorState): SyntaxNode | undefined => { const tree = root(state); return tree && valueChildren(tree)[0]; };

/** The first JSON syntax error (as reported by JSON.parse) at its position, or a duplicate key. */
export function syntaxProblems(state: EditorState): TextProblem[] {
  const text = state.doc.toString();
  const length = state.doc.length;
  const clamp = (from: number): TextRange => ({ from: Math.min(from, Math.max(0, length - 1)), to: Math.min(Math.max(from, 0) + 1, length) });
  try { JSON.parse(text); }
  catch (error) {
    const message = (error as Error).message;
    let at: number | undefined;
    const tree = root(state);
    tree?.cursor().iterate((node) => { if (at === undefined && node.type.isError) at = node.from; });
    at ??= Number(/position (\d+)/.exec(message)?.[1] ?? (/end of JSON input/.test(message) ? length : 0));
    return [{ ...clamp(at), message: `Invalid JSON: ${message}` }];
  }
  const problems: TextProblem[] = [];
  const visit = (node: SyntaxNode) => {
    if (node.name === "Object") {
      const seen = new Set<string>();
      for (const property of properties(node)) {
        const key = keyOf(state, property);
        if (key && seen.has(key.name)) problems.push({ from: key.node.from, to: key.node.to, message: `Duplicate key "${key.name}": JSON.parse keeps only the last value` });
        if (key) seen.add(key.name);
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  const value = top(state);
  if (value) visit(value);
  return problems;
}

interface Located { node: SyntaxNode; key?: SyntaxNode; rest: string[] }
function locate(state: EditorState, segments: string[]): Located | undefined {
  const start = top(state);
  if (!start) return undefined;
  let current = start, key: SyntaxNode | undefined, rest = segments;
  while (rest.length) {
    if (current.name === "Object") {
      let matched = false;
      for (const property of properties(current)) {
        const name = keyOf(state, property);
        const value = valueOfProperty(property);
        if (!name || !value) continue;
        for (let take = rest.length; take >= 1 && !matched; take--) {
          if (rest.slice(0, take).join(".") === name.name) { current = value; key = name.node; rest = rest.slice(take); matched = true; }
        }
        if (matched) break;
      }
      if (!matched) break;
    } else if (current.name === "Array") {
      const element = valueChildren(current)[Number(rest[0])];
      if (!element || !/^\d+$/.test(rest[0])) break;
      current = element; rest = rest.slice(1);
    } else break;
  }
  return { node: current, key, rest };
}
const splitPath = (path: string) => path ? path.split(".") : [];

/** Where a registry path lives in the text; the nearest existing ancestor when it is absent. */
export function rangeOfPath(state: EditorState, path: string): TextRange {
  const length = state.doc.length;
  const found = locate(state, splitPath(path));
  if (!found) return { from: 0, to: Math.min(1, length) };
  const scalar = !["Object", "Array"].includes(found.node.name);
  if (!found.rest.length && scalar) return { from: found.node.from, to: found.node.to };
  if (found.key) return { from: found.key.from, to: found.key.to };
  return { from: found.node.from, to: Math.min(found.node.from + 1, length) };
}
/** Offset of the key or element a path names (nearest ancestor when absent). */
export function positionOfPath(state: EditorState, segments: string[]): number | undefined {
  const found = locate(state, segments);
  if (!found) return undefined;
  return found.rest.length || !found.key ? found.node.from : found.key.from;
}

function segmentOf(state: EditorState, node: SyntaxNode): string | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (parent.name === "Property") return keyOf(state, parent)?.name;
  if (parent.name === "Array") return String(valueChildren(parent).findIndex((child) => child.from === node.from));
  return undefined;
}
/** Path segments of the property or element containing `position`. */
export function pathAt(state: EditorState, position: number): string[] {
  const tree = root(state);
  if (!tree) return [];
  const segments: string[] = [];
  for (let node: SyntaxNode | null = tree.resolveInner(position, -1); node; node = node.parent) {
    const segment = node.name === "Property" ? keyOf(state, node)?.name : node.parent?.name === "Array" ? segmentOf(state, node) : undefined;
    if (segment !== undefined && segment !== "-1") segments.unshift(segment);
  }
  return segments;
}

export interface Level { literals: Record<string, unknown>; next?: string }
export interface Cursor {
  kind: "key" | "value"; from: number; to: number; inString: boolean; present: string[];
  /** Ancestor objects, outermost first, with their literal members and the segment descended into. */
  levels: Level[]; path: string[];
}
const literalMembers = (state: EditorState, object: SyntaxNode): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const property of properties(object)) {
    const key = keyOf(state, property), value = valueOfProperty(property);
    if (!key || !value || ["Object", "Array"].includes(value.name)) continue;
    try { result[key.name] = JSON.parse(state.sliceDoc(value.from, value.to)); } catch { /* incomplete literal */ }
  }
  return result;
};

/** What the cursor is completing: a key of an object, or a value of a property or array slot. */
export function cursorAt(state: EditorState, position: number): Cursor | undefined {
  const tree = root(state);
  if (!tree) return undefined;
  const near = tree.resolveInner(position, -1);
  let kind: "key" | "value" | undefined, from = position, to = position, inString = false, scope: SyntaxNode | null = near;
  if (near.name === "PropertyName") { kind = "key"; from = near.from; to = near.to; inString = true; }
  else if (near.name === "String" && position > near.from && position <= near.to) { kind = "value"; from = near.from; to = near.to; inString = true; }
  while (scope && !["Object", "Array", "Property"].includes(scope.name)) scope = scope.parent;
  if (!scope) return undefined;
  if (!kind) {
    if (scope.name === "Property") {
      const colon = scope.getChild(":");
      if (colon && position >= colon.to) kind = "value"; else return undefined;
    } else kind = scope.name === "Object" ? "key" : "value";
  }
  // The container that owns the slot: an object for keys, the property or array for values.
  let owner: SyntaxNode | null = near.name === "PropertyName" ? near.parent?.parent ?? null : scope;
  if (kind === "value" && scope.name === "Property" && near.name !== "PropertyName") owner = scope;
  if (!owner) return undefined;
  const levels: Level[] = [];
  const path: string[] = [];
  const chain: SyntaxNode[] = [];
  for (let node: SyntaxNode | null = owner; node; node = node.parent) chain.unshift(node);
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (node.name === "Object") {
      const child = chain[i + 1];
      const inner = child?.name === "Property" ? child : undefined;
      const segment = inner ? keyOf(state, inner)?.name : undefined;
      levels.push({ literals: literalMembers(state, node), next: segment });
      if (segment !== undefined) path.push(segment);
    } else if (node.name === "Array") {
      const child = chain[i + 1];
      const index = child ? valueChildren(node).findIndex((entry) => entry.from === child.from) : valueChildren(node).filter((entry) => entry.to <= position).length;
      levels.push({ literals: {}, next: String(Math.max(index, 0)) });
      path.push(String(Math.max(index, 0)));
    }
  }
  if (kind === "key") {
    const object = owner.name === "Object" ? owner : undefined;
    return { kind, from, to, inString, present: object ? properties(object).map((p) => keyOf(state, p)?.name ?? "") : [], levels, path };
  }
  return { kind, from, to, inString, present: [], levels, path };
}

/** Registry diagnostics for one file, placed on the line of the field they name. */
export function registryTextProblems(state: EditorState, problems: ContentProblem[]): TextProblem[] {
  return problems.filter((problem) => !(problem.path === "" && problem.message.startsWith("Invalid JSON")))
    .map((problem) => ({ ...rangeOfPath(state, problem.path), message: problem.message }));
}
