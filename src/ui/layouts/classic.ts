import "./classic.css";
import { panel } from "./panels";

/** One illustrated page: panorama above three framed columns, with the map over the centre. */
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
