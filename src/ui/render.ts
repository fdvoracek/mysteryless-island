import type { Engine, Command } from "../core/engine";
import { view, type ButtonView, type View } from "../core/selectors";
import { applyFont, FONTS, getFont, loadFontId, saveFontId, type Font } from "./fonts";
import { getLayout, LAYOUTS, type Layout } from "./layouts";
import { REQUIRED_IDS } from "./layouts/panels";

/**
 * Minimal DOM renderer. It renders view models and sends commands; it holds no game state.
 * Buttons are keyed by id so hover, focus and the cooldown bar survive re-renders.
 */
export class UI {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private busyUntil = 0;
  private layout: Layout;
  private restoring = false;

  constructor(
    root: HTMLElement,
    private getEngine: () => Engine,
    private onCommand: (cmd: Command) => ReturnType<Engine["dispatch"]>,
    private onRestart: () => void,
    private onRestore: () => void,
    /** multiplies progress bar durations (?speed=0.2 in tests); 1 = normal */
    private speed = 1,
    /** id of the layout to start with (see ./layouts) */
    layoutId?: string | null,
  ) {
    this.root = root;
    this.layout = getLayout(layoutId);
    this.build();
    this.mountLayout(this.layout);
  }

  /** The frame that never changes: the game area, the menu and the death fade. */
  private build() {
    this.root.innerHTML = `
      <div id="game"></div>
      <footer class="menu">
        <div class="layout-switch">
          <button class="link" id="fontBtn" aria-haspopup="menu" aria-expanded="false"></button>
          <div class="layout-menu" id="fontMenu" role="menu" hidden></div>
        </div>
        <div class="layout-switch">
          <button class="link" id="layoutBtn" aria-haspopup="menu" aria-expanded="false"></button>
          <div class="layout-menu" id="layoutMenu" role="menu" hidden></div>
        </div>
        <button class="link" id="lights">lights off.</button>
        <button class="link" id="restart">restart.</button>
      </footer>
      <div class="fade" id="fade"><p id="fadeText"></p></div>`;
    for (const id of ["game", "fade", "fadeText", "layoutBtn", "layoutMenu", "fontBtn", "fontMenu"]) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }
    this.buildLayoutMenu();
    this.buildFontMenu();
    this.root.querySelector("#restart")!.addEventListener("click", () => this.confirmRestart());
    const lights = this.root.querySelector<HTMLButtonElement>("#lights")!;
    lights.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      setTheme(dark);
      lights.textContent = dark ? "lights on." : "lights off.";
    });
    if (document.documentElement.dataset.theme === "dark") lights.textContent = "lights on.";
  }

  // ---------------------------------------------------------------- layouts

  /** Put a layout's skeleton into the game area and look up its panels. */
  private mountLayout(layout: Layout) {
    this.layout = layout;
    for (const l of LAYOUTS) this.root.classList.remove(`layout-${l.id}`);
    this.root.classList.add(`layout-${layout.id}`);
    for (const href of layout.stylesheets ?? []) loadStylesheet(href);
    this.els.game.innerHTML = layout.skeleton();
    for (const id of REQUIRED_IDS) {
      const el = this.els.game.querySelector<HTMLElement>(`#${id}`);
      if (!el) throw new Error(`layout "${layout.id}" has no #${id} panel (see src/ui/layouts/panels.ts)`);
      this.els[id] = el;
    }
    const older = this.els.game.querySelector<HTMLElement>("#logOlder");
    if (older) this.els.logOlder = older;
    else delete this.els.logOlder;
    this.els.layoutBtn.textContent = `layout: ${layout.name}.`;
    this.els.layoutMenu.querySelectorAll<HTMLElement>("[data-layout]").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.layout === layout.id));
    });
  }

  private buildLayoutMenu() {
    const close = popupMenu(this.els.layoutBtn, this.els.layoutMenu);
    for (const l of LAYOUTS) {
      this.els.layoutMenu.append(menuItem(l.name, { layout: l.id }, () => {
        close();
        if (this.isBusy() || this.restoring || l.id === this.layout.id) return;
        saveLayoutId(l.id);
        this.mountLayout(l);
        this.render();
      }));
    }
  }

  /** The font switch: one font for all text in every layout (see ./fonts.ts). */
  private buildFontMenu() {
    const close = popupMenu(this.els.fontBtn, this.els.fontMenu);
    const pick = (f: Font) => {
      applyFont(f);
      this.els.fontBtn.textContent = `font: ${f.name}.`;
      this.els.fontMenu.querySelectorAll<HTMLElement>("[data-font]").forEach((b) => {
        b.setAttribute("aria-checked", String(b.dataset.font === f.id));
      });
    };
    for (const f of FONTS) {
      this.els.fontMenu.append(menuItem(f.name, { font: f.id }, () => { close(); saveFontId(f.id); pick(f); }));
    }
    pick(getFont(loadFontId()));
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
    if (v.dead && !this.restoring) this.showDeath(v.lastLine);
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
          b.className = "qaction sbtn";
          b.textContent = action.label;
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
        row.append(div(s.label, "key"), div(String(s.count), "val"));
        if (s.use) {
          const b = document.createElement("button");
          b.className = "use sbtn";
          b.textContent = s.use.verb;
          b.title = s.use.tooltip.join(" · ");
          b.disabled = this.isBusy();
          b.addEventListener("click", () => this.send({ type: "consume", item: s.id }, b));
          row.append(b);
        }
        for (const a of s.actions) {
          const b = document.createElement("button");
          b.className = "iaction sbtn" + (a.enabled ? "" : " off");
          b.dataset.action = a.id;
          b.textContent = a.label;
          const label = `${a.label} ${s.label} (${a.tooltip.join(", ")})`;
          b.title = a.reason ? `${label}: ${a.reason}` : label;
          b.setAttribute("aria-label", b.title);
          b.addEventListener("click", () => { if (a.enabled) this.send(a.command, b); });
          row.append(b);
        }
        return row;
      }),
    );
  }

  /** Draw the story the way the current layout asks for (see StoryStyle in ./layouts/types.ts). */
  private renderLog(v: View) {
    const st = this.layout.story;
    // blocks, newest first: one per line, or one per action (a paragraph)
    const blocks = (st.unit === "line"
      ? v.log.map((text) => ({ text, first: text, day: 0, clock: "" }))
      : v.turns.map((t) => ({ text: t.lines.join(" "), first: t.lines[0], day: t.day, clock: t.clock }))
    ).slice(0, st.limit);

    const make = (b: (typeof blocks)[number], age: number) => {
      const p = document.createElement("p");
      p.className = "entry" + (age === 0 ? (st.latestLarge ? " latest" : "") : st.older === "muted" ? " older" : "");
      if (st.timestamps && b.clock) {
        const t = document.createElement("span");
        t.className = "time";
        t.textContent = b.clock;
        p.append(t);
      }
      p.append(b.text);
      p.style.setProperty("--age", String(age));
      if (st.older === "fade") p.style.opacity = String(Math.max(0.12, 1 - age * 0.07));
      return p;
    };

    let shown = blocks;
    const olderLine: string[] = [];
    if (st.older === "inline") {
      // only the newest block stays a paragraph; the rest becomes one quiet line
      shown = blocks.slice(0, 1);
      olderLine.push(...blocks.slice(1).map((b) => b.first));
    }

    const nodes: HTMLElement[] = shown.map((b, age) => make(b, age));
    if (st.order === "oldest-first") nodes.reverse();

    // day headings between paragraphs of different days (in reading order)
    if (st.timestamps) {
      const ordered = st.order === "oldest-first" ? [...shown].reverse() : shown;
      const withDays: HTMLElement[] = [];
      let lastDay = -1;
      ordered.forEach((b, i) => {
        if (b.day && b.day !== lastDay) { withDays.push(div(`day ${b.day}`, "day")); lastDay = b.day; }
        withDays.push(nodes[i]);
      });
      this.els.log.replaceChildren(...withDays);
    } else {
      this.els.log.replaceChildren(...nodes);
    }

    if (st.older === "inline") {
      const target = this.els.logOlder ?? this.els.log;
      const line = div(olderLine.join(" · "), "older-line");
      if (target === this.els.log) this.els.log.append(line);
      else target.replaceChildren(line);
    }

    // book order: keep the newest paragraph in view
    if (st.order === "oldest-first") this.els.log.scrollTop = this.els.log.scrollHeight;
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

function div(text: string, cls?: string) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  return d;
}

/** Add a <link rel="stylesheet"> once (layouts can bring their own web fonts). */
function loadStylesheet(href: string) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

const LAYOUT_KEY = "textisland.layout";

/** The layout to start with: ?layout=<id> in the URL, else the last one chosen. */
export function loadLayoutId(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("layout");
  if (fromUrl) return fromUrl;
  try { return localStorage.getItem(LAYOUT_KEY); } catch { return null; }
}

function saveLayoutId(id: string) {
  try { localStorage.setItem(LAYOUT_KEY, id); } catch { /* ignore */ }
}

/** Wire a menu button to its popup; returns a function that closes it. */
function popupMenu(btn: HTMLElement, menu: HTMLElement): () => void {
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target as Node)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  return close;
}

function menuItem(label: string, data: Record<string, string>, onClick: () => void): HTMLButtonElement {
  const item = document.createElement("button");
  item.className = "link";
  item.setAttribute("role", "menuitemradio");
  Object.assign(item.dataset, data);
  item.textContent = label;
  item.addEventListener("click", onClick);
  return item;
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
