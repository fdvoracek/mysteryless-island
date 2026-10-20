import type { Registry } from "../content/registry";
import type { TreeKind } from "../content/schema";
import type { GameState } from "./state";

export function initialTechnology(reg: Registry): GameState["technology"] {
  const technology: GameState["technology"] = { craft: { completed: [], unlocked: [] }, build: { completed: [], unlocked: [] } };
  reconcileTechnology(reg, technology);
  return technology;
}

/** Preserve permission history when authors edit edges; never infer completion from possessions. */
export function reconcileTechnology(reg: Registry, technology: GameState["technology"]): void {
  for (const kind of ["craft", "build"] as const) {
    const tree = reg.trees.get(kind)!;
    const progress = technology[kind];
    progress.completed = [...new Set(progress.completed.filter((id) => tree.nodes.has(id)))];
    progress.unlocked = [...new Set([...progress.unlocked.filter((id) => tree.nodes.has(id)), ...progress.completed])];
    for (const node of tree.nodes.values()) {
      if (node.after.every((id) => progress.completed.includes(id)) && !progress.unlocked.includes(node.target)) progress.unlocked.push(node.target);
    }
  }
}

export function completeTechnology(reg: Registry, state: GameState, kind: TreeKind, target: string): void {
  if (!state.technology[kind].completed.includes(target)) state.technology[kind].completed.push(target);
  reconcileTechnology(reg, state.technology);
}

export function technologyReason(reg: Registry, state: GameState, kind: TreeKind, target: string): string | undefined {
  const node = reg.trees.get(kind)?.nodes.get(target);
  if (!node) return "unknown creation";
  if (state.technology[kind].unlocked.includes(target)) return undefined;
  const names = node.after.filter((id) => !state.technology[kind].completed.includes(id)).map((id) => {
    if (kind === "build") return reg.buildings.get(id)!.name;
    const r = reg.recipes.get(id)!;
    return r.label ?? reg.items.get(r.item)!.name;
  });
  return `first ${kind === "craft" ? "craft" : "build"} ${names.join(" and ")}`;
}
