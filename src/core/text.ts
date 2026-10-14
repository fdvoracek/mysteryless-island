import { int, type RngState } from "./rng";

/**
 * Sentences start with a capital letter, also after . ! or ?
 * Used for text the engine builds from pieces (e.g. a disabled button's reason:
 * "needs 3 firewood (have 1)"). Content text is written capitalised and checked by tests.
 */
export function sentence(s: string): string;
export function sentence(s: string | undefined): string | undefined;
export function sentence(s: string | undefined): string | undefined {
  if (!s) return s;
  return s
    .replace(/^(\W*)([a-z])/, (_, pre: string, c: string) => pre + c.toUpperCase())
    .replace(/([.!?]["”’)]?\s+)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
}

/**
 * Every text in the journal is a passage or a list of variant passages (`Text` in the schema).
 * One variant is shown each time, chosen with the game's seeded rng, and never the same one twice
 * in a row: the last choice per text is kept in `state.lastText` (keyed by its first variant).
 *
 * "first" always shows the first variant: tests use it to check the logic with fixed wording,
 * and the browser test turns it on with ?variants=first.
 */
export type VariantMode = "random" | "first";
let mode: VariantMode = "random";
export const setVariantMode = (m: VariantMode) => { mode = m; };
export const variantMode = () => mode;

interface VariantState { rng: RngState; lastText?: Record<string, number> }

export function chooseText(t: string | readonly string[], s: VariantState, vars?: Record<string, string>): string {
  const list = typeof t === "string" ? [t] : t;
  let i = 0;
  if (list.length > 1 && mode === "random") {
    const memo = (s.lastText ??= {});
    const last = memo[list[0]];
    if (last === undefined || last >= list.length) i = int(s.rng, 0, list.length - 1);
    else { i = int(s.rng, 0, list.length - 2); if (i >= last) i++; } // anything but the last one
    memo[list[0]] = i;
  }
  const out = list[i];
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m) : out;
}
