import { bujo } from "./bujo";
import { classic } from "./classic";
import { journal } from "./journal";
import { notebook } from "./notebook";
import { scene } from "./scene";
import { stage } from "./stage";
import type { Layout } from "./types";

/**
 * All layouts, in the order they appear in the layout menu. The first one is the default.
 * Add or remove a layout here (and its .ts/.css files); nothing else needs to change.
 */
export const LAYOUTS: readonly Layout[] = [classic, journal, scene, notebook, stage, bujo];

export function getLayout(id: string | null | undefined): Layout {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export type { Layout, StoryStyle } from "./types";
