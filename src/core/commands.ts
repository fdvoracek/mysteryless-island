import type { Engine, Command, Result } from "./engine";

/** A small adapter for callers that manually drive paced work. The session controller owns browser timing. */
export interface CommandResult extends Result { stepMs?: number; advance?: () => boolean }

export function prepareCommand(engine: Engine, cmd: Command): CommandResult {
  const result = engine.start(cmd);
  if (!result.ok || !engine.runningActions().length) return result;
  const state = engine.state;
  const stepMs = engine.progressMs(engine.reg.game.stepMinutes / 60);
  return { ...result, stepMs, advance: () => {
    if (engine.state !== state) return true;
    const step = engine.stepActions();
    if (!step.ok) return true;
    return !engine.runningActions().length || !!engine.state.events.active || engine.state.dead;
  } };
}
