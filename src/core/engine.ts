import type { Registry } from "../content/registry";
import type { Activity, BuildingStep, Condition, Effect, Effort, GameEvent, Landmark, ItemAction, Outcome, Recipe, RecipeWay, Region, Thoughts, Yield } from "../content/schema";
import { phaseAt } from "./clock";
import { batchesReady, buildingKey, buildingState, evaluate, explain, toolFactor, type Ctx } from "./conditions";
import { int, weighted } from "./rng";
import { createInitialState, type GameState } from "./state";
import { chooseText, sentence } from "./text";

export type Command =
  | { type: "activity"; id: string }
  | { type: "travel"; region: string }
  | { type: "consume"; item: string }
  | { type: "explore" }
  /** open the craft menu or the build menu (a pop-up; choosing in it makes the thing) */
  | { type: "menu"; menu: "craft" | "build" }
  | { type: "itemAction"; item: string; action: string }
  /** a building here (its button in the buildings panel): start its cycle (sow, set the trap) or collect (harvest) */
  | { type: "building"; id: string; step: "start" | "collect" }
  /** pick a button in the open event ("close" ends a scene without choices) */
  | { type: "choose"; choice: string };

export interface Result {
  ok: boolean;
  /** why the command was refused */
  reason?: string;
  /** cosmetic cooldown for the UI, in ms */
  cooldownMs: number;
  died?: boolean;
}

const refuse = (reason: string): Result => ({ ok: false, reason, cooldownMs: 0 });

/**
 * The engine interprets content. It owns the current state (saving and loading are outside it).
 * It never touches the DOM, Date or Math.random, so tests and tools can run it in Node.
 */
export class Engine {
  state: GameState;
  private damageLogged = new Set<string>();
  /** while true, nothing is logged (you are asleep); see doActivity */
  private quiet = false;
  /** what is happening, named as the cause if it kills you without a damage rule (an event, food) */
  private causeHint: string | undefined;
  /** the game before the current command, to say what a finished task changed */
  /** places unlocked during the current command (see offerNewPlaces) */
  private opened: string[] = [];
  private before?: { items: Record<string, number>; unlocked: string[]; location: string; possible: string[]; built: string[]; cmd: Command["type"] };
  /** characters logged during the current command, for the progress bar duration */
  private loggedChars = 0;
  /** something was crafted or built in the current command (its note says what is now possible) */
  private made = false;

  constructor(public reg: Registry, state: GameState) {
    this.state = state;
    // saves from before these existed
    this.state.today ??= {};
    this.state.lastText ??= {};
    this.state.events ??= { active: null, queue: [], seen: {} };
    this.state.buildings ??= {};
    for (const b of Object.values(this.state.buildings)) b.count ??= 1;
  }

  static newGame(reg: Registry, seed: number): Engine {
    const e = new Engine(reg, createInitialState(reg, seed));
    e.syncQuests(); // "start" quests and anything already true at the first moment
    // "start" events open before anything else (the story before the beach)
    e.state.events.queue = [...reg.events.values()].filter((ev) => ev.trigger === "start").map((ev) => ev.id);
    e.openNextEvent();
    return e;
  }

  ctx(effort?: Effort): Ctx {
    return { reg: this.reg, state: this.state, effort };
  }

  log(text: string | undefined) {
    if (!text || this.quiet) return;
    this.state.log.unshift({ at: this.state.time, text, turn: this.state.turn ?? 0 });
    this.loggedChars += text.length;
    if (this.state.log.length > 100) this.state.log.length = 100;
  }

  /** One variant of a content text (see chooseText); `{place}` etc. are filled from `vars`. */
  say(t: string | readonly string[] | undefined, vars?: Record<string, string>): string | undefined {
    return t === undefined ? undefined : chooseText(t, this.state, vars);
  }

  /** Log several lines in reading order (the view groups them into one paragraph per action). */
  logLines(lines: Array<string | undefined>) {
    for (const line of lines) this.log(line);
  }

  // ---------------------------------------------------------------- commands

  dispatch(cmd: Command): Result {
    if (this.state.dead) return refuse("you are dead");
    // while an event is open, only its buttons work
    if (this.state.events.active && cmd.type !== "choose") return refuse("an event is open");
    if (!this.state.events.active && cmd.type === "choose") return refuse("no event is open");
    this.state.turn = (this.state.turn ?? 0) + 1;
    this.state.prevStats = { ...this.state.stats };
    this.damageLogged.clear();
    this.loggedChars = 0;
    this.causeHint = undefined;
    this.before = { ...this.snapshot(), cmd: cmd.type };
    this.made = false;
    const notesBefore = this.state.events.notes?.length ?? 0;
    const res = this.run(cmd);
    this.offerNewPlaces(notesBefore);
    // a task finished by this command: its note opens first
    if (!this.state.events.active && !this.state.dead) this.openNextEvent();
    if (res.ok && !this.state.dead && cmd.type !== "choose" && cmd.type !== "explore") this.checkEvents(this.actionKeys(cmd));
    this.before = undefined;
    return res;
  }

  /**
   * Places new on the map after a command: the pop-up that opened them says so and offers to walk
   * there ("go to the forest"). A look-around finding gets the line and the button; a task note from
   * this command gets the button (it already says the way opens); otherwise a note of its own.
   */
  private offerNewPlaces(notesBefore: number) {
    const ids = this.opened.filter((id) => id !== this.state.location);
    this.opened = [];
    if (!ids.length || this.state.dead) return;
    const np = this.reg.game.newPlace;
    const hint = () => ids.map((id) => this.say(np.text, { place: this.reg.regions.get(id)!.name })!).join(" ");
    const a = this.state.events.active;
    const notes = (this.state.events.notes ??= []);
    if (a?.id.startsWith("explore:") && a.scene !== "look") Object.assign(a, { hint: hint(), go: ids });
    else if (notes.length > notesBefore) notes[notes.length - 1].go = ids;
    else notes.push({ title: this.say(np.title)!, text: hint(), go: ids });
  }

