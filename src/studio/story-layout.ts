import dagre from "@dagrejs/dagre";
import type { Graph, GraphNode } from "./story";

export type Direction = "LR" | "TB";
export type Spacing = "compact" | "normal" | "wide";
export interface StoryOptions { direction: Direction; spacing: Spacing; group: boolean; allReferences: boolean; depth: 1 | 2 }
export const defaultOptions: StoryOptions = { direction: "LR", spacing: "normal", group: false, allReferences: false, depth: 1 };
export interface Point { x: number; y: number }
export interface GroupBox { id: string; label: string; x: number; y: number; width: number; height: number }
export interface Arrangement { positions: Map<string, Point>; groups: GroupBox[] }
export const NODE_WIDTH = 240, NODE_HEIGHT = 92;
const GROUP_PAD = 24, GROUP_HEADER = 34;
const gaps: Record<Spacing, { rank: number; node: number }> = { compact: { rank: 90, node: 24 }, normal: { rank: 170, node: 45 }, wide: { rank: 260, node: 80 } };

/** Nodes within `depth` hops of `id`, following edges in both directions. */
export function neighbourhood(graph: Graph, id: string, depth: number): Set<string> {
  const reached = new Set([id]);
  let frontier = [id];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const edge of graph.edges) for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (frontier.includes(from) && !reached.has(to)) { reached.add(to); next.push(to); }
    }
    frontier = next;
  }
  return reached;
}

/** Name or ID match, exact ID first, then prefix, then substring; ties keep graph order. */
export function searchNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (node: GraphNode) => {
    const id = node.id.slice(node.id.indexOf(":") + 1).toLowerCase(), label = node.label.toLowerCase();
    if (id === q || node.id.toLowerCase() === q) return 0;
    if (id.startsWith(q)) return 1;
    return id.includes(q) || label.includes(q) ? 2 : 3;
  };
  return nodes.map((node, index) => ({ node, index, rank: rank(node) })).filter(r => r.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(r => r.node);
}

interface Box { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box, margin: number) => a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;

/** Plain dagre run over sizes; returns top-left corners. */
function dagreLayout(items: { id: string; width: number; height: number }[], edges: [string, string][], direction: Direction, spacing: Spacing) {
  const layout = new dagre.graphlib.Graph().setGraph({ rankdir: direction, ranksep: gaps[spacing].rank, nodesep: gaps[spacing].node }).setDefaultEdgeLabel(() => ({}));
  for (const item of items) layout.setNode(item.id, { width: item.width, height: item.height });
  const ids = new Set(items.map(i => i.id));
  for (const [source, target] of edges) if (source !== target && ids.has(source) && ids.has(target)) layout.setEdge(source, target);
  dagre.layout(layout);
  return new Map(items.map(item => { const p = layout.node(item.id); return [item.id, { x: p.x - item.width / 2, y: p.y - item.height / 2 }] as const; }));
}

/** First area by sorted ID; flags and nodes without a connected area stay ungrouped. */
export const groupOf = (node: GraphNode) => [...(node.areas ?? [])].sort()[0];

/**
 * Pure and deterministic. Dagre positions every node from the visible edges; pinned nodes then take their
 * saved position and every unpinned node is nudged along the cross axis until it clears the nodes placed before it.
 */
