import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import type { Building, CreationTree, Recipe, Region } from "../src/content/schema";
import { readContentFiles } from "./helpers";

type Files = ReturnType<typeof readContentFiles>;
const craftTree = (f: Files) => f["content/trees/crafting.json"] as CreationTree;
const recipes = (f: Files) => Object.entries(f).filter(([p]) => p.startsWith("content/recipes/")).map(([, v]) => v) as Recipe[];
const buildings = (f: Files) => Object.entries(f).filter(([p]) => p.startsWith("content/buildings/")).map(([, v]) => v) as Building[];
const cases: Array<[string, (f: Files) => void, RegExp]> = [
  ["duplicate tree kind", (f) => { f["content/trees/duplicate.json"] = { ...craftTree(f), id: "another_crafting_tree" }; }, /duplicate tree kind/],
  ["duplicate tree id", (f) => { f["content/trees/duplicate.json"] = craftTree(f); }, /duplicate id.*crafting_tree/],
  ["duplicate branch", (f) => { craftTree(f).branches.push(craftTree(f).branches[0]); }, /duplicate id.*craft_tools/],
  ["duplicate node", (f) => { craftTree(f).nodes.push(craftTree(f).nodes[0]); }, /duplicate target/],
  ["unknown recipe", (f) => { craftTree(f).nodes[0].target = "missing_recipe"; }, /unknown recipe.*missing_recipe/],
  ["unknown branch", (f) => { craftTree(f).nodes[0].branch = "missing_branch"; }, /unknown branch/],
  ["missing recipe node", (f) => { craftTree(f).nodes.pop(); }, /needs exactly one node/],
  ["missing tree", (f) => { delete f["content/trees/building.json"]; }, /missing build tree/],
  ["duplicate parent", (f) => { craftTree(f).nodes[1].after = ["craft_rock_knife", "craft_rock_knife"]; }, /duplicate parents/],
  ["cross-tree parent", (f) => { craftTree(f).nodes[0].after = ["campfire"]; }, /unknown parent.*campfire/],
  ["self dependency", (f) => { craftTree(f).nodes[0].after = ["craft_rock_knife"]; }, /cycle.*craft_rock_knife.*craft_rock_knife/],
  ["indirect cycle", (f) => { craftTree(f).nodes[0].after = ["craft_axe"]; }, /cycle.*craft_rock_knife.*craft_axe.*craft_rock_knife/],
  ["unknown site", (f) => { buildings(f)[0].build.requires = { site: "missing_site" }; }, /unknown site.*missing_site/],
  ["site without provider", (f) => { f["content/sites/unprovided_site.json"] = { id: "unprovided_site", name: "unprovided site", needs: "unprovided site" }; buildings(f)[0].build.requires = { site: "unprovided_site" }; }, /unprovided_site.*no provider/],
  ["unknown site grant", (f) => { (f["content/regions/beach.json"] as Region).siteCapabilities = ["missing_site"]; }, /siteCapabilities.*unknown site/],
  ["quest gated recipe", (f) => { recipes(f)[0].requires = { all: [{ not: { quest: "survive_first_night", is: "done" } }] }; }, /quests cannot gate creation/],
  ["quest gated method", (f) => { recipes(f)[0].ways[0].visibleWhen = { any: [{ quest: "survive_first_night", is: "active" }] }; }, /quests cannot gate creation/],
  ["quest gated construction", (f) => { buildings(f)[0].build.requires = { quest: "survive_first_night", is: "done" }; }, /quests cannot gate creation/],
  ["multiple outputs on a non-repeatable recipe", (f) => { recipes(f)[0].count = 2; }, /non-repeatable recipe must output one item/],
];

describe("creation graph validation", () => {
  it.each(cases)("rejects %s with an authoring location", (_label, change, message) => {
    const files = readContentFiles();
    change(files);
    expect(() => buildRegistry(files)).toThrow(message);
  });

  it("indexes branch-independent depth, children, and all-parent ordering", () => {
    const files = readContentFiles();
    craftTree(files).nodes.find((n) => n.target === "craft_hoe")!.after = ["craft_axe", "craft_rope"];
    const tree = buildRegistry(files).trees.get("craft")!;
    expect(tree.depth.get("craft_rock_knife")).toBe(0);
    expect(tree.depth.get("craft_rope")).toBe(1);
    expect(tree.depth.get("craft_hoe")).toBe(2);
    expect(tree.children.get("craft_rock_knife")).toContain("craft_rope");
    expect(tree.order.indexOf("craft_hoe")).toBeGreaterThan(tree.order.indexOf("craft_rope"));
    expect(tree.order.indexOf("craft_hoe")).toBeGreaterThan(tree.order.indexOf("craft_axe"));
  });
});