  /** "go to the forest" in a pop-up: close it and walk there (after-explore events follow). */
  private goFromPopup(choiceId: string, after?: string[]): Result | null {
    const a = this.state.events.active!;
    const id = choiceId.startsWith("go:") ? choiceId.slice(3) : "";
    if (!id || !a.go?.includes(id)) return null;
    this.state.events.active = null;
    const res = this.travel(id);
    if (!this.state.dead && after) this.checkEvents(after);
    if (!this.state.dead && !this.state.events.active) this.openNextEvent();
    return res;
  }

  /** What a finished task can be compared against: items, open places, actions possible here. */
  private snapshot() {
    const region = this.reg.regions.get(this.state.location)!;
    return {
      items: { ...this.state.items },
      unlocked: this.reg.regionOrder.filter((id) => this.state.regions[id]?.unlocked),
      location: this.state.location,
      possible: region.activities.filter((a) => { const c = this.check(a); return c.visible && c.enabled; }).map((a) => a.id),
      built: Object.keys(this.state.buildings),
    };
  }

  /**
   * What changed since the command began, as short sentences (game.json → tasks): items gained,
   * items used, places opened, and (when the task's own action did it) actions now possible here.
   */
  private changes(): string[] {
    const b = this.before;
    if (!b) return [];
    const t = this.reg.game.tasks;
    const now = this.snapshot();
    const gained: string[] = [], used: string[] = [], out: string[] = [];
    const inv = new Set<string>(this.reg.game.inventoryCategories);
    const named = (id: string, n: number) => {
      const it = this.reg.items.get(id)!;
      return n > 1 ? `${n} ${it.plural ?? it.name}` : it.name;
    };
    for (const id of new Set([...Object.keys(b.items), ...Object.keys(now.items)])) {
      const d = (now.items[id] ?? 0) - (b.items[id] ?? 0);
      if (d > 0) gained.push(sentence(this.say(t.gained, { item: named(id, d), where: inv.has(this.reg.items.get(id)!.category) ? "inventory" : "stores" })!));
      if (d < 0) used.push(sentence(this.say(t.used, { item: named(id, -d) })!));
    }
    out.push(...gained, ...used);
    for (const key of now.built) if (!b.built.includes(key)) out.push(sentence(this.say(t.built, { building: this.reg.buildings.get(key.split("@")[0])!.name })!));
    for (const id of now.unlocked) if (!b.unlocked.includes(id)) out.push(this.say(t.opened, { place: this.reg.regions.get(id)!.name })!);
    if (this.made && now.location === b.location) {
      const region = this.reg.regions.get(now.location)!;
      for (const id of now.possible) if (!b.possible.includes(id)) out.push(this.say(t.possible, { action: region.activities.find((a) => a.id === id)!.name })!);
    }
    return out;
  }

  private run(cmd: Command): Result {
    switch (cmd.type) {
      case "activity": return this.doActivity(cmd.id);
      case "travel": return this.travel(cmd.region);
      case "consume": return this.consume(cmd.item);
      case "explore": return this.explore();
      case "menu": return this.openMenu(cmd.menu);
      case "itemAction": return this.itemAction(cmd.item, cmd.action);
      case "building": return this.buildingStep(cmd.id, cmd.step);
      case "choose": return this.choose(cmd.choice);
    }
  }

  // ---------------------------------------------------------------- events

  /** The open event and its scene, if any. */
  openEventScene(): { event: GameEvent; scene: GameEvent["scenes"][string]; text: string } | null {
    const a = this.state.events.active;
    if (!a || a.id.startsWith("explore:") || a.id.startsWith("menu:") || a.id === "note") return null;
    const event = this.reg.events.get(a.id)!;
    return { event, scene: event.scenes[a.scene], text: a.text };
  }

  /** Is a choice of the open scene shown, and can it be picked now? */
  checkChoice(c: { visibleWhen?: Condition; requires?: Condition; requiresText?: string }): { visible: boolean; enabled: boolean; reason?: string } {
    const ctx = this.ctx();
    if (!evaluate(c.visibleWhen, ctx)) return { visible: false, enabled: false };
    if (!evaluate(c.requires, ctx)) return { visible: true, enabled: false, reason: c.requiresText ?? explain(c.requires, ctx) ?? undefined };
    return { visible: true, enabled: true };
  }

  private choose(choiceId: string): Result {
    if (this.state.events.active!.id === "note") {
      const went = this.goFromPopup(choiceId);
      if (went) return went;
      if (choiceId !== "close") return refuse("unknown choice");
      this.state.events.active = null;
      this.openNextEvent();
      return this.chose();
    }
    if (this.state.events.active!.id.startsWith("explore:")) return this.exploreChoose(choiceId);
    if (this.state.events.active!.id.startsWith("menu:")) return this.menuChoose(choiceId);
    const open = this.openEventScene()!;
    const { event, scene } = open;
    if (!scene.choices) {
      if (choiceId !== "close") return refuse("unknown choice");
      this.endEvent(event);
      return this.chose();
    }
    const c = scene.choices.find((x) => x.id === choiceId);
    if (!c) return refuse("unknown choice");
    const check = this.checkChoice(c);
    if (!check.visible) return refuse("unknown choice");
    if (!check.enabled) return refuse(check.reason ?? "not possible now");
    this.remember(`${event.id}_${c.id}`);
    this.causeHint = event.title.toLowerCase();
    this.applyEffects(c.effects);
    if (this.state.dead) { this.state.events.active = null; this.state.events.queue = []; return this.died(0); }
    if (c.next) this.enterScene(event, c.next);
    else this.endEvent(event);
    return this.chose();
  }

  /** A choice takes no game time, and the next page must be clickable at once: no progress bar. */
  private chose(): Result {
    return this.state.dead ? this.died(0) : { ok: true, cooldownMs: 0 };
  }

