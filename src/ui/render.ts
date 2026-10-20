import type { Engine, Command, Result } from "../core/engine";
import { fmtHours, view, type ButtonView, type View } from "../core/selectors";
import { applyFont, FONTS, getFont, loadFontId, saveFontId, type Font } from "./fonts";
import { renderTree, TreeTooltip } from "./tree";
import { classicSkeleton } from "./layouts/classic";
import { REQUIRED_IDS } from "./layouts/panels";
import type { Icon } from "../content/schema";
import { iconSvg } from "./icons";

/**
 * Minimal DOM renderer. It renders view models and sends commands; it holds no game state.
 * Buttons are keyed by id so hover, focus and the cooldown bar survive re-renders.
 */
export class UI {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  /** true while the death fade runs (nothing can be clicked) */
  private restoring = false;
  /** places shown on the map last time (null before the first render): a new one pulses */
  private knownPlaces: Set<string> | null = null;
  /** new places that pulse once the pop-ups over the map are closed, until the next action */
  private pulse = new Set<string>();
  /** whether this page has shown the game alive (then a death gets the fade first) */
  private wasAlive = false;
  private treeTooltip: TreeTooltip;
  private treeEngine?: Engine;
  private centreTab: "area" | "craft" | "build" = "area";

  constructor(
    root: HTMLElement,
    private getEngine: () => Engine,
    private onCommand: (cmd: Command) => Result,
    private onRestart: () => void,
    /** the saved game ("save." in the menu; "load" on the end screen) */
    private saves: { save(): boolean; load(): boolean; has(): boolean },
    /** multiplies progress bar durations (?speed=0.2 in tests); 1 = normal */
    private speed = 1,
  ) {
    this.root = root;
    this.build();
    this.mountClassic();
    this.treeTooltip = new TreeTooltip(root);
  }

