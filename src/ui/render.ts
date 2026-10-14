import type { Engine, Command } from "../core/engine";
import { view, type ButtonView, type View } from "../core/selectors";

/**
 * Minimal DOM renderer. It renders view models and sends commands; it holds no game state.
 * Buttons are keyed by id so hover, focus and the cooldown bar survive re-renders.
 */
export class UI {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private busyUntil = 0;
  private restoring = false;

  constructor(
    root: HTMLElement,
    private getEngine: () => Engine,
    private onCommand: (cmd: Command) => ReturnType<Engine["dispatch"]>,
    private onRestart: () => void,
    private onRestore: () => void,
  ) {
    this.root = root;
    this.build();
  }

  private build() {
    this.root.innerHTML = `
      <div class="wrap" id="wrap">
        <section class="log" id="log" aria-live="polite" aria-label="story"></section>
        <main class="centre">
          <nav class="tabs" id="tabs" aria-label="regions"></nav>
          <div class="buttons" id="actions"></div>
        </main>
        <aside class="side">
          <fieldset class="box"><legend id="clock"></legend><div id="status"></div></fieldset>
          <fieldset class="box" id="storesBox"><legend>stores</legend><div id="stores"></div></fieldset>
        </aside>
      </div>
      <footer class="menu">
        <button class="link" id="lights">lights off.</button>
        <button class="link" id="restart">restart.</button>
      </footer>
      <div class="fade" id="fade"><p id="fadeText"></p></div>`;
    for (const id of ["log", "tabs", "actions", "clock", "status", "stores", "storesBox", "fade", "fadeText", "wrap"]) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }
    this.root.querySelector("#restart")!.addEventListener("click", () => this.confirmRestart());
    const lights = this.root.querySelector<HTMLButtonElement>("#lights")!;
    lights.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      setTheme(dark);
      lights.textContent = dark ? "lights on." : "lights off.";
    });
    if (document.documentElement.dataset.theme === "dark") lights.textContent = "lights on.";
  }

  render() {
    const v = view(this.getEngine());
    this.renderTabs(v);
    this.renderButtons(this.els.actions, v.actions, (id) => ({ type: "activity", id }));
    this.renderStatus(v);
    this.renderStores(v);
    this.renderLog(v);
    if (v.dead && !this.restoring) this.showDeath(v.log[0]);
  }

  // ---------------------------------------------------------------- panels

  private renderTabs(v: View) {
    const nav = this.els.tabs;
    nav.replaceChildren(
      ...v.tabs.flatMap((t, i) => {
        const b = document.createElement("button");
        b.className = "tab" + (t.here ? " here" : "");
        b.textContent = t.label;
        b.disabled = t.here || this.isBusy();
        if (!t.here) b.addEventListener("click", () => this.send({ type: "travel", region: t.id }, b));
        const parts: HTMLElement[] = [b];
        if (i < v.tabs.length - 1) { const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "|"; parts.push(sep); }
        return parts;
      }),
    );
  }

  private renderButtons(container: HTMLElement, buttons: ButtonView[], toCmd: (id: string) => Command) {
    const existing = new Map<string, HTMLButtonElement>();
    container.querySelectorAll<HTMLButtonElement>("button.btn").forEach((b) => existing.set(b.dataset.id!, b));
    const keep = new Set(buttons.map((b) => b.id));
    existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });

    buttons.forEach((bv, index) => {
      let el = existing.get(bv.id);
      if (!el) {
        el = document.createElement("button");
        el.className = "btn appear";
        el.dataset.id = bv.id;
        el.innerHTML = `<span class="label"></span><span class="cd"></span><span class="tip" role="tooltip"></span>`;
        el.addEventListener("click", () => { if (!el!.classList.contains("off")) this.send(toCmd(bv.id), el!); });
      }
      el.querySelector(".label")!.textContent = bv.label;
      const tip = el.querySelector(".tip")!;
      tip.replaceChildren(...bv.tooltip.map((t) => div(t)), ...(bv.reason ? [div(bv.reason, "reason")] : []));
      el.classList.toggle("off", !bv.enabled);
      el.setAttribute("aria-disabled", String(!bv.enabled || this.isBusy()));
      if (container.children[index] !== el) container.insertBefore(el, container.children[index] ?? null);
    });
  }

  private renderStatus(v: View) {
    this.els.clock.textContent = `day ${v.status.day} · ${v.status.clock} · ${v.status.phase}`;
    this.els.status.replaceChildren(
      ...v.status.lines.map((l) => {
        const row = div("", "row" + (l.bad ? " bad" : ""));
        row.append(div(l.label, "key"), div(l.word + (l.trend === "down" ? " ↓" : l.trend === "up" ? " ↑" : ""), "val"));
        return row;
      }),
    );
  }

  private renderStores(v: View) {
    this.els.storesBox.hidden = v.stores.length === 0;
    this.els.stores.replaceChildren(
      ...v.stores.map((s) => {
        const row = div("", "row");
        row.append(div(s.label, "key"), div(String(s.count), "val"));
        if (s.use) {
          const b = document.createElement("button");
          b.className = "link use";
          b.textContent = s.use.verb;
          b.title = s.use.tooltip.join(" · ");
          b.disabled = this.isBusy();
          b.addEventListener("click", () => this.send({ type: "consume", item: s.id }, b));
          row.append(b);
        }
        return row;
      }),
    );
  }

  private renderLog(v: View) {
    const lines = v.log.slice(0, 30);
    this.els.log.replaceChildren(
      ...lines.map((t, i) => {
        const p = div(t, "line");
        p.style.opacity = String(Math.max(0.12, 1 - i * 0.07));
        return p;
      }),
    );
  }

  // ---------------------------------------------------------------- interaction

  private isBusy() { return performance.now() < this.busyUntil; }

  private send(cmd: Command, source: HTMLElement) {
    if (this.isBusy() || this.restoring) return;
    const res = this.onCommand(cmd);
    if (!res.ok) { this.render(); return; }
    this.busyUntil = performance.now() + res.cooldownMs;
    this.els.wrap.classList.add("busy");
    const bar = source.querySelector<HTMLElement>(".cd");
    if (bar && res.cooldownMs > 0) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      void bar.offsetWidth; // restart the transition
      bar.style.transition = `width ${res.cooldownMs}ms linear`;
      bar.style.width = "0%";
    }
    this.render();
    window.setTimeout(() => { this.els.wrap.classList.remove("busy"); this.render(); }, res.cooldownMs);
  }

  private showDeath(text: string) {
    this.restoring = true;
    this.els.fadeText.textContent = text;
    this.els.fade.classList.add("show");
    window.setTimeout(() => {
      this.onRestore();
      this.els.fade.classList.remove("show");
      this.restoring = false;
      this.render();
    }, 3000);
  }

  private confirmRestart() {
    const box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = `<div class="panel"><div class="title">restart?</div><p>start again from the first morning on the beach.</p>
      <div class="buttons"><button class="btn" id="yes"><span class="label">restart</span></button>
      <button class="btn" id="no"><span class="label">keep going</span></button></div></div>`;
    document.body.append(box);
    box.querySelector("#yes")!.addEventListener("click", () => { box.remove(); this.onRestart(); this.render(); });
    box.querySelector("#no")!.addEventListener("click", () => box.remove());
  }
}

function div(text: string, cls?: string) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  return d;
}

export function setTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("textisland.theme", dark ? "dark" : "light"); } catch { /* ignore */ }
}

export function initTheme() {
  let t: string | null = null;
  try { t = localStorage.getItem("textisland.theme"); } catch { /* ignore */ }
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
}
