import "./scene.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 2. The scene and the shelf: the result of the last action is a large paragraph with the
 * buttons right under it; older text shrinks into one quiet line below. Everything else
 * sits on a narrow shelf on the right.
 */
export const scene: Layout = {
  id: "scene",
  name: "scene",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <main class="s-main">
        ${panel.places()}
        ${panel.story()}
        ${panel.actions()}
        ${panel.storyOlder()}
      </main>
      <aside class="s-shelf">
        ${panel.status()}
        ${panel.tasks()}
        ${panel.stores()}
        ${panel.inventory()}
      </aside>
    </div>`,
  story: { order: "newest-first", unit: "turn", older: "inline", latestLarge: true, timestamps: false, limit: 8 },
};