  private openNextEvent() {
    const note = this.state.events.notes?.shift();
    if (note) { this.state.events.active = { id: "note", scene: "note", text: note.text, title: note.title, go: note.go }; return; }
    const id = this.state.events.queue.shift();
    if (!id) return;
    const event = this.reg.events.get(id)!;
    const seen = (this.state.events.seen[id] ??= { count: 0, lastAt: 0 });
    seen.count += 1;
    seen.lastAt = this.state.time;
    this.enterScene(event, "start");
  }

  private enterScene(event: GameEvent, sceneId: string) {
    const scene = event.scenes[sceneId];
    const text = this.say(scene.text)!;
    this.state.events.active = { id: event.id, scene: sceneId, text };
    // the event is part of the story: its pages go into the journal too, in the order they happen
    this.logStory(text);
    this.applyEffects(scene.effects);
  }

  /**
   * Write a passage into the journal as its own paragraph(s): a blank line in the text starts a
   * new paragraph. Whatever is logged after it in the same command starts a new paragraph too.
   */
  private logStory(text: string) {
    for (const p of text.split(/\n\s*\n/)) {
      this.state.turn = (this.state.turn ?? 0) + 1;
      this.log(p.trim());
    }
    this.state.turn = (this.state.turn ?? 0) + 1;
  }

  private endEvent(event: GameEvent) {
    this.state.events.active = null;
    this.remember(event.id);
    // the story before the beach is over: the journal starts
    if (event.trigger === "start" && !this.state.events.queue.some((id) => this.reg.events.get(id)!.trigger === "start")) {
      this.log(this.say(this.reg.game.start.log));
    }
    this.postCheck();
    this.openNextEvent();
  }

  /** Can this event open now (once only, or after its cooldown; its extra condition)? */
  private eventCanOpen(ev: GameEvent): boolean {
    const seen = this.state.events.seen[ev.id];
    if (seen && (!ev.repeat || this.state.time - seen.lastAt < ev.repeat.cooldownHours * 60)) return false;
    return evaluate(ev.when, this.ctx());
  }

  /** After an action: open the first event whose trigger fires (time, condition, or a chance roll). */
  private checkEvents(keys: string[]) {
    if (this.state.events.active || this.state.dead) return;
    const ctx = this.ctx();
    for (const ev of this.reg.events.values()) {
      const t = ev.trigger;
      if (t === "start" || !this.eventCanOpen(ev)) continue;
      let fires = false;
      if ("at" in t) fires = evaluate({ reached: { day: t.at.day, hour: t.at.hour } }, ctx);
      else if ("when" in t) fires = evaluate(t.when, ctx);
      else if (!t.after || t.after.some((a) => keys.includes(a))) fires = pickChance(this.state, t.chance);
      if (fires) {
        this.state.events.queue.push(ev.id);
        this.openNextEvent();
        return;
      }
    }
  }

  /** What an action counts as for { after: [...] } triggers. */
  private actionKeys(cmd: Command): string[] {
    switch (cmd.type) {
      case "activity": return [cmd.id, ...(this.reg.activities.get(cmd.id)?.activity.tags ?? [])];
      case "travel": return ["travel", cmd.region];
      case "explore": return ["explore"];
      case "consume": return [cmd.item, ...(this.reg.items.get(cmd.item)?.consume?.tags ?? [])];
      case "itemAction": return [cmd.item, ...(this.reg.items.get(cmd.item)?.actions?.find((a) => a.id === cmd.action)?.tags ?? [])];
      case "menu": return [];
      case "building": {
        const b = this.reg.buildings.get(cmd.id)?.cycle?.[cmd.step];
        return b ? [b.id, ...(b.tags ?? [])] : [];
      }
      case "choose": return [];
    }
  }

  /** The "look around" action of the current region: visible until everything is discovered. */
  /**
   * Is this command a sleep that will happen now (an activity with effort "sleep", allowed here)?
   * The game is saved just before it, so after a death you can load and do the evening differently.
   */
  willSleep(cmd: Command): boolean {
    if (cmd.type !== "activity" || this.state.dead || this.state.events.active) return false;
    const entry = this.reg.activities.get(cmd.id);
    if (!entry || entry.activity.effort !== "sleep" || entry.region !== this.state.location) return false;
    const c = this.check(entry.activity);
    return c.visible && c.enabled;
  }

  /** The "look around" button: there if the region can be explored; `open` = landmarks offered now. */
  checkExplore(): { visible: boolean; open: number; found: number; total: number } {
    const region = this.reg.regions.get(this.state.location)!;
    const ex = region.explore;
    if (!ex) return { visible: false, open: 0, found: 0, total: 0 };
    const st = this.state.regions[region.id];
    return {
      visible: true,
      open: this.openLandmarks(region).length,
      found: ex.landmarks.filter((d) => st.discoveries.includes(d.id)).length,
      total: ex.landmarks.length,
    };
  }

  /** Landmarks of a region not explored yet whose visibleWhen holds now, in content order. */
  openLandmarks(region: Region): Landmark[] {
    const st = this.state.regions[region.id];
    const ctx = this.ctx();
    return (region.explore?.landmarks ?? []).filter((d) => !st.discoveries.includes(d.id) && evaluate(d.visibleWhen, ctx));
  }


  // ---------------------------------------------------------------- craft and build menus

  /** A recipe's way now: the first whose visibleWhen holds. */
  recipeWay(r: Recipe): RecipeWay | undefined {
    const ctx = this.ctx();
    return r.ways.find((w) => evaluate(w.visibleWhen, ctx));
  }

  /** Recipes in the craft menu: available, and not had yet (unless they can be made again). */
  craftOptions(): Recipe[] {
    const ctx = this.ctx();
    return [...this.reg.recipes.values()].filter((r) =>
      evaluate(r.availableWhen, ctx) && !!this.recipeWay(r) && (r.multiple || (this.state.items[r.item] ?? 0) < 1));
  }

