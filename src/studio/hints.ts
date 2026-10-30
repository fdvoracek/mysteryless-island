import { z } from "zod";
import { Activity, Artwork, Item, ItemAction, Site, Region, Landmark, Recipe, RecipeWay, Building, BuildingStep, Quest, GameEvent } from "../content";
import { unwrap, type Schema } from "./schema";

export interface FieldHint {
  label?: string;
  help?: string;
  row?: string;
  unit?: string;
}

const schemas: [string, Schema][] = [["Activity", Activity], ["ItemAction", ItemAction], ["Item", Item], ["Site", Site], ["Artwork", Artwork], ["Region", Region], ["Landmark", Landmark], ["Recipe", Recipe], ["RecipeWay", RecipeWay], ["Building", Building], ["BuildingStep", BuildingStep], ["Quest", Quest], ["GameEvent", GameEvent]];
export const schemaName = (schema: Schema): string | undefined => schemas.find(([, node]) => node === unwrap(schema))?.[0];
export interface Section { title: string; keys: string[] }
export const sections = new Map<Schema, Section[]>([
  [Activity, [
    { title: "Basics", keys: ["name", "id", "hours", "effort", "icon", "global", "building", "tags"] },
    { title: "When can the player do this?", keys: ["visibleWhen", "requires", "requiresText", "cost"] },
    { title: "Journal", keys: ["log", "thoughts", "afterwards"] },
    { title: "Results", keys: ["yields", "outcomes", "effects"] },
  ]],
  [Item, [
    { title: "Basics", keys: ["name", "plural", "id", "order", "category", "max", "artwork"] },
    { title: "Use", keys: ["consume", "tool"] },
    { title: "Item actions", keys: ["actions"] },
  ]],
  [Recipe, [
    { title: "Basics", keys: ["item", "id", "label", "count", "multiple", "tags"] },
    { title: "Requirements", keys: ["requires"] },
    { title: "Ways", keys: ["ways"] },
  ]],
  [Building, [
    { title: "Basics", keys: ["name", "id", "order", "artwork", "icon", "hint", "word", "max", "warmthC", "timer"] },
    { title: "Building it", keys: ["build"] },
    { title: "Production", keys: ["cycle"] },
  ]],
  [Quest, [
    { title: "Basics", keys: ["title", "id", "order"] },
    { title: "Start and finish", keys: ["trigger", "completeWhen"] },
    { title: "Journal", keys: ["startLog", "doneLog"] },
    { title: "Rewards", keys: ["effects"] },
  ]],
]);
export const sectionsFor = (schema: Schema): Section[] | undefined => sections.get(unwrap(schema));

