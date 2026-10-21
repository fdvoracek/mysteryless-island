import { describe, expect, it } from "vitest";
import { CHIP_HEIGHT, CHIP_WIDTH, compactTreeLayout, treeConnections, type LayoutNode } from "../src/ui/tree-layout";
import { loadRegistry, startGame } from "./helpers";
import { treeView } from "../src/core/selectors";

function verify(nodes: LayoutNode[], viewport: number, clearConnections = false) {
  const layout = compactTreeLayout(nodes, viewport);
  const placed = new Map(layout.nodes.map((node) => [node.target, node]));
  expect(placed.size).toBe(nodes.length);
  expect(layout.width).toBeGreaterThanOrEqual(viewport);
  const overlaps: string[] = [];
  for (const box of layout.nodes) {
    expect(box.width).toBe(CHIP_WIDTH);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
    expect(box.y + CHIP_HEIGHT).toBeLessThanOrEqual(layout.height);
    for (const other of layout.nodes) if (box.target < other.target) {
      if (!(box.y + CHIP_HEIGHT <= other.y || other.y + CHIP_HEIGHT <= box.y || box.x + box.width <= other.x || other.x + other.width <= box.x)) overlaps.push(`${box.target} / ${other.target}`);
    }
  }
  expect(overlaps, "node overlaps").toEqual([]);
  const groups = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    const key = JSON.stringify([...node.after].sort());
    groups.set(key, [...groups.get(key) ?? [], node]);
    for (const parent of node.after) expect(placed.get(parent)!.y + CHIP_HEIGHT).toBeLessThan(placed.get(node.target)!.y);
  }
  for (const siblings of groups.values()) {
    expect(new Set(siblings.map((node) => placed.get(node.target)!.row)).size).toBe(1);
    const parents = siblings[0].after.map((id) => placed.get(id)!);
    if (!parents.length) continue;
    const midpoint = parents.reduce((sum, node) => sum + node.x + node.width / 2, 0) / parents.length;
    const centres = siblings.map((node) => placed.get(node.target)!.x + CHIP_WIDTH / 2);
    expect((Math.min(...centres) + Math.max(...centres)) / 2).toBeCloseTo(midpoint, 8);
  }
  const connections = treeConnections(nodes, layout.nodes);
  const expected = nodes.flatMap((node) => node.after.map((parent) => `${parent}→${node.target}`)).sort();
  expect(connections.map((edge) => `${edge.parent}→${edge.target}`).sort()).toEqual(expected);
  const intersections: string[] = [];
  for (const connection of connections) {
    const parent = placed.get(connection.parent)!, child = placed.get(connection.target)!;
    expect(connection.points[0]).toEqual({ x: parent.x + CHIP_WIDTH / 2, y: parent.y + CHIP_HEIGHT });
    expect(connection.points.at(-1)).toEqual({ x: child.x + CHIP_WIDTH / 2, y: child.y });
    expect(connection.points).toHaveLength(4); // one shared stem/fork, with no border detour
    for (let index = 1; index < connection.points.length; index++) {
      const a = connection.points[index - 1], b = connection.points[index];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      if (!clearConnections) continue;
      for (const chip of layout.nodes) {
        const intersects = a.x === b.x
          ? a.x > chip.x && a.x < chip.x + chip.width && Math.max(a.y, b.y) > chip.y && Math.min(a.y, b.y) < chip.y + CHIP_HEIGHT
          : a.y > chip.y && a.y < chip.y + CHIP_HEIGHT && Math.max(a.x, b.x) > chip.x && Math.min(a.x, b.x) < chip.x + chip.width;
        if (intersects) intersections.push(`${connection.parent} → ${connection.target} intersects ${chip.target}`);
      }
    }
  }
  expect(intersections, "connector intersections").toEqual([]);
  return layout;
}