  /**
   * Is the craft or build button shown? Not at the start: from the moment something can be crafted,
   * or something is available to build somewhere; then it stays, everywhere (flag "menu_<menu>").
   */
  menuShown(menu: "craft" | "build"): boolean {
    if (this.state.flags.includes(`menu_${menu}`)) return true;
    if (menu === "craft") return this.craftOptions().length > 0;
    const ctx = this.ctx();
    return [...this.reg.buildings.values()].some((b) => evaluate(b.availableWhen, ctx));
  }

  /** Buildings in the build menu: available, allowed here, fewer than their max here. */
  buildOptions(): string[] {
    return [...this.reg.buildings.keys()].filter((id) => this.buildable(id));
  }

  /** Can this recipe be made now (its way's requirements and cost)? */
  checkRecipe(r: Recipe): { enabled: boolean; reason?: string } {
    const w = this.recipeWay(r);
    if (!w) return { enabled: false };
    return this.checkCost(w.requires, w.requiresText, w.cost);
  }

  private checkCost(requires: Condition | undefined, requiresText: string | undefined, cost: Record<string, number> | undefined): { enabled: boolean; reason?: string } {
    const ctx = this.ctx();
    if (!evaluate(requires, ctx)) return { enabled: false, reason: requiresText ?? explain(requires, ctx) ?? undefined };
    for (const [item, n] of Object.entries(cost ?? {})) {
      const have = this.state.items[item] ?? 0;
      if (have < n) return { enabled: false, reason: `needs ${n} ${this.reg.items.get(item)?.name ?? item} (have ${have})` };
    }
    return { enabled: true };
  }

  /** Open the craft or build menu: a pop-up listing what can be made (no time passes); `empty` says when there is nothing. */
  private openMenu(menu: "craft" | "build"): Result {
    const m = this.reg.game.menus[menu];
    const empty = menu === "craft" ? !this.craftOptions().length : !this.buildOptions().length;
    this.state.events.active = { id: `menu:${menu}`, scene: "menu", text: this.say(empty ? m.empty : m.text)! };
    return { ok: true, cooldownMs: 0 };
  }

  /** A choice in a menu: close, or make it (the pop-up closes; the work takes its time and shows its bar). */
  private menuChoose(choiceId: string): Result {
    const menu = this.state.events.active!.id.slice("menu:".length) as "craft" | "build";
    if (choiceId === "close") { this.state.events.active = null; return this.chose(); }
    if (menu === "craft") {
      const r = this.craftOptions().find((x) => x.id === choiceId);
      if (!r) return refuse("unknown choice");
      const c = this.checkRecipe(r);
      if (!c.enabled) return refuse(c.reason ?? "not possible now");
      this.state.events.active = null;
      this.made = true;
      const res = this.craft(r);
      if (res.ok && !this.state.dead) this.checkEvents([r.id, ...(r.tags ?? [])]);
      return res;
    }
    if (!this.buildOptions().includes(choiceId)) return refuse("unknown choice");
    const c = this.checkBuildingStep(choiceId, "build");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");
    this.state.events.active = null;
    this.made = true;
    const res = this.buildingStep(choiceId, "build");
    if (res.ok && !this.state.dead) this.checkEvents([choiceId]);
    return res;
  }

  /**
   * An action's time with the tools you have: a stand-in for a tool it needs (the rock knife for the
   * knife) makes it take longer (see Item.substitutes).
   */
  hoursFor(hours: number, conds: Array<Condition | undefined>): number {
    return hours * toolFactor(this.reg, this.state, conds);
  }

  private craft(r: Recipe): Result {
    const w = this.recipeWay(r)!;
    const hours = this.hoursFor(w.hours, [w.visibleWhen, w.requires]);
    this.take(w.cost);
    this.log(this.say(w.log));
    if (!this.advance(hours, w.effort)) return this.died(hours);
    this.give({ [r.item]: r.count ?? 1 });
    this.applyEffects(w.effects);
    this.count(r.id, r.tags);
    this.postCheck();
    return this.ok(hours);
  }

  /** Is an item's action button (e.g. cook) shown, and usable now? */
  checkItemAction(itemId: string, a: ItemAction): { visible: boolean; enabled: boolean; reason?: string } {
    const ctx = this.ctx();
    const have = this.state.items[itemId] ?? 0;
    if (have <= 0 || !evaluate(a.visibleWhen, ctx)) return { visible: false, enabled: false };
    if (!evaluate(a.requires, ctx)) {
      return { visible: true, enabled: false, reason: a.requiresText ?? explain(a.requires, ctx) ?? undefined };
    }
    const need = { [itemId]: a.uses ?? 1, ...(a.cost ?? {}) };
    for (const [item, n] of Object.entries(need)) {
      const got = this.state.items[item] ?? 0;
      if (got < n) return { visible: true, enabled: false, reason: `needs ${n} ${this.reg.items.get(item)?.name ?? item} (have ${got})` };
    }
    return { visible: true, enabled: true };
  }

  private itemAction(itemId: string, actionId: string): Result {
    const a = this.reg.items.get(itemId)?.actions?.find((x) => x.id === actionId);
    if (!a) return refuse("you can't do that");
    const c = this.checkItemAction(itemId, a);
    if (!c.visible) return refuse("not possible here");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");
    const hours = this.hoursFor(a.hours, [a.visibleWhen, a.requires]);
    this.take({ [itemId]: a.uses ?? 1 });
    this.take(a.cost);
    this.log(this.say(a.log));
    if (!this.advance(hours, a.effort)) return this.died(hours);
    this.applyEffects(a.effects);
    this.count(`${itemId}_${a.id}`, a.tags);
    this.postCheck();
    return this.ok(hours);
  }

