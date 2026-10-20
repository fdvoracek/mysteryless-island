import "./classic.css";
import { panel } from "./panels";

/** One illustrated page: shared panorama/map above journal, actions, and status. */
export const classicSkeleton = () => `
    <div class="page">
      ${panel.panorama()}
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
      </div>
    </div>`;
