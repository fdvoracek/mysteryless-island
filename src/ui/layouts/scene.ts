import "./scene.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 2. The scene and the shelf: the result of the last action is a large paragraph; the few
 * actions before it sit above it, fading upwards. Under the text: the places you can walk to,
 * then the buttons. Everything else sits on a narrow shelf on the right.
 */
export const scene: Layout = {
  id: "scene",
  name: "scene",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <main class="s-main">
        ${panel.story()}
        ${panel.places()}
        ${panel.actions()}
      </main>
      <aside class="s-shelf">
        ${panel.status()}
        ${panel.tasks()}
        ${panel.inventory()}
      </aside>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: false, limit: 4 },
};
