import "./classic.css";
import { panel } from "./panels";

/** The original three columns: story on the left (newest on top), actions in the middle, panels on the right. */
export const classicSkeleton = () => `
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
    </div>`;