  /** The frame that never changes: the game area, the menu and the death fade. */
  private build() {
    this.root.innerHTML = `
      <div id="game"></div>
      <footer class="menu">
        <div class="font-switch">
          <button class="link" id="fontBtn" aria-haspopup="menu" aria-expanded="false"></button>
          <div class="font-menu" id="fontMenu" role="menu" hidden></div>
        </div>
        <button class="link" id="saveBtn">save.</button>
        <button class="link" id="lights">lights off.</button>
        <button class="link" id="restart">restart.</button>
      </footer>
      <div class="fade" id="fade"><p id="fadeText"></p></div>
      <div class="modal event end" id="end" hidden>
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="endTitle">
          <h2 class="title" id="endTitle"></h2>
          <div class="event-text" id="endText"></div>
          <div class="buttons">
            <button class="btn" id="endLoad"><span class="label"></span></button>
            <button class="btn" id="endRestart"><span class="label"></span></button>
          </div>
        </div>
      </div>
      <div class="modal event" id="event" hidden>
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="eventTitle">
          <div class="title-row">
            <h2 class="title" id="eventTitle"></h2>
            <button class="back" id="eventBack" hidden><span aria-hidden="true">←</span> <span class="label"></span></button>
          </div>
          <div class="event-text" id="eventText" aria-live="polite"></div>
          <div class="buttons" id="eventChoices"></div>
        </div>
      </div>`;
    for (const id of ["game", "fade", "fadeText", "fontBtn", "fontMenu", "event", "eventTitle", "eventBack", "eventText", "eventChoices", "end", "endTitle", "endText", "endLoad", "endRestart", "saveBtn"]) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }
    this.buildFontMenu();
    // the back arrow closes the pop-up; so does a click next to it, or Escape (not the story before
    // the island, which fills the screen)
    this.els.eventBack.addEventListener("click", () => this.closeEvent());
    this.els.event.addEventListener("click", (e) => { if (e.target === this.els.event) this.closeEvent(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.els.event.hidden) this.closeEvent(); });
    this.root.querySelector("#restart")!.addEventListener("click", () => this.confirmRestart());
    // the end screen's buttons: back to the saved game, or a new game from the storm
    this.els.endRestart.addEventListener("click", () => { this.onRestart(); this.els.quests.replaceChildren(); this.knownPlaces = null; this.render(); });
    this.els.endLoad.addEventListener("click", () => { if (this.saves.load()) { this.els.quests.replaceChildren(); this.knownPlaces = null; this.render(); } });
    // save.: store the game as it is now; a short "saved." confirms it
    this.els.saveBtn.addEventListener("click", () => {
      const e = this.getEngine();
      if (e.state.dead || this.restoring || this.isBusy()) return;
      const ok = this.saves.save();
      this.els.saveBtn.textContent = ok ? "saved." : "could not save.";
      window.setTimeout(() => { this.els.saveBtn.textContent = "save."; }, 1600);
    });
    const lights = this.root.querySelector<HTMLButtonElement>("#lights")!;
    lights.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      setTheme(dark);
      lights.textContent = dark ? "lights on." : "lights off.";
    });
    if (document.documentElement.dataset.theme === "dark") lights.textContent = "lights on.";
  }

  /** Mount the classic panels once; the renderer owns their content. */
  private mountClassic() {
    this.root.classList.add("layout-classic");
    this.els.game.innerHTML = classicSkeleton();
    for (const id of REQUIRED_IDS) {
      const el = this.els.game.querySelector<HTMLElement>(`#${id}`);
      if (!el) throw new Error(`classic layout has no #${id} panel (see src/ui/layouts/panels.ts)`);
      this.els[id] = el;
    }
    const tabs = ["area", "craft", "build"] as const;
    tabs.forEach((tab, index) => {
      this.els[`${tab}Tab`].onclick = () => { this.selectCentreTab(tab); this.render(); };
      this.els[`${tab}Tab`].onkeydown = (event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
        if (next < 0) return;
        event.preventDefault(); this.selectCentreTab(tabs[next]); this.els[`${tabs[next]}Tab`].focus(); this.render();
      };
    });
  }

  private selectCentreTab(tab: "area" | "craft" | "build") {
    if (this.centreTab !== tab) this.treeTooltip?.hide();
    this.centreTab = tab;
    for (const id of ["area", "craft", "build"]) {
      this.els[`${id}Panel`].hidden = id !== tab;
      this.els[`${id}Tab`].setAttribute("aria-selected", String(id === tab));
      this.els[`${id}Tab`].tabIndex = id === tab ? 0 : -1;
    }
  }

  /** One font for all text (see ./fonts.ts). */
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
    this.selectCentreTab(this.centreTab);
    const engine = this.getEngine();
    if (this.treeEngine !== engine) this.treeTooltip.hide();
    this.treeEngine = engine;
    const v = view(engine);
    if (v.event || v.dead) this.treeTooltip.hide();
    this.els.wrap.classList.toggle("busy", this.isBusy());
    this.els.wrap.setAttribute("aria-busy", String(this.isBusy()));
    this.renderTabs(v);
    this.renderButtons(this.els.actions, v.environmentActions);
    this.renderConsumables(v);
    this.renderStatus(v);
    this.renderQuests(v);
    this.renderBuildings(v);
    this.renderInventory(v);
    this.els.regionTitle.textContent = v.title;
    this.renderLog(v);
    this.renderEvent(v);
    this.renderEnd(v);
    renderTree(this.els.craftTree, v.trees.craft, this.renderButtons.bind(this), this.treeTooltip);
    renderTree(this.els.buildTree, v.trees.build, this.renderButtons.bind(this), this.treeTooltip);
    this.renderWork(v);
  }

  // ---------------------------------------------------------------- events

  /**
   * The open event, as a modal over the game (like A Dark Room): title, text, one button per choice.
   * The game behind it cannot be used until the event ends (the engine refuses other commands).
   */
  private renderEvent(v: View) {
    const box = this.els.event;
    const ev = v.event;
    // a "start" event (the shipwreck) comes before the island: show only the event
    this.root.classList.toggle("prologue", !!ev?.prologue);
    if (!ev) { box.hidden = true; delete box.dataset.key; return; }
    // rebuild only when the scene changes, so a button keeps focus and its cooldown bar
    const key = `${ev.id}|${ev.text}`;
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      this.els.eventTitle.textContent = ev.title;
      this.els.eventText.replaceChildren(...ev.text.split(/\n\s*\n/).map((p) => { const el = document.createElement("p"); el.textContent = p; return el; }));
      // close is the back arrow in the title line (the same place in every pop-up); in the story
      // before the island it stays a button under the text
      const closeChoice = ev.prologue ? undefined : ev.choices.find((c) => c.id === "close");
      this.els.eventBack.hidden = !closeChoice;
      if (closeChoice) this.els.eventBack.querySelector(".label")!.textContent = closeChoice.label;
      const buttons = ev.choices.filter((c) => c !== closeChoice);
      this.els.eventChoices.hidden = buttons.length === 0;
      this.els.eventChoices.replaceChildren(...buttons.map((c) => {
        const b = document.createElement("button");
        b.className = "btn";
        b.dataset.choice = c.id;
        b.innerHTML = `<span class="label"></span><span class="cd"></span>`;
        b.querySelector(".label")!.textContent = c.label;
        if (c.time) { const t = document.createElement("span"); t.className = "time"; t.textContent = c.time; b.querySelector(".label")!.append(t); }
        b.addEventListener("click", () => { if (!b.classList.contains("off")) this.send({ type: "choose", choice: c.id }, b); });
        return b;
      }));
      box.hidden = false;
      window.setTimeout(() => (this.els.eventChoices.querySelector<HTMLButtonElement>(".btn:not(.off)") ?? (closeChoice ? this.els.eventBack : null))?.focus(), 0);
    }
    for (const c of ev.choices) {
      const b = this.els.eventChoices.querySelector<HTMLElement>(`[data-choice="${c.id}"]`);
      if (!b) continue;
      const disabled = !c.enabled || (this.isBusy() && !!c.hours);
      b.classList.toggle("off", disabled);
      // the craft and build menus: what it needs (and why not, when it can't be made yet)
      b.title = [c.tooltip, c.reason].filter(Boolean).join(": ");
      b.setAttribute("aria-disabled", String(disabled));
    }
  }

  /** Close the open pop-up, if it has a back arrow (an event that asks for a choice does not close). */
  private closeEvent() {
    if (this.root.classList.contains("prologue") || this.els.eventBack.hidden) return;
    this.send({ type: "choose", choice: "close" }, this.els.eventBack);
  }

  // ---------------------------------------------------------------- panels

  /**
   * The places as a small route map: a grid of equal cells with a node (button) per place you know,
   * paths from the camp with the walking time, and "?" where a place is still to be found. The map is
   * centred on the place you are in: when you walk, the whole map slides to put the new place in the
   * middle (the `.map` element stays, only its --hc/--hr change, so the move is a CSS transition).
   */
  private renderTabs(v: View) {
    const m = v.map;
    let view = this.els.tabs.querySelector<HTMLElement>(":scope > .map-view");
    if (!view) {
      view = div("", "map-view");
      view.append(div("", "map"));
      // the hover card lives outside the faded view, so the fog does not hide it
      const tip = div("", "map-tip");
      tip.hidden = true;
      tip.setAttribute("role", "tooltip");
      tip.id = "mapTip";
      this.els.tabs.replaceChildren(view, tip);
    }
    const tip = this.els.tabs.querySelector<HTMLElement>(":scope > .map-tip")!;
    tip.hidden = true; // its node is redrawn below
    const grid = view.firstElementChild as HTMLElement;
    const here = v.tabs.find((t) => t.here) ?? { col: 0, row: 0 };
    const cells = [...v.tabs, ...m.unknown];
    const dy = Math.max(0, ...cells.map((c) => Math.abs(c.row - here.row)));
    view.style.setProperty("--dy", String(dy));
    grid.style.setProperty("--cols", String(m.cols));
    grid.style.setProperty("--rows", String(m.rows));
    grid.style.setProperty("--hc", String(here.col));
    grid.style.setProperty("--hr", String(here.row));
    // cell centres in % of the grid, for the paths and their labels
    const at = (p: { col: number; row: number }) => ({ x: ((p.col + 0.5) / m.cols) * 100, y: ((p.row + 0.5) / m.rows) * 100 });
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "map-paths");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const labels: HTMLElement[] = [];
    for (const p of m.paths) {
      const a = at(p.from), b = at(p.to);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
      line.setAttribute("vector-effect", "non-scaling-stroke");
      if (p.unknown) line.setAttribute("class", "unknown");
      svg.append(line);
      if (p.label) {
        const t = div(p.label, "map-time");
        t.style.left = `${(a.x + b.x) / 2}%`;
        t.style.top = `${(a.y + b.y) / 2}%`;
        labels.push(t);
      }
    }
    const place = (el: HTMLElement, p: { col: number; row: number }) => { el.style.gridColumn = String(p.col + 1); el.style.gridRow = String(p.row + 1); };
    const first = this.knownPlaces === null;
    const known = new Set(v.tabs.map((t) => t.id));
    if (!first) for (const id of known) if (!this.knownPlaces!.has(id)) this.pulse.add(id);
    this.knownPlaces = known;
    // the fog: places three or more cells away are faded out completely, so they can't be clicked either
    const far = (c: { col: number; row: number }) => Math.abs(c.col - here.col) >= 3 || Math.abs(c.row - here.row) >= 3;
    const nodes = v.tabs.map((t) => {
      const b = grid.querySelector<HTMLButtonElement>(`button.tab[data-id="${t.id}"]`) ?? document.createElement("button");
      b.className = (b.classList.contains("running") ? "running " : "") + "tab" + (t.here ? " here" : "") + (far(t) ? " far" : "") + (this.pulse.has(t.id) && !t.here && !v.event ? " new" : "");
      b.dataset.id = t.id;
      if (!b.firstChild) b.innerHTML = `<span class="cd"></span><span class="dot" aria-hidden="true"></span><span class="name"></span>`;
      b.querySelector(".name")!.textContent = t.label;
      b.setAttribute("aria-label", t.here ? `${t.label}, you are here` : `${t.label}, walk there, ${fmtHours(t.hours)}`);
      if (t.here) { b.setAttribute("aria-current", "location"); b.setAttribute("aria-disabled", "true"); }
      else { b.removeAttribute("aria-current"); b.removeAttribute("aria-disabled"); }
      // the place you are in stays enabled, so it can be hovered for its icons; clicking it does nothing
      b.disabled = !t.here && this.isBusy();
      if (far(t)) { b.tabIndex = -1; b.setAttribute("aria-hidden", "true"); }
      else { b.removeAttribute("tabindex"); b.removeAttribute("aria-hidden"); }
      b.onclick = t.here ? null : () => this.send({ type: "travel", region: t.id }, b);
      if (t.icons.length) {
        b.setAttribute("aria-describedby", "mapTip");
        const show = () => this.showMapTip(tip, b, t.icons);
        b.onmouseenter = show;
        b.onfocus = show;
        b.onmouseleave = () => { tip.hidden = true; };
        b.onblur = () => { tip.hidden = true; };
      }
      place(b, t);
      return b;
    });
    const unknown = m.unknown.map((u) => {
      const q = div("?", "map-unknown" + (far(u) ? " far" : ""));
      q.setAttribute("aria-label", "somewhere not found yet");
      place(q, u);
      return q;
    });
    grid.replaceChildren(svg, ...labels, ...nodes, ...unknown);
    // the first drawing (and a restart or load) puts the map in place without sliding
    if (first) { grid.classList.add("still"); void grid.offsetWidth; grid.classList.remove("still"); }
  }



  /** The hover card under a place on the map: an icon (and its word) for each thing found there. */
  private showMapTip(tip: HTMLElement, node: HTMLElement, icons: Icon[]) {
    tip.replaceChildren(...icons.map((i) => {
      const el = div("", "map-icon");
      el.innerHTML = iconSvg(i);
      el.append(div(i, "map-icon-name"));
      return el;
    }));
    const box = this.els.tabs.getBoundingClientRect(), r = node.getBoundingClientRect();
    tip.style.left = `${r.left - box.left + r.width / 2}px`;
    tip.style.top = `${r.bottom - box.top + 4}px`;
    tip.hidden = false;
  }

  private renderButtons(container: HTMLElement, buttons: ButtonView[]) {
    const existing = new Map<string, HTMLButtonElement>();
    container.querySelectorAll<HTMLButtonElement>("button.btn").forEach((b) => existing.set(b.dataset.id!, b));
    const keep = new Set(buttons.map((b) => b.id));
    existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });
    container.querySelectorAll(".break").forEach((b) => b.remove());

    buttons.forEach((bv, index) => {
      let el = existing.get(bv.id);
      if (!el) {
        el = document.createElement("button");
        el.className = "btn appear";
        el.dataset.id = bv.id;
        el.innerHTML = `<span class="label"></span><span class="cd"></span><span class="tip" role="tooltip"></span>`;
      }
      el.onclick = () => { if (!el!.classList.contains("off")) this.send(bv.command, el!); };
      const label = el.querySelector(".label")!;
      label.textContent = bv.label;
      if (bv.badge) { const m = document.createElement("span"); m.className = "badge"; m.textContent = bv.badge; label.append(m); }
      const tip = el.querySelector(".tip")!;
      tip.replaceChildren(...bv.tooltip.map((t) => div(t)), ...(bv.reason ? [div(bv.reason, "reason")] : []));
      el.classList.toggle("off", !bv.enabled);
      el.setAttribute("aria-disabled", String(!bv.enabled || (this.isBusy() && bv.command.type !== "pause")));
      if (container.children[index] !== el) container.insertBefore(el, container.children[index] ?? null);
    });
    // Keep exploration above the other area controls.
    const explore = container.querySelector<HTMLElement>('button.btn[data-id^="explore:"]');
    explore?.classList.add("explore");
    const first = [...container.querySelectorAll<HTMLElement>("button.btn")].filter((b) => b === explore).at(-1);
    if (first?.nextElementSibling) first.after(div("", "break"));
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
        const head = div("", "head");
        head.append(div(q.title, "title"));
        el.append(head);
        if (prev) prev.after(el);
        else box.prepend(el);
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
        row.append(...this.itemKey(it.label, it.tags));
        if (it.count > 1) row.append(div(String(it.count), "val"));
        return row;
      }),
    );
  }

  /** An item's name, and its tool tags next to it (knife · sharp). */
  private itemKey(label: string, tags: string[]): HTMLElement[] {
    const key = div(label, "key");
    return tags.length ? [key, div(tags.join(" · "), "itags")] : [key];
  }

  /** Key rows and their controls so focus and progress survive refreshes. */
  private renderControlRows(container: HTMLElement, rows: Array<{
    id: string; label: string; hint?: string; tags?: string[]; word: string; actions: ButtonView[];
  }>) {
    const keep = new Set(rows.map((r) => r.id));
    for (const el of [...container.children] as HTMLElement[]) if (!keep.has(el.dataset.id!)) el.remove();
    rows.forEach((r, index) => {
      let el = container.querySelector<HTMLElement>(`:scope > [data-id="${r.id}"]`);
      if (!el) {
        el = div("", "control-row");
        el.dataset.id = r.id;
        el.append(div("", "row control-heading"), div("", "buttons control-buttons"));
      }
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", r.label);
      el.querySelector(".control-heading")!.replaceChildren(...this.itemKey(r.label, r.tags ?? []), div(r.word, "val"));
      el.querySelector<HTMLElement>(".control-heading")!.title = r.hint ?? "";
      this.renderButtons(el.querySelector<HTMLElement>(".control-buttons")!, r.actions);
      if (container.children[index] !== el) container.insertBefore(el, container.children[index] ?? null);
    });
  }

  /** Only buildings standing in the current location, with every control that uses them. */
  private renderBuildings(v: View) {
    this.els.buildingsBox.hidden = v.buildings.length === 0;
    this.renderControlRows(this.els.buildings, v.buildings);
  }

  private renderConsumables(v: View) {
    this.els.consumablesBox.hidden = v.consumables.length === 0;
    this.renderControlRows(this.els.consumables, v.consumables.map((i) => ({ ...i, word: String(i.count) })));
  }

  /** Classic story: newest lines first, with older entries fading. */
  private renderLog(v: View) {
    this.els.log.replaceChildren(...v.log.slice(0, 30).map((text, age) => {
      const p = document.createElement("p");
      p.className = "entry";
      p.textContent = text;
      p.style.opacity = String(Math.max(0.12, 1 - age * 0.07));
      return p;
    }));
  }

  // ---------------------------------------------------------------- interaction

  private isBusy() { return !this.getEngine().state.dead && this.getEngine().runningActions().length > 0; }

  private send(cmd: Command, _source: HTMLElement) {
    if (this.restoring) return;
    const choice = cmd.type === "choose" ? view(this.getEngine()).event?.choices.find((c) => c.id === cmd.choice) : undefined;
    if (this.isBusy() && cmd.type !== "pause" && (cmd.type !== "choose" || choice?.hours)) return;
    if (cmd.type !== "choose") this.pulse.clear();
    this.onCommand(cmd);
    this.render();
  }

  /** Render saved work state. CSS animates only between committed clock steps. */
  private renderWork(v: View) {
    this.els.workBox.hidden = !v.work.length;
    this.renderControlRows(this.els.work, v.work);
    this.root.querySelectorAll(".running").forEach((el) => el.classList.remove("running"));
    for (const work of v.work) {
      const selector = work.target.kind === "travel" ? `.tab[data-id="${work.target.id}"]` : `.btn[data-id="${work.target.id}"]`;
      const sources = [this.root.querySelector<HTMLElement>(selector), this.els.work.querySelector<HTMLElement>(`.btn[data-id="work:${work.id}"]`)];
      for (const source of sources) {
        if (!source) continue;
        source.classList.toggle("running", work.running);
        const bar = source.querySelector<HTMLElement>(".cd");
        if (!bar) continue;
        const key = `${work.id}:${work.remaining}:${work.running}`;
        if (bar.dataset.progress === key) continue;
        bar.dataset.progress = key;
        bar.style.transition = "none";
        bar.style.width = `${work.remaining}%`;
        if (work.running) {
          void bar.offsetWidth;
          bar.style.transition = `width ${this.getEngine().progressMs(this.getEngine().reg.game.stepMinutes / 60) * this.speed}ms linear`;
          bar.style.width = `${work.nextRemaining}%`;
        }
      }
    }
    // Clear a completed work bar even if its main action button remains mounted.
    for (const bar of this.root.querySelectorAll<HTMLElement>(".cd[data-progress]")) {
      if (!v.work.some((w) => bar.dataset.progress!.startsWith(`${w.id}:`))) {
        bar.style.transition = "none"; bar.style.width = "0%"; delete bar.dataset.progress;
      }
    }
  }

  /**
   * Death is permanent. Dying now: the screen fades on the last line, then the end screen. Opening a
   * game that already ended: the end screen at once. It stays until "start again".
   */
  private renderEnd(v: View) {
    const end = v.end;
    if (!end) {
      this.root.classList.remove("ended");
      this.els.end.hidden = true;
      this.wasAlive = true;
      return;
    }
    if (this.restoring || this.root.classList.contains("ended")) return;
    const show = () => {
      this.els.endTitle.textContent = end.title;
      this.els.endText.replaceChildren(...end.lines.map((t) => { const p = document.createElement("p"); p.textContent = t; return p; }));
      this.els.endRestart.querySelector(".label")!.textContent = end.restart;
      this.els.endLoad.querySelector(".label")!.textContent = end.load;
      this.els.endLoad.hidden = !this.saves.has();
      this.els.fade.classList.remove("show");
      this.root.classList.add("ended");
      this.els.end.hidden = false;
      this.restoring = false;
      window.setTimeout(() => this.els.endRestart.focus(), 0);
    };
    if (!this.wasAlive) { show(); return; } // a game that ended before this page was opened
    this.restoring = true;
    this.els.fadeText.textContent = v.lastLine;
    this.els.fade.classList.add("show");
    window.setTimeout(show, Math.round(2400 * this.speed));
  }


  private confirmRestart() {
    const box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = `<div class="panel"><div class="title">Restart?</div><p>Start a new game, from the storm.</p>
      <div class="buttons"><button class="btn" id="yes"><span class="label">restart</span></button>
      <button class="btn" id="no"><span class="label">keep going</span></button></div></div>`;
    document.body.append(box);
    box.querySelector("#yes")!.addEventListener("click", () => { box.remove(); this.onRestart(); this.els.quests.replaceChildren(); this.knownPlaces = null; this.render(); });
    box.querySelector("#no")!.addEventListener("click", () => box.remove());
  }
}

function div(text: string, cls?: string) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  return d;
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
