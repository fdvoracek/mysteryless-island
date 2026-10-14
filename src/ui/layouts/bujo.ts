import "./bujo.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 5. A 19th-century castaway's journal in print. The left page is only
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
};
