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
