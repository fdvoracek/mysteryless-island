import type { FullConfig } from "@playwright/test";
import { rm } from "node:fs/promises";

export default async function cleanup(config: FullConfig) {
  await rm(config.metadata.studioFixtureRoot, { recursive: true, force: true });
}
