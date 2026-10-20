import { describe, expect, it } from "vitest";
import { Artwork, type Building, type Item, type Region } from "../src/content/schema";
import { buildRegistry } from "../src/content/registry";
import { treeView, view } from "../src/core/selectors";
import { illustrationUrl } from "../src/ui/illustration";
import { loadRegistry, readContentFiles, revealAll, startGame } from "./helpers";

const panorama = { id: "art_beach", src: "illustrations/locations/beach.png", width: 1600, height: 440, alt: "Low cliffs beside a quiet stretch of beach." };
const object = { id: "art_knife", src: "illustrations/items/knife.webp", width: 160, height: 160, alt: "A small knife with a wooden handle." };
function illustratedContent() {
  const files = readContentFiles();
  files["content/artwork.json"] = [panorama, object,
    { ...object, id: "art_rock_knife", src: "illustrations/items/rock_knife.png", alt: "A stone sharpened into a blade." },
    { ...object, id: "art_can", src: "illustrations/items/can.png", alt: "An empty metal water can." },
    { ...object, id: "art_fire", src: "illustrations/structures/fire.png", alt: "A small ring of stones." },
    { ...panorama, id: "art_forest", src: "illustrations/locations/forest.png", alt: "A spring beneath quiet trees." }];
  (files["content/regions/beach.json"] as Region).artwork = "art_beach";
  (files["content/regions/forest.json"] as Region).artwork = "art_forest";
  const items = files["content/items/basics.json"] as Item[];
  items.find((item) => item.id === "knife")!.artwork = "art_knife";
  items.find((item) => item.id === "rock_knife")!.artwork = "art_rock_knife";
  items.find((item) => item.id === "water_can")!.artwork = "art_can";
  (files["content/buildings/camp.json"] as Building[]).find((building) => building.id === "campfire")!.artwork = "art_fire";
  return files;
}

describe("optional artwork authoring", () => {
  it("accepts an empty or absent catalog without adding images or game state", () => {
    const files = readContentFiles(); delete files["content/artwork.json"];
    const reg = buildRegistry(files), engine = startGame(reg, 7);
    expect(reg.artwork.size).toBe(0);
    expect(view(engine).panorama).toBeUndefined();
    expect(view(engine).inventory.every((item) => !item.artwork)).toBe(true);
    expect(treeView(engine, "craft").nodes.every((node) => !node.artwork)).toBe(true);
    expect(engine.state).toEqual(startGame(loadRegistry(), 7).state);
    expect(startGame(buildRegistry(illustratedContent()), 7).state).toEqual(engine.state);
  });

  it.each([
    { src: "/illustrations/knife.png" }, { src: "https://example.com/knife.png" },
    { src: "data:image/png;base64,x" }, { src: "illustrations/../knife.png" },
    { src: "illustrations/knife.png?query=x" }, { src: "illustrations/knife.html" },
    { width: 0 }, { height: -1 }, { width: 1.5 }, { alt: "   " }, { unexpected: true },
  ])("rejects invalid metadata %j", (change) => {
    const files = readContentFiles(); files["content/artwork.json"] = [{ ...object, ...change }];
    expect(() => buildRegistry(files)).toThrow(/content\/artwork\.json/);
  });

  it("requires descriptive alternative text even when a paired-label consumer may render it decoratively", () => {
    expect(Artwork.safeParse({ ...object, alt: "" }).success).toBe(false);
    expect(Artwork.parse({ ...object, alt: "  A knife.  " }).alt).toBe("A knife.");
  });

  it.each(["region", "item", "building"])("validates the %s artwork reference with its file and field", (kind) => {
    const files = illustratedContent();
    if (kind === "region") (files["content/regions/beach.json"] as Region).artwork = "missing_art";
    if (kind === "item") (files["content/items/basics.json"] as Item[])[0].artwork = "missing_art";
    if (kind === "building") (files["content/buildings/camp.json"] as Building[])[0].artwork = "missing_art";
    expect(() => buildRegistry(files)).toThrow(/content\/.*\.artwork: unknown artwork "missing_art"/);
  });

  it("enforces global artwork identities and the region panorama's declared 1600×440 dimensions", () => {
    const files = illustratedContent();
    (files["content/artwork.json"] as unknown[]).push({ ...object, id: "knife" });
    expect(() => buildRegistry(files)).toThrow(/duplicate id "knife"/);
    files["content/artwork.json"] = [{ ...panorama, width: 800, height: 220 }];
    expect(() => buildRegistry(files)).toThrow(/content\/regions\/beach\.json.beach.artwork: region artwork must declare 1600 × 440/);
  });
});

describe("resolved artwork views", () => {
  it("uses item artwork for inventory/consumables and the exact recipe OUTPUT item for tree hints", () => {
    const reg = buildRegistry(illustratedContent()), e = startGame(reg, 7);
    e.applyEffects([{ give: { water_can: 1 } }]);
    expect(view(e).inventory.find((item) => item.id === "knife")!.artwork).toEqual(object);
    expect(view(e).consumables.find((item) => item.id === "water_can")!.artwork!.id).toBe("art_can");
    expect(treeView(e, "craft").nodes.find((node) => node.target === "craft_rock_knife")!.artwork!.id).toBe("art_rock_knife");
    expect(treeView(e, "craft").nodes.find((node) => node.target === "craft_axe")!.artwork).toBeUndefined();
  });

  it("uses building artwork for the local structure and its tree hints, without granting a building", () => {
    const e = startGame(buildRegistry(illustratedContent()), 7);
    expect(view(e).buildings).toEqual([]);
    expect(treeView(e, "build").nodes.find((node) => node.target === "campfire")!.artwork!.id).toBe("art_fire");
    e.applyEffects([{ build: "campfire" }]);
    expect(view(e).buildings.find((building) => building.id === "campfire")!.artwork!.id).toBe("art_fire");
    e.state.location = "forest";
    expect(view(e).buildings).toEqual([]);
  });

  it("changes the shared panorama only when travel arrives, retaining it across tab view derivation", () => {
    const e = revealAll(startGame(buildRegistry(illustratedContent()), 7));
    const before = view(e).panorama;
    expect(before).toEqual(panorama);
    treeView(e, "craft"); treeView(e, "build");
    expect(view(e).panorama).toBe(before);
    expect(e.start({ type: "travel", region: "forest" }).ok).toBe(true);
    e.stepActions(); expect(view(e).panorama).toBe(before);
    e.stepActions(); expect(view(e).panorama!.id).toBe("art_forest");
    e.state.location = "meadows";
    expect(view(e).panorama).toBeUndefined();
  });
});

describe("Pages-safe illustration URLs", () => {
  it.each([
    ["./", "./illustrations/items/knife.webp"], ["", "./illustrations/items/knife.webp"],
    ["/mysteryless-island/", "/mysteryless-island/illustrations/items/knife.webp"],
    ["/nested/island", "/nested/island/illustrations/items/knife.webp"],
  ])("preserves the deployment base %s", (base, expected) => expect(illustrationUrl(object.src, base)).toBe(expected));
  it("uses the Vite-provided default base", () => expect(illustrationUrl(object.src)).toBe(`${import.meta.env.BASE_URL}illustrations/items/knife.webp`));
});