describe("shared subtree tree layout", () => {
  it("keeps both trees' sibling rows and chains aligned, independently of viewport width", () => {
    const e = startGame(loadRegistry(), 7);
    for (const kind of ["craft", "build"] as const) {
      const tree = treeView(e, kind);
      const layout = verify(tree.nodes, 320, true);
      const relativePositions = (width: number) => {
        const positions = compactTreeLayout(tree.nodes, width).nodes;
        return positions.map((node) => ({ ...node, x: node.x - positions[0].x }));
      };
      for (const width of [168, 480, 900]) expect(relativePositions(width)).toEqual(relativePositions(320));
      const centre = (target: string) => layout.nodes.find((node) => node.target === target)!.x + CHIP_WIDTH / 2;
      const chains = kind === "craft" ? [["craft_axe", "craft_hoe"]] : [["bed", "shelter"], ["shelter", "rain_barrel"], ["corn_field", "bee_hive"]];
      for (const [parent, child] of chains) expect(centre(child)).toBe(centre(parent));
      for (const node of tree.nodes) expect(node.category).toBe(tree.branches.find((branch) => branch.id === node.branch)!.name);
    }
  });

  it("reserves asymmetric descendant branches but centres sibling NODE roots rather than their combined bounding box", () => {
    const nodes: LayoutNode[] = [
      { target: "root", depth: 0, after: [] },
      ...["left", "middle", "right"].map((target) => ({ target, depth: 1, after: ["root"] })),
      ...Array.from({ length: 7 }, (_, i) => ({ target: `left_${i}`, depth: 2, after: ["left"] })),
      { target: "middle_child", depth: 2, after: ["middle"] },
      { target: "right_child", depth: 2, after: ["right"] },
      ...Array.from({ length: 4 }, (_, i) => ({ target: `right_grandchild_${i}`, depth: 3, after: ["right_child"] })),
    ];
    const layout = verify(nodes, 320, true);
    expect(layout.width).toBeGreaterThan(7 * CHIP_WIDTH);
    const placed = (id: string) => layout.nodes.find((node) => node.target === id)!;
    expect((placed("left").x + placed("right").x) / 2).toBe(placed("root").x);
    expect(placed("middle_child").x).toBe(placed("middle").x);
    expect(placed("left_6").x + CHIP_WIDTH).toBeLessThan(placed("middle_child").x);
  });

  it("lets a 150-node forest grow horizontally and deeply without wrapping siblings or losing edges", () => {
    const nodes: LayoutNode[] = [];
    for (let root = 0; root < 10; root++) {
      nodes.push({ target: `root_${root}`, depth: 0, after: [] });
      for (let child = 0; child < 7; child++) {
        nodes.push({ target: `child_${root}_${child}`, depth: 1, after: [`root_${root}`] });
        nodes.push({ target: `leaf_${root}_${child}`, depth: 2, after: [`child_${root}_${child}`] });
      }
    }
    const layout = verify(nodes, 320, true);
    expect(layout.nodes).toHaveLength(150);
    expect(layout.width).toBeGreaterThan(320 * 10);
    expect(new Set(layout.nodes.filter((node) => node.target.startsWith("root_")).map((node) => node.row)).size).toBe(1);
    expect(layout).toEqual(compactTreeLayout(nodes, 320));
  });

  it("retains all multi-parent edges and centres exact predecessor-set sibling groups on their parents' mean", () => {
    const nodes: LayoutNode[] = [
      { target: "left_root", depth: 0, after: [] }, { target: "right_root", depth: 0, after: [] },
      { target: "left_child", depth: 1, after: ["left_root"] }, { target: "right_child", depth: 1, after: ["right_root"] },
      { target: "merge_a", depth: 2, after: ["left_child", "right_child"] },
      { target: "merge_b", depth: 2, after: ["right_child", "left_child"] },
      { target: "merge_leaf", depth: 3, after: ["merge_a"] },
      { target: "final_join", depth: 4, after: ["merge_leaf", "merge_b", "right_root"] },
    ];
    for (const width of [168, 480]) expect(verify(nodes, width)).toEqual(compactTreeLayout(nodes, width));
  });

  it("supports deterministic 150-node DAGs without node overlaps or silently dropped join edges", () => {
    const nodes: LayoutNode[] = [];
    for (let depth = 0; depth < 15; depth++) for (let column = 0; column < 10; column++) nodes.push({
      target: `node_${depth}_${column}`, depth,
      after: depth ? [`node_${depth - 1}_${column}`, `node_${depth - 1}_${(column + 5) % 10}`] : [],
    });
    const layout = verify(nodes, 320);
    expect(layout).toEqual(compactTreeLayout(nodes, 320));
    expect(layout.height).toBeGreaterThan(1000);
  });

  it("handles an empty graph without a phantom canvas", () => {
    expect(compactTreeLayout([], 320)).toEqual({ width: 320, height: 0, nodes: [] });
  });
});
