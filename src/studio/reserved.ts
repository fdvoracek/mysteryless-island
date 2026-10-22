/** Engine protocol identities cannot be renamed without changing game behavior.
 * Keep the UI, rename validation and hardcoded-ID guard on this one list. */
export const RESERVED_IDENTITIES: readonly { kind: string; id: string; reason: string }[] = [
  { kind: "scene", id: "start", reason: "the engine opens every event at the start scene" },
  { kind: "activity", id: "sleep", reason: 'the engine counts every night\'s sleep under this ID (src/core/engine.ts, this.count("sleep"))' },
  { kind: "stat", id: "health", reason: "required by the registry and used directly by engine code" },
  { kind: "stat", id: "energy", reason: "used directly by engine code for work and sleep" },
  { kind: "stat", id: "hunger", reason: "used directly by engine code for automatic provisions" },
  { kind: "stat", id: "thirst", reason: "used directly by engine code for automatic provisions" },
];
export const reservedReason = (kind: string, id: string): string | undefined => RESERVED_IDENTITIES.find(entry => entry.kind === kind && entry.id === id)?.reason;
