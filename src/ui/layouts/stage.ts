import "./stage.css";
import { panel } from "./panels";
import type { Layout } from "./types";

/**
 * 4. Story above, camp below: the top of the screen is the story, centred like a subtitle;
 * the camp is one strip along the bottom (status | places and actions | tasks and goods).
 */
export const stage: Layout = {
  id: "stage",
  name: "stage",
  skeleton: () => `
    <div class="wrap" id="wrap">
      <section class="st-story">
        ${panel.story()}
      </section>
      <section class="st-camp">
        <div class="st-status">${panel.status()}</div>
        <div class="st-play">
          ${panel.places()}
          ${panel.actions()}
        </div>
        <div class="st-goods">
          ${panel.tasks()}
          ${panel.stores()}
          ${panel.inventory()}
        </div>
      </section>
    </div>`,
  story: { order: "oldest-first", unit: "turn", older: "muted", latestLarge: true, timestamps: false, limit: 4 },
};