export function arrange(graph: Graph, options: Pick<StoryOptions, "direction" | "spacing" | "group">, pins: Record<string, Point>, labels: (area: string) => string = area => area): Arrangement {
  const { direction, spacing } = options;
  const edges = graph.edges.map(e => [e.source, e.target] as [string, string]);
  const positions = new Map<string, Point>();
  const memberOf = new Map<string, string>();
  if (options.group) for (const node of graph.nodes) { const area = groupOf(node); if (area) memberOf.set(node.id, area); }
  if (!memberOf.size) {
    for (const [id, p] of dagreLayout(graph.nodes.map(n => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })), edges, direction, spacing)) positions.set(id, p);
  } else {
    // Stage 1: each area on its own. Stage 2: area boxes and ungrouped nodes, joined by the edges between them.
    const areas = [...new Set(memberOf.values())].sort();
    const local = new Map<string, { size: { width: number; height: number }; offsets: Map<string, Point> }>();
    for (const area of areas) {
      const ids = graph.nodes.filter(n => memberOf.get(n.id) === area).map(n => n.id), set = new Set(ids);
      const placed = dagreLayout(ids.map(id => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })), edges.filter(([s, t]) => set.has(s) && set.has(t)), direction, spacing);
      const xs = [...placed.values()].map(p => p.x), ys = [...placed.values()].map(p => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      local.set(area, {
        size: { width: Math.max(...xs) - minX + NODE_WIDTH + 2 * GROUP_PAD, height: Math.max(...ys) - minY + NODE_HEIGHT + 2 * GROUP_PAD + GROUP_HEADER },
        offsets: new Map([...placed].map(([id, p]) => [id, { x: p.x - minX + GROUP_PAD, y: p.y - minY + GROUP_PAD + GROUP_HEADER }])),
      });
    }
    const owner = (id: string) => memberOf.has(id) ? `group:${memberOf.get(id)}` : id;
    const top = dagreLayout([
      ...areas.map(area => ({ id: `group:${area}`, ...local.get(area)!.size })),
      ...graph.nodes.filter(n => !memberOf.has(n.id)).map(n => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    ], [...new Map(edges.map(([s, t]) => [`${owner(s)}>${owner(t)}`, [owner(s), owner(t)] as [string, string]])).values()], direction, spacing);
    for (const node of graph.nodes) {
      const area = memberOf.get(node.id);
      if (!area) { positions.set(node.id, top.get(node.id)!); continue; }
      const origin = top.get(`group:${area}`)!, offset = local.get(area)!.offsets.get(node.id)!;
      positions.set(node.id, { x: origin.x + offset.x, y: origin.y + offset.y });
    }
  }
  // Pins win; unpinned nodes keep clear of everything already placed.
  const placed: Box[] = [];
  for (const node of graph.nodes) { const pin = pins[node.id]; if (pin) { positions.set(node.id, { x: pin.x, y: pin.y }); placed.push({ ...pin, width: NODE_WIDTH, height: NODE_HEIGHT }); } }
  const cross = direction === "LR" ? "y" : "x", step = (direction === "LR" ? NODE_HEIGHT : NODE_WIDTH) / 2 + gaps[spacing].node / 2;
  const free = graph.nodes.filter(n => !pins[n.id]).sort((a, b) => {
    const pa = positions.get(a.id)!, pb = positions.get(b.id)!;
    return direction === "LR" ? pa.x - pb.x || pa.y - pb.y || a.id.localeCompare(b.id) : pa.y - pb.y || pa.x - pb.x || a.id.localeCompare(b.id);
  });
  for (const node of free) {
    const base = positions.get(node.id)!;
    let chosen = base;
    for (let attempt = 0; attempt < 400; attempt++) {
      const shift = Math.ceil(attempt / 2) * step * (attempt % 2 ? 1 : -1);
      const candidate = { ...base, [cross]: base[cross] + shift } as Point;
      if (!placed.some(box => overlaps({ ...candidate, width: NODE_WIDTH, height: NODE_HEIGHT }, box, 8))) { chosen = candidate; break; }
    }
    positions.set(node.id, chosen);
    placed.push({ ...chosen, width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const groups: GroupBox[] = [];
  for (const area of new Set(memberOf.values())) {
    const members = graph.nodes.filter(n => memberOf.get(n.id) === area).map(n => positions.get(n.id)!);
    const x = Math.min(...members.map(p => p.x)) - GROUP_PAD, y = Math.min(...members.map(p => p.y)) - GROUP_PAD - GROUP_HEADER;
    groups.push({ id: `group:${area}`, label: labels(area), x, y, width: Math.max(...members.map(p => p.x)) + NODE_WIDTH + GROUP_PAD - x, height: Math.max(...members.map(p => p.y)) + NODE_HEIGHT + GROUP_PAD - y });
  }
  groups.sort((a, b) => a.id.localeCompare(b.id));
  return { positions, groups };
}
