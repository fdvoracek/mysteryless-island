/** Flags supplied by engine protocol rather than authored effects. Not identities. */
export const GAME_FLAGS: readonly { id: string; reason: string }[] = [
  { id: "auto_hunger_unavailable", reason: "automatic provisions cannot supply food at the hunger threshold" },
  { id: "auto_thirst_unavailable", reason: "automatic provisions cannot supply drink at the thirst threshold" },
];
