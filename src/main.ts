import "./ui/styles.css";
import { loadContent } from "./content/loader";
import { ContentError, type Registry } from "./content/registry";
import { Engine } from "./core/engine";
import { ActionController } from "./app/action-controller";
import { setVariantMode } from "./core/text";
import { installDebug } from "./debug/console";
import { clearSave, hasSavedGame, loadGame, previewSeed, readSaveStatus, saveGame, writeSave } from "./persistence/save";
import { initTheme, UI } from "./ui/render";

initTheme();
const app = document.getElementById("app")!;

// Dev server only: the Studio plugin reports content changes; a multi-file save reloads once.
if (import.meta.hot) {
  let reloadTimer: number | undefined;
  import.meta.hot.on("studio:files-changed", () => {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => location.reload(), 400);
  });
}

let reg: Registry;
try {
  reg = loadContent();
} catch (e) {
  // content errors are shown on screen so authors see them immediately
  const msg = e instanceof ContentError ? e.message : String(e);
  app.innerHTML = `<pre class="error"></pre>`;
  app.querySelector("pre")!.textContent = msg;
  throw e;
}

// ?variants=first always shows the first wording of each text (used by the browser tests)
if (new URLSearchParams(location.search).get("variants") === "first") setVariantMode("first");

const newSeed = () => Math.floor(Math.random() * 2 ** 31); // the only Math.random: picks a seed
// preview only: &seed=<n> starts a new game, then leaves the URL so a reload continues it
const seed = previewSeed();
if (seed !== undefined) {
  clearSave();
  const url = new URL(location.href);
  url.searchParams.delete("seed");
  history.replaceState(null, "", url);
}
const loaded = readSaveStatus(reg);
if (loaded.error) {
  const message = document.createElement("p");
  message.textContent = loaded.error;
  const restart = document.createElement("button");
  restart.textContent = "start a new game";
  restart.onclick = () => { clearSave(); location.reload(); };
  app.replaceChildren(message, restart);
  throw new Error(loaded.error);
}
const resumed = loaded.state;
let engine = resumed ? new Engine(reg, resumed) : Engine.newGame(reg, seed ?? newSeed());
document.title = reg.game.title;

/** the autosave after every completed action (a reload continues; a death stays a death) */
const save = () => writeSave(engine.state);

// Optional environment timing; ?speed=0.2 overrides it for manual previews.
const configuredStepMs = Number(import.meta.env.VITE_ACTION_STEP_MS);
const defaultSpeed = Number.isFinite(configuredStepMs) && configuredStepMs > 0
  ? configuredStepMs / engine.progressMs(reg.game.stepMinutes / 60) : 1;
const speedParam = Number(new URLSearchParams(location.search).get("speed"));
const speed = speedParam > 0 ? speedParam : defaultSpeed;

let ui: UI;
const controller = new ActionController(() => engine, () => { save(); ui.render(); }, speed);
ui = new UI(
  app,
  () => engine,
  (cmd) => {
    // going to sleep saves the game first (into the saved game), so you can load the evening again
    if (engine.willSleep(cmd)) saveGame(engine.state);
    return controller.send(cmd);
  },
  () => { controller.stop(); clearSave(); engine = Engine.newGame(reg, newSeed()); save(); },
  // the saved game: "save." stores it; after death it can be loaded
  {
    save: () => saveGame(engine.state),
    load: () => { const s = loadGame(reg); if (!s) return false; controller.stop(); engine = new Engine(reg, s); save(); controller.sync(); return true; },
    has: () => hasSavedGame(),
  },
  speed,
);

installDebug(() => engine, () => { save(); ui.render(); controller.sync(); }, () => { controller.stop(); clearSave(); engine = Engine.newGame(reg, newSeed()); save(); ui.render(); });
save();
ui.render();
controller.sync();
