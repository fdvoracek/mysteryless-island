import { describe, expect, it } from "vitest";
import { parseSeed, previewUrl } from "../../src/studio/preview";

describe("preview URL and seed", () => {
  it("builds the preview address", () => {
    expect(previewUrl()).toBe("/?preview");
    expect(previewUrl({ firstVariants: true })).toBe("/?preview&variants=first");
    expect(previewUrl({ firstVariants: true, seed: 1234 })).toBe("/?preview&variants=first&seed=1234");
    expect(previewUrl({ seed: 0 })).toBe("/?preview&seed=0");
  });

  it("accepts an empty seed or whole digits and rejects the rest", () => {
    expect(parseSeed("")).toEqual({ valid: true });
    expect(parseSeed(" 1234 ")).toEqual({ seed: 1234, valid: true });
    for (const bad of ["-1", "1.5", "abc", "12 34", "99999999999999999999"]) expect(parseSeed(bad).valid).toBe(false);
  });
});
