/** The part of the game's `window.ti` debug console that the preview panel calls (same origin). */
export interface PreviewApi {
  give(item: string, amount?: number): void;
  time(hours: number): void;
  unlock(regionId: string): void;
  quest(id: string): void;
  reset(): void;
  state(): unknown;
}

/** Digits only, like the game's own `&seed=` parsing; empty means no seed. */
export function parseSeed(text: string): { seed?: number; valid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: true };
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) ? { seed: Number(trimmed), valid: true } : { valid: false };
}

export function previewUrl(options: { firstVariants?: boolean; seed?: number } = {}): string {
  const params = ["preview"];
  if (options.firstVariants) params.push("variants=first");
  if (options.seed !== undefined) params.push(`seed=${options.seed}`);
  return `/?${params.join("&")}`;
}