  /** "look around": open the pop-up with what you see and the landmarks to explore. No time passes. */
  private explore(): Result {
    const region = this.reg.regions.get(this.state.location)!;
    const ex = region.explore;
    if (!ex) return refuse("nothing to explore here");
    const ctx = this.ctx();
    const lines = ex.view.filter((v) => evaluate(v.when, ctx)).map((v) => this.say(v.text)!);
    if (!this.openLandmarks(region).length && ex.nothingLeft) lines.push(this.say(ex.nothingLeft)!);
    this.state.events.active = { id: `explore:${region.id}`, scene: "look", text: lines.join(" ") };
    return { ok: true, cooldownMs: 0 };
  }

  /** A choice in the look-around pop-up: a landmark to explore, or close. */
  private exploreChoose(choiceId: string): Result {
    const active = this.state.events.active!;
    const region = this.reg.regions.get(active.id.slice("explore:".length))!;
    if (active.scene !== "look") {
      // the finding is read: back to the game (or walk to a place it opened); "after explore" events may follow
      const went = this.goFromPopup(choiceId, ["explore", active.scene.slice("found:".length)]);
      if (went) return went;
      if (choiceId !== "close") return refuse("unknown choice");
      this.state.events.active = null;
      this.checkEvents(["explore", active.scene.slice("found:".length)]);
      return this.chose();
    }
    if (choiceId === "close") { this.state.events.active = null; return this.chose(); }
    const d = this.openLandmarks(region).find((x) => x.id === choiceId);
    if (!d) return refuse("unknown choice");
    const check = this.checkChoice(d);
    if (!check.enabled) return refuse(check.reason ?? "not possible now");
    const hours = this.hoursFor(d.hours, [d.visibleWhen, d.requires]);
    if (!this.advance(hours, d.effort)) { this.state.events.active = null; return this.died(hours); }
    const st = this.state.regions[region.id];
    st.discoveries.push(d.id);
    st.explored += 1;
    this.remember(d.id);
    const text = this.say(d.text)!;
    this.state.events.active = { id: active.id, scene: `found:${d.id}`, text };
    this.logStory(text);
    this.applyEffects(d.effects);
    this.postCheck();
    if (this.state.dead) this.state.events.active = null;
    return this.chose();
  }


  /** Can this activity be shown, and can it be done now? Used by the UI and by dispatch. */
  check(a: Activity): { visible: boolean; enabled: boolean; reason?: string } {
    const ctx = this.ctx();
    if (!evaluate(a.visibleWhen, ctx)) return { visible: false, enabled: false };
    if (!evaluate(a.requires, ctx)) {
      return { visible: true, enabled: false, reason: a.requiresText ?? explain(a.requires, ctx) ?? undefined };
    }
    for (const [item, n] of Object.entries(a.cost ?? {})) {
      const have = this.state.items[item] ?? 0;
      if (have < n) {
        const name = this.reg.items.get(item)?.name ?? item;
        return { visible: true, enabled: false, reason: `needs ${n} ${name} (have ${have})` };
      }
    }
    return { visible: true, enabled: true };
  }

  private doActivity(id: string): Result {
    const entry = this.reg.activities.get(id);
    if (!entry) return refuse(`unknown activity ${id}`);
    if (entry.region !== this.state.location) return refuse("not here");
    const a = entry.activity;
    const c = this.check(a);
    if (!c.visible) return refuse("not available");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");

    const hours = this.hoursFor(a.hours, [a.visibleWhen, a.requires]);
    // thoughts are worked out first: how tired you are as you lie down, not after the night
    this.logLines(this.thoughts(a.thoughts));
    this.take(a.cost);
    this.log(this.say(a.log));
    // asleep you notice nothing (thirst, the fire dying): the morning sums it up in `afterwards`
    this.quiet = a.effort === "sleep";
    const alive = this.advance(hours, a.effort);
    this.quiet = false;
    if (!alive) return this.died(hours);

    this.applyYields(a.yields);
    this.applyOutcomes(a.outcomes);
    this.applyEffects(a.effects);
    this.logLines(this.thoughts(a.afterwards));
    this.count(a.id, a.tags);
    // sleeping ends the day: tomorrow's memories start empty
    if (a.effort === "sleep") this.state.today = {};
    this.postCheck();
    return this.ok(hours);
  }

  private travel(regionId: string): Result {
    const to = this.reg.regions.get(regionId);
    const from = this.reg.regions.get(this.state.location)!;
    if (!to) return refuse(`unknown region ${regionId}`);
    if (regionId === this.state.location) return refuse("already here");
    if (!this.state.regions[regionId]?.unlocked) return refuse("you don't know the way");

    // travel goes via camp: time from here to camp plus camp to there
    const hours = from.travelHours + to.travelHours;
    this.log(this.say(this.reg.game.journal.walkTo, { place: to.name }));
    if (!this.advance(hours, "work")) return this.died(hours);

    this.state.location = regionId;
    this.remember(regionId);
    const r = this.state.regions[regionId];
    if (!r.visited) {
      r.visited = true;
      this.logLines([this.say(to.description), this.say(to.firstVisit?.log)]);
    } else {
      this.logLines(this.arrivalView(to));
    }
    this.postCheck();
    // walking takes its game time, but shows no progress bar: you arrive at once (a bar here felt like loading)
    return this.state.dead ? this.died(hours) : { ok: true, cooldownMs: 0 };
  }

  /** The lines of an activity's thought groups whose conditions hold now (see Thoughts in the schema). */
  thoughts(groups: Thoughts[] | undefined): string[] {
    const ctx = this.ctx();
    const out: string[] = [];
    for (const g of groups ?? []) {
      const lines = g.lines.filter((l) => evaluate(l.when, ctx)).slice(0, g.max ?? Infinity);
      if (lines.length) {
        if (g.intro) out.push(this.say(g.intro)!);
        for (const l of lines) out.push(this.say(l.text)!);
      } else if (g.otherwise) {
        out.push(this.say(g.otherwise)!);
      }
    }
    return out;
  }

