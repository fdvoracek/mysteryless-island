import "./ui/styles.css";
import { loadContent } from "./content/loader";
import { ContentError, type Registry } from "./content/registry";
import { Engine } from "./core/engine";
import { installDebug } from "./debug/console";
import { clearSave, readSave, writeSave } from "./persistence/save";
import { initTheme, UI } from "./ui/render";

initTheme();
const app = document.getElementById("app")!;

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

const newSeed = () => Math.floor(Math.random() * 2 ** 31); // the only Math.random: picks a seed
const saved = readSave(reg);
let engine = saved ? new Engine(reg, saved.current, saved.checkpoint) : Engine.newGame(reg, newSeed());
document.title = reg.game.title;

const save = () => writeSave(engine.state, engine.checkpoint);

// ?speed=0.2 makes progress bars 5x faster (used by the browser tests)
const speedParam = Number(new URLSearchParams(location.search).get("speed"));
const speed = speedParam > 0 ? speedParam : 1;

const ui = new UI(
  app,
  () => engine,
  (cmd) => { const r = engine.dispatch(cmd); save(); return r; },
  () => { clearSave(); engine = Engine.newGame(reg, newSeed()); save(); },
  () => { engine.restoreCheckpoint(); save(); },
  speed,
);

installDebug(() => engine, () => { save(); ui.render(); }, () => { clearSave(); engine = Engine.newGame(reg, newSeed()); save(); ui.render(); });
save();
ui.render();
