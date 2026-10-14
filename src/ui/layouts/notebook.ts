import "./notebook.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 3. The field notebook: two pages. The left page is the castaway's diary, with the time of
 * each entry and a heading for each day; the right page is the camp: places, actions, status.
 */
export const notebook: Layout = {
  id: "notebook",
  name: "notebook",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <section class="n-diary">
        ${panel.story()}
      </section>
      <section class="n-camp">
        ${panel.places()}
        ${panel.actions()}
        ${panel.status()}
        ${panel.tasks()}
        <div class="n-goods">
          ${panel.stores()}
          ${panel.inventory()}
        </div>
      </section>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: true, limit: 16 },
};