  /** What you see on arriving again: the region's `arrive` lines whose condition holds now. */
  arrivalView(region: Region): string[] {
    const ctx = this.ctx();
    return (region.arrive ?? []).filter((a) => evaluate(a.when, ctx)).map((a) => this.say(a.text)!);
  }

  // ---------------------------------------------------------------- buildings

  /** Can this building stand where you are (one of its places, whose condition holds)? */
  canBuildHere(id: string): boolean {
    const b = this.reg.buildings.get(id);
    const ctx = this.ctx();
    return !!b && b.places.some((p) => p.region === this.state.location && evaluate(p.when, ctx));
  }

  /** How many of a building stand where you are (0 = none). */
  builtHere(id: string): number {
    return this.state.buildings[buildingKey(id, this.state.location)]?.count ?? 0;
  }

  /** Is it offered in the build menu here: available, allowed in this place, fewer than its max? */
  buildable(id: string): boolean {
    const b = this.reg.buildings.get(id);
    return !!b && evaluate(b.availableWhen, this.ctx()) && this.canBuildHere(id) && this.builtHere(id) < (b.max ?? 1);
  }

  /** The cycle step a building here offers now (in the buildings panel): start when idle, collect when ready. */
  buildingStepFor(id: string): { step: "start" | "collect"; def: BuildingStep } | null {
    const b = this.reg.buildings.get(id);
    if (!b?.cycle) return null;
    const st = buildingState(this.reg, this.state, id, this.state.location);
    if (st === "idle") return { step: "start", def: b.cycle.start };
    if (st === "ready") return { step: "collect", def: b.cycle.collect };
    return null;
  }

