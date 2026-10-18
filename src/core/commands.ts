import { Engine, type Command, type Result } from "./engine";
import type { GameState } from "./state";

/** The browser advances one simulation step at a time; true means the command is finished. */
export interface CommandResult extends Result {
  stepMs?: number;
  advance?: () => boolean;
}

/** Plan deterministically, then reveal each clock step and finally the command's results. */
export function prepareCommand(engine: Engine, cmd: Command): CommandResult {
  let initial: GameState | undefined;
  const steps: GameState[] = [];
  const planned = new Engine(engine.reg, structuredClone(engine.state), (state, kind) => {
    if (kind === "start") initial ??= structuredClone(state);
    else steps.push(structuredClone(state));
  });
  const result = planned.dispatch(cmd);
  if (!result.ok || !steps.length || result.cooldownMs === 0) {
    engine.state = planned.state;
    return { ...result, cooldownMs: 0 };
  }

  // Choices close their menu or exploration page while work is in progress.
  if (cmd.type === "choose") {
    initial!.events.active = null;
    for (const state of steps) state.events.active = null;
  }
  // Rewards, travel, discoveries, task notes and other final effects arrive with the last tick.
  steps[steps.length - 1] = planned.state;
  engine.state = initial!;
  let current = engine.state;
  let next = 0;
  const stepMs = engine.progressMs(engine.reg.game.stepMinutes / 60);
  return {
    ...result,
    stepMs,
    cooldownMs: steps.length * stepMs,
    advance: () => {
      if (next === steps.length || engine.state !== current) return true;
      engine.state = current = steps[next++];
      return next === steps.length;
    },
  };
}
