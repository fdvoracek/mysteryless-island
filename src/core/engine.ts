import type { Registry } from "../content/registry";
import type { Activity, Effect, Effort, ItemAction, Outcome, Region, Thoughts, Yield } from "../content/schema";
import { phaseAt } from "./clock";
import { evaluate, explain, type Ctx } from "./conditions";
import { int, pick, weighted } from "./rng";
import { clone, createInitialState, type GameState } from "./state";

export type Command =
  | { type: "activity"; id: string }
  | { type: "travel"; region: string }
  | { type: "consume"; item: string }
  | { type: "explore" }
  | { type: "questAction"; quest: string }
  | { type: "itemAction"; item: string; action: string };

export interface Result {
  ok: boolean;
  /** why the command was refused */
  reason?: string;
  /** cosmetic cooldown for the UI, in ms */
  cooldownMs: number;
  died?: boolean;
}

const refuse = (reason: string): Result => ({ ok: false, reason, cooldownMs: 0 });
const textOf = (t: string | string[] | undefined, s: GameState) =>
  t === undefined ? undefined : Array.isArray(t) ? pick(s.rng, t) : t;

/**
 * The engine interprets content. It owns the current state and the checkpoint.
 * It never touches the DOM, Date or Math.random, so tests and tools can run it in Node.
 */
export class Engine {
  state: GameState;
  checkpoint: GameState;
  private damageLogged = new Set<string>();
  /** while true, nothing is logged (you are asleep); see doActivity */
  private quiet = false;
  /** characters logged during the current command, for the progress bar duration */
  private loggedChars = 0;

  constructor(public reg: Registry, state: GameState, checkpoint?: GameState) {
    this.state = state;
    this.checkpoint = checkpoint ?? clone(state);
    // saves from before `today` existed
    this.state.today ??= {};
    this.checkpoint.today ??= {};
  }

