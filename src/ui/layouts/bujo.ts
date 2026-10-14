import "./bujo.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 5. Bullet journal: a dot-grid spread. The left page is the daily log (one bullet per action,
 * with its time, a hand-lettered heading per day) with the places and actions under it; the right
 * page holds the collections: a tracker for the survival bars, the task list, stores, inventory.
 */
export const bujo: Layout = {
  id: "bujo",
  name: "bullet journal",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <section class="bj-page bj-log">
        <h2 class="bj-title">daily log</h2>
        ${panel.story()}
        <div class="bj-play">
          ${panel.places()}
          ${panel.actions()}
        </div>
      </section>
      <section class="bj-page bj-collections">
        ${panel.status()}
        ${panel.tasks()}
        <div class="bj-pair">
          ${panel.stores()}
          ${panel.inventory()}
        </div>
      </section>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: true, limit: 14 },
  // hand lettering for headings, a pen-like hand for the log; both fall back to system handwriting fonts
  stylesheets: ["https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Patrick+Hand&display=swap"],
};
