import type { Command, Engine, Result } from "../core/engine";

export interface Scheduler {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
const browserScheduler: Scheduler = {
  set: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Owns the real-time schedule. Neither the engine nor a layout knows about browser timers. */
export class ActionController {
  private timer: unknown;
  private generation = 0;
  constructor(private engine: () => Engine, private changed: () => void, private speed = 1, private scheduler = browserScheduler) {}

  send(command: Command): Result {
    const result = this.engine().start(command);
    this.changed(); // persist reservations immediately, including the first work record
    this.sync();
    return result;
  }

  /** Resume saved work with a fresh interval, without accounting for time spent away. */
  sync() {
    const engine = this.engine();
    if (engine.state.dead || engine.state.events.active || !engine.runningActions().length) { this.stop(); return; }
    if (this.timer !== undefined) return;
    const generation = this.generation;
    const state = engine.state;
    this.timer = this.scheduler.set(() => {
      this.timer = undefined;
      if (generation !== this.generation || engine !== this.engine() || state !== engine.state) return;
      engine.stepActions();
      this.changed(); // each committed quarter hour survives a reload
      this.sync();
    }, Math.max(1, engine.progressMs(engine.reg.game.stepMinutes / 60) * this.speed));
  }

  stop() {
    this.generation++;
    if (this.timer !== undefined) this.scheduler.clear(this.timer);
    this.timer = undefined;
  }
}
