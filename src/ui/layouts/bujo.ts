import "./bujo.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 5. Bullet journal, in black and white. The left page is only what happened: the daily log,
 * one bullet per action with its time and a lettered heading per day. The right page is
 * everything you act on or check: places and actions, the tracker (survival bars), tasks,
 * stores and inventory.
 */
export const bujo: Layout = {
  id: "bujo",
  name: "bullet journal",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <section class="bj-page bj-log">
        <h2 class="bj-title">daily log</h2>
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
  // hand lettering for headings only; falls back to system handwriting fonts
  stylesheets: ["https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap"],
};
