import { readContentFiles } from "../helpers";

// Deliberate invalid copies; the frozen pack on disk is never modified.
export const diagnosticScenarios: Record<string, (files: Record<string, any>) => void> = {
  schema: (files) => { files["content/activities/gather_wood.json"].hours = "bad"; },
  condition: (files) => { files["content/activities/gather_wood.json"].requires = { all: [{ not: { item: "missing_item" } }] }; },
  yield: (files) => { files["content/activities/gather_wood.json"].yields[0].item = "missing_item"; },
  effect: (files) => { files["content/activities/gather_wood.json"].effects = [{ give: { missing_item: 1 } }]; },
  duplicate: (files) => { files["content/items/duplicate_knife.json"] = structuredClone(files["content/items/knife.json"]); },
  text: (files) => { for (const id of ["collect_stones", "gather_wood"]) files[`content/activities/${id}.json`].log = { id: "duplicate_passage", variants: ["A.", "B."] }; },
  filename: (files) => { files["content/items/wrong_name.json"] = files["content/items/knife.json"]; delete files["content/items/knife.json"]; },
  activity: (files) => { files["content/regions/beach.json"].activities.push("missing_activity"); },
  cycle: (files) => { files["content/trees/crafting.json"].nodes[0].after = ["craft_rock_knife"]; },
  missing: (files) => { delete files["content/game.json"]; },
};
export function brokenDiagnosticPack() {
  const files = readContentFiles();
  for (const name of ["condition", "yield", "effect", "duplicate", "activity", "cycle"]) diagnosticScenarios[name](files);
  // Keep schema and reference failures on separate definitions so both validation phases run.
  (files["content/activities/collect_shells.json"] as { hours: unknown }).hours = "bad";
  return files;
}
