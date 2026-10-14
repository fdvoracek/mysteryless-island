import "./bujo.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 5. A 19th-century castaway's journal: period print (switchable fonts) and copperplate headings. The left page is only
 * what happened: the log, entries with the hour in the margin and a heading per day. The right
 * page is everything you act on or check: places and actions, survival bars, tasks, stores and
 * inventory. (The id stays "bujo" so saved layout choices keep working.)
 */
export const bujo: Layout = {
  id: "bujo",
  name: "old journal",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <section class="bj-page bj-log">
        <h2 class="bj-title">journal</h2>
        ${panel.story()}
      </section>
      <section class="bj-page bj-side">
        <div class="bj-play">
          ${panel.places()}
          ${panel.actions()}
        </div>
        ${panel.status()}
        ${panel.tasks()}
        <div class="bj-pair">
          ${panel.stores()}
          ${panel.inventory()}
        </div>
      </section>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: true, limit: 24 },
  // Pinyon Script: copperplate headings (falls back to the macOS script fonts);
  // the text fonts below are period print faces, switchable in the bottom menu
  stylesheets: [
    "https://fonts.googleapis.com/css2?family=Pinyon+Script&family=Old+Standard+TT:ital@0;1&family=IM+Fell+English:ital@0;1&family=Cormorant+Garamond:ital,wght@1,500&display=swap",
  ],
  fonts: [
    { id: "old_standard", name: "old standard", family: '"Old Standard TT", Georgia, serif' },
    { id: "fell", name: "fell", family: '"IM Fell English", "Iowan Old Style", Georgia, serif', scale: 1.02 },
    { id: "garamond_italic", name: "garamond italic", family: '"Cormorant Garamond", Garamond, Georgia, serif', style: "italic", weight: 500, scale: 1.08 },
  ],
};
