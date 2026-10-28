import { z } from "zod";
import { Activity, Artwork, Item, ItemAction, Site } from "../content";
import { unwrap, type Schema } from "./schema";

export interface FieldHint {
  label?: string;
  help?: string;
  row?: string;
  unit?: string;
}

const schemas: [string, Schema][] = [["Activity", Activity], ["ItemAction", ItemAction], ["Item", Item], ["Site", Site], ["Artwork", Artwork]];

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
]);

export function hintFor(objectSchema: Schema, key: string): FieldHint | undefined {
  return hints.get(unwrap(objectSchema))?.[key];
}

export function humanize(key: string): string {
  if (key === "id") return "ID";
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function staleHints(map = hints): string[] {
  return schemas.flatMap(([name, schema]) => {
    const node = unwrap(schema);
    return Object.keys(map.get(schema) ?? {}).filter(key => !(node instanceof z.ZodObject) || !(key in node.shape)).map(key => `${name}.${key}`);
  });
}
