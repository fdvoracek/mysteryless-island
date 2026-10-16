import type { Engine, Command } from "../core/engine";
import { fmtHours, view, type ButtonView, type View } from "../core/selectors";
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
  /** true while the death fade runs (nothing can be clicked) */
  private restoring = false;
  /** whether this page has shown the game alive (then a death gets the fade first) */
  private wasAlive = false;

  constructor(
    root: HTMLElement,
    private getEngine: () => Engine,
    private onCommand: (cmd: Command) => ReturnType<Engine["dispatch"]>,
    private onRestart: () => void,
    /** the saved game ("save." in the menu; "load" on the end screen) */
    private saves: { save(): boolean; load(): boolean; has(): boolean },
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
          <h2 class="title" id="eventTitle"></h2>
          <div class="event-text" id="eventText" aria-live="polite"></div>
          <div class="buttons" id="eventChoices"></div>
        </div>
      </div>`;
    for (const id of ["game", "fade", "fadeText", "layoutBtn", "layoutMenu", "fontBtn", "fontMenu", "event", "eventTitle", "eventText", "eventChoices", "end", "endTitle", "endText", "endLoad", "endRestart", "saveBtn"]) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }
    this.buildLayoutMenu();
    this.buildFontMenu();
    this.root.querySelector("#restart")!.addEventListener("click", () => this.confirmRestart());
    // the end screen's buttons: back to the saved game, or a new game from the storm
    this.els.endRestart.addEventListener("click", () => { this.onRestart(); this.els.quests.replaceChildren(); this.render(); });
    this.els.endLoad.addEventListener("click", () => { if (this.saves.load()) { this.els.quests.replaceChildren(); this.render(); } });
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
    this.renderEvent(v);
    this.renderEnd(v);
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
      this.els.eventChoices.replaceChildren(...ev.choices.map((c) => {
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
      window.setTimeout(() => this.els.eventChoices.querySelector<HTMLButtonElement>(".btn:not(.off)")?.focus(), 0);
    }
    for (const c of ev.choices) {
      const b = this.els.eventChoices.querySelector<HTMLElement>(`[data-choice="${c.id}"]`);
      if (!b) continue;
      b.classList.toggle("off", !c.enabled);
      b.title = c.reason ?? "";
      b.setAttribute("aria-disabled", String(!c.enabled));
    }
  }

  // ---------------------------------------------------------------- panels

  /**
   * The places as a small route map: a grid with a node (button) per place you know, paths from
   * the camp with the walking time, and "?" where a place is still to be found. Click a node to walk.
   */
  private renderTabs(v: View) {
    const m = v.map;
    const grid = div("", "map");
    grid.style.gridTemplateColumns = `repeat(${m.cols}, minmax(7.5em, 10em))`;
    grid.style.gridTemplateRows = `repeat(${m.rows}, 2.4em)`;
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
    const nodes = v.tabs.map((t) => {
      const b = document.createElement("button");
      b.className = "tab" + (t.here ? " here" : "");
      b.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="name"></span>`;
      b.querySelector(".name")!.textContent = t.label;
      b.title = t.here ? "you are here" : `walk there · ${fmtHours(t.hours)}`;
      if (t.here) b.setAttribute("aria-current", "location");
      b.disabled = t.here || this.isBusy();
      if (!t.here) b.addEventListener("click", () => this.send({ type: "travel", region: t.id }, b));
      place(b, t);
      return b;
    });
    const unknown = m.unknown.map((u) => { const q = div("?", "map-unknown"); q.setAttribute("aria-label", "somewhere not found yet"); place(q, u); return q; });
    grid.append(svg, ...labels, ...nodes, ...unknown);
    this.els.tabs.replaceChildren(grid);
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
        el.addEventListener("click", () => { if (!el!.classList.contains("off")) this.send(bv.command, el!); });
      }
      const label = el.querySelector(".label")!;
      label.textContent = bv.label;
      if (bv.badge) { const m = document.createElement("span"); m.className = "badge"; m.textContent = bv.badge; label.append(m); }
      const tip = el.querySelector(".tip")!;
      tip.replaceChildren(...bv.tooltip.map((t) => div(t)), ...(bv.reason ? [div(bv.reason, "reason")] : []));
      el.classList.toggle("off", !bv.enabled);
      el.setAttribute("aria-disabled", String(!bv.enabled || this.isBusy()));
      if (container.children[index] !== el) container.insertBefore(el, container.children[index] ?? null);
    });
    // look around stands on its own line, above the other buttons: it stays, and changes with what is left to find
    const explore = container.querySelector<HTMLElement>('button.btn[data-id^="explore:"]');
    if (explore) {
      explore.classList.add("explore");
      if (explore.nextElementSibling) explore.after(div("", "break"));
    }
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
        if (it.actions.length) {
          const acts = document.createElement("span");
          acts.className = "acts";
          acts.append(...this.itemButtons(it.label, it.actions));
          row.append(acts);
        }
        return row;
      }),
    );
  }

  /** Small labelled buttons next to an item (cook, fill...), for the stores and the inventory. */
  private itemButtons(itemLabel: string, actions: ButtonView[]): HTMLButtonElement[] {
    return actions.map((a) => {
      const b = document.createElement("button");
      b.className = "iaction sbtn" + (a.enabled ? "" : " off");
      b.dataset.action = a.id.split(":").at(-1)!;
      b.textContent = a.label;
      const label = `${a.label} ${itemLabel} (${a.tooltip.join(", ")})`;
      b.title = a.reason ? `${label}: ${a.reason}` : label;
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => { if (a.enabled) this.send(a.command, b); });
      return b;
    });
  }

  private renderStores(v: View) {
    this.els.storesBox.hidden = v.stores.length === 0;
    this.els.stores.replaceChildren(
      ...v.stores.map((s) => {
        const row = div("", "row");
        row.dataset.id = s.id;
        row.append(div(s.label, "key"), div(String(s.count), "val"));
        // the item's buttons are grouped so a layout can place them (e.g. outside the box)
        const acts = document.createElement("span");
        acts.className = "acts";
        if (s.use) {
          const b = document.createElement("button");
          b.className = "use sbtn";
          b.textContent = s.use.verb;
          b.title = s.use.tooltip.join(" · ");
          b.disabled = this.isBusy();
          b.addEventListener("click", () => this.send({ type: "consume", item: s.id }, b));
          acts.append(b);
        }
        acts.append(...this.itemButtons(s.label, s.actions));
        if (acts.childElementCount) row.append(acts);
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
