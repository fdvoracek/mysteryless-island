import "./classic.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/** The original three columns: story on the left (newest on top), actions in the middle, panels on the right. */
export const classic: Layout = {
  id: "classic",
  name: "classic",
  skeleton: () => `
    <div class="wrap" id="wrap">
      ${panel.places()}
      ${panel.story()}
      <main class="centre">
        ${panel.actions()}
      </main>
      <aside class="side">
        ${panel.status()}
        ${panel.tasks()}
        ${panel.inventory()}
      </aside>
    </div>`,
  story: { order: "newest-first", unit: "line", older: "fade", latestLarge: false, timestamps: false, limit: 30 },
};
