import { describe, expect, it } from "vitest";
import { CHIP_HEIGHT, compactTreeLayout, routeTreeEdges, type LayoutNode } from "../src/ui/tree-layout";
import { loadRegistry, startGame } from "./helpers";
import { treeView } from "../src/core/selectors";

function verify(nodes: LayoutNode[], width: number) {
  const layout = compactTreeLayout(nodes, width);
  const placed = new Map(layout.nodes.map((node) => [node.target, node]));
  expect(placed.size).toBe(nodes.length);
  expect(layout.columns).toBeLessThanOrEqual(3);
  for (const node of nodes) {
    const box = placed.get(node.target)!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1e-9);
    expect(box.y + CHIP_HEIGHT).toBeLessThanOrEqual(layout.height);
    for (const parent of node.after) expect(placed.get(parent)!.y + CHIP_HEIGHT).toBeLessThan(box.y);
    for (const other of layout.nodes) {
      if (other.target === box.target) continue;
      expect(box.y + CHIP_HEIGHT <= other.y || other.y + CHIP_HEIGHT <= box.y || box.x + box.width <= other.x || other.x + other.width <= box.x).toBe(true);
    }
  }
  return layout;
}

describe("compact shared tree layout", () => {
  it.each([[120, 1], [250, 1], [320, 2], [480, 3], [900, 3]])("wraps a wide generation at %spx while keeping every parent above its children", (width, columns) => {
    const roots: LayoutNode[] = Array.from({ length: 7 }, (_, i) => ({ target: `root_${i}`, depth: 0, after: [] }));
    const children: LayoutNode[] = Array.from({ length: 17 }, (_, i) => ({ target: `child_${i}`, depth: 1, after: [roots[i % roots.length].target] }));
    const nodes = [...roots, ...children, { target: "merge", depth: 2, after: children.map((node) => node.target) }];
    const layout = verify(nodes, width);
    expect(layout.columns).toBe(columns);
  });
  it("lays out 150 nodes with multiple roots, deep generations and multiple parents deterministically", () => {
    const nodes: LayoutNode[] = [];
    for (let i = 0; i < 150; i++) nodes.push({ target: `node_${i}`, depth: Math.floor(i / 10), after: i < 10 ? [] : [`node_${i - 10}`, `node_${Math.floor(i / 10) * 10 - 1}`].filter((id, index, ids) => ids.indexOf(id) === index) });
    for (const width of [168, 320, 480]) {
      expect(verify(nodes, width)).toEqual(compactTreeLayout(nodes, width));
    }
  });
  it("uses authored category names in both trees' node metadata without using categories as placement lanes", () => {
    const reg = loadRegistry(), e = startGame(reg, 7);
    for (const kind of ["craft", "build"] as const) {
      const tree = treeView(e, kind);
      for (const node of tree.nodes) expect(node.category).toBe(tree.branches.find((branch) => branch.id === node.branch)!.name);
      verify(tree.nodes, 320);
    }
  });
  it("handles an empty graph without a phantom scrolling canvas", () => {
    expect(compactTreeLayout([], 320)).toMatchObject({ height: 0, nodes: [] });
  });
});

/** Open interiors exclude shared border endpoints: touching your own chip is expected. */
function expectClearRoutes(nodes: LayoutNode[], width: number) {
  const layout = compactTreeLayout(nodes, width);
  const routes = routeTreeEdges(nodes, layout.nodes, width);
  expect(routes).toHaveLength(nodes.reduce((sum, node) => sum + node.after.length, 0));
  for (const route of routes) {
    const start = layout.nodes.find((node) => node.target === route.parent)!;
    const end = layout.nodes.find((node) => node.target === route.target)!;
    expect(route.points[0]).toEqual({ x: start.x + start.width / 2, y: start.y + CHIP_HEIGHT });
    expect(route.points.at(-1)).toEqual({ x: end.x + end.width / 2, y: end.y });
    if (route.kind === "curve") {
      expect(end.row - start.row).toBe(1); // its entire curve stays in the empty inter-row gap
      continue;
    }
    for (let index = 1; index < route.points.length; index++) {
      const a = route.points[index - 1], b = route.points[index];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      for (const chip of layout.nodes) {
        const intersects = a.x === b.x
          ? a.x > chip.x && a.x < chip.x + chip.width && Math.max(a.y, b.y) > chip.y && Math.min(a.y, b.y) < chip.y + CHIP_HEIGHT
          : a.y > chip.y && a.y < chip.y + CHIP_HEIGHT && Math.max(a.x, b.x) > chip.x && Math.min(a.x, b.x) < chip.x + chip.width;
        expect(intersects, `${route.parent} → ${route.target} intersects ${chip.target}`).toBe(false);
      }
    }
  }
  return routes;
}

describe("wrapped tree connections", () => {
  it.each([250, 320, 480])("keeps the real campfire-to-corn-field edge clear of fish traps at %spx", (width) => {
    const e = startGame(loadRegistry(), 7);
    const nodes = treeView(e, "build").nodes;
    const routes = expectClearRoutes(nodes, width);
    expect(routes.find((edge) => edge.parent === "campfire" && edge.target === "corn_field")!.kind).toBe("gutter");
    expect(routes.some((edge) => edge.kind === "curve")).toBe(true);
  });
  it("routes wrapped generations and multiple parents around every unrelated chip in a 150-node graph", () => {
    const nodes: LayoutNode[] = [];
    for (let depth = 0; depth < 15; depth++) for (let column = 0; column < 10; column++) {
      nodes.push({ target: `node_${depth}_${column}`, depth,
        after: depth ? [`node_${depth - 1}_${column}`, `node_${depth - 1}_${(column + 5) % 10}`] : [] });
    }
    for (const width of [168, 320, 480]) expect(expectClearRoutes(nodes, width).some((edge) => edge.kind === "gutter")).toBe(true);
  });
});
