/** Compact vertical DAG placement. A whole depth finishes before the next depth starts,
 * so wrapped generations and multiple parents always keep every parent above its child. */
export interface LayoutNode { target: string; depth: number; after: string[] }
export interface TreePlacement { target: string; x: number; y: number; width: number; row: number }
export const CHIP_HEIGHT = 46;
const GAP = 12;
const ROW_GAP = 34;
const PADDING = 8;
export function compactTreeLayout(nodes: readonly LayoutNode[], availableWidth: number): { columns: number; height: number; nodes: TreePlacement[] } {
  const width = Math.max(0, availableWidth - PADDING * 2);
  const columns = Math.max(1, Math.min(3, Math.floor((width + GAP) / (124 + GAP))));
  const chipWidth = Math.min(150, Math.max(0, (width - GAP * (columns - 1)) / columns));
  const generations = new Map<number, LayoutNode[]>();
  for (const node of nodes) generations.set(node.depth, [...generations.get(node.depth) ?? [], node]);
  const placed = new Map<string, TreePlacement>();
  const rows = new Map<number, TreePlacement[]>();
  let rowCount = 0;
  for (const depth of [...generations.keys()].sort((a, b) => a - b)) {
    const groups = new Map<string, LayoutNode[]>();
    for (const node of generations.get(depth)!) {
      const parents = JSON.stringify([...node.after].sort());
      groups.set(parents, [...groups.get(parents) ?? [], node]);
    }
    const centre = (group: LayoutNode[]) => {
      const parents = group[0].after.map((id) => placed.get(id)).filter((parent): parent is TreePlacement => !!parent);
      return parents.length ? parents.reduce((sum, parent) => sum + parent.x + parent.width / 2, 0) / parents.length : availableWidth / 2;
    };
    // Finish the preceding generation before placing any descendants. Within a generation,
    // separate parent-set groups can share a row only when their anchored chips fit.
    const firstRow = rowCount;
    for (const group of [...groups.values()].sort((a, b) => centre(a) - centre(b))) {
      const midpoint = centre(group);
      const room = Math.max(0, Math.min(midpoint - PADDING, availableWidth - PADDING - midpoint));
      const perRow = Math.max(1, Math.min(columns, Math.floor((room * 2 + GAP + 1e-9) / (chipWidth + GAP))));
      let row = firstRow;
      for (let start = 0; start < group.length; start += perRow) {
        const chunk = group.slice(start, start + perRow);
        const left = midpoint - (chunk.length * chipWidth + (chunk.length - 1) * GAP) / 2;
        const candidates = chunk.map((node, column) => ({ target: node.target, x: left + column * (chipWidth + GAP), width: chipWidth }));
        while ((rows.get(row)?.length ?? 0) + candidates.length > columns || candidates.some((candidate) =>
          rows.get(row)?.some((other) => candidate.x < other.x + other.width + GAP - 1e-9 && other.x < candidate.x + candidate.width + GAP - 1e-9))) row++;
        for (const candidate of candidates) {
          const placement = { ...candidate, y: PADDING + row * (CHIP_HEIGHT + ROW_GAP), row };
          placed.set(placement.target, placement);
          rows.set(row, [...rows.get(row) ?? [], placement]);
        }
        rowCount = Math.max(rowCount, row + 1);
        row++;
      }
    }
  }
  return { columns, height: rowCount ? PADDING * 2 + rowCount * CHIP_HEIGHT + (rowCount - 1) * ROW_GAP : 0, nodes: [...placed.values()] };
}

export interface TreePoint { x: number; y: number }
export interface TreeEdgeRoute {
  parent: string; target: string; kind: "curve" | "gutter"; points: TreePoint[]; path: string;
}
/** Long edges use the padding gutter, with turns only in the empty gaps between rows.
 * This prevents a wrapped sibling from appearing to be an intermediate prerequisite. */
export function routeTreeEdges(nodes: readonly LayoutNode[], placements: readonly TreePlacement[], width: number): TreeEdgeRoute[] {
  const placed = new Map(placements.map((node) => [node.target, node]));
  const edges: TreeEdgeRoute[] = [];
  for (const node of nodes) {
    const to = placed.get(node.target);
    if (!to) continue;
    for (const parent of node.after) {
      const from = placed.get(parent);
      if (!from) continue;
      const start = { x: from.x + from.width / 2, y: from.y + CHIP_HEIGHT };
      const end = { x: to.x + to.width / 2, y: to.y };
      if (to.row - from.row <= 1) {
        const middle = (start.y + end.y) / 2;
        edges.push({ parent, target: node.target, kind: "curve", points: [start, end],
          path: `M ${start.x} ${start.y} C ${start.x} ${middle}, ${end.x} ${middle}, ${end.x} ${end.y}` });
      } else {
        const rail = (start.x + end.x) / 2 < width / 2 ? PADDING / 2 : width - PADDING / 2;
        const points = [start, { x: start.x, y: start.y + ROW_GAP / 2 },
          { x: rail, y: start.y + ROW_GAP / 2 }, { x: rail, y: end.y - ROW_GAP / 2 },
          { x: end.x, y: end.y - ROW_GAP / 2 }, end];
        edges.push({ parent, target: node.target, kind: "gutter", points,
          path: points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") });
      }
    }
  }
  return edges;
}