  static newGame(reg: Registry, seed: number): Engine {
    const e = new Engine(reg, createInitialState(reg, seed));
    e.syncQuests(); // "start" quests and anything already true at the first moment
    e.checkpoint = clone(e.state);
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

  /** Log several lines in reading order (the view groups them into one paragraph per action). */
  logLines(lines: Array<string | undefined>) {
    for (const line of lines) this.log(line);
  }

  // ---------------------------------------------------------------- commands

  dispatch(cmd: Command): Result {
    if (this.state.dead) return refuse("you are dead");
    this.state.turn = (this.state.turn ?? 0) + 1;
    this.state.prevStats = { ...this.state.stats };
    this.damageLogged.clear();
    this.loggedChars = 0;
    switch (cmd.type) {
      case "activity": return this.doActivity(cmd.id);
      case "travel": return this.travel(cmd.region);
      case "consume": return this.consume(cmd.item);
      case "explore": return this.explore();
      case "questAction": return this.questAction(cmd.quest);
      case "itemAction": return this.itemAction(cmd.item, cmd.action);
    }
  }

  /** The "look around" action of the current region: visible until everything is discovered. */
  checkExplore(): { visible: boolean; enabled: boolean; reason?: string; found: number; total: number } {
    const region = this.reg.regions.get(this.state.location)!;
    const ex = region.explore;
    if (!ex) return { visible: false, enabled: false, found: 0, total: 0 };
    const st = this.state.regions[region.id];
    const total = ex.discoveries.length;
    const found = ex.discoveries.filter((d) => st.discoveries.includes(d.id)).length;
    if (found >= total && ex.hideWhenDone !== false) return { visible: false, enabled: false, found, total };
    const ctx = this.ctx();
    if (!evaluate(ex.requires, ctx)) {
      return { visible: true, enabled: false, reason: ex.requiresText ?? explain(ex.requires, ctx) ?? undefined, found, total };
    }
    return { visible: true, enabled: true, found, total };
  }

  /** Can the action next to an active quest be used now? */
  checkQuestAction(id: string): { visible: boolean; enabled: boolean; reason?: string } {
    const q = this.reg.quests.get(id);
    if (!q?.action || this.state.quests[id]?.status !== "active") return { visible: false, enabled: false };
    const a = q.action;
    const ctx = this.ctx();
    if (!evaluate(a.requires, ctx)) {
      return { visible: true, enabled: false, reason: a.requiresText ?? explain(a.requires, ctx) ?? undefined };
    }
    for (const [item, n] of Object.entries(a.cost ?? {})) {
      const have = this.state.items[item] ?? 0;
      if (have < n) return { visible: true, enabled: false, reason: `needs ${n} ${this.reg.items.get(item)?.name ?? item} (have ${have})` };
    }
    return { visible: true, enabled: true };
  }

  private questAction(id: string): Result {
    const c = this.checkQuestAction(id);
    if (!c.visible) return refuse("no such task");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");
    const a = this.reg.quests.get(id)!.action!;
    this.take(a.cost);
    this.log(textOf(a.log, this.state));
    if (!this.advance(a.hours, a.effort)) return this.died(a.hours);
    this.applyEffects(a.effects);
    this.postCheck();
    return this.ok(a.hours);
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
    this.take({ [itemId]: a.uses ?? 1 });
    this.take(a.cost);
    this.log(textOf(a.log, this.state));
    if (!this.advance(a.hours, a.effort)) return this.died(a.hours);
    this.applyEffects(a.effects);
    this.count(`${itemId}_${a.id}`, a.tags);
    this.postCheck();
    return this.ok(a.hours);
  }

  private explore(): Result {
    const region = this.reg.regions.get(this.state.location)!;
    const ex = region.explore;
    const c = this.checkExplore();
    if (!ex || !c.visible) return refuse("nothing more to find here");
    if (!c.enabled) return refuse(c.reason ?? "not possible now");

    if (!this.advance(ex.hours, ex.effort)) return this.died(ex.hours);
    const st = this.state.regions[region.id];
    st.explored += 1;
    const ctx = this.ctx();
    const found = ex.discoveries.filter(
      (d) => !st.discoveries.includes(d.id) && d.at <= st.explored && evaluate(d.when, ctx),
    );
    for (const d of found) {
      st.discoveries.push(d.id);
      this.remember(d.id);
      this.logLines(d.text);
      this.applyEffects(d.effects);
    }
    if (!found.length) this.log(textOf(ex.nothingLog, this.state) ?? "Nothing new.");
    this.postCheck();
    return this.ok(ex.hours);
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

    // thoughts are worked out first: how tired you are as you lie down, not after the night
    this.logLines(this.thoughts(a.thoughts));
    this.take(a.cost);
    this.log(textOf(a.log, this.state));
    // asleep you notice nothing (thirst, the fire dying): the morning sums it up in `afterwards`
    this.quiet = a.effort === "sleep";
    const alive = this.advance(a.hours, a.effort);
    this.quiet = false;
    if (!alive) return this.died(a.hours);

    this.applyYields(a.yields);
    this.applyOutcomes(a.outcomes);
    this.applyEffects(a.effects);
    this.logLines(this.thoughts(a.afterwards));
    this.count(a.id, a.tags);
    // sleeping ends the day: tomorrow's memories start empty
    if (a.effort === "sleep") this.state.today = {};
    this.postCheck();
    if (a.checkpoint && !this.state.dead) this.checkpoint = clone(this.state);
    return this.ok(a.hours);
  }

  private travel(regionId: string): Result {
    const to = this.reg.regions.get(regionId);
    const from = this.reg.regions.get(this.state.location)!;
    if (!to) return refuse(`unknown region ${regionId}`);
    if (regionId === this.state.location) return refuse("already here");
    if (!this.state.regions[regionId]?.unlocked) return refuse("you don't know the way");

    // travel goes via camp: time from here to camp plus camp to there
    const hours = from.travelHours + to.travelHours;
    this.log(`You walk to ${to.name}.`);
    if (!this.advance(hours, "work")) return this.died(hours);

    this.state.location = regionId;
    this.remember(regionId);
    const r = this.state.regions[regionId];
    if (!r.visited) {
      r.visited = true;
      this.logLines([...to.description, textOf(to.firstVisit?.log, this.state)]);
    } else {
      this.logLines(this.arrivalView(to));
    }
    this.postCheck();
    return this.ok(hours);
  }

  /** The lines of an activity's thought groups whose conditions hold now (see Thoughts in the schema). */
  thoughts(groups: Thoughts[] | undefined): string[] {
    const ctx = this.ctx();
    const out: string[] = [];
    for (const g of groups ?? []) {
      const lines = g.lines.filter((l) => evaluate(l.when, ctx)).slice(0, g.max ?? Infinity);
      if (lines.length) {
        if (g.intro) out.push(textOf(g.intro, this.state)!);
        for (const l of lines) out.push(textOf(l.text, this.state)!);
      } else if (g.otherwise) {
        out.push(textOf(g.otherwise, this.state)!);
      }
    }
    return out;
  }

  /** What you see on arriving again: the region's `arrive` lines whose condition holds now. */
  arrivalView(region: Region): string[] {
    const ctx = this.ctx();
    return (region.arrive ?? []).filter((a) => evaluate(a.when, ctx)).map((a) => textOf(a.text, this.state)!);
  }

  private consume(itemId: string): Result {
    const item = this.reg.items.get(itemId);
    if (!item?.consume) return refuse("you can't use that");
    if ((this.state.items[itemId] ?? 0) < 1) return refuse(`no ${item.name} left`);
    const c = item.consume;
    this.take({ [itemId]: 1 });
    this.log(textOf(c.log, this.state));
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

  /** After death: go back to the last checkpoint. */
  restoreCheckpoint() {
    this.state = clone(this.checkpoint);
    // keep turns increasing past the death, so the wake-up line starts a new paragraph
    const lastTurn = Math.max(this.checkpoint.turn ?? 0, ...this.checkpoint.log.map((l) => l.turn ?? 0));
    this.state.turn = lastTurn + 1;
    this.log(this.reg.game.restoreLog);
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
        if (d.log && !this.quiet && !this.damageLogged.has(key)) { this.damageLogged.add(key); this.log(d.log); }
      }
      for (const r of sf.regen) {
        if (evaluate(r.when, ctx)) s.stats.health = clamp(s.stats.health + r.healthPerHour * stepHours);
      }
      if (s.stats.health <= 0) {
        s.dead = true;
        this.quiet = false; // dying is never quiet
        this.log(this.reg.game.deathLog);
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
      if (t.warnLog && before > warn && after <= warn && after > 0) this.log(t.warnLog);
      if (after === 0) this.log(t.expireLog);
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
      this.state.items[k] = (this.state.items[k] ?? 0) + n;
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
    this.log(textOf(o.text, this.state));
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
      else if ("log" in e) this.log(textOf(e.log, s));
      else if ("roll" in e) this.applyOutcomes(e.roll);
      else if ("startQuest" in e) this.startQuest(e.startQuest);
    }
    if (s.stats.health <= 0 && !s.dead) { s.dead = true; this.log(this.reg.game.deathLog); }
  }

  /** Count a finished activity or item use, plus its tags, for { "did": ... } conditions. */
  private count(id: string, tags?: string[]) {
    for (const key of [id, ...(tags ?? [])]) {
      const k = `did:${key}`;
      this.state.counters[k] = (this.state.counters[k] ?? 0) + 1;
      this.remember(key);
    }
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
    this.log(textOf(q.startLog, this.state));
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
          this.log(textOf(q.doneLog, this.state));
          this.applyEffects(q.effects);
          changed = true;
        }
      }
      if (!changed) return;
    }
  }

  /** Runs after every command: unlock regions, then update quests. */
  private postCheck() {
    const ctx = this.ctx();
    for (const id of this.reg.regionOrder) {
      const r = this.reg.regions.get(id)!;
      const st = this.state.regions[id];
      if (!st.unlocked && r.unlockWhen && evaluate(r.unlockWhen, ctx)) {
        st.unlocked = true;
        this.log(`A way to ${r.name} opens.`);
      }
    }
    this.syncQuests();
  }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const pickChance = (s: GameState, chance: number) => int(s.rng, 0, 9999) < chance * 10000;
