import "./journal.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 1. The journal: a book page. One centred column, oldest text on top and the newest
 * paragraph at the bottom, set larger, with the actions as underlined words right after it.
 * Status is a thin strip at the top; tasks, stores and inventory sit in the margin.
 */
export const journal: Layout = {
  id: "journal",
  name: "journal",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <header class="j-top">${panel.status()}</header>
      <main class="j-page">
        ${panel.story()}
        <div class="j-play">
          ${panel.places()}
          ${panel.actions()}
        </div>
      </main>
      <aside class="j-margin">
        ${panel.tasks()}
        ${panel.stores()}
        ${panel.inventory()}
      </aside>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: false, limit: 12 },
};
