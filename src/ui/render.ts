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
    /** multiplies progress bar durations (?speed=0.2 in tests); 1 = normal */
    private speed = 1,
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
          <fieldset class="box" id="questsBox"><legend>tasks</legend><div id="quests"></div></fieldset>
          <fieldset class="box" id="storesBox"><legend>stores</legend><div id="stores"></div></fieldset>
          <fieldset class="box" id="inventoryBox"><legend>inventory</legend><div id="inventory"></div></fieldset>
        </aside>
      </div>
      <footer class="menu">
        <button class="link" id="lights">lights off.</button>
        <button class="link" id="restart">restart.</button>
      </footer>
      <div class="fade" id="fade"><p id="fadeText"></p></div>`;
    for (const id of ["log", "tabs", "actions", "clock", "status", "quests", "questsBox", "stores", "storesBox", "inventory", "inventoryBox", "fade", "fadeText", "wrap"]) {
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
    this.renderButtons(this.els.actions, v.actions);
    this.renderStatus(v);
    this.renderQuests(v);
    this.renderStores(v);
    this.renderInventory(v);
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

  private renderButtons(container: HTMLElement, buttons: ButtonView[]) {
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
        el.addEventListener("click", () => { if (!el!.classList.contains("off")) this.send(bv.command, el!); });
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
    const box = this.els.status;
    const keep = new Set(v.status.lines.map((l) => l.id));
    box.querySelectorAll<HTMLElement>(".row").forEach((r) => { if (!keep.has(r.dataset.id!)) r.remove(); });

    v.status.lines.forEach((l, index) => {
      // rows are keyed by id and updated in place, so the bar width transitions smoothly
      let row = box.querySelector<HTMLElement>(`.row[data-id="${l.id}"]`);
      if (!row) {
        row = div("", "row");
        row.dataset.id = l.id;
        row.append(div(l.label, "key"));
        if (l.fill === null) {
          row.append(div("", "val"));
        } else {
          const bar = div("", "val bar");
          bar.setAttribute("role", "meter");
          bar.setAttribute("aria-valuemin", "0");
          bar.setAttribute("aria-valuemax", "100");
          bar.append(document.createElement("i"));
          row.classList.add("stat");
          row.tabIndex = 0;
          row.append(bar, div("", "tip"));
        }
      }
      row.classList.toggle("bad", l.bad);
      row.querySelector(".key")!.textContent = l.label;
      if (l.fill === null) {
        row.querySelector(".val")!.textContent = l.word;
      } else {
        const trend = l.trend === "worse" ? "getting worse" : l.trend === "better" ? "getting better" : "";
        const bar = row.querySelector<HTMLElement>(".bar")!;
        bar.querySelector("i")!.style.width = `${l.fill}%`;
        bar.setAttribute("aria-valuenow", String(Math.round(l.fill)));
        bar.setAttribute("aria-valuetext", l.word);
        bar.setAttribute("aria-label", l.label);
        row.setAttribute("aria-label", `${l.label}: ${l.word}${trend ? ", " + trend : ""}`);
        row.querySelector(".tip")!.textContent = [l.word, trend].filter(Boolean).join(" · ");
      }
      if (box.children[index] !== row) box.insertBefore(row, box.children[index] ?? null);
    });
  }

  /**
   * Active quests only. A quest that leaves the list is shown struck through for a moment,
   * then removed (quests only leave the list by being completed).
   */
  private renderQuests(v: View) {
    const box = this.els.quests;
    const active = new Set(v.quests.map((q) => q.id));
    box.querySelectorAll<HTMLElement>(".quest").forEach((el) => {
      if (active.has(el.dataset.id!) || el.classList.contains("done")) return;
      el.classList.add("done");
      el.setAttribute("aria-label", `${el.dataset.title}: done`);
      window.setTimeout(() => { el.remove(); this.els.questsBox.hidden = !box.querySelector(".quest"); }, 1800);
    });
    // existing rows keep their place (a finished one fades where it was); new ones go after
    // the previous active quest in content order
    let prev: HTMLElement | null = null;
    for (const q of v.quests) {
      let el = box.querySelector<HTMLElement>(`.quest[data-id="${q.id}"]`);
      if (!el) {
        el = div("", "quest appear");
        el.dataset.id = q.id;
        el.dataset.title = q.title;
        el.tabIndex = 0;
        const head = div("", "head");
        head.append(div(q.title, "title"));
        if (q.action) {
          const action = q.action;
          const b = document.createElement("button");
          b.className = "qaction";
          b.textContent = action.icon;
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!b.classList.contains("off")) this.send(action.command, b);
          });
          head.append(b);
        }
        el.append(head);
        if (q.progress.length) el.append(div("", "progress"));
        if (q.hint) el.append(div(q.hint, "tip"));
        if (prev) prev.after(el);
        else box.prepend(el);
      }
      // refresh progress and the action button on every render
      const progress = el.querySelector(".progress");
      if (progress) progress.textContent = q.progress.map((p) => `${p.label} ${p.have}/${p.need}`).join(" · ");
      const b = el.querySelector<HTMLButtonElement>(".qaction");
      if (b && q.action) {
        b.classList.toggle("off", !q.action.enabled);
        const label = `${q.action.label} (${q.action.tooltip.join(", ")})`;
        b.title = q.action.reason ? `${label}: ${q.action.reason}` : label;
        b.setAttribute("aria-label", `${q.action.label} ${q.title}${q.action.reason ? ", " + q.action.reason : ""}`);
        b.setAttribute("aria-disabled", String(!q.action.enabled));
      }
      prev = el;
    }
    this.els.questsBox.hidden = !box.querySelector(".quest");
  }

  private renderInventory(v: View) {
    this.els.inventoryBox.hidden = v.inventory.length === 0;
    this.els.inventory.replaceChildren(
      ...v.inventory.map((it) => {
        const row = div("", "row");
        row.dataset.id = it.id;
        row.append(div(it.label, "key"));
        if (it.count > 1) row.append(div(String(it.count), "val"));
        return row;
      }),
    );
  }

  private renderStores(v: View) {
    this.els.storesBox.hidden = v.stores.length === 0;
    this.els.stores.replaceChildren(
      ...v.stores.map((s) => {
        const row = div("", "row");
        row.dataset.id = s.id;
        row.append(div(s.label, "key"));
        for (const a of s.actions) {
          const b = document.createElement("button");
          b.className = "iaction" + (a.enabled ? "" : " off");
          b.dataset.action = a.id;
          b.append(icon(a.icon));
          const label = `${a.label} ${s.label} (${a.tooltip.join(", ")})`;
          b.title = a.reason ? `${label}: ${a.reason}` : label;
          b.setAttribute("aria-label", b.title);
          b.addEventListener("click", () => { if (a.enabled) this.send(a.command, b); });
          row.append(b);
        }
        row.append(div(String(s.count), "val"));
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
    const ms = Math.round(res.cooldownMs * this.speed);
    // while the bar runs, every control is locked and greyed out; only the running one keeps its look
    this.busyUntil = performance.now() + ms;
    this.els.wrap.classList.add("busy");
    this.els.wrap.setAttribute("aria-busy", "true");
    source.classList.add("running");
    const bar = source.querySelector<HTMLElement>(".cd");
    if (bar && ms > 0) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      void bar.offsetWidth; // restart the transition
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = "0%";
    }
    this.render();
    window.setTimeout(() => {
      this.els.wrap.classList.remove("busy");
      this.els.wrap.removeAttribute("aria-busy");
      source.classList.remove("running");
      this.render();
    }, ms);
  }

  private showDeath(text: string) {
    this.restoring = true;
    this.els.fadeText.textContent = text;
    this.els.fade.classList.add("show");
    window.setTimeout(() => {
      this.onRestore();
      this.els.quests.replaceChildren();
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
    box.querySelector("#yes")!.addEventListener("click", () => { box.remove(); this.onRestart(); this.els.quests.replaceChildren(); this.render(); });
    box.querySelector("#no")!.addEventListener("click", () => box.remove());
  }
}

/** Built-in ink icons (stroke follows the text colour); anything else is shown as a text glyph. */
const ICONS: Record<string, string> = {
  fire: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5c.6 2.6 3.8 3.9 3.8 7.6A3.8 3.8 0 0 1 4.2 9.1c0-1.9 1-3 2-3.9.1 1.6.8 2.6 1.8 2.9-.3-2.3-.6-4.2 0-6.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 14.4c-1.1 0-1.9-.8-1.9-1.9 0-1 .9-1.6 1.4-2.4.4.9 2.4 1.4 2.4 2.4 0 1.1-.8 1.9-1.9 1.9z" fill="currentColor"/></svg>',
};

function icon(name: string): Node {
  if (ICONS[name]) {
    const t = document.createElement("template");
    t.innerHTML = ICONS[name];
    return t.content.firstChild!;
  }
  return document.createTextNode(name);
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