export const hints = new Map<Schema, Record<string, FieldHint>>([
  [Activity, {
    name: { label: "Name", help: "Button text" },
    hours: { label: "Hours", row: "Duration & effort", unit: "h" },
    effort: { label: "Effort", row: "Duration & effort" },
    icon: { label: "Icon", row: "Duration & effort" },
    visibleWhen: { label: "Visible when", help: "Button appears" },
    requires: { label: "Requires", help: "Button enabled" },
    requiresText: { label: "Requires text", help: "Reason shown while disabled" },
    cost: { label: "Cost", help: "Items used up" },
    log: { label: "Journal at start", help: "Logged when the work starts" },
    thoughts: { label: "Thoughts before", help: "Logged before the activity" },
    afterwards: { label: "Thoughts after", help: "Logged after it, from the resulting state" },
    global: { label: "Global", help: "Available in every area" },
    building: { label: "Building", help: "Shown with this local building" },
    tags: { label: "Tags", help: "Counted for “did” conditions" },
  }],
  [ItemAction, {
    label: { label: "Label", help: "Button text" },
    hours: { label: "Hours", row: "Duration & effort", unit: "h" },
    effort: { label: "Effort", row: "Duration & effort" },
    uses: { label: "Uses", row: "Duration & effort" },
    visibleWhen: { label: "Visible when", help: "Button appears" },
    requires: { label: "Requires", help: "Button enabled" },
    requiresText: { label: "Requires text", help: "Reason shown while disabled" },
    log: { label: "Journal at start", help: "Logged when the work starts" },
    building: { label: "Building", help: "Shown under this local building" },
  }],
  [Item, {
    name: { label: "Name" }, plural: { label: "Plural" },
    category: { label: "Category", row: "Category & limit" },
    max: { label: "Max carried", row: "Category & limit" },
    tool: { label: "Tool", help: "Tool tags this item provides" },
    actions: { label: "Item actions" },
  }],
  [Site, { name: { label: "Name" }, needs: { label: "Needs text", help: "Shown when the site is missing" } }],
  [Artwork, {
    src: { label: "Image path", help: "Under public/illustrations/" },
    width: { label: "Width", row: "Size", unit: "px" },
    height: { label: "Height", row: "Size", unit: "px" },
    alt: { label: "Alt text" },
  }],
  [Region, {
    name: { label: "Name" },
    title: { label: "Title" },
    description: { label: "First-visit text", help: "Shown on the first visit" },
    travelHours: { label: "Travel from camp", help: "0 = the camp", unit: "h" },
    map: { label: "Map cell" },
    hintWhen: { label: "“?” shown when", help: "While locked; default from the start" },
    unlockWhen: { label: "Unlocked when" },
    shelterWhen: { label: "Natural shelter when" },
    firstVisit: { label: "First visit" },
    arrive: { label: "On return", help: "Every line whose condition holds" },
    explore: { label: "Look around" },
    activities: { label: "Activities" },
    siteCapabilities: { label: "Sites" },
  }],
  [Landmark, {
    label: { label: "Button", help: "In the look-around pop-up" },
    hours: { label: "Hours", row: "Duration & effort", unit: "h" },
    effort: { label: "Effort", row: "Duration & effort" },
    visibleWhen: { label: "Offered when" },
    requires: { label: "Requires", help: "Button enabled" },
    requiresText: { label: "Requires text", help: "Reason shown while disabled" },
    text: { label: "Discovery passage", help: "Shown in the pop-up" },
    journal: { label: "Journal line", help: "Short; defaults to the passage" },
    siteCapabilities: { label: "Sites" },
  }],
  [Recipe, {
    item: { label: "Makes" },
    count: { label: "Count" },
    label: { label: "Button label", help: "Default: the item's name" },
    requires: { label: "Requires", help: "Combined with the chosen way" },
    multiple: { label: "Repeatable", help: "Can be made again while you have one" },
    ways: { label: "Ways", help: "One is chosen automatically" },
  }],
  [RecipeWay, {
    hours: { label: "Hours", row: "Duration & effort", unit: "h" },
    effort: { label: "Effort", row: "Duration & effort" },
    visibleWhen: { label: "Visible when" },
    requires: { label: "Requires" },
    requiresText: { label: "Requires text", help: "Reason shown while disabled" },
    cost: { label: "Cost", help: "Items used up" },
    log: { label: "Journal at start", help: "Logged when the work starts" },
  }],
  [Building, {
    name: { label: "Name" },
    hint: { label: "Hover hint", help: "Shown in the buildings panel" },
    icon: { label: "Map icon", help: "Shown when hovering the place" },
    max: { label: "Max per place", help: "Default 1" },
    build: { label: "Building it", help: "Label, time, cost, requirements" },
    warmthC: { label: "Warmth", help: "Added to the felt temperature here", unit: "°C" },
    timer: { label: "State timer" },
    word: { label: "Panel word", help: "Default “built”" },
    cycle: { label: "Production cycle" },
  }],
  [BuildingStep, {
    label: { label: "Label" },
    hours: { label: "Hours", row: "Duration & effort", unit: "h" },
    effort: { label: "Effort", row: "Duration & effort" },
    requires: { label: "Requires" },
    requiresText: { label: "Requires text", help: "Reason shown while disabled" },
    cost: { label: "Cost", help: "Items used up" },
    log: { label: "Journal at start", help: "Logged when the work starts" },
  }],
  [Quest, {
    title: { label: "Title" },
    trigger: { label: "Starts", help: "start, manual (startQuest effect) or when" },
    completeWhen: { label: "Done when" },
    startLog: { label: "Start journal" },
    doneLog: { label: "Done journal", help: "Also shown in the completion note" },
    effects: { label: "Rewards", help: "Applied when the task is done" },
  }],
  [GameEvent, {
    title: { label: "Title" },
    trigger: { label: "Opens" },
    when: { label: "Only when", help: "Extra condition for any trigger" },
    repeat: { label: "Repeat", help: "Comes back after the cooldown" },
  }],
]);

export function hintFor(objectSchema: Schema, key: string): FieldHint | undefined {
  return hints.get(unwrap(objectSchema))?.[key];
}

export function humanize(key: string): string {
  if (key === "id") return "ID";
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").split(" ").map(word => /^[A-Z]$/.test(word) ? word : word.toLowerCase()).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function staleHints(map = hints, sectionMap = sections): string[] {
  return schemas.flatMap(([name, schema]) => {
    const node = unwrap(schema);
    const errors = Object.keys(map.get(schema) ?? {}).filter(key => !(node instanceof z.ZodObject) || !(key in node.shape)).map(key => `${name}.${key}`);
    const owners = new Map<string, string>();
    const rows = new Map<string, string>();
    for (const section of sectionMap.get(schema) ?? []) for (const key of section.keys) {
      const row = map.get(schema)?.[key]?.row;
      if (!(node instanceof z.ZodObject) || !(key in node.shape) || owners.has(key) || row && rows.has(row) && rows.get(row) !== section.title) errors.push(`sections:${name}.${key}`);
      owners.set(key, section.title);
      if (row) rows.set(row, section.title);
    }
    return errors;
  });
}

export interface EntryHint { title?: string; summary: string[] }
export const collapsibleEntries = new Map<Schema, EntryHint>([
  [Landmark, { title: "label", summary: ["hours", "effort", "visibleWhen", "requires"] }],
  [ItemAction, { title: "label", summary: ["hours", "effort", "building", "visibleWhen", "uses"] }],
  [RecipeWay, { summary: ["hours", "effort", "visibleWhen", "requires"] }],
]);
export function staleEntries(map = collapsibleEntries): string[] {
  return [...map].flatMap(([schema, config]) => {
    const node = unwrap(schema);
    return [...(config.title === undefined ? [] : [config.title]), ...config.summary]
      .filter(key => !(node instanceof z.ZodObject) || !(key in node.shape))
      .map(key => `${schemaName(schema) ?? "Unknown"}.${key}`);
  });
}
