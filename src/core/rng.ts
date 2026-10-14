/** Seeded sfc32 generator. Its 4-number state lives in GameState, so saves replay identically. */
export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  const s: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 12; i++) next(s); // warm up
  return s;
}

/** Returns a float in [0, 1) and advances the state in place. */
export function next(s: RngState): number {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  s[0] = a; s[1] = b; s[2] = c; s[3] = d;
  return t / 4294967296;
}

export function int(s: RngState, min: number, max: number): number {
  return min + Math.floor(next(s) * (max - min + 1));
}

export function pick<T>(s: RngState, list: readonly T[]): T {
  return list[Math.floor(next(s) * list.length)];
}

export function weighted<T extends { weight: number }>(s: RngState, list: readonly T[]): T | undefined {
  const total = list.reduce((n, x) => n + x.weight, 0);
  if (total <= 0) return undefined;
  let r = next(s) * total;
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1];
}