  /**
   * A step's cost and time for the buildings here: several in a place work together, so starting or
   * collecting costs and takes that many times as much (building one is always for one).
   */
  stepCost(id: string, step: "build" | "start" | "collect"): { hours: number; cost: Record<string, number> } {
    const b = this.reg.buildings.get(id)!;
    const d = step === "build" ? b.build : b.cycle![step];
    const n = step === "build" ? 1 : Math.max(1, this.builtHere(id));
    const cost: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.cost ?? {})) cost[k] = v * n;
    return { hours: this.hoursFor(d.hours * n, [d.requires]), cost };
  }

  /** Can this step be done now (you are there, it is its turn, its requirements and cost)? */
  checkBuildingStep(id: string, step: "build" | "start" | "collect"): { visible: boolean; enabled: boolean; reason?: string } {
    const b = this.reg.buildings.get(id);
    if (!b) return { visible: false, enabled: false };
    const d = step === "build" ? (this.buildable(id) ? b.build : null) : (this.buildingStepFor(id)?.step === step ? b.cycle![step] : null);
    if (!d) return { visible: false, enabled: false };
    return { visible: true, ...this.checkCost(d.requires, d.requiresText, this.stepCost(id, step).cost) };
  }

  /** Put up a building here, start its cycle, or collect what it made (once per batch ready, per building). */
  private buildingStep(id: string, step: "build" | "start" | "collect"): Result {
    const c = this.checkBuildingStep(id, step);
    if (!c.visible) return refuse("not available");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");
    const b = this.reg.buildings.get(id)!;
    const key = buildingKey(id, this.state.location);
    const d = step === "build" ? b.build : b.cycle![step];
    const { hours, cost } = this.stepCost(id, step);
    const n = Math.max(1, this.builtHere(id));
    const batches = step === "collect" ? batchesReady(this.reg, this.state, id, this.state.location) : 0;
    this.take(cost);
    this.log(this.say(d.log));
    // what was caught so far is taken out now; with `repeat` the next batch counts from the end of the work
    if (step === "collect") this.state.buildings[key].startedAt = undefined;
    if (!this.advance(hours, d.effort)) return this.died(hours);
    if (step === "build") this.addBuilding(id);
    if (step === "start" || (step === "collect" && b.cycle!.repeat)) this.state.buildings[key].startedAt = this.state.time;
    if (step === "collect") {
      const cd = d as BuildingStep;
      for (let i = 0; i < Math.max(1, batches) * n; i++) { this.applyYields(cd.yields); this.applyOutcomes(cd.outcomes); }
    }
    this.applyEffects(d.effects);
    if (step === "build") this.count(id);
    else this.count((d as BuildingStep).id, (d as BuildingStep).tags);
    this.postCheck();
    return this.ok(hours);
  }

  /** One more of a building where you are (up to its max). A new one joins a cycle already running. */
  private addBuilding(id: string) {
    const key = buildingKey(id, this.state.location);
    const max = this.reg.buildings.get(id)!.max ?? 1;
    const st = this.state.buildings[key];
    if (!st) this.state.buildings[key] = { count: 1, builtAt: this.state.time };
    else st.count = Math.min(max, (st.count ?? 1) + 1);
  }

  /** Buildings here whose first batch became ready in this clock step: say so (if you are awake). */
  private buildingsReady(from: number, to: number) {
    for (const [key, st] of Object.entries(this.state.buildings)) {
      const [id, region] = key.split("@");
      const b = this.reg.buildings.get(id);
      if (st.startedAt === undefined || region !== this.state.location || !b?.cycle?.readyLog) continue;
      const first = st.startedAt + Math.round(b.cycle.hours * 60);
      if (first > from && first <= to) this.log(this.say(b.cycle.readyLog));
    }
  }

  private consume(itemId: string): Result {
    const item = this.reg.items.get(itemId);
    if (!item?.consume) return refuse("you can't use that");
    if ((this.state.items[itemId] ?? 0) < 1) return refuse(`no ${item.name} left`);
    const c = item.consume;
    this.causeHint = `bad ${item.name}`;
    this.take({ [itemId]: 1 });
    this.log(this.say(c.log));
    if (!this.advance(c.hours, c.effort ?? "light")) return this.died(c.hours);
    if (c.stats) this.applyEffects([{ stat: c.stats }]);
    this.applyOutcomes(c.outcomes);
    this.count(itemId, c.tags);
    this.postCheck();
    return this.ok(c.hours);
  }

  private ok(hours: number): Result {
    if (this.state.dead) return this.died(hours);
    return { ok: true, cooldownMs: this.progressMs(hours) };
  }

  private died(hours: number): Result {
    return { ok: true, died: true, cooldownMs: this.progressMs(hours) };
  }

  /** Real-time length of the progress bar: longer actions and more text to read take longer. */
  progressMs(hours: number): number {
    const { msPerHour, msPerChar, minMs, maxMs } = this.reg.game.cosmetic;
    const ms = hours * msPerHour + this.loggedChars * msPerChar;
    return Math.round(Math.max(minMs, Math.min(maxMs, ms)));
  }



  // ---------------------------------------------------------------- simulation

  /**
   * Advance time in fixed steps. Returns false if the player died.
   * Step order: clock, timers, warmth, stat rates, damage, regen, death check.
   */
  advance(hours: number, effort: Effort): boolean {
    const { stepMinutes } = this.reg.game;
    const steps = Math.max(1, Math.round((hours * 60) / stepMinutes));
    const stepHours = stepMinutes / 60;
    const s = this.state;
    const ctx = this.ctx(effort);
    const { stats: sf } = this.reg;

    for (let i = 0; i < steps; i++) {
      s.time += stepMinutes;
      this.tickTimers(stepMinutes);
      this.buildingsReady(s.time - stepMinutes, s.time);
      if (s.time % 60 === 0) this.stepWarmth();

      // stat drain/gain by effort, with multipliers
      const rates = sf.ratesPerHour[effort] ?? {};
      for (const [stat, perHour] of Object.entries(rates)) {
        let factor = 1;
        for (const m of sf.multipliers) if (m.stat === stat && evaluate(m.when, ctx)) factor *= m.factor;
        s.stats[stat] = clamp((s.stats[stat] ?? 0) + perHour * factor * stepHours);
      }
      for (const d of sf.damage) {
        if (!evaluate(d.when, ctx)) continue;
        s.stats.health = clamp(s.stats.health + d.healthPerHour * stepHours);
        const key = JSON.stringify(d.when);
        if (d.log && !this.quiet && !this.damageLogged.has(key)) { this.damageLogged.add(key); this.log(this.say(d.log)); }
      }
      for (const r of sf.regen) {
        if (evaluate(r.when, ctx)) s.stats.health = clamp(s.stats.health + r.healthPerHour * stepHours);
      }
      if (s.stats.health <= 0) {
        // the cause: the rule hurting most at this moment (all of them if they tie), or what the
        // action was (an event, food)
        const hurting = sf.damage.filter((d) => d.healthPerHour < 0 && d.cause && evaluate(d.when, ctx));
        const worst = Math.min(...hurting.map((d) => d.healthPerHour));
        const causes = hurting.filter((d) => d.healthPerHour === worst).map((d) => d.cause!);
        this.quiet = false; // dying is never quiet
        this.die(causes.length ? causes.join(" and ") : this.causeHint);
        return false;
      }
    }
    return true;
  }

  private tickTimers(minutes: number) {
    const s = this.state;
    for (const t of this.reg.timers.values()) {
      const before = s.timers[t.id] ?? 0;
      if (before <= 0) continue;
      const after = Math.max(0, before - minutes);
      s.timers[t.id] = after;
      const warn = (t.warnAtHours ?? -1) * 60;
      if (t.warnLog && before > warn && after <= warn && after > 0) this.log(this.say(t.warnLog));
      if (after === 0) this.log(this.say(t.expireLog));
    }
  }

  /** Environment temperature where the player is, in °C. */
  feltTemperature(): number {
    const s = this.state;
    const region = this.reg.regions.get(s.location)!;
    let c = region.climate.baseC + phaseAt(this.reg, s.time).tempC;
    for (const t of this.reg.timers.values()) {
      if ((s.timers[t.id] ?? 0) > 0 && (!t.region || t.region === s.location)) c += t.modifiers?.localHeatC ?? 0;
    }
    // a building can keep its place warmer (the shelter out of the wind)
    for (const key of Object.keys(s.buildings)) {
      const [id, region] = key.split("@");
      if (region === s.location) c += this.reg.buildings.get(id)?.warmthC ?? 0;
    }
    return c;
  }

  /** Body warmth moves one band per hour toward the band of the felt temperature. */
  private stepWarmth() {
    const felt = this.feltTemperature();
    const bands = this.reg.climate.bodyBands;
    let target = bands.findIndex((b) => b.belowC !== undefined && felt < b.belowC);
    if (target < 0) target = bands.length - 1;
    const s = this.state;
    if (target > s.warmth) s.warmth++;
    else if (target < s.warmth) s.warmth--;
  }

  // ---------------------------------------------------------------- results

  private take(cost?: Record<string, number>) {
    for (const [k, n] of Object.entries(cost ?? {})) this.state.items[k] = Math.max(0, (this.state.items[k] ?? 0) - n);
  }

  private give(items: Record<string, number>) {
    for (const [k, n] of Object.entries(items)) {
      if (n <= 0) continue;
      const max = this.reg.items.get(k)?.max ?? Infinity;
      this.state.items[k] = Math.min(max, (this.state.items[k] ?? 0) + n);
      if (!this.state.seen.includes(k)) this.state.seen.push(k);
    }
  }

  private applyYields(ys?: Yield[]) {
    const s = this.state;
    for (const y of ys ?? []) {
      if (y.when && !evaluate(y.when, this.ctx())) continue;
      if (y.chance !== undefined && !(pickChance(s, y.chance))) continue;
      this.give({ [y.item]: int(s.rng, y.min, y.max) });
    }
  }

  private applyOutcomes(os?: Outcome[]) {
    if (!os?.length) return;
    const ctx = this.ctx();
    const o = weighted(this.state.rng, os.filter((x) => evaluate(x.when, ctx)));
    if (!o) return;
    this.log(this.say(o.text));
    this.applyEffects(o.effects);
  }

  applyEffects(es?: Effect[]) {
    const s = this.state;
    for (const e of es ?? []) {
      if ("give" in e) this.give(e.give);
      else if ("take" in e) this.take(e.take);
      else if ("stat" in e) for (const [k, d] of Object.entries(e.stat)) s.stats[k] = clamp((s.stats[k] ?? 0) + d);
      else if ("timer" in e) {
        const t = this.reg.timers.get(e.timer)!;
        s.timers[t.id] = Math.min(t.maxHours * 60, (s.timers[t.id] ?? 0) + e.addHours * 60);
      } else if ("flag" in e) { if (!s.flags.includes(e.flag)) s.flags.push(e.flag); }
      else if ("unflag" in e) s.flags = s.flags.filter((f) => f !== e.unflag);
      else if ("log" in e) this.log(this.say(e.log));
      else if ("roll" in e) this.applyOutcomes(e.roll);
      else if ("startQuest" in e) this.startQuest(e.startQuest);
      else if ("unlock" in e) {
        const st = s.regions[e.unlock];
        if (!st.unlocked) { st.unlocked = true; this.log(this.say(this.reg.game.journal.wayOpens, { place: this.reg.regions.get(e.unlock)!.name })); this.opened.push(e.unlock); }
      } else if ("build" in e) {
        this.addBuilding(e.build);
        this.remember(e.build);
      } else if ("startCycle" in e) {
        // the building here (e.g. the field is sown as it is dug)
        const st = s.buildings[buildingKey(e.startCycle, s.location)];
        if (st && st.startedAt === undefined) st.startedAt = s.time;
      }
    }
    if (s.stats.health <= 0 && !s.dead) this.die(this.causeHint);
  }

  /** Count a finished activity or item use, plus its tags, for { "did": ... } conditions. */
  private count(id: string, tags?: string[]) {
    for (const key of [id, ...(tags ?? [])]) {
      const k = `did:${key}`;
      this.state.counters[k] = (this.state.counters[k] ?? 0) + 1;
      this.remember(key);
    }
  }

  /**
   * Death is permanent: record when and why, and write the end screen's lines once (so a reload
   * shows the same words): how long you lasted, and the cause.
   */
  private die(cause?: string) {
    const s = this.state;
    const ending = this.reg.game.ending;
    s.dead = true;
    this.log(this.say(this.reg.game.deathLog));
    const { start } = this.reg.game;
    const lasted = s.time - ((start.day - 1) * 1440 + Math.round(start.hour * 60));
    const why = cause ?? ending.defaultCause;
    s.death = {
      time: s.time,
      cause: why,
      lines: [
        this.say(ending.survived, { time: duration(lasted), day: String(Math.floor(s.time / 1440) + 1) })!,
        this.say(ending.cause, { cause: why })!,
      ],
    };
  }

  /** Note something for today's memories ({ "today": id }); cleared when you sleep. */
  private remember(key: string) {
    this.state.today[key] = (this.state.today[key] ?? 0) + 1;
  }

  // ---------------------------------------------------------------- quests

  /** Start a quest if it hasn't started yet (from a trigger or a { "startQuest" } effect). */
  startQuest(id: string) {
    const q = this.reg.quests.get(id);
    if (!q || this.state.quests[id]) return;
    this.state.quests[id] = { status: "active", startedAt: this.state.time };
    this.log(this.say(q.startLog));
  }

  /**
   * Start quests whose trigger is met, finish active quests whose goal is met.
   * Repeats because finishing one quest can start the next (chains via effects or { "quest": ... }).
   */
  syncQuests() {
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (const q of this.reg.quests.values()) {
        const st = this.state.quests[q.id];
        if (!st) {
          const t = q.trigger;
          if (t === "start" || (typeof t === "object" && evaluate(t.when, this.ctx()))) {
            this.startQuest(q.id);
            changed = true;
          }
        } else if (st.status === "active" && evaluate(q.completeWhen, this.ctx())) {
          st.status = "done";
          st.doneAt = this.state.time;
          this.remember(q.id);
          const story = this.say(q.doneLog);
          this.log(story);
          this.applyEffects(q.effects);
          // a note: the task's ending, then what changed (opens when the command is over)
          (this.state.events.notes ??= []).push({
            title: this.say(this.reg.game.tasks.title, { task: q.title })!,
            text: [story, ...this.changes()].filter(Boolean).join("\n\n"),
          });
          changed = true;
        }
      }
      if (!changed) return;
    }
  }

  /** Runs after every command: unlock regions, then update quests (and remember menus once shown). */
  private postCheck() {
    const ctx = this.ctx();
    for (const id of this.reg.regionOrder) {
      const r = this.reg.regions.get(id)!;
      const st = this.state.regions[id];
      if (!st.unlocked && r.unlockWhen && evaluate(r.unlockWhen, ctx)) {
        st.unlocked = true;
        this.log(this.say(this.reg.game.journal.wayOpens, { place: r.name }));
        this.opened.push(id);
      }
    }
    this.syncQuests();
    this.rememberMenus();
  }

  /** Once the craft or build button has appeared it stays, even where there is nothing to make. */
  private rememberMenus() {
    for (const m of ["craft", "build"] as const) {
      if (!this.state.flags.includes(`menu_${m}`) && this.menuShown(m)) this.state.flags.push(`menu_${m}`);
    }
  }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const pickChance = (s: GameState, chance: number) => int(s.rng, 0, 9999) < chance * 10000;

/** 1500 minutes -> "1 day and 1 hour"; 45 -> "45 minutes" (for the end screen) */
function duration(minutes: number): string {
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts = [d ? unit(d, "day") : "", h ? unit(h, "hour") : "", !d && !h ? unit(m, "minute") : ""].filter(Boolean);
  return parts.join(" and ");
}

