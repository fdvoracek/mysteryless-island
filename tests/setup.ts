import { beforeEach } from "vitest";
import { setVariantMode } from "../src/core/text";

// Tests check the game logic with fixed wording: always the first variant of each text.
// tests/variants.test.ts switches to "random" to check the variety itself.
beforeEach(() => setVariantMode("first"));
