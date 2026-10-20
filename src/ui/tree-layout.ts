/** Subtree space is reserved before placing chips. Sibling node centres, rather than
 * their potentially asymmetric descendant bounds, determine the parent's alignment. */
export interface LayoutNode { target: string; depth: number; after: string[] }
export interface TreePlacement { target: string; x: number; y: number; width: number; row: number }
export const CHIP_WIDTH = 120;
export const CHIP_HEIGHT = 40;
const GAP = 24;
const ROW_GAP = 40;
const PADDING = 12;
interface Branch { left: number; right: number; children: Array<{ target: string; offset: number }> }

/** Pack complete descendant bounds, then centre the first/last sibling NODE roots. */
function siblingOffsets(targets: readonly string[], branches: Map<string, Branch>): Array<{ target: string; offset: number }> {
  let right = 0;
  const offsets = targets.map((target, index) => {
    const branch = branches.get(target)!;
    const offset = index ? right + GAP - branch.left : 0;
    right = offset + branch.right;
    return { target, offset };
  });
  const midpoint = offsets.length ? (offsets[0].offset + offsets[offsets.length - 1].offset) / 2 : 0;
  return offsets.map((entry) => ({ ...entry, offset: entry.offset - midpoint }));
}

export function compactTreeLayout(nodes: readonly LayoutNode[], availableWidth: number): { width: number; height: number; nodes: TreePlacement[] } {
  if (!nodes.length) return { width: Math.max(0, availableWidth), height: 0, nodes: [] };
  const children = new Map<string, string[]>();
  for (const node of nodes) if (node.after.length === 1) children.set(node.after[0], [...children.get(node.after[0]) ?? [], node.target]);
  const branches = new Map<string, Branch>();
  const measure = (target: string): Branch => {
    const existing = branches.get(target); if (existing) return existing;
    const descendants = children.get(target) ?? [];
    descendants.forEach(measure);
    const offsets = siblingOffsets(descendants, branches);
    const branch = {
      left: Math.min(-CHIP_WIDTH / 2, ...offsets.map((entry) => entry.offset + branches.get(entry.target)!.left)),
      right: Math.max(CHIP_WIDTH / 2, ...offsets.map((entry) => entry.offset + branches.get(entry.target)!.right)),
      children: offsets,
    };
    branches.set(target, branch); return branch;
  };
  nodes.forEach((node) => measure(node.target));
  const placed = new Map<string, TreePlacement>();
  let rowCount = 0;
  const place = (target: string, centre: number, row: number) => {
    placed.set(target, { target, x: centre - CHIP_WIDTH / 2, y: PADDING + row * (CHIP_HEIGHT + ROW_GAP), width: CHIP_WIDTH, row });
    rowCount = Math.max(rowCount, row + 1);
    for (const child of branches.get(target)!.children) place(child.target, centre + child.offset, row + 1);
  };
  // Ordinary forests get tidy, fully reserved branches and one row for every sibling set.
  const roots = nodes.filter((node) => !node.after.length).map((node) => node.target);
  for (const root of siblingOffsets(roots, branches)) place(root.target, root.offset, 0);

  // Shared descendants have more than one owner. Keep each exact parent-set group together,
  // centred on its parents' mean, below existing components so node bounds never overlap.
  // All edges remain; general DAG forks can cross, without inventing obstacle detours.
  const joins = new Map<string, LayoutNode[]>();
  for (const node of [...nodes].sort((a, b) => a.depth - b.depth)) if (node.after.length > 1) {
    const key = JSON.stringify([...node.after].sort());
    joins.set(key, [...joins.get(key) ?? [], node]);
  }
  for (const group of joins.values()) {
    const centre = group[0].after.reduce((sum, parent) => {
      const placement = placed.get(parent)!;
      return sum + placement.x + placement.width / 2;
    }, 0) / group[0].after.length;
    const row = rowCount;
    for (const sibling of siblingOffsets(group.map((node) => node.target), branches)) place(sibling.target, centre + sibling.offset, row);
  }
  const values = [...placed.values()];
  const left = Math.min(...values.map((node) => node.x)), right = Math.max(...values.map((node) => node.x + node.width));
  const width = Math.max(availableWidth, right - left + PADDING * 2);
  const shift = (width - (right - left)) / 2 - left;
  values.forEach((node) => { node.x += shift; });
  return { width, height: PADDING * 2 + rowCount * CHIP_HEIGHT + (rowCount - 1) * ROW_GAP, nodes: values };
}

export interface TreePoint { x: number; y: number }
export interface TreeConnection {
  parent: string; target: string; points: TreePoint[]; path: string;
}
/** Per-edge paths share the same stem and horizontal fork for a parent's child row. */
export function treeConnections(nodes: readonly LayoutNode[], placements: readonly TreePlacement[]): TreeConnection[] {
  const placed = new Map(placements.map((node) => [node.target, node]));
  return nodes.flatMap((node) => node.after.map((parent) => {
    const from = placed.get(parent)!, to = placed.get(node.target)!;
    const start = { x: from.x + from.width / 2, y: from.y + CHIP_HEIGHT };
    const end = { x: to.x + to.width / 2, y: to.y };
    const fork = start.y + ROW_GAP / 2;
    const points = [start, { x: start.x, y: fork }, { x: end.x, y: fork }, end];
    return { parent, target: node.target, points,
      path: points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") };
  }));
}
